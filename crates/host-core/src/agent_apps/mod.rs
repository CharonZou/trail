//! Agent applications: a registry of external web apps the desktop opens in the
//! work panel.
//!
//! This module stores and validates entries. It never fetches the target: the
//! desktop browser view loads it, with the same origin and navigation policy as
//! any other preview. `folder` entries resolve to their `index.html` under the
//! existing `file://` preview path; `remote` entries must be http(s).

use std::path::Path;

use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};

use crate::db::{ms_to_ts, now_ms, Database};

pub const SCHEMA: &str = include_str!("schema.sql");

const MAX_APPS: i64 = 200;
const MAX_NAME_CHARS: usize = 120;
const MAX_DESCRIPTION_CHARS: usize = 2_000;
const MAX_ENTRY_CHARS: usize = 2_048;
const MAX_ICON_CHARS: usize = 2_048;

#[derive(Debug)]
pub struct AppError {
    pub code: i64,
    pub kind: &'static str,
    pub message: String,
}

impl AppError {
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

impl From<anyhow::Error> for AppError {
    fn from(error: anyhow::Error) -> Self {
        Self::internal(error.to_string())
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(error: rusqlite::Error) -> Self {
        Self::internal(error.to_string())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentApp {
    pub id: String,
    pub name: String,
    pub description: String,
    pub kind: String,
    pub entry: String,
    pub icon: Option<String>,
    pub enabled: bool,
    pub sort_order: i64,
    pub last_opened_at: Option<String>,
    /// URL the desktop should load, or `None` when the entry is unavailable.
    pub open_url: Option<String>,
    pub available: bool,
    pub unavailable_reason: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub fn handle(db: &Database, method: &str, params: &Value) -> Result<Value, AppError> {
    match method {
        "apps.list" => list_apps(db),
        "apps.create" => create_app(db, params),
        "apps.update" => update_app(db, params),
        "apps.delete" => delete_app(db, params),
        "apps.markOpened" => mark_opened(db, params),
        other => Err(AppError {
            code: 1003,
            kind: "METHOD_NOT_FOUND",
            message: format!("unknown apps method: {other}"),
        }),
    }
}

fn require_str<'a>(params: &'a Value, key: &str) -> Result<&'a str, AppError> {
    params
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::invalid(format!("{key} required")))
}

fn optional_str(params: &Value, key: &str) -> Option<String> {
    params
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn clamp_name(value: &str) -> Result<String, AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid("name required"));
    }
    if trimmed.chars().count() > MAX_NAME_CHARS {
        return Err(AppError::invalid("name is too long"));
    }
    Ok(trimmed.to_string())
}

fn clamp_description(value: Option<String>) -> Result<String, AppError> {
    let value = value.unwrap_or_default();
    if value.chars().count() > MAX_DESCRIPTION_CHARS {
        return Err(AppError::invalid("description is too long"));
    }
    Ok(value)
}

fn clamp_icon(value: Option<String>) -> Result<Option<String>, AppError> {
    match value {
        Some(icon) if icon.chars().count() > MAX_ICON_CHARS => {
            Err(AppError::invalid("icon is too long"))
        }
        other => Ok(other),
    }
}

fn normalize_kind(value: &str) -> Result<&'static str, AppError> {
    match value.trim().to_ascii_lowercase().as_str() {
        "remote" => Ok("remote"),
        "folder" => Ok("folder"),
        _ => Err(AppError::invalid("kind must be 'remote' or 'folder'")),
    }
}

/// A remote entry is an absolute http(s) URL without whitespace or control
/// characters. The desktop browser view applies its own origin policy on top.
fn validate_remote_entry(entry: &str) -> Result<String, AppError> {
    let trimmed = entry.trim();
    if trimmed.chars().count() > MAX_ENTRY_CHARS {
        return Err(AppError::invalid("entry is too long"));
    }
    if trimmed
        .chars()
        .any(|value| value.is_whitespace() || value.is_control())
    {
        return Err(AppError::invalid("entry must not contain whitespace"));
    }
    let lower = trimmed.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err(AppError::invalid(
            "remote entries must be http or https URLs",
        ));
    }
    let after_scheme = trimmed
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or("");
    let host = after_scheme.split('/').next().unwrap_or("");
    if host.is_empty() || host.starts_with(':') {
        return Err(AppError::invalid("entry has no host"));
    }
    Ok(trimmed.to_string())
}

