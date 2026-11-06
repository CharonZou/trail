use super::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::model::{ProjectMemoryEntryRecord, ProjectMemoryRecord, ProjectRecord};
use super::repositories::{
    canonical_project_path, normalize_project_memory_entries, project_display_name,
    render_project_memory_entries, MAX_PROJECT_MEMORY_BYTES,
};

const GROUP_NAMESPACE: &str = "projectGroups";
const GROUP_MEMORY_NAMESPACE: &str = "projectGroupMemory";
const GROUP_INSTRUCTIONS_NAMESPACE: &str = "projectGroupInstructions";
/// Indexing choice of a legacy project, which has no group record of its own.
const GROUP_WORKSPACE_INDEX_NAMESPACE: &str = "projectGroupWorkspaceIndex";
/// Icon and tint of a legacy project, which has no group record of its own.
const GROUP_APPEARANCE_NAMESPACE: &str = "projectGroupAppearance";
pub const MAX_PROJECT_GROUP_NAME_CHARS: usize = 80;
pub const MAX_PROJECT_GROUP_ICON_CHARS: usize = 40;
pub const MAX_PROJECT_GROUP_INSTRUCTIONS_BYTES: usize = 32 * 1024;

pub const REMOTE_PROJECT_PREFIX: &str = "remote-project:";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteWorkspace {
    pub host_key: String,
    pub path: String,
}

