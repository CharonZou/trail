//! Knowledge libraries: local document ingestion, chunking, keyword + vector
//! retrieval, and the `knowledge.*` RPC surface.
//!
//! SQLite is owned by host-core, so this module is the only writer. The desktop
//! shell supplies absolute file paths it obtained from a native picker; the
//! module validates them again and never accepts a remote path.

pub mod chunk;
pub mod embed;
pub mod extract;

use std::path::Path;
use std::sync::Arc;

use chrono::{Duration, Local, TimeZone};
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::sync::Mutex;

use crate::db::{ms_to_ts, now_ms, Database};
use crate::providers;
use crate::state::AppState;

pub const SCHEMA: &str = include_str!("schema.sql");

const MAX_LIBRARIES: i64 = 500;
const MAX_NAME_CHARS: usize = 120;
const MAX_DESCRIPTION_CHARS: usize = 2_000;
const MAX_QUERY_CHARS: usize = 512;
const DEFAULT_LIMIT: i64 = 8;
const MAX_LIMIT: i64 = 32;
const EMBED_BATCH: usize = 16;
/// Activity rows kept globally; older rows are pruned on every insert so this
/// local trail never grows unbounded.
const ACTIVITY_KEEP: i64 = 500;

#[derive(Debug)]
pub struct KnowledgeError {
    pub code: i64,
    pub kind: &'static str,
    pub message: String,
}

impl KnowledgeError {
    fn invalid(message: impl Into<String>) -> Self {
        Self {
            code: 1002,
            kind: "INVALID_PARAMS",
            message: message.into(),
        }
    }

