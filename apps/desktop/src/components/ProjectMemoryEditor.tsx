import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectMemory, ProjectMemoryEntry } from "@trail/shared";
import { api } from "../lib/api";
import {
  createProjectMemoryEntry,
  filterProjectMemoryEntries,
  normalizeProjectMemoryEntries,
  projectMemoryEntries as entriesFromMemory,
  projectMemoryEntriesEqual,
} from "../lib/project-memory";
import { Button, Input, Textarea, TooltipButton, cx } from "./ui";
import { IconPlus, IconSparkles, IconTrash } from "./icons";

export type ProjectMemoryProject = {
  name: string;
  path: string;
  groupId?: string;
  legacy?: boolean;
};

/** The one project-memory editor used by both the dialog and Asset Center. */
export function ProjectMemoryEditor({
  project,
  onSaved,
  onError,
  onCancel,
  onDirtyChange,
  onSavingChange,
  search = "",
  autoCreate = false,
  onAutoCreateHandled,
  onBeforeCreate,
  variant = "dialog",
}: {
  project: ProjectMemoryProject;
  onSaved: () => void;
  onError: (error: unknown) => void;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
  search?: string;
  autoCreate?: boolean;
  onAutoCreateHandled?: () => void;
  onBeforeCreate?: () => void;
  variant?: "dialog" | "page";
}) {
  const { t } = useTranslation();
  const [memory, setMemory] = useState<ProjectMemory | null>(null);
  const [entries, setEntries] = useState<ProjectMemoryEntry[]>([]);
  const [savedEntries, setSavedEntries] = useState<ProjectMemoryEntry[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMemory(null);
    const load = project.groupId && !project.legacy
      ? api.getProjectGroupMemory(project.groupId)
      : api.getProjectMemory(project.path);
    void load.then((result) => {
      if (cancelled) return;
      const loadedEntries = entriesFromMemory(result.memory);
      setMemory(result.memory);
      setEntries(loadedEntries);
      setSavedEntries(loadedEntries);
    }).catch((error) => {
      if (!cancelled) onError(error);
    });
    return () => {
      cancelled = true;
    };
  }, [project.groupId, project.legacy, project.path]);

  const dirty = memory !== null && !projectMemoryEntriesEqual(entries, savedEntries);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onSavingChange?.(saving);
  }, [onSavingChange, saving]);

  useEffect(() => {
    if (!autoCreate || memory === null) return;
    onBeforeCreate?.();
    setEntries((current) => [...current, createProjectMemoryEntry()]);
    onAutoCreateHandled?.();
  }, [autoCreate, memory, onAutoCreateHandled, onBeforeCreate]);

  const updateEntry = (id: string, patch: Partial<ProjectMemoryEntry>) => {
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  };

  const addEntry = () => {
    onBeforeCreate?.();
    setEntries((current) => [...current, createProjectMemoryEntry()]);
  };

  const save = async () => {
    const normalized = normalizeProjectMemoryEntries(entries);
    setSaving(true);
    try {
      const result = project.groupId && !project.legacy
        ? await api.saveProjectGroupMemory(project.groupId, normalized)
        : await api.saveProjectMemory(project.path, normalized);
      const saved = entriesFromMemory(result.memory);
      setMemory(result.memory);
      setEntries(saved);
      setSavedEntries(saved);
      onSaved();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  const visibleEntries = useMemo(
    () => filterProjectMemoryEntries(entries, search),
    [entries, search],
  );

  return (
    <div className={cx("project-memory-editor", `is-${variant}`)}>
      <div className="project-memory-dialog-toolbar">
        <span className="project-memory-dialog-count">
          {t("project.memoryCount", { count: entries.length })}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={memory === null || saving}
          onClick={addEntry}
        >
          <IconPlus size={14} aria-hidden />
          {t("project.memoryAdd")}
        </Button>
      </div>
      {visibleEntries.length > 0 ? (
        <div className="project-memory-dialog-list" role="list">
          {visibleEntries.map((entry) => (
            <article className="project-memory-card" key={entry.id} role="listitem">
              <div className="project-memory-card-head">
                <span className="project-memory-entry-index" aria-hidden>
                  {entries.findIndex((item) => item.id === entry.id) + 1}
                </span>
                <Input
                  value={entry.title}
                  placeholder={t("project.memoryEntryTitle")}
                  aria-label={t("project.memoryEntryTitle")}
                  disabled={memory === null || saving}
                  onChange={(event) => updateEntry(entry.id, { title: event.target.value })}
                />
                <TooltipButton
                  type="button"
                  className="project-memory-remove"
                  tooltip={t("project.memoryRemove")}
                  ariaLabel={t("project.memoryRemove")}
                  disabled={saving}
                  onClick={() =>
                    setEntries((current) => current.filter((item) => item.id !== entry.id))
                  }
                >
                  <IconTrash size={15} />
                </TooltipButton>
              </div>
              <Textarea
                className="project-memory-entry-content"
                value={entry.content}
                placeholder={t("project.memoryEntryContent")}
                aria-label={t("project.memoryEntryContent")}
                disabled={memory === null || saving}
                onChange={(event) => updateEntry(entry.id, { content: event.target.value })}
              />
            </article>
          ))}
        </div>
      ) : (
        <div className="project-memory-dialog-empty">
          <IconSparkles size={20} aria-hidden />
          <span>
            {search.trim() && entries.length > 0
              ? t("assets.memoryNoMatches")
              : memory === null
                ? t("common.loading")
                : t("project.memoryEmpty")}
          </span>
          {!search.trim() ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={memory === null || saving}
              onClick={addEntry}
            >
              <IconPlus size={14} aria-hidden />
              {t("project.memoryAdd")}
            </Button>
          ) : null}
        </div>
      )}
      <div className="project-memory-dialog-hint">{t("project.memoryHint")}</div>
      <div className="project-instructions-dialog-actions">
        {onCancel ? (
          <Button variant="ghost" disabled={saving} onClick={onCancel}>
            {t("settings.cancel")}
          </Button>
        ) : null}
        <Button variant="primary" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? t("project.memorySaving") : t("project.memorySave")}
        </Button>
      </div>
    </div>
  );
}
