//! Keyword, semantic, and hybrid retrieval over a knowledge library, plus
//! the tool-facing search entry point and semantic index maintenance.

use super::*;

pub(crate) fn parse_mode(params: &Value) -> Result<&'static str, KnowledgeError> {
    match params
        .get("mode")
        .and_then(Value::as_str)
        .unwrap_or("hybrid")
    {
        "keyword" => Ok("keyword"),
        "semantic" => Ok("semantic"),
        "hybrid" => Ok("hybrid"),
        other => Err(KnowledgeError::invalid(format!(
            "unknown search mode: {other}"
        ))),
    }
}

pub(crate) fn parse_limit(params: &Value) -> i64 {
    params
        .get("limit")
        .and_then(Value::as_i64)
        .unwrap_or(DEFAULT_LIMIT)
        .clamp(1, MAX_LIMIT)
}

/// Tool-facing entry point for `KnowledgeSearch`. It is the same retrieval the
/// RPC surface uses, but defaults to a handful of passages so one agent call
/// cannot flood the model context with the whole library.
pub async fn search_for_tool(
    state: Arc<Mutex<AppState>>,
    args: &Value,
) -> Result<Value, KnowledgeError> {
    let mut params = args.clone();
    if !params.is_object() {
        return Err(KnowledgeError::invalid("arguments must be an object"));
    }
    if params.get("limit").is_none() {
        params["limit"] = json!(6);
    }
    search(state, &params).await
}

pub(crate) async fn search(
    state: Arc<Mutex<AppState>>,
    params: &Value,
) -> Result<Value, KnowledgeError> {
    let query = require_str(params, "query")?;
    if query.chars().count() > MAX_QUERY_CHARS {
        return Err(KnowledgeError::invalid("query is too long"));
    }
    let query = query.split_whitespace().collect::<Vec<_>>().join(" ");
    let mode = parse_mode(params)?;
    let limit = parse_limit(params);
    let library_id = optional_str(params, "libraryId");

    let mut semantic_error: Option<String> = None;
    let query_embedding = if mode != "keyword" {
        match library_id.as_deref() {
            Some(id) => {
                let config = {
                    let st = state.lock().await;
                    embedding_config_for_library(&st.db, &st.secrets, id)
                };
                match config {
                    Ok(Some(config)) => Some(
                        embed::embed_texts(&config, std::slice::from_ref(&query))
                            .await
                            .map_err(|error| error.to_string())
                            .map(|mut vectors| vectors.remove(0)),
                    ),
                    Ok(None) => None,
                    Err(error) => Some(Err(error.message)),
                }
            }
            None => None,
        }
    } else {
        None
    };

    let keyword_hits = {
        let st = state.lock().await;
        keyword_search(&st.db, library_id.as_deref(), &query, limit * 2)?
    };

    let vector_hits = match query_embedding {
        Some(Ok(vector)) => {
            let st = state.lock().await;
            vector_search(&st.db, library_id.as_deref(), &vector, limit * 2)?
        }
        Some(Err(error)) => {
            semantic_error = Some(error);
            Vec::new()
        }
        None => Vec::new(),
    };

    let degraded = mode != "keyword" && vector_hits.is_empty();
    let hits = if mode == "keyword" || vector_hits.is_empty() {
        keyword_hits.into_iter().take(limit as usize).collect()
    } else if mode == "semantic" {
        vector_hits.into_iter().take(limit as usize).collect()
    } else {
        fuse_hybrid(keyword_hits, vector_hits, limit as usize)
    };

    let activity_query = query.clone();
    let mut result = json!(KnowledgeSearchResult {
        query,
        mode: mode.to_string(),
        degraded,
        hits,
    });
    if let Some(error) = semantic_error {
        result["semanticError"] = Value::String(error);
    }
    {
        let st = state.lock().await;
        record_activity(
            &st.db,
            "search",
            library_id.as_deref(),
            None,
            &activity_query,
        );
    }
    // Flat payload: the desktop `knowledgeSearch` API and the KnowledgeSearch
    // tool both read `hits`/`degraded` directly off this object.
    Ok(result)
}

#[derive(Clone)]
pub(crate) struct RankedHit {
    document_id: String,
    document_title: String,
    source_path: Option<String>,
    chunk_ordinal: i64,
    text: String,
    score: f64,
}