/// A folder entry must be an existing absolute directory containing an
/// `index.html` (or `index.htm`).
fn resolve_folder_entry(entry: &str) -> Result<(String, String), AppError> {
    let path = Path::new(entry.trim());
    if !path.is_absolute() {
        return Err(AppError::invalid("folder entries must be absolute paths"));
    }
    if !path.is_dir() {
        return Err(AppError::invalid(
            "folder entry is not an existing directory",
        ));
    }
    let index = ["index.html", "index.htm"]
        .iter()
        .map(|name| path.join(name))
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| AppError::invalid("folder has no index.html"))?;
    let canonical = std::fs::canonicalize(path)
        .map_err(|error| AppError::invalid(format!("folder cannot be resolved: {error}")))?;
    Ok((canonical.to_string_lossy().to_string(), file_url(&index)))
}

fn file_url(path: &Path) -> String {
    let absolute = path.to_string_lossy().replace('\\', "/");
    let encoded = absolute
        .chars()
        .map(|character| match character {
            ' ' => "%20".to_string(),
            '%' => "%25".to_string(),
            '#' => "%23".to_string(),
            '?' => "%3F".to_string(),
            other => other.to_string(),
        })
        .collect::<String>();
    let with_root = if encoded.starts_with('/') {
        encoded
    } else {
        format!("/{encoded}")
    };
    format!("file://{with_root}")
}

fn compute_open(app: &mut AgentApp) {
    app.open_url = None;
    app.available = false;
    app.unavailable_reason = None;
    match app.kind.as_str() {
        "remote" => {
            app.open_url = Some(app.entry.clone());
            app.available = true;
        }
        "folder" => match resolve_folder_entry(&app.entry) {
            Ok((canonical, url)) => {
                app.entry = canonical;
                app.open_url = Some(url);
                app.available = true;
            }
            Err(error) => app.unavailable_reason = Some(error.message),
        },
        _ => app.unavailable_reason = Some("unknown application kind".into()),
    }
}

