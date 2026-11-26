//! Document listing, preview, ingestion, and deletion for a knowledge
//! library. Every function here is reached through `knowledge::handle`.

use super::*;

pub(crate) fn list_documents(db: &Database, params: &Value) -> Result<Value, KnowledgeError> {
    let library_id = library_id_param(params)?;
    get_library_row(db, &library_id)?;
    let mut statement = db.conn().prepare_cached(
        "SELECT id, library_id, title, source_path, media_type, byte_size, status,
                error_code, error_message, chunk_count, content_state, content_kind,
                char_count, created_at, updated_at
           FROM knowledge_documents WHERE library_id = ?1
          ORDER BY updated_at DESC, title ASC",
    )?;
    let documents = statement
        .query_map(params![library_id], |row| {
            Ok(KnowledgeDocument {
                id: row.get(0)?,
                library_id: row.get(1)?,
                title: row.get(2)?,
                source_path: row.get(3)?,
                media_type: row.get(4)?,
                byte_size: row.get(5)?,
                status: row.get(6)?,
                error_code: row.get(7)?,
                error_message: row.get(8)?,
                chunk_count: row.get(9)?,
                content_state: row.get(10)?,
                content_kind: row.get(11)?,
                char_count: row.get(12)?,
                created_at: ms_to_ts(row.get(13)?),
                updated_at: ms_to_ts(row.get(14)?),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(json!({ "documents": documents }))
}

const DOCUMENT_COLUMNS: &str = "id, library_id, title, source_path, media_type, byte_size, status,
     error_code, error_message, chunk_count, content_state, content_kind,
     char_count, created_at, updated_at";

fn row_to_document(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeDocument> {
    Ok(KnowledgeDocument {
        id: row.get(0)?,
        library_id: row.get(1)?,
        title: row.get(2)?,
        source_path: row.get(3)?,
        media_type: row.get(4)?,
        byte_size: row.get(5)?,
        status: row.get(6)?,
        error_code: row.get(7)?,
        error_message: row.get(8)?,
        chunk_count: row.get(9)?,
        content_state: row.get(10)?,
        content_kind: row.get(11)?,
        char_count: row.get(12)?,
        created_at: ms_to_ts(row.get(13)?),
        updated_at: ms_to_ts(row.get(14)?),
    })
}

fn load_document(
    db: &Database,
    library_id: &str,
    document_id: &str,
) -> Result<KnowledgeDocument, KnowledgeError> {
    db.conn()
        .prepare_cached(&format!(
            "SELECT {DOCUMENT_COLUMNS} FROM knowledge_documents
              WHERE id = ?1 AND library_id = ?2"
        ))?
        .query_row(params![document_id, library_id], |row| row_to_document(row))
        .optional()?
        .ok_or_else(|| KnowledgeError::invalid("document not found in this library"))
}

/// Upper bound for one reader request. A preview is a reading surface, not an
/// export: cap both chunk count and text so a huge source cannot stall IPC.
pub(crate) const PREVIEW_MAX_CHUNKS: i64 = 400;
pub(crate) const PREVIEW_MAX_CHARS: usize = 240_000;
/// The body endpoint returns the whole document (not a preview). 800k chars
/// keeps an 8 MB Markdown note readable while still bounding one IPC payload.
pub(crate) const CONTENT_MAX_CHARS: usize = 800_000;

pub(crate) fn get_document(db: &Database, params: &Value) -> Result<Value, KnowledgeError> {
    let library_id = library_id_param(params)?;
    let document_id = require_str(params, "documentId")?.to_string();
    get_library_row(db, &library_id)?;
    let document = load_document(db, &library_id, &document_id)?;

    let mut statement = db.conn().prepare_cached(
        "SELECT ordinal, text, char_count, embedding IS NOT NULL
           FROM knowledge_chunks WHERE document_id = ?1
          ORDER BY ordinal ASC LIMIT ?2",
    )?;
    let mut truncated = false;
    let mut total_chars = 0usize;
    let mut chunks = Vec::new();
    let rows = statement.query_map(params![document.id, PREVIEW_MAX_CHUNKS], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, bool>(3)?,
        ))
    })?;
    for row in rows {
        let (ordinal, text, char_count, embedded) = row?;
        if total_chars >= PREVIEW_MAX_CHARS {
            truncated = true;
            break;
        }
        total_chars += text.chars().count();
        chunks.push(json!({
            "ordinal": ordinal,
            "text": text,
            "charCount": char_count,
            "embedded": embedded,
        }));
    }
    Ok(json!({
        "document": document,
        "chunks": chunks,
        "truncated": truncated,
    }))
}

/// `content_kind` is what the reader uses to pick affordances: Markdown renders
/// as authored, extracted PDF/Office text is plain text with no structure, and
/// a manual note is Markdown the user can edit.
pub(crate) fn content_kind_for(media_type: &str, path: Option<&Path>) -> &'static str {
    let extension = path
        .and_then(|value| value.extension())
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    match media_type {
        "text/markdown" => "markdown",
        "application/pdf" => "pdf-text",
        _ if extension == "md" || extension == "markdown" => "markdown",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        | "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => "office-text",
        _ => "text",
    }
}

pub(crate) fn get_document_content(db: &Database, params: &Value) -> Result<Value, KnowledgeError> {
    let library_id = library_id_param(params)?;
    let document_id = require_str(params, "documentId")?.to_string();
    get_library_row(db, &library_id)?;
    let mut document = load_document(db, &library_id, &document_id)?;

    if document.content_state == "legacy" {
        document = backfill_content(db, document)?;
    }

    let content = db
        .conn()
        .prepare_cached("SELECT content_md FROM knowledge_documents WHERE id = ?1")?
        .query_row(params![document_id], |row| row.get::<_, String>(0))?;
    let mut truncated = false;
    let content = if content.chars().count() > CONTENT_MAX_CHARS {
        truncated = true;
        content.chars().take(CONTENT_MAX_CHARS).collect::<String>()
    } else {
        content
    };

    Ok(json!({
        "document": document,
        "content": content,
        "contentKind": document.content_kind,
        "contentState": document.content_state,
        "truncated": truncated,
    }))
}

/// Backfill a document imported before schema v30. The source file is preferred
/// because it still carries the authored Markdown; when the file is gone the
/// chunk store is the only remaining copy, so the chunks are re-joined with the
/// hard-split overlap removed. A failure keeps the row readable (empty body +
/// `failed`) instead of erroring the whole reader.
fn backfill_content(
    db: &Database,
    document: KnowledgeDocument,
) -> Result<KnowledgeDocument, KnowledgeError> {
    let mut content = None;
    let mut kind = document.content_kind.clone();
    if let Some(path) = document.source_path.as_deref() {
        let path = Path::new(path);
        if path.is_file() {
            if let Ok(extracted) = extract::extract(path) {
                kind = content_kind_for(&extracted.media_type, Some(path)).to_string();
                content = Some(extracted.text);
            }
        }
    }
    let (content, state) = match content {
        Some(text) => (text, "ready"),
        None => {
            let chunks = load_chunk_texts(db, &document.id)?;
            if chunks.is_empty() {
                (String::new(), "failed")
            } else {
                (chunk::join_chunks_for_preview(&chunks), "ready")
            }
        }
    };
    let char_count = content.chars().count() as i64;
    db.conn().execute(
        "UPDATE knowledge_documents
            SET content_md = ?2, content_state = ?3, content_kind = ?4, char_count = ?5
          WHERE id = ?1",
        params![document.id, content, state, kind, char_count],
    )?;
    load_document(db, &document.library_id, &document.id)
}

fn load_chunk_texts(db: &Database, document_id: &str) -> Result<Vec<String>, KnowledgeError> {
    let mut statement = db.conn().prepare_cached(
        "SELECT text FROM knowledge_chunks WHERE document_id = ?1 ORDER BY ordinal ASC",
    )?;
    let texts = statement
        .query_map(params![document_id], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(texts)
}

pub(crate) fn save_document_content(
    db: &Database,
    params: &Value,
) -> Result<Value, KnowledgeError> {
    let library_id = library_id_param(params)?;
    let document_id = require_str(params, "documentId")?.to_string();
    get_library_row(db, &library_id)?;
    let document = load_document(db, &library_id, &document_id)?;
    if document.content_kind != "markdown" && document.content_kind != "text" {
        return Err(KnowledgeError::invalid(
            "only text and Markdown documents can be edited",
        ));
    }
    let content = params
        .get("content")
        .and_then(Value::as_str)
        .ok_or_else(|| KnowledgeError::invalid("content required"))?;
    if content.trim().is_empty() {
        return Err(KnowledgeError::invalid("document body cannot be empty"));
    }
    if content.chars().count() > extract::MAX_EXTRACTED_CHARS {
        return Err(KnowledgeError::invalid("document body is too large"));
    }
    let chunks = chunk::chunk_text(content);
    if chunks.is_empty() {
        return Err(KnowledgeError::invalid("document has no readable text"));
    }
    let content_hash = hex::encode(Sha256::digest(content.as_bytes()));
    let char_count = content.chars().count() as i64;
    let now = now_ms();

    let transaction = db.conn().unchecked_transaction()?;
    transaction.execute(
        "UPDATE knowledge_documents
            SET content_md = ?2, content_state = 'ready', content_kind = ?3,
                char_count = ?4, content_hash = ?5, chunk_count = ?6, updated_at = ?7
          WHERE id = ?1",
        params![
            document_id,
            content,
            document.content_kind,
            char_count,
            content_hash,
            chunks.len() as i64,
            now
        ],
    )?;
    transaction.execute(
        "DELETE FROM knowledge_chunks WHERE document_id = ?1",
        params![document_id],
    )?;
    {
        let mut statement = transaction.prepare_cached(
            "INSERT INTO knowledge_chunks
               (library_id, document_id, ordinal, text, char_count, embedding, embedding_dim)
             VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL)",
        )?;
        for (ordinal, chunk_text) in chunks.iter().enumerate() {
            statement.execute(params![
                library_id,
                document_id,
                ordinal as i64,
                chunk_text,
                chunk_text.chars().count() as i64
            ])?;
        }
    }
    transaction.commit()?;

    let document = load_document(db, &library_id, &document_id)?;
    record_activity(
        db,
        "doc.save",
        Some(&library_id),
        Some(&document_id),
        &document.title,
    );
    Ok(json!({ "document": document }))
}

pub(crate) fn import_files(db: &Database, params: &Value) -> Result<Value, KnowledgeError> {
    let library_id = library_id_param(params)?;
    get_library_row(db, &library_id)?;
    let paths = params
        .get("paths")
        .and_then(Value::as_array)
        .ok_or_else(|| KnowledgeError::invalid("paths required"))?;
    if paths.is_empty() || paths.len() > 100 {
        return Err(KnowledgeError::invalid("import 1 to 100 files at a time"));
    }
    let mut outcomes = Vec::with_capacity(paths.len());
    for value in paths {
        let path = value
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| KnowledgeError::invalid("paths must be non-empty strings"))?;
        outcomes.push(import_one_path(db, &library_id, Path::new(path)));
    }
    Ok(json!({ "outcomes": outcomes }))
}