pub(crate) fn keyword_search(
    db: &Database,
    library_id: Option<&str>,
    query: &str,
    limit: i64,
) -> Result<Vec<KnowledgeSearchHit>, KnowledgeError> {
    let chars = query.chars().count();
    let mut hits: Vec<RankedHit> = Vec::new();
    if chars >= 3 {
        // A quoted phrase keeps FTS operators (`AND`, `*`, `:`) inert.
        let phrase = format!("\"{}\"", query.replace('"', "\"\""));
        let sql = "SELECT c.document_id, d.title, d.source_path, c.ordinal, c.text,
                          bm25(knowledge_chunks_fts)
                     FROM knowledge_chunks_fts
                     JOIN knowledge_chunks c ON c.id = knowledge_chunks_fts.rowid
                     JOIN knowledge_documents d ON d.id = c.document_id
                    WHERE knowledge_chunks_fts MATCH ?1";
        let rows = if let Some(library_id) = library_id {
            let sql =
                format!("{sql} AND c.library_id = ?2 ORDER BY bm25(knowledge_chunks_fts) LIMIT ?3");
            let mut statement = db.conn().prepare_cached(&sql)?;
            let mapped = statement.query_map(params![phrase, library_id, limit], map_ranked_row)?;
            mapped.collect::<rusqlite::Result<Vec<_>>>()?
        } else {
            let sql = format!("{sql} ORDER BY bm25(knowledge_chunks_fts) LIMIT ?2");
            let mut statement = db.conn().prepare_cached(&sql)?;
            let mapped = statement.query_map(params![phrase, limit], map_ranked_row)?;
            mapped.collect::<rusqlite::Result<Vec<_>>>()?
        };
        hits = rows;
    }

    // Trigram FTS5 cannot match a query shorter than three characters (and may
    // find nothing for a rare long phrase). Fall back to a bounded substring
    // scan so one- and two-character CJK queries still work.
    if hits.is_empty() {
        let pattern = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
        let sql = "SELECT c.document_id, d.title, d.source_path, c.ordinal, c.text
                     FROM knowledge_chunks c
                     JOIN knowledge_documents d ON d.id = c.document_id
                    WHERE c.text LIKE ?1 ESCAPE '\\'";
        let rows = if let Some(library_id) = library_id {
            let sql = format!("{sql} AND c.library_id = ?2 ORDER BY c.id DESC LIMIT ?3");
            let mut statement = db.conn().prepare_cached(&sql)?;
            let mapped = statement.query_map(params![pattern, library_id, limit], |row| {
                Ok(RankedHit {
                    document_id: row.get(0)?,
                    document_title: row.get(1)?,
                    source_path: row.get(2)?,
                    chunk_ordinal: row.get(3)?,
                    text: row.get(4)?,
                    score: 0.25,
                })
            })?;
            mapped.collect::<rusqlite::Result<Vec<_>>>()?
        } else {
            let sql = format!("{sql} ORDER BY c.id DESC LIMIT ?2");
            let mut statement = db.conn().prepare_cached(&sql)?;
            let mapped = statement.query_map(params![pattern, limit], |row| {
                Ok(RankedHit {
                    document_id: row.get(0)?,
                    document_title: row.get(1)?,
                    source_path: row.get(2)?,
                    chunk_ordinal: row.get(3)?,
                    text: row.get(4)?,
                    score: 0.25,
                })
            })?;
            mapped.collect::<rusqlite::Result<Vec<_>>>()?
        };
        hits = rows;
    }

    Ok(hits
        .into_iter()
        .map(|hit| {
            let snippet = make_snippet(&hit.text, query);
            KnowledgeSearchHit {
                document_id: hit.document_id,
                document_title: hit.document_title,
                source_path: hit.source_path,
                chunk_ordinal: hit.chunk_ordinal,
                snippet,
                score: hit.score,
            }
        })
        .collect())
}

pub(crate) fn map_ranked_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<RankedHit> {
    let rank: f64 = row.get(5)?;
    Ok(RankedHit {
        document_id: row.get(0)?,
        document_title: row.get(1)?,
        source_path: row.get(2)?,
        chunk_ordinal: row.get(3)?,
        text: row.get(4)?,
        // bm25 is negative-is-better; a positive 1/(1+|rank|) keeps ordering.
        score: 1.0 / (1.0 + rank.abs()),
    })
}