impl RemoteWorkspace {
    pub fn validate(&self) -> Result<()> {
        if self.host_key.trim().is_empty()
            || self.host_key.len() > 200
            || self.host_key.contains(':')
            || self.host_key.chars().any(char::is_control)
            || !self.path.starts_with('/')
            || self.path.len() > 4096
            || self.path.chars().any(char::is_control)
        {
            return Err(anyhow!("invalid remote workspace binding"));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGroupRoot {
    pub path: String,
    pub name: String,
    pub position: i64,
}

/// Icon id and tint the user picked for one project. The renderer owns the
/// icon catalog, so the host keeps only the identifier it was handed and never
/// interprets it; the tint is a plain hex color because the renderer writes it
/// straight into a style.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct ProjectGroupAppearance {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

impl ProjectGroupAppearance {
    /// Whether the user has picked nothing, so the project keeps its defaults.
    pub fn is_empty(&self) -> bool {
        self.icon.is_none() && self.color.is_none()
    }

    /// Normalises a submitted pair: trims, lowercases the tint and turns an
    /// empty value into "no choice". Anything the picker could not produce is
    /// refused, because these strings reach the renderer as a style value.
    pub fn normalized(icon: Option<&str>, color: Option<&str>) -> Result<Self> {
        let icon = icon
            .map(valid_icon_id)
            .transpose()?
            .filter(|value| !value.is_empty());
        let color = color
            .map(valid_color)
            .transpose()?
            .filter(|value| !value.is_empty());
        Ok(Self { icon, color })
    }

    fn from_value(value: &Value) -> Self {
        let field = |name: &str| {
            value.get(name).and_then(Value::as_str).and_then(|raw| {
                let text = raw.trim();
                (!text.is_empty()).then(|| text.to_string())
            })
        };
        Self {
            icon: field("icon"),
            color: field("color"),
        }
    }
}

fn valid_icon_id(raw: &str) -> Result<String> {
    let icon = raw.trim();
    if icon.is_empty() {
        return Ok(String::new());
    }
    if icon.len() > MAX_PROJECT_GROUP_ICON_CHARS
        || !icon.starts_with(|c: char| c.is_ascii_alphanumeric())
        || !icon
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return Err(anyhow!("project group icon is invalid"));
    }
    Ok(icon.to_string())
}

fn valid_color(raw: &str) -> Result<String> {
    let color = raw.trim().to_lowercase();
    if color.is_empty() {
        return Ok(String::new());
    }
    let Some(digits) = color.strip_prefix('#') else {
        return Err(anyhow!("project group color must be a hex color"));
    };
    if digits.len() != 6 || !digits.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(anyhow!("project group color must be a hex color"));
    }
    Ok(color)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGroupRecord {
    pub id: String,
    pub name: String,
    pub primary_path: String,
    pub roots: Vec<ProjectGroupRoot>,
    pub created_at: i64,
    pub updated_at: i64,
    pub pinned: bool,
    pub last_opened_at: i64,
    #[serde(default)]
    pub legacy: bool,
    /// Roots removed without chats remain suppressed as legacy projections.
    #[serde(default)]
    pub detached_paths: Vec<String>,
    /// Whether the workspace file index may be built for this project's
    /// folders. Records written before this field existed keep indexing on.
    #[serde(default = "default_workspace_index")]
    pub workspace_index: bool,
    /// Icon and tint the user picked. Records written before this field existed
    /// render with the historical folder glyph.
    #[serde(default, skip_serializing_if = "ProjectGroupAppearance::is_empty")]
    pub appearance: ProjectGroupAppearance,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote: Option<RemoteWorkspace>,
}

fn default_workspace_index() -> bool {
    true
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGroupContextRecord {
    pub group_id: String,
    pub roots: Vec<ProjectGroupRoot>,
    pub instructions: String,
    pub memory: ProjectMemoryRecord,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote: Option<RemoteWorkspace>,
}

fn group_from_value(raw: &str) -> Result<ProjectGroupRecord> {
    let group: ProjectGroupRecord = serde_json::from_str(raw)?;
    if group.id.trim().is_empty() || group.name.trim().is_empty() {
        return Err(anyhow!("project group record is missing an id or name"));
    }
    if group.roots.is_empty() || group.primary_path.trim().is_empty() {
        return Err(anyhow!("project group record must contain a primary root"));
    }
    if group.roots[0].path != group.primary_path {
        return Err(anyhow!("project group primary root must be first"));
    }
    if let Some(remote) = &group.remote {
        remote.validate()?;
        if group.primary_path != format!("{REMOTE_PROJECT_PREFIX}{}", group.id)
            || group.roots.len() != 1
        {
            return Err(anyhow!("invalid remote project identity"));
        }
    } else if group.primary_path.starts_with(REMOTE_PROJECT_PREFIX) {
        return Err(anyhow!("remote project identity requires a binding"));
    }
    Ok(group)
}

fn legacy_group(
    project: &ProjectRecord,
    workspace_index: bool,
    appearance: ProjectGroupAppearance,
) -> ProjectGroupRecord {
    ProjectGroupRecord {
        id: format!("legacy:{}", project.path),
        name: project.name.clone(),
        primary_path: project.path.clone(),
        roots: vec![ProjectGroupRoot {
            path: project.path.clone(),
            name: project.name.clone(),
            position: 0,
        }],
        created_at: project.created_at,
        updated_at: project.last_opened_at,
        pinned: project.pinned,
        last_opened_at: project.last_opened_at,
        legacy: true,
        detached_paths: Vec::new(),
        workspace_index,
        appearance,
        remote: None,
    }
}

impl Database {
    pub fn remote_workspace_for_path(&self, path: &str) -> Result<Option<RemoteWorkspace>> {
        if !path.starts_with(REMOTE_PROJECT_PREFIX) {
            return Ok(None);
        }
        let group = self
            .group_by_id(&path[REMOTE_PROJECT_PREFIX.len()..])?
            .ok_or_else(|| anyhow!("remote project not found"))?;
        if group.primary_path != path {
            return Err(anyhow!("invalid remote project identity"));
        }
        group
            .remote
            .map(Some)
            .ok_or_else(|| anyhow!("remote project binding missing"))
    }

    pub fn create_remote_project_group(
        &self,
        name: &str,
        remote: RemoteWorkspace,
    ) -> Result<ProjectGroupRecord> {
        remote.validate()?;
        let name = name.trim();
        if name.is_empty() || name.chars().count() > MAX_PROJECT_GROUP_NAME_CHARS {
            return Err(anyhow!("project group name is invalid"));
        }
        if self
            .stored_project_groups()?
            .iter()
            .any(|group| group.remote.as_ref() == Some(&remote))
        {
            return Err(anyhow!("folder already belongs to a project group"));
        }
        let id = Uuid::new_v4().to_string();
        let primary_path = format!("{REMOTE_PROJECT_PREFIX}{id}");
        let now = now_ms();
        let group = ProjectGroupRecord {
            id,
            name: name.to_string(),
            primary_path: primary_path.clone(),
            roots: vec![ProjectGroupRoot {
                path: primary_path.clone(),
                name: name.to_string(),
                position: 0,
            }],
            created_at: now,
            updated_at: now,
            pinned: false,
            last_opened_at: now,
            legacy: false,
            detached_paths: Vec::new(),
            workspace_index: true,
            appearance: ProjectGroupAppearance::default(),
            remote: Some(remote),
        };
        let transaction = self.conn.unchecked_transaction()?;
        // The synthetic row owns local session metadata; no remote directory is
        // ever probed, canonicalized or created on this machine.
        self.conn.execute(
            "INSERT INTO projects(path,name,created_at,last_opened_at) VALUES(?1,?2,?3,?3)",
            params![primary_path, name, now],
        )?;
        self.kv_set(GROUP_NAMESPACE, &group.id, &serde_json::to_value(&group)?)?;
        transaction.commit()?;
        Ok(group)
    }

    fn stored_project_groups(&self) -> Result<Vec<ProjectGroupRecord>> {
        let mut stmt = self
            .conn
            .prepare_cached("SELECT value_json FROM kv WHERE ns = ?1 ORDER BY key")?;
        let rows = stmt.query_map(params![GROUP_NAMESPACE], |row| row.get::<_, String>(0))?;
        rows.map(|row| group_from_value(&row?)).collect()
    }

    fn group_by_id(&self, id: &str) -> Result<Option<ProjectGroupRecord>> {
        Ok(self
            .list_project_groups()?
            .into_iter()
            .find(|group| group.id == id))
    }

    pub fn list_project_groups(&self) -> Result<Vec<ProjectGroupRecord>> {
        let projects = self.list_projects()?;
        let stored = self.stored_project_groups()?;
        let mut used_paths = std::collections::HashSet::new();
        let mut groups = Vec::with_capacity(stored.len() + projects.len());

        for group in stored {
            for root in &group.roots {
                let path = canonical_project_path(&root.path)
                    .ok_or_else(|| anyhow!("project group root path must not be blank"))?;
                used_paths.insert(path);
            }
            for path in &group.detached_paths {
                if let Some(path) = canonical_project_path(path) {
                    used_paths.insert(path);
                }
            }
            groups.push(group);
        }
        for project in projects {
            if !used_paths.contains(&project.path) {
                let workspace_index = self.workspace_index_for_path(&project.path)?;
                let appearance = self.appearance_for_path(&project.path)?;
                groups.push(legacy_group(&project, workspace_index, appearance));
            }
        }
        groups.sort_by(|left, right| {
            right
                .pinned
                .cmp(&left.pinned)
                .then(right.last_opened_at.cmp(&left.last_opened_at))
                .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
        });
        Ok(groups)
    }

    pub fn project_group_for_path(&self, path: &str) -> Result<Option<ProjectGroupRecord>> {
        let Some(canonical) = canonical_project_path(path) else {
            return Ok(None);
        };
        Ok(self
            .list_project_groups()?
            .into_iter()
            .find(|group| group.roots.iter().any(|root| root.path == canonical)))
    }

    /// The stored (non-legacy) project group that owns `path` as one of its
    /// roots, if any. A legacy group is only the projection of the project row
    /// itself, so it is never returned here.
    pub fn stored_project_group_for_path(&self, path: &str) -> Result<Option<ProjectGroupRecord>> {
        Ok(self
            .project_group_for_path(path)?
            .filter(|group| !group.legacy))
    }

    /// The indexing choice of a project that has no group record: a legacy
    /// projection keeps its override under its own path, and only when
    /// indexing is off, so an untouched project is always indexed.
    fn workspace_index_for_path(&self, path: &str) -> Result<bool> {
        Ok(self
            .kv_get(GROUP_WORKSPACE_INDEX_NAMESPACE, path)?
            .and_then(|value| value.get("workspaceIndex").and_then(Value::as_bool))
            .unwrap_or(true))
    }

    /// Sets whether the workspace file index may be built for one project.
    /// A stored group keeps the flag on its record; a legacy projection has no
    /// record of its own, so its flag is keyed by the primary path instead.
    pub fn set_workspace_index(&self, id: &str, enabled: bool) -> Result<ProjectGroupRecord> {
        let Some(group) = self.group_by_id(id.trim())? else {
            return Err(anyhow!("project group not found"));
        };
        if group.remote.is_some() {
            return Err(anyhow!("remote projects have no local workspace index"));
        }
        if group.legacy {
            // The key is the stored project path itself, exactly as
            // `list_project_groups` reads it, so a renamed folder cannot make
            // the override unreachable.
            let path = group.primary_path.clone();
            if enabled {
                self.kv_delete(GROUP_WORKSPACE_INDEX_NAMESPACE, &path)?;
            } else {
                self.kv_set(
                    GROUP_WORKSPACE_INDEX_NAMESPACE,
                    &path,
                    &serde_json::json!({ "workspaceIndex": false }),
                )?;
            }
            return Ok(ProjectGroupRecord {
                workspace_index: enabled,
                ..group
            });
        }
        if group.workspace_index == enabled {
            return Ok(group);
        }
        let mut updated = ProjectGroupRecord {
            workspace_index: enabled,
            ..group
        };
        updated.updated_at = now_ms();
        self.kv_set(
            GROUP_NAMESPACE,
            &updated.id,
            &serde_json::to_value(&updated)?,
        )?;
        Ok(updated)
    }

    /// The icon and tint of a project that has no group record. Only what the
    /// user picked is stored, so an untouched project has no row at all.
    fn appearance_for_path(&self, path: &str) -> Result<ProjectGroupAppearance> {
        Ok(self
            .kv_get(GROUP_APPEARANCE_NAMESPACE, path)?
            .map(|value| ProjectGroupAppearance::from_value(&value))
            .unwrap_or_default())
    }

    /// Sets the icon and tint of one project. The pair replaces what was
    /// stored, so an empty field clears it. A stored group keeps the pair on
    /// its record; a legacy projection has no record of its own, so the pair is
    /// keyed by the primary path instead.
    pub fn set_appearance(
        &self,
        id: &str,
        appearance: ProjectGroupAppearance,
    ) -> Result<ProjectGroupRecord> {
        let Some(group) = self.group_by_id(id.trim())? else {
            return Err(anyhow!("project group not found"));
        };
        if group.remote.is_some() {
            return Err(anyhow!("remote projects have no local workspace icon"));
        }
        if group.legacy {
            // The key is the stored project path itself, exactly as
            // `list_project_groups` reads it, so a renamed folder cannot make
            // the choice unreachable.
            let path = group.primary_path.clone();
            if appearance.is_empty() {
                self.kv_delete(GROUP_APPEARANCE_NAMESPACE, &path)?;
            } else {
                self.kv_set(
                    GROUP_APPEARANCE_NAMESPACE,
                    &path,
                    &serde_json::to_value(&appearance)?,
                )?;
            }
            return Ok(ProjectGroupRecord {
                appearance,
                ..group
            });
        }
        if group.appearance == appearance {
            return Ok(group);
        }
        let mut updated = ProjectGroupRecord {
            appearance,
            ..group
        };
        updated.updated_at = now_ms();
        self.kv_set(
            GROUP_NAMESPACE,
            &updated.id,
            &serde_json::to_value(&updated)?,
        )?;
        Ok(updated)
    }

    /// Delete a stored project group record together with its group-scoped
    /// memory and instructions. The underlying project rows are left untouched;
    /// callers remove those separately when appropriate.
    pub fn delete_project_group_record(&self, id: &str) -> Result<()> {
        self.kv_delete(GROUP_NAMESPACE, id)?;
        self.kv_delete(GROUP_MEMORY_NAMESPACE, id)?;
        self.kv_delete(GROUP_INSTRUCTIONS_NAMESPACE, id)?;
        Ok(())
    }

    pub fn create_project_group(&self, name: &str, paths: &[String]) -> Result<ProjectGroupRecord> {
        let name = name.trim();
        if name.is_empty() {
            return Err(anyhow!("project group name must not be blank"));
        }
        if name.chars().count() > MAX_PROJECT_GROUP_NAME_CHARS {
            return Err(anyhow!(
                "project group name exceeds {MAX_PROJECT_GROUP_NAME_CHARS} characters"
            ));
        }
        let mut canonical_paths = Vec::with_capacity(paths.len());
        for raw in paths {
            let path = canonical_project_path(raw)
                .ok_or_else(|| anyhow!("project group root path must not be blank"))?;
            if !Path::new(&path).is_dir() {
                return Err(anyhow!("project group root is not a directory: {path}"));
            }
            if canonical_paths.iter().any(|candidate| candidate == &path) {
                continue;
            }
            if self
                .project_group_for_path(&path)?
                .is_some_and(|group| !group.legacy)
            {
                return Err(anyhow!("folder already belongs to a project group: {path}"));
            }
            canonical_paths.push(path);
        }
        if canonical_paths.is_empty() {
            return Err(anyhow!("project group requires at least one folder"));
        }

        let now = now_ms();
        let roots = canonical_paths
            .iter()
            .enumerate()
            .map(|(position, path)| ProjectGroupRoot {
                path: path.clone(),
                name: project_display_name(path),
                position: position as i64,
            })
            .collect::<Vec<_>>();
        for path in &canonical_paths {
            self.ensure_project(path, false)?;
        }
        let group = ProjectGroupRecord {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            primary_path: canonical_paths[0].clone(),
            roots,
            created_at: now,
            updated_at: now,
            pinned: false,
            last_opened_at: now,
            legacy: false,
            detached_paths: Vec::new(),
            workspace_index: true,
            appearance: ProjectGroupAppearance::default(),
            remote: None,
        };
        self.kv_set(GROUP_NAMESPACE, &group.id, &serde_json::to_value(&group)?)?;
        // The record owns these choices from now on, so a path-keyed fallback
        // left by an earlier legacy project must not outlive creation.
        for path in &canonical_paths {
            self.kv_delete(GROUP_WORKSPACE_INDEX_NAMESPACE, path)?;
            self.kv_delete(GROUP_APPEARANCE_NAMESPACE, path)?;
        }
        Ok(group)
    }

    /// Edits a stored group's display name and ordered roots.
    ///
    /// `primary` selects which selected root becomes the primary root; the
    /// stored primary is kept when it is `None`, and dropping it from `paths`
    /// without naming a replacement is refused. The primary root always stays
    /// first, so naming another root reorders the group around it.
    pub fn update_project_group(
        &self,
        id: &str,
        name: &str,
        paths: &[String],
        primary: Option<&str>,
    ) -> Result<ProjectGroupRecord> {
        let name = name.trim();
        if name.is_empty() || name.chars().count() > MAX_PROJECT_GROUP_NAME_CHARS {
            return Err(anyhow!("project group name is invalid"));
        }
        let Some(current) = self.group_by_id(id.trim())? else {
            return Err(anyhow!("project group not found"));
        };
        if current.remote.is_some() {
            let keeps_current_primary = primary.is_none_or(|path| path == current.primary_path);
            if paths != [current.primary_path.clone()] || !keeps_current_primary {
                return Err(anyhow!("remote project folder binding cannot be changed"));
            }
            return self.rename_project_group(&current.id, name);
        }
        let current_primary = canonical_project_path(&current.primary_path)
            .ok_or_else(|| anyhow!("project group primary path is invalid"))?;
        let requested_primary = primary
            .map(|path| {
                canonical_project_path(path)
                    .ok_or_else(|| anyhow!("project group primary path must not be blank"))
            })
            .transpose()?;
        let mut selected = Vec::with_capacity(paths.len());
        for raw in paths {
            let path = canonical_project_path(raw)
                .ok_or_else(|| anyhow!("project group root path must not be blank"))?;
            // A root this group already owns may have been renamed or unmounted
            // externally since it was stored; editing the group must still be
            // able to keep, reorder, or drop it (#1869). Only folders that are
            // new to the group must exist on disk.
            let is_current_root = current.roots.iter().any(|root| root.path == path);
            if !is_current_root && !Path::new(&path).is_dir() {
                return Err(anyhow!("project group root is not a directory: {path}"));
            }
            if selected.iter().any(|candidate| candidate == &path) {
                continue;
            }
            if let Some(other) = self.project_group_for_path(&path)? {
                if other.id != current.id && !other.legacy {
                    return Err(anyhow!("folder already belongs to a project group: {path}"));
                }
            }
            selected.push(path);
        }
        let primary = match requested_primary {
            Some(requested) if selected.iter().any(|path| path == &requested) => requested,
            Some(requested) => {
                return Err(anyhow!(
                    "the primary folder must be one of the group folders: {requested}"
                ))
            }
            None if selected.iter().any(|path| path == &current_primary) => current_primary,
            None => return Err(anyhow!("the primary folder cannot be removed")),
        };
        let mut ordered = vec![primary.clone()];
        ordered.extend(selected.into_iter().filter(|path| path != &primary));

        let removed = current
            .roots
            .iter()
            .map(|root| root.path.as_str())
            .filter(|path| !ordered.iter().any(|candidate| candidate == path))
            .collect::<Vec<_>>();
        let mut removed_without_sessions = Vec::new();
        for path in &removed {
            let has_sessions: bool = self.conn.query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM sessions s
                    JOIN projects p ON p.id = s.project_id
                    WHERE p.path = ?1
                )",
                params![path],
                |row| row.get(0),
            )?;
            if !has_sessions {
                removed_without_sessions.push(*path);
            }
        }
        for path in &ordered {
            self.ensure_project(path, false)?;
        }

        if current.legacy && ordered.len() == 1 {
            self.conn
                .prepare_cached("UPDATE projects SET name = ?1 WHERE path = ?2")?
                .execute(params![name, primary])?;
            let mut legacy = current;
            legacy.name = name.to_string();
            return Ok(legacy);
        }

        let now = now_ms();
        let roots = ordered
            .iter()
            .enumerate()
            .map(|(position, path)| ProjectGroupRoot {
                path: path.clone(),
                name: project_display_name(path),
                position: position as i64,
            })
            .collect::<Vec<_>>();
        let mut detached_paths = current.detached_paths;
        for path in removed_without_sessions {
            if !detached_paths.iter().any(|candidate| candidate == path) {
                detached_paths.push(path.to_string());
            }
        }
        detached_paths.retain(|path| !ordered.iter().any(|candidate| candidate == path));

        let group = ProjectGroupRecord {
            id: if current.legacy {
                Uuid::new_v4().to_string()
            } else {
                current.id
            },
            name: name.to_string(),
            primary_path: primary,
            roots,
            created_at: current.created_at,
            updated_at: now,
            pinned: current.pinned,
            last_opened_at: current.last_opened_at,
            legacy: false,
            detached_paths,
            workspace_index: current.workspace_index,
            appearance: current.appearance,
            remote: None,
        };
        if current.legacy {
            // The promoted record owns these choices from now on, so the
            // path-keyed fallbacks must not outlive it and re-apply later.
            for path in &ordered {
                self.kv_delete(GROUP_WORKSPACE_INDEX_NAMESPACE, path)?;
                self.kv_delete(GROUP_APPEARANCE_NAMESPACE, path)?;
            }
            // A legacy project may already have path-scoped memory. Merge the
            // memory of every selected legacy root into the new group so
            // upgrading a project never silently discards user context.
            let mut merged_entries = Vec::new();
            for (root_index, path) in ordered.iter().enumerate() {
                let memory = self.get_project_memory(path)?;
                if let Some(entries) = memory.entries {
                    merged_entries.extend(entries.into_iter().map(|entry| {
                        ProjectMemoryEntryRecord {
                            id: format!("root-{root_index}-{}", entry.id),
                            title: entry.title,
                            content: entry.content,
                        }
                    }));
                } else if !memory.content.is_empty() {
                    merged_entries.push(ProjectMemoryEntryRecord {
                        id: format!("root-{root_index}-legacy"),
                        title: project_display_name(path),
                        content: memory.content,
                    });
                }
            }
            if !merged_entries.is_empty() {
                let content = render_project_memory_entries(&merged_entries);
                self.kv_set(
                    GROUP_MEMORY_NAMESPACE,
                    &group.id,
                    &serde_json::json!({
                        "format": "entries-v1",
                        "content": content,
                        "entries": merged_entries,
                        "updatedAt": now_ms()
                    }),
                )?;
            }
        }
        self.kv_set(GROUP_NAMESPACE, &group.id, &serde_json::to_value(&group)?)?;
        Ok(group)
    }

    /// Removes one root from a stored group as part of that project's delete
    /// (#1358). The caller preflights running sessions and then deletes this
    /// project's sessions as part of the same RPC flow. Unlike
    /// `update_project_group`, this may remove the fixed primary root; the
    /// first remaining root becomes primary. Removing the last root deletes
    /// the group record.
    pub fn remove_project_from_group(
        &self,
        id: &str,
        path: &str,
    ) -> Result<Option<ProjectGroupRecord>> {
        let Some(current) = self.group_by_id(id.trim())? else {
            return Err(anyhow!("project group not found"));
        };
        if current.legacy {
            return Ok(Some(current));
        }
        let Some(removed) = current
            .roots
            .iter()
            .find(|root| root.path == path)
            .map(|root| root.path.clone())
        else {
            return Ok(Some(current));
        };
        let remaining: Vec<String> = current
            .roots
            .iter()
            .map(|root| root.path.clone())
            .filter(|candidate| candidate != &removed)
            .collect();
        if remaining.is_empty() {
            self.delete_project_group_record(&current.id)?;
            return Ok(None);
        }
        // The primary moves to the first remaining root when it is removed.
        let primary = if current.primary_path == removed {
            remaining[0].clone()
        } else {
            current.primary_path.clone()
        };
        let ordered = vec![primary.clone()];
        let mut ordered = ordered;
        ordered.extend(
            remaining
                .into_iter()
                .filter(|candidate| candidate != &primary),
        );

        let now = now_ms();
        let roots = ordered
            .iter()
            .enumerate()
            .map(|(position, candidate)| ProjectGroupRoot {
                path: candidate.clone(),
                name: project_display_name(candidate),
                position: position as i64,
            })
            .collect::<Vec<_>>();
        let group = ProjectGroupRecord {
            id: current.id,
            name: current.name,
            primary_path: primary,
            roots,
            created_at: current.created_at,
            updated_at: now,
            pinned: current.pinned,
            last_opened_at: current.last_opened_at,
            legacy: false,
            detached_paths: current.detached_paths,
            workspace_index: current.workspace_index,
            appearance: current.appearance,
            remote: current.remote,
        };
        self.kv_set(GROUP_NAMESPACE, &group.id, &serde_json::to_value(&group)?)?;
        Ok(Some(group))
    }

    pub fn rename_project_group(&self, id: &str, name: &str) -> Result<ProjectGroupRecord> {
        let name = name.trim();
        if name.is_empty() || name.chars().count() > MAX_PROJECT_GROUP_NAME_CHARS {
            return Err(anyhow!("project group name is invalid"));
        }
        let Some(mut group) = self.group_by_id(id.trim())? else {
            return Err(anyhow!("project group not found"));
        };
        if group.legacy {
            self.conn
                .prepare_cached("UPDATE projects SET name = ?1 WHERE path = ?2")?
                .execute(params![name, group.primary_path])?;
        } else {
            group.name = name.to_string();
            if group.remote.is_some() {
                group.roots[0].name = name.to_string();
                self.conn.execute(
                    "UPDATE projects SET name = ?1 WHERE path = ?2",
                    params![name, group.primary_path],
                )?;
            }
            group.updated_at = now_ms();
            self.kv_set(GROUP_NAMESPACE, &group.id, &serde_json::to_value(&group)?)?;
        }
        group.name = name.to_string();
        Ok(group)
    }

    pub fn get_project_group_memory(&self, id: &str) -> Result<ProjectMemoryRecord> {
        let Some(group) = self.group_by_id(id)? else {
            return Err(anyhow!("project group not found"));
        };
        if group.legacy {
            return self.get_project_memory(&group.primary_path);
        }
        let value = self.kv_get(GROUP_MEMORY_NAMESPACE, &group.id)?;
        let content = value
            .as_ref()
            .and_then(|item| item.get("content"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let updated_at = value
            .as_ref()
            .and_then(|item| item.get("updatedAt"))
            .and_then(Value::as_i64)
            .unwrap_or_default();
        let entries = value
            .as_ref()
            .and_then(super::repositories::parse_project_memory_entries);
        Ok(ProjectMemoryRecord {
            content,
            entries,
            updated_at,
        })
    }

    pub fn set_project_group_memory(
        &self,
        id: &str,
        raw_entries: &Value,
    ) -> Result<ProjectMemoryRecord> {
        let Some(group) = self.group_by_id(id)? else {
            return Err(anyhow!("project group not found"));
        };
        if group.legacy {
            return self.set_project_memory_entries(&group.primary_path, raw_entries);
        }
        let entries = normalize_project_memory_entries(raw_entries)?;
        let content = render_project_memory_entries(&entries);
        if content.len() > MAX_PROJECT_MEMORY_BYTES {
            return Err(anyhow!(
                "project memory exceeds {MAX_PROJECT_MEMORY_BYTES} bytes"
            ));
        }
        let updated_at = now_ms();
        self.kv_set(
            GROUP_MEMORY_NAMESPACE,
            &group.id,
            &serde_json::json!({
                "format": "entries-v1",
                "content": content,
                "entries": entries,
                "updatedAt": updated_at
            }),
        )?;
        Ok(ProjectMemoryRecord {
            content,
            entries: Some(entries),
            updated_at,
        })
    }

    pub fn get_project_group_instructions(&self, id: &str) -> Result<String> {
        let Some(group) = self.group_by_id(id)? else {
            return Err(anyhow!("project group not found"));
        };
        if group.legacy {
            return Ok(String::new());
        }
        Ok(self
            .kv_get(GROUP_INSTRUCTIONS_NAMESPACE, &group.id)?
            .and_then(|value| {
                value
                    .get("content")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .unwrap_or_default())
    }

    pub fn set_project_group_instructions(&self, id: &str, content: &str) -> Result<String> {
        let Some(group) = self.group_by_id(id)? else {
            return Err(anyhow!("project group not found"));
        };
        if group.legacy {
            return Err(anyhow!("legacy project groups use folder instructions"));
        }
        if content.len() > MAX_PROJECT_GROUP_INSTRUCTIONS_BYTES {
            return Err(anyhow!(
                "project instructions exceed {MAX_PROJECT_GROUP_INSTRUCTIONS_BYTES} bytes"
            ));
        }
        self.kv_set(
            GROUP_INSTRUCTIONS_NAMESPACE,
            &group.id,
            &serde_json::json!({ "content": content, "updatedAt": now_ms() }),
        )?;
        Ok(content.to_string())
    }

    pub fn project_group_context_for_path(
        &self,
        path: &str,
    ) -> Result<Option<ProjectGroupContextRecord>> {
        let Some(group) = self.project_group_for_path(path)? else {
            return Ok(None);
        };
        if group.legacy {
            return Ok(None);
        }
        Ok(Some(ProjectGroupContextRecord {
            group_id: group.id.clone(),
            roots: group.roots,
            instructions: self.get_project_group_instructions(&group.id)?,
            memory: self.get_project_group_memory(&group.id)?,
            remote: group.remote,
        }))
    }
}
