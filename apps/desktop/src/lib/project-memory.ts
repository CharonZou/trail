import type { ProjectMemory, ProjectMemoryEntry } from "@trail/shared";

export function createProjectMemoryEntry(): ProjectMemoryEntry {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    "memory-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  return { id, title: "", content: "" };
}

export function projectMemoryEntries(memory: ProjectMemory | null): ProjectMemoryEntry[] {
  if (!memory) return [];
  if (memory.entries) return memory.entries;
  const content = memory.content.trim();
  return content ? [{ id: "legacy-project-memory", title: "", content }] : [];
}

export function normalizeProjectMemoryEntries(
  entries: readonly ProjectMemoryEntry[],
): ProjectMemoryEntry[] {
  return entries
    .map((entry) => ({
      id: entry.id.trim(),
      title: entry.title.trim(),
      content: entry.content.trim(),
    }))
    .filter((entry) => entry.content.length > 0);
}

export function projectMemoryEntriesEqual(
  left: readonly ProjectMemoryEntry[],
  right: readonly ProjectMemoryEntry[],
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function filterProjectMemoryEntries(
  entries: readonly ProjectMemoryEntry[],
  search: string,
) {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return [...entries];
  return entries.filter((entry) =>
    `${entry.title}\n${entry.content}`.toLocaleLowerCase().includes(needle),
  );
}