pub(crate) fn vector_search(
    db: &Database,
    library_id: Option<&str>,
    query: &[f32],
    limit: i64,
) -> Result<Vec<KnowledgeSearchHit>, KnowledgeError> {
    let mut statement = db.conn().prepare_cached(
        "SELECT c.document_id, d.title, d.source_path, c.ordinal, c.text,
                c.embedding, c.embedding_dim
           FROM knowledge_chunks c
           JOIN knowledge_documents d ON d.id = c.document_id
          WHERE c.embedding IS NOT NULL
            AND (?1 IS NULL OR c.library_id = ?1)",
    )?;
    let rows = statement.query_map(params![library_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, i64>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Vec<u8>>(5)?,
            row.get::<_, i64>(6)?,
        ))
    })?;
    let mut scored: Vec<(f64, RankedHit)> = Vec::new();
    for row in rows {
        let (document_id, title, source_path, ordinal, text, blob, dim) = row?;
        if dim as usize != query.len() {
            continue;
        }
        let Some(vector) = embed::blob_to_vector(&blob, query.len()) else {
            continue;
        };
        let score = embed::cosine_similarity(query, &vector);
        if score <= 0.0 {
            continue;
        }
        scored.push((
            score,
            RankedHit {
                document_id,
                document_title: title,
                source_path,
                chunk_ordinal: ordinal,
                text,
                score,
            },
        ));
    }
    scored.sort_by(|a, b| b.0.total_cmp(&a.0));
    Ok(scored
        .into_iter()
        .take(limit as usize)
        .map(|(score, hit)| KnowledgeSearchHit {
            document_id: hit.document_id,
            document_title: hit.document_title,
            source_path: hit.source_path,
            chunk_ordinal: hit.chunk_ordinal,
            snippet: make_snippet(&hit.text, ""),
            score,
        })
        .collect())
}

pub(crate) fn fuse_hybrid(
    keyword: Vec<KnowledgeSearchHit>,
    vector: Vec<KnowledgeSearchHit>,
    limit: usize,
) -> Vec<KnowledgeSearchHit> {
    use std::collections::HashMap;
    let mut fused: HashMap<(String, i64), (KnowledgeSearchHit, f64)> = HashMap::new();
    for (rank, hit) in keyword.into_iter().enumerate() {
        let entry = fused
            .entry((hit.document_id.clone(), hit.chunk_ordinal))
            .or_insert_with(|| (hit.clone(), 0.0));
        entry.1 += 1.0 / (60.0 + rank as f64);
    }
    for (rank, hit) in vector.into_iter().enumerate() {
        let entry = fused
            .entry((hit.document_id.clone(), hit.chunk_ordinal))
            .or_insert_with(|| (hit.clone(), 0.0));
        entry.1 += 1.0 / (60.0 + rank as f64);
    }
    let mut hits: Vec<(KnowledgeSearchHit, f64)> = fused.into_values().collect();
    hits.sort_by(|a, b| b.1.total_cmp(&a.1));
    hits.into_iter()
        .take(limit)
        .map(|(mut hit, score)| {
            hit.score = score;
            hit
        })
        .collect()
}

pub(crate) fn make_snippet(text: &str, query: &str) -> String {
    const WINDOW: usize = 180;
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let chars: Vec<char> = flat.chars().collect();
    if chars.len() <= WINDOW * 2 {
        return flat;
    }
    let needle: Vec<char> = query.chars().flat_map(char::to_lowercase).collect();
    let haystack: Vec<char> = flat.chars().flat_map(char::to_lowercase).collect();
    let position = if needle.is_empty() {
        0
    } else {
        haystack
            .windows(needle.len())
            .position(|window| window == needle.as_slice())
            .unwrap_or(0)
    };
    let start = position.saturating_sub(WINDOW);
    let end = (start + WINDOW * 2).min(chars.len());
    let mut snippet: String = chars[start..end].iter().collect();
    if start > 0 {
        snippet.insert(0, '…');
    }
    if end < chars.len() {
        snippet.push('…');
    }
    snippet
}

