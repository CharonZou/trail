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
            documents::list_documents(&st.db, params)
        }
        "knowledge.getDocument" => {
            let st = state.lock().await;
            documents::get_document(&st.db, params)
        }
        "knowledge.importFiles" => {
            let st = state.lock().await;
            documents::import_files(&st.db, params)
        }
        "knowledge.importText" => {
            let st = state.lock().await;
            documents::import_text(&st.db, params)
        }
        "knowledge.deleteDocument" => {
            let st = state.lock().await;
            documents::delete_document(&st.db, params)
        }
        "knowledge.search" => retrieval::search(state, params).await,
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

mod documents;
mod retrieval;

pub use retrieval::{index_library, search_for_tool};

#[cfg(test)]
mod tests;