    fn not_found(message: impl Into<String>) -> Self {
        Self {
            code: 1007,
            kind: "NOT_FOUND",
            message: message.into(),
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self {
            code: 1000,
            kind: "INTERNAL",
            message: message.into(),
        }
    }
}

impl From<anyhow::Error> for KnowledgeError {
    fn from(error: anyhow::Error) -> Self {
        Self::internal(error.to_string())
    }
}

impl From<rusqlite::Error> for KnowledgeError {
    fn from(error: rusqlite::Error) -> Self {
        Self::internal(error.to_string())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeLibrary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub embedding_provider_id: Option<String>,
    pub embedding_model: Option<String>,
    pub semantic_enabled: bool,
    /// Searchable documents (`status = 'ready'`).
    pub document_count: i64,
    /// Every document row, including failed imports.
    pub document_total: i64,
    pub failed_document_count: i64,
    /// Ready documents whose chunks are not embedded yet. Meaningful only when
    /// `semantic_enabled`; the hub reports these as "still indexing".
    pub vector_pending_document_count: i64,
    pub chunk_count: i64,
    pub embedded_chunk_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeActivity {
    pub id: i64,
    pub library_id: Option<String>,
    pub document_id: Option<String>,
    pub action: String,
    pub title: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeDocument {
    pub id: String,
    pub library_id: String,
    pub title: String,
    pub source_path: Option<String>,
    pub media_type: String,
    pub byte_size: i64,
    pub status: String,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub chunk_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSearchHit {
    pub document_id: String,
    pub document_title: String,
    pub source_path: Option<String>,
    pub chunk_ordinal: i64,
    pub snippet: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSearchResult {
    pub query: String,
    pub mode: String,
    /// True when semantic or hybrid search fell back to keyword-only results.
    pub degraded: bool,
    pub hits: Vec<KnowledgeSearchHit>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOutcome {
    pub path: String,
    pub document_id: Option<String>,
    pub status: String,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub chunk_count: i64,
}

pub(crate) struct EmbeddingConfig {
    provider_id: String,
    model: String,
    base_url: String,
    api_key: Option<String>,
    headers: Vec<(String, String)>,
}

pub async fn handle(
    state: Arc<Mutex<AppState>>,
    method: &str,
    params: &Value,
) -> Result<Value, KnowledgeError> {
    match method {
        "knowledge.listLibraries" => {
            let st = state.lock().await;
            list_libraries(&st.db)
        }
        "knowledge.createLibrary" => {
            let st = state.lock().await;
            create_library(&st.db, &st.secrets, params)
        }
        "knowledge.updateLibrary" => {
            let st = state.lock().await;
            update_library(&st.db, &st.secrets, params)
        }
        "knowledge.deleteLibrary" => {
            let st = state.lock().await;
            delete_library(&st.db, params)
        }
        "knowledge.listDocuments" => {
            let st = state.lock().await;
            list_documents(&st.db, params)
        }
        "knowledge.getDocument" => {
            let st = state.lock().await;
            get_document(&st.db, params)
        }
        "knowledge.importFiles" => {
            let st = state.lock().await;
            import_files(&st.db, params)
        }
        "knowledge.importText" => {
            let st = state.lock().await;
            import_text(&st.db, params)
        }
        "knowledge.deleteDocument" => {
            let st = state.lock().await;
            delete_document(&st.db, params)
        }
        "knowledge.search" => search(state, params).await,
        "knowledge.indexLibrary" => index_library(state, params).await,
        "knowledge.listActivities" => {
            let st = state.lock().await;
            list_activities(&st.db, params)
        }
        "knowledge.activityTrend" => {
            let st = state.lock().await;
            activity_trend(&st.db, params)
        }
        "knowledge.supportedExtensions" => Ok(json!({
            "extensions": extract::supported_extensions(),
            "maxBytes": extract::MAX_IMPORT_BYTES,
        })),
        other => Err(KnowledgeError {
            code: 1003,
            kind: "METHOD_NOT_FOUND",
            message: format!("unknown knowledge method: {other}"),
        }),
    }
}

fn require_str<'a>(params: &'a Value, key: &str) -> Result<&'a str, KnowledgeError> {
    params
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| KnowledgeError::invalid(format!("{key} required")))
}

fn optional_str(params: &Value, key: &str) -> Option<String> {
    params
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn clamp_name(value: &str) -> Result<String, KnowledgeError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(KnowledgeError::invalid("name required"));
    }
    if value.chars().count() > MAX_NAME_CHARS {
        return Err(KnowledgeError::invalid("name is too long"));
    }
    Ok(value.to_string())
}

fn clamp_description(value: Option<String>) -> Result<String, KnowledgeError> {
    let value = value.unwrap_or_default();
    if value.chars().count() > MAX_DESCRIPTION_CHARS {
        return Err(KnowledgeError::invalid("description is too long"));
    }
    Ok(value)
}

fn library_id_param(params: &Value) -> Result<String, KnowledgeError> {
    Ok(require_str(params, "libraryId")?.to_string())
}

fn get_library_row(db: &Database, id: &str) -> Result<KnowledgeLibrary, KnowledgeError> {
    db.conn()
        .prepare_cached(
            "SELECT l.id, l.name, l.description, l.embedding_provider_id, l.embedding_model,
                    l.semantic_enabled, l.created_at, l.updated_at,
                    (SELECT COUNT(*) FROM knowledge_documents d WHERE d.library_id = l.id AND d.status = 'ready'),
                    (SELECT COUNT(*) FROM knowledge_chunks c WHERE c.library_id = l.id),
                    (SELECT COUNT(*) FROM knowledge_chunks c WHERE c.library_id = l.id AND c.embedding IS NOT NULL),
                    (SELECT COUNT(*) FROM knowledge_documents d WHERE d.library_id = l.id),
                    (SELECT COUNT(*) FROM knowledge_documents d WHERE d.library_id = l.id AND d.status = 'failed'),
                    (SELECT COUNT(*) FROM knowledge_documents d
                      WHERE l.semantic_enabled = 1
                        AND d.library_id = l.id AND d.status = 'ready'
                        AND EXISTS (SELECT 1 FROM knowledge_chunks c
                                     WHERE c.document_id = d.id AND c.embedding IS NULL))
             FROM knowledge_libraries l WHERE l.id = ?1",
        )?
        .query_row(params![id], |row| {
            Ok(KnowledgeLibrary {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                embedding_provider_id: row.get(3)?,
                embedding_model: row.get(4)?,
                semantic_enabled: row.get::<_, i64>(5)? == 1,
                created_at: ms_to_ts(row.get(6)?),
                updated_at: ms_to_ts(row.get(7)?),
                document_count: row.get(8)?,
                chunk_count: row.get(9)?,
                embedded_chunk_count: row.get(10)?,
                document_total: row.get(11)?,
                failed_document_count: row.get(12)?,
                vector_pending_document_count: row.get(13)?,
            })
        })
        .optional()?
        .ok_or_else(|| KnowledgeError::not_found("library not found"))
}

fn list_libraries(db: &Database) -> Result<Value, KnowledgeError> {
    let mut statement = db.conn().prepare_cached(
        "SELECT l.id, l.name, l.description, l.embedding_provider_id, l.embedding_model,
                l.semantic_enabled, l.created_at, l.updated_at,
                (SELECT COUNT(*) FROM knowledge_documents d WHERE d.library_id = l.id AND d.status = 'ready'),
                (SELECT COUNT(*) FROM knowledge_chunks c WHERE c.library_id = l.id),
                (SELECT COUNT(*) FROM knowledge_chunks c WHERE c.library_id = l.id AND c.embedding IS NOT NULL),
                (SELECT COUNT(*) FROM knowledge_documents d WHERE d.library_id = l.id),
                (SELECT COUNT(*) FROM knowledge_documents d WHERE d.library_id = l.id AND d.status = 'failed'),
                (SELECT COUNT(*) FROM knowledge_documents d
                  WHERE l.semantic_enabled = 1
                    AND d.library_id = l.id AND d.status = 'ready'
                    AND EXISTS (SELECT 1 FROM knowledge_chunks c
                                 WHERE c.document_id = d.id AND c.embedding IS NULL))
         FROM knowledge_libraries l
         ORDER BY l.updated_at DESC, l.name ASC",
    )?;
    let libraries = statement
        .query_map([], |row| {
            Ok(KnowledgeLibrary {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                embedding_provider_id: row.get(3)?,
                embedding_model: row.get(4)?,
                semantic_enabled: row.get::<_, i64>(5)? == 1,
                created_at: ms_to_ts(row.get(6)?),
                updated_at: ms_to_ts(row.get(7)?),
                document_count: row.get(8)?,
                chunk_count: row.get(9)?,
                embedded_chunk_count: row.get(10)?,
                document_total: row.get(11)?,
                failed_document_count: row.get(12)?,
                vector_pending_document_count: row.get(13)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(json!({ "libraries": libraries }))
}

/// Short human-readable label stored with an activity row. Keeps the table
/// free of user file contents beyond what the UI already shows as a title.
fn activity_title(value: &str, max: usize) -> String {
    let trimmed = value.trim();
    let mut out = String::with_capacity(trimmed.len().min(max * 4));
    for (count, ch) in trimmed.chars().enumerate() {
        if count >= max {
            out.push('…');
            break;
        }
        out.push(ch);
    }
    out
}

/// Best-effort activity trail write. A failure here must never fail the
/// operation the user asked for, so the error is logged and dropped.
fn record_activity(
    db: &Database,
    action: &str,
    library_id: Option<&str>,
    document_id: Option<&str>,
    title: &str,
) {
    let result =
        (|| -> anyhow::Result<()> {
            db.conn().execute(
            "INSERT INTO knowledge_activity (library_id, document_id, action, title, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![library_id, document_id, action, activity_title(title, 80), now_ms()],
        )?;
            db.conn().execute(
                "DELETE FROM knowledge_activity
              WHERE id NOT IN (SELECT id FROM knowledge_activity
                                ORDER BY created_at DESC, id DESC LIMIT ?1)",
                params![ACTIVITY_KEEP],
            )?;
            Ok(())
        })();
    if let Err(error) = result {
        eprintln!("[knowledge] failed to record activity {action}: {error}");
    }
}

fn list_activities(db: &Database, params: &Value) -> Result<Value, KnowledgeError> {
    let limit = params
        .get("limit")
        .and_then(Value::as_i64)
        .unwrap_or(5)
        .clamp(1, 50);
    let library_id = optional_str(params, "libraryId");
    let mut statement = db.conn().prepare_cached(
        "SELECT id, library_id, document_id, action, title, created_at
           FROM knowledge_activity
          WHERE (?1 IS NULL OR library_id = ?1)
          ORDER BY created_at DESC, id DESC
          LIMIT ?2",
    )?;
    let activities = statement
        .query_map(params![library_id, limit], |row| {
            Ok(KnowledgeActivity {
                id: row.get(0)?,
                library_id: row.get(1)?,
                document_id: row.get(2)?,
                action: row.get(3)?,
                title: row.get(4)?,
                created_at: ms_to_ts(row.get(5)?),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(json!({ "activities": activities }))
}

/// Daily search/ask counts for the hub's visit-trend card. Only retrieval
/// actions count as "visits"; uploads and library edits are not visits.
fn activity_trend(db: &Database, params: &Value) -> Result<Value, KnowledgeError> {
    let days = params
        .get("days")
        .and_then(Value::as_i64)
        .unwrap_or(7)
        .clamp(1, 30);
    let today = Local::now().date_naive();
    let first = today - Duration::days(days - 1);
    let first_ts = Local
        .from_local_datetime(&first.and_hms_opt(0, 0, 0).expect("midnight is valid"))
        .single()
        .map(|dt| dt.timestamp_millis())
        .unwrap_or(0);

    let mut counts: std::collections::BTreeMap<chrono::NaiveDate, i64> =
        std::collections::BTreeMap::new();
    {
        let mut statement = db.conn().prepare_cached(
            "SELECT created_at FROM knowledge_activity
              WHERE action IN ('search', 'ask') AND created_at >= ?1",
        )?;
        let mut rows = statement.query(params![first_ts])?;
        while let Some(row) = rows.next()? {
            let ts: i64 = row.get(0)?;
            if let Some(dt) = Local.timestamp_millis_opt(ts).single() {
                *counts.entry(dt.date_naive()).or_insert(0) += 1;
            }
        }
    }

    let mut points = Vec::with_capacity(days as usize);
    for offset in 0..days {
        let day = first + Duration::days(offset);
        points.push(json!({
            "day": day.format("%Y-%m-%d").to_string(),
            "searches": counts.get(&day).copied().unwrap_or(0),
        }));
    }
    Ok(json!({ "points": points, "days": days }))
}

fn create_library(
    db: &Database,
    secrets: &crate::secrets::SecretStore,
    params: &Value,
) -> Result<Value, KnowledgeError> {
    let name = clamp_name(require_str(params, "name")?)?;
    let description = clamp_description(optional_str(params, "description"))?;
    let provider_id = optional_str(params, "embeddingProviderId");
    let model = optional_str(params, "embeddingModel");
    let semantic = params
        .get("semanticEnabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let (provider_id, model) =
        validate_embedding_config(db, secrets, provider_id, model, semantic)?;
    let count: i64 =
        db.conn()
            .query_row("SELECT COUNT(*) FROM knowledge_libraries", [], |row| {
                row.get(0)
            })?;
    if count >= MAX_LIBRARIES {
        return Err(KnowledgeError::invalid("too many libraries"));
    }

    let now = now_ms();
    let id = uuid::Uuid::new_v4().to_string();
    db.conn().execute(
        "INSERT INTO knowledge_libraries
           (id, name, description, embedding_provider_id, embedding_model, semantic_enabled, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![id, name, description, provider_id, model, if semantic { 1i64 } else { 0 }, now],
    )?;
    record_activity(db, "base.create", Some(&id), None, &name);
    Ok(json!({ "library": get_library_row(db, &id)? }))
}

fn validate_embedding_config(
    db: &Database,
    secrets: &crate::secrets::SecretStore,
    provider_id: Option<String>,
    model: Option<String>,
    semantic: bool,
) -> Result<(Option<String>, Option<String>), KnowledgeError> {
    match (provider_id, model) {
        (None, None) => {
            if semantic {
                return Err(KnowledgeError::invalid(
                    "semantic search needs an embedding provider and model",
                ));
            }
            Ok((None, None))
        }
        (Some(provider_id), Some(model)) => {
            let provider = providers::get_provider(db, secrets, &provider_id)
                .map_err(|error| KnowledgeError::internal(error.to_string()))?
                .ok_or_else(|| KnowledgeError::invalid("embedding provider not found"))?;
            if provider.base_url.as_deref().unwrap_or("").trim().is_empty() {
                return Err(KnowledgeError::invalid(
                    "embedding provider needs a base URL",
                ));
            }
            if provider.protocol != "openai" && provider.api_style.as_deref() != Some("openai") {
                // The MVP embedding call is the OpenAI-compatible `/embeddings`
                // shape; other protocols would silently return the wrong body.
                return Err(KnowledgeError::invalid(
                    "embedding provider must speak the OpenAI-compatible API",
                ));
            }
            Ok((Some(provider_id), Some(model)))
        }
        _ => Err(KnowledgeError::invalid(
            "embedding provider and model must be set together",
        )),
    }
}

fn update_library(
    db: &Database,
    secrets: &crate::secrets::SecretStore,
    params: &Value,
) -> Result<Value, KnowledgeError> {
    let id = require_str(params, "id")?.to_string();
    let current = get_library_row(db, &id)?;
    let name = match params.get("name").and_then(Value::as_str) {
        Some(value) => clamp_name(value)?,
        None => current.name.clone(),
    };
    let description = match params.get("description") {
        Some(_) => clamp_description(optional_str(params, "description"))?,
        None => current.description.clone(),
    };
    let provider_id = match params.get("embeddingProviderId") {
        Some(Value::Null) => None,
        Some(Value::String(value)) if value.trim().is_empty() => None,
        Some(Value::String(value)) => Some(value.trim().to_string()),
        Some(_) => {
            return Err(KnowledgeError::invalid(
                "embeddingProviderId must be a string",
            ))
        }
        None => current.embedding_provider_id.clone(),
    };
    let model = match params.get("embeddingModel") {
        Some(Value::Null) => None,
        Some(Value::String(value)) if value.trim().is_empty() => None,
        Some(Value::String(value)) => Some(value.trim().to_string()),
        Some(_) => return Err(KnowledgeError::invalid("embeddingModel must be a string")),
        None => current.embedding_model.clone(),
    };
    let semantic = params
        .get("semanticEnabled")
        .and_then(Value::as_bool)
        .unwrap_or(current.semantic_enabled);
    let (provider_id, model) =
        validate_embedding_config(db, secrets, provider_id, model, semantic)?;

    let config_changed =
        provider_id != current.embedding_provider_id || model != current.embedding_model;
    db.conn().execute(
        "UPDATE knowledge_libraries
            SET name = ?2, description = ?3, embedding_provider_id = ?4, embedding_model = ?5,
                semantic_enabled = ?6, updated_at = ?7
          WHERE id = ?1",
        params![
            id,
            name,
            description,
            provider_id,
            model,
            if semantic { 1i64 } else { 0 },
            now_ms()
        ],
    )?;
    if config_changed {
        // Vectors from the previous model are not comparable with the new one.
        db.conn().execute(
            "UPDATE knowledge_chunks SET embedding = NULL, embedding_dim = NULL WHERE library_id = ?1",
            params![id],
        )?;
    }
    Ok(json!({ "library": get_library_row(db, &id)? }))
}

fn delete_library(db: &Database, params: &Value) -> Result<Value, KnowledgeError> {
    let id = require_str(params, "id")?.to_string();
    let library = get_library_row(db, &id)?;
    record_activity(db, "base.delete", Some(&id), None, &library.name);
    let removed = db
        .conn()
        .execute("DELETE FROM knowledge_libraries WHERE id = ?1", params![id])?;
    if removed > 0 {
        // Deleting the library removes its rows; the trail keeps the deleted
        // library's history, so drop rows pointing at nothing else.
        db.conn().execute(
            "DELETE FROM knowledge_activity
              WHERE library_id = ?1
                AND action IN ('doc.upload', 'doc.manual', 'doc.save', 'doc.delete',
                               'folder.import', 'index.run', 'ask', 'search')",
            params![id],
        )?;
    }
    Ok(json!({ "removed": removed > 0 }))
}

fn list_documents(db: &Database, params: &Value) -> Result<Value, KnowledgeError> {
    let library_id = library_id_param(params)?;
    get_library_row(db, &library_id)?;
    let mut statement = db.conn().prepare_cached(
        "SELECT id, library_id, title, source_path, media_type, byte_size, status,
                error_code, error_message, chunk_count, created_at, updated_at
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
                created_at: ms_to_ts(row.get(10)?),
                updated_at: ms_to_ts(row.get(11)?),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(json!({ "documents": documents }))
}

/// Upper bound for one reader request. A preview is a reading surface, not an
/// export: cap both chunk count and text so a huge source cannot stall IPC.
const PREVIEW_MAX_CHUNKS: i64 = 400;
const PREVIEW_MAX_CHARS: usize = 240_000;

fn get_document(db: &Database, params: &Value) -> Result<Value, KnowledgeError> {
    let library_id = library_id_param(params)?;
    let document_id = require_str(params, "documentId")?.to_string();
    get_library_row(db, &library_id)?;
    let document = db
        .conn()
        .prepare_cached(
            "SELECT id, library_id, title, source_path, media_type, byte_size, status,
                    error_code, error_message, chunk_count, created_at, updated_at
               FROM knowledge_documents WHERE id = ?1 AND library_id = ?2",
        )?
        .query_row(params![document_id, library_id], |row| {
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
                created_at: ms_to_ts(row.get(10)?),
                updated_at: ms_to_ts(row.get(11)?),
            })
        })
        .optional()?
        .ok_or_else(|| KnowledgeError::invalid("document not found in this library"))?;

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


fn import_files(db: &Database, params: &Value) -> Result<Value, KnowledgeError> {
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

fn import_one_path(db: &Database, library_id: &str, path: &Path) -> ImportOutcome {
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
fn record_failed_import(db: &Database, library_id: &str, path: &Path, outcome: &ImportOutcome) {
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

fn import_text(db: &Database, params: &Value) -> Result<Value, KnowledgeError> {
    let library_id = library_id_param(params)?;
    get_library_row(db, &library_id)?;
    let title = clamp_name(require_str(params, "title")?)?;
    let text = require_str(params, "text")?;
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

fn insert_document(
    db: &Database,
    library_id: &str,
    title: &str,
    source_path: Option<&str>,
    media_type: &str,
    byte_size: i64,
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
        return Ok((existing_id, chunk_count, true));
    }

    let chunks = chunk::chunk_text(text);
    if chunks.is_empty() {
        return Err(KnowledgeError::invalid("document has no readable text"));
    }

    let now = now_ms();
    let id = uuid::Uuid::new_v4().to_string();
    let transaction = db.conn().unchecked_transaction()?;
    transaction.execute(
        "INSERT INTO knowledge_documents
           (id, library_id, title, source_path, media_type, byte_size, status, error_code,
            error_message, chunk_count, content_hash, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'ready', NULL, NULL, ?7, ?8, ?9, ?9)",
        params![
            id,
            library_id,
            title,
            source_path,
            media_type,
            byte_size,
            chunks.len() as i64,
            content_hash,
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

fn delete_document(db: &Database, params: &Value) -> Result<Value, KnowledgeError> {
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

fn parse_mode(params: &Value) -> Result<&'static str, KnowledgeError> {
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

fn parse_limit(params: &Value) -> i64 {
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

async fn search(state: Arc<Mutex<AppState>>, params: &Value) -> Result<Value, KnowledgeError> {
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
                        embed::embed_texts(&config, &[query.clone()])
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
struct RankedHit {
    document_id: String,
    document_title: String,
    source_path: Option<String>,
    chunk_ordinal: i64,
    text: String,
    score: f64,
}

fn keyword_search(
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

fn map_ranked_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<RankedHit> {
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

fn vector_search(
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

fn fuse_hybrid(
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

fn make_snippet(text: &str, query: &str) -> String {
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

fn embedding_config_for_library(
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

fn provider_secret(
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

fn unembedded_chunks(
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

fn unembedded_count(db: &Database, library_id: &str) -> Result<i64, KnowledgeError> {
    Ok(db.conn().query_row(
        "SELECT COUNT(*) FROM knowledge_chunks WHERE library_id = ?1 AND embedding IS NULL",
        params![library_id],
        |row| row.get(0),
    )?)
}

#[cfg(test)]
mod tests;