pub(crate) fn embedding_config_for_library(
    db: &Database,
    secrets: &crate::secrets::SecretStore,
    library_id: &str,
) -> Result<Option<EmbeddingConfig>, KnowledgeError> {
    let library = get_library_row(db, library_id)?;
    let (Some(provider_id), Some(model)) = (library.embedding_provider_id, library.embedding_model)
    else {
        return Ok(None);
    };
    if !library.semantic_enabled {
        return Ok(None);
    }
    let provider = providers::get_provider(db, secrets, &provider_id)
        .map_err(|error| KnowledgeError::internal(error.to_string()))?
        .ok_or_else(|| KnowledgeError::not_found("embedding provider not found"))?;
    let base_url = provider
        .base_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| KnowledgeError::invalid("embedding provider needs a base URL"))?
        .to_string();
    let api_key = provider_secret(db, secrets, &provider_id)?;
    let headers = provider
        .headers
        .unwrap_or_default()
        .into_iter()
        .collect::<Vec<_>>();
    Ok(Some(EmbeddingConfig {
        provider_id,
        model,
        base_url,
        api_key,
        headers,
    }))
}

pub(crate) fn provider_secret(
    db: &Database,
    secrets: &crate::secrets::SecretStore,
    provider_id: &str,
) -> Result<Option<String>, KnowledgeError> {
    providers::get_secret_for_provider(db, secrets, provider_id)
        .map_err(|error| KnowledgeError::internal(error.to_string()))
}

pub async fn index_library(
    state: Arc<Mutex<AppState>>,
    params: &Value,
) -> Result<Value, KnowledgeError> {
    let library_id = library_id_param(params)?;
    let config = {
        let st = state.lock().await;
        get_library_row(&st.db, &library_id)?;
        embedding_config_for_library(&st.db, &st.secrets, &library_id)?.ok_or_else(|| {
            KnowledgeError::invalid(
                "this library has no embedding provider, model and semantic switch",
            )
        })?
    };

    let mut embedded = 0i64;
    let mut batches = 0usize;
    loop {
        let batch = {
            let st = state.lock().await;
            unembedded_chunks(&st.db, &library_id, EMBED_BATCH)?
        };
        if batch.is_empty() {
            break;
        }
        batches += 1;
        if batches > 2_000 {
            break;
        }
        let texts = batch
            .iter()
            .map(|(_, text)| text.clone())
            .collect::<Vec<_>>();
        let vectors = embed::embed_texts(&config, &texts).await.map_err(|error| {
            KnowledgeError::internal(format!(
                "embedding provider failed after {embedded} chunks: {error}"
            ))
        })?;
        if vectors.len() != batch.len() {
            return Err(KnowledgeError::internal(
                "embedding provider returned the wrong vector count",
            ));
        }
        let dim = vectors.first().map(Vec::len).unwrap_or(0);
        if dim == 0 {
            return Err(KnowledgeError::internal(
                "embedding provider returned empty vectors",
            ));
        }
        {
            let st = state.lock().await;
            let transaction = st.db.conn().unchecked_transaction()?;
            for ((chunk_id, _), vector) in batch.iter().zip(vectors.iter()) {
                transaction.execute(
                    "UPDATE knowledge_chunks SET embedding = ?2, embedding_dim = ?3 WHERE id = ?1",
                    params![chunk_id, embed::vector_to_blob(vector), vector.len() as i64],
                )?;
            }
            transaction.commit()?;
        }
        embedded += batch.len() as i64;
    }

    let remaining = {
        let st = state.lock().await;
        unembedded_count(&st.db, &library_id)?
    };
    {
        let st = state.lock().await;
        let name = get_library_row(&st.db, &library_id)
            .map(|library| library.name)
            .unwrap_or_else(|_| library_id.clone());
        record_activity(&st.db, "index.run", Some(&library_id), None, &name);
    }
    Ok(json!({
        "embedded": embedded,
        "remaining": remaining,
        "providerId": config.provider_id,
        "model": config.model,
    }))
}

pub(crate) fn unembedded_chunks(
    db: &Database,
    library_id: &str,
    limit: usize,
) -> Result<Vec<(i64, String)>, KnowledgeError> {
    let mut statement = db.conn().prepare_cached(
        "SELECT id, text FROM knowledge_chunks
          WHERE library_id = ?1 AND embedding IS NULL
          ORDER BY id LIMIT ?2",
    )?;
    let rows = statement.query_map(params![library_id, limit as i64], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub(crate) fn unembedded_count(db: &Database, library_id: &str) -> Result<i64, KnowledgeError> {
    Ok(db.conn().query_row(
        "SELECT COUNT(*) FROM knowledge_chunks WHERE library_id = ?1 AND embedding IS NULL",
        params![library_id],
        |row| row.get(0),
    )?)
}