pub(crate) fn import_one_path(db: &Database, library_id: &str, path: &Path) -> ImportOutcome {
    let display = path.to_string_lossy().to_string();
    if !path.is_absolute() || !path.is_file() {
        let outcome = ImportOutcome {
            path: display,
            document_id: None,
            status: "failed".into(),
            error_code: Some("INVALID_PATH".into()),
            error_message: Some(if path.is_absolute() {
                "file not found".into()
            } else {
                "absolute file paths only".into()
            }),
            chunk_count: 0,
        };
        record_failed_import(db, library_id, path, &outcome);
        return outcome;
    }

    let outcome = match extract::extract(path) {
        Ok(extracted) => {
            let title = path
                .file_stem()
                .and_then(|value| value.to_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("document")
                .to_string();
            let byte_size = std::fs::metadata(path)
                .map(|meta| meta.len() as i64)
                .unwrap_or(0);
            match insert_document(
                db,
                library_id,
                &title,
                Some(&display),
                &extracted.media_type,
                byte_size,
                content_kind_for(&extracted.media_type, Some(path)),
                &extracted.text,
            ) {
                Ok((id, chunks, reused)) => ImportOutcome {
                    path: display.clone(),
                    document_id: Some(id),
                    status: if reused {
                        "duplicate".into()
                    } else {
                        "ready".into()
                    },
                    error_code: None,
                    error_message: None,
                    chunk_count: chunks,
                },
                Err(error) => ImportOutcome {
                    path: display.clone(),
                    document_id: None,
                    status: "failed".into(),
                    error_code: Some(error.kind.into()),
                    error_message: Some(error.message),
                    chunk_count: 0,
                },
            }
        }
        Err(error) => ImportOutcome {
            path: display.clone(),
            document_id: None,
            status: "failed".into(),
            error_code: Some(error.code().into()),
            error_message: Some(error.to_string()),
            chunk_count: 0,
        },
    };
    if outcome.status == "failed" {
        record_failed_import(db, library_id, path, &outcome);
    } else {
        let title = path
            .file_stem()
            .and_then(|value| value.to_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("document");
        record_activity(
            db,
            "doc.upload",
            Some(library_id),
            outcome.document_id.as_deref(),
            title,
        );
    }
    outcome
}

/// Import failures still leave a row so the user can see which file did not
/// make it, instead of a silently missing entry.
pub(crate) fn record_failed_import(
    db: &Database,
    library_id: &str,
    path: &Path,
    outcome: &ImportOutcome,
) {
    let title = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("document")
        .to_string();
    let byte_size = std::fs::metadata(path)
        .map(|meta| meta.len() as i64)
        .unwrap_or(0);
    let now = now_ms();
    let id = uuid::Uuid::new_v4().to_string();
    let _ = db.conn().execute(
        "INSERT INTO knowledge_documents
           (id, library_id, title, source_path, media_type, byte_size, status, error_code,
            error_message, chunk_count, content_hash, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'application/octet-stream', ?5, 'failed', ?6, ?7, 0, '', ?8, ?8)",
        params![
            id,
            library_id,
            title,
            path.to_string_lossy(),
            byte_size,
            outcome.error_code.clone(),
            outcome.error_message.clone(),
            now
        ],
    );
}

pub(crate) fn import_text(db: &Database, params: &Value) -> Result<Value, KnowledgeError> {
    let library_id = library_id_param(params)?;
    get_library_row(db, &library_id)?;
    let title = clamp_name(require_str(params, "title")?)?;
    // Keep the authored bytes (trailing newlines included) for the body; only
    // the validation path trims, since a Markdown note's exact text is what the
    // reader renders back.
    let text = params
        .get("text")
        .and_then(Value::as_str)
        .ok_or_else(|| KnowledgeError::invalid("text required"))?;
    if text.trim().is_empty() {
        return Err(KnowledgeError::invalid("text required"));
    }
    if text.chars().count() > extract::MAX_EXTRACTED_CHARS {
        return Err(KnowledgeError::invalid("text is too large"));
    }
    let (id, chunks, reused) = insert_document(
        db,
        &library_id,
        &title,
        optional_str(params, "sourcePath").as_deref(),
        "text/markdown",
        text.len() as i64,
        "markdown",
        text,
    )?;
    record_activity(db, "doc.manual", Some(&library_id), Some(&id), &title);
    Ok(json!({
        "outcome": ImportOutcome {
            path: optional_str(params, "sourcePath").unwrap_or_else(|| title.clone()),
            document_id: Some(id),
            status: if reused { "duplicate".into() } else { "ready".into() },
            error_code: None,
            error_message: None,
            chunk_count: chunks,
        }
    }))
}

pub(crate) fn insert_document(
    db: &Database,
    library_id: &str,
    title: &str,
    source_path: Option<&str>,
    media_type: &str,
    byte_size: i64,
    content_kind: &str,
    text: &str,
) -> Result<(String, i64, bool), KnowledgeError> {
    let content_hash = hex::encode(Sha256::digest(text.as_bytes()));
    if let Some((existing_id, chunk_count)) = db
        .conn()
        .prepare_cached(
            "SELECT id, chunk_count FROM knowledge_documents
              WHERE library_id = ?1 AND content_hash = ?2 AND status = 'ready'
              LIMIT 1",
        )?
        .query_row(params![library_id, content_hash], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .optional()?
    {
        // Re-importing the same bytes is not new content, but it is the best
        // chance to backfill a body that predates schema v30.
        let _ = db.conn().execute(
            "UPDATE knowledge_documents
                SET content_md = ?2, content_state = 'ready', content_kind = ?3,
                    char_count = ?4
              WHERE id = ?1 AND content_state = 'legacy'",
            params![existing_id, text, content_kind, text.chars().count() as i64],
        );
        return Ok((existing_id, chunk_count, true));
    }

    let chunks = chunk::chunk_text(text);
    if chunks.is_empty() {
        return Err(KnowledgeError::invalid("document has no readable text"));
    }
    let char_count = text.chars().count() as i64;

    let now = now_ms();
    let id = uuid::Uuid::new_v4().to_string();
    let transaction = db.conn().unchecked_transaction()?;
    transaction.execute(
        "INSERT INTO knowledge_documents
           (id, library_id, title, source_path, media_type, byte_size, status, error_code,
            error_message, chunk_count, content_hash, content_md, content_state, content_kind,
            char_count, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'ready', NULL, NULL, ?7, ?8, ?9, 'ready', ?10,
                 ?11, ?12, ?12)",
        params![
            id,
            library_id,
            title,
            source_path,
            media_type,
            byte_size,
            chunks.len() as i64,
            content_hash,
            text,
            content_kind,
            char_count,
            now
        ],
    )?;
    {
        let mut statement = transaction.prepare_cached(
            "INSERT INTO knowledge_chunks
               (library_id, document_id, ordinal, text, char_count, embedding, embedding_dim)
             VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL)",
        )?;
        for (ordinal, chunk_text) in chunks.iter().enumerate() {
            statement.execute(params![
                library_id,
                id,
                ordinal as i64,
                chunk_text,
                chunk_text.chars().count() as i64
            ])?;
        }
    }
    transaction.commit()?;
    Ok((id, chunks.len() as i64, false))
}

pub(crate) fn delete_document(db: &Database, params: &Value) -> Result<Value, KnowledgeError> {
    let id = require_str(params, "id")?.to_string();
    let document = db
        .conn()
        .prepare_cached("SELECT library_id, title FROM knowledge_documents WHERE id = ?1")?
        .query_row(params![id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .optional()?;
    let removed = db
        .conn()
        .execute("DELETE FROM knowledge_documents WHERE id = ?1", params![id])?;
    if let Some((library_id, title)) = document {
        if removed > 0 {
            record_activity(db, "doc.delete", Some(&library_id), Some(&id), &title);
        }
    }
    Ok(json!({ "removed": removed > 0 }))
}