fn row_to_app(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentApp> {
    let mut app = AgentApp {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        kind: row.get(3)?,
        entry: row.get(4)?,
        icon: row.get(5)?,
        enabled: row.get::<_, i64>(6)? == 1,
        sort_order: row.get(7)?,
        last_opened_at: row.get::<_, Option<i64>>(8)?.map(ms_to_ts),
        open_url: None,
        available: false,
        unavailable_reason: None,
        created_at: ms_to_ts(row.get(9)?),
        updated_at: ms_to_ts(row.get(10)?),
    };
    compute_open(&mut app);
    Ok(app)
}

fn list_apps(db: &Database) -> Result<Value, AppError> {
    let mut statement = db.conn().prepare_cached(
        "SELECT id, name, description, kind, entry, icon, enabled, sort_order,
                last_opened_at, created_at, updated_at
           FROM agent_apps ORDER BY sort_order ASC, created_at ASC",
    )?;
    let apps = statement
        .query_map([], row_to_app)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(json!({ "apps": apps }))
}

fn get_app(db: &Database, id: &str) -> Result<AgentApp, AppError> {
    db.conn()
        .prepare_cached(
            "SELECT id, name, description, kind, entry, icon, enabled, sort_order,
                    last_opened_at, created_at, updated_at
               FROM agent_apps WHERE id = ?1",
        )?
        .query_row(params![id], row_to_app)
        .optional()?
        .ok_or_else(|| AppError::not_found("application not found"))
}

fn create_app(db: &Database, params: &Value) -> Result<Value, AppError> {
    let name = clamp_name(require_str(params, "name")?)?;
    let description = clamp_description(optional_str(params, "description"))?;
    let kind = normalize_kind(require_str(params, "kind")?)?;
    let entry = require_str(params, "entry")?;
    let (entry, open_url) = match kind {
        "remote" => {
            let entry = validate_remote_entry(entry)?;
            (entry.clone(), Some(entry))
        }
        _ => {
            let (entry, url) = resolve_folder_entry(entry)?;
            (entry, Some(url))
        }
    };
    let icon = clamp_icon(optional_str(params, "icon"))?;
    let enabled = params
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(true);

    let count: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM agent_apps", [], |row| row.get(0))?;
    if count >= MAX_APPS {
        return Err(AppError::invalid("too many applications"));
    }
    let next_order: i64 = db.conn().query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM agent_apps",
        [],
        |row| row.get(0),
    )?;
    let now = now_ms();
    let id = uuid::Uuid::new_v4().to_string();
    db.conn().execute(
        "INSERT INTO agent_apps
           (id, name, description, kind, entry, icon, enabled, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        params![
            id,
            name,
            description,
            kind,
            entry,
            icon,
            if enabled { 1i64 } else { 0 },
            next_order,
            now
        ],
    )?;
    let mut app = get_app(db, &id)?;
    app.open_url = open_url;
    Ok(json!({ "app": app }))
}

fn update_app(db: &Database, params: &Value) -> Result<Value, AppError> {
    let id = require_str(params, "id")?.to_string();
    let current = get_app(db, &id)?;
    let name = match params.get("name").and_then(Value::as_str) {
        Some(value) => clamp_name(value)?,
        None => current.name.clone(),
    };
    let description = match params.get("description") {
        Some(_) => clamp_description(optional_str(params, "description"))?,
        None => current.description.clone(),
    };
    let kind = match params.get("kind").and_then(Value::as_str) {
        Some(value) => normalize_kind(value)?,
        None => normalize_kind(&current.kind)?,
    };
    let entry = match params.get("entry").and_then(Value::as_str) {
        Some(value) => value.trim().to_string(),
        None => current.entry.clone(),
    };
    let entry = match kind {
        "remote" => validate_remote_entry(&entry)?,
        _ => resolve_folder_entry(&entry)?.0,
    };
    let icon = match params.get("icon") {
        Some(_) => clamp_icon(optional_str(params, "icon"))?,
        None => current.icon.clone(),
    };
    let enabled = params
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(current.enabled);

    db.conn().execute(
        "UPDATE agent_apps
            SET name = ?2, description = ?3, kind = ?4, entry = ?5, icon = ?6,
                enabled = ?7, updated_at = ?8
          WHERE id = ?1",
        params![
            id,
            name,
            description,
            kind,
            entry,
            icon,
            if enabled { 1i64 } else { 0 },
            now_ms()
        ],
    )?;
    Ok(json!({ "app": get_app(db, &id)? }))
}

fn delete_app(db: &Database, params: &Value) -> Result<Value, AppError> {
    let id = require_str(params, "id")?;
    let removed = db
        .conn()
        .execute("DELETE FROM agent_apps WHERE id = ?1", params![id])?;
    Ok(json!({ "removed": removed > 0 }))
}

fn mark_opened(db: &Database, params: &Value) -> Result<Value, AppError> {
    let id = require_str(params, "id")?;
    let now = now_ms();
    let updated = db.conn().execute(
        "UPDATE agent_apps SET last_opened_at = ?2 WHERE id = ?1",
        params![id, now],
    )?;
    if updated == 0 {
        return Err(AppError::not_found("application not found"));
    }
    Ok(json!({ "openedAt": ms_to_ts(now) }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_db() -> (tempfile::TempDir, Database) {
        let dir = tempfile::tempdir().expect("temp dir");
        let db = Database::open(&dir.path().join("test.sqlite")).expect("open db");
        (dir, db)
    }

    #[test]
    fn rejects_non_http_remote_entries() {
        let (dir, db) = open_db();
        let error = create_app(
            &db,
            &json!({ "name": "bad", "kind": "remote", "entry": "javascript:alert(1)" }),
        )
        .unwrap_err();
        assert_eq!(error.kind, "INVALID_PARAMS");
        drop(dir);
    }

    #[test]
    fn rejects_relative_folder_entries() {
        let (dir, db) = open_db();
        let error = create_app(
            &db,
            &json!({ "name": "bad", "kind": "folder", "entry": "apps/demo" }),
        )
        .unwrap_err();
        assert_eq!(error.kind, "INVALID_PARAMS");
        drop(dir);
    }

    #[test]
    fn folder_entry_resolves_to_index_file_url() {
        let (dir, db) = open_db();
        let app_dir = dir.path().join("demo app");
        std::fs::create_dir_all(&app_dir).unwrap();
        std::fs::write(app_dir.join("index.html"), "<html></html>").unwrap();
        let value = create_app(
            &db,
            &json!({ "name": "Demo", "kind": "folder", "entry": app_dir.to_string_lossy() }),
        )
        .unwrap();
        let app = &value["app"];
        assert_eq!(app["available"], true);
        let url = app["openUrl"].as_str().unwrap();
        assert!(url.starts_with("file://"));
        assert!(url.ends_with("/index.html"));
        assert!(url.contains("%20"), "spaces are percent-encoded");
    }

    #[test]
    fn folder_without_index_is_unavailable_but_kept() {
        let (dir, db) = open_db();
        let app_dir = dir.path().join("empty");
        std::fs::create_dir_all(&app_dir).unwrap();
        // An existing entry with no index cannot be created: the validation is
        // explicit so the user fixes the folder instead of opening a blank tab.
        let error = create_app(
            &db,
            &json!({ "name": "Empty", "kind": "folder", "entry": app_dir.to_string_lossy() }),
        )
        .unwrap_err();
        assert!(error.message.contains("index.html"));
    }

    #[test]
    fn lists_in_creation_order() {
        let (_dir, db) = open_db();
        create_app(
            &db,
            &json!({ "name": "A", "kind": "remote", "entry": "https://a.example" }),
        )
        .unwrap();
        create_app(
            &db,
            &json!({ "name": "B", "kind": "remote", "entry": "https://b.example" }),
        )
        .unwrap();
        let apps = list_apps(&db).unwrap();
        let list = apps["apps"].as_array().unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0]["name"], "A");
        assert_eq!(list[0]["available"], true);
    }
}
