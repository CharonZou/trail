import type { KnowledgeDocument } from "@trail/shared";

/**
 * Reader-side numbers derived from the stored body. Everything here is pure
 * text measurement, so the hero, the rail and the outline never disagree.
 */
export type DocStats = {
  chars: number;
  lines: number;
  headings: number;
  codeBlocks: number;
  tables: number;
  /** Rough mixed-script estimate: ~450 characters per minute. */
  readingMinutes: number;
};

export function docStats(source: string): DocStats {
  const chars = source.length;
  const lines = source ? source.split("\n").length : 0;
  const headings = (source.match(/^#{1,6}\s+\S/gm) ?? []).length;
  const fences = (source.match(/^```/gm) ?? []).length;
  const tables = (source.match(/^\s*\|?\s*:?-{3,}:?\s*\|/gm) ?? []).length;
  return {
    chars,
    lines,
    headings,
    codeBlocks: Math.floor(fences / 2),
    tables,
    readingMinutes: chars === 0 ? 0 : Math.max(1, Math.ceil(chars / 450)),
  };
}

/**
 * The first prose paragraph of the body, used as the hero description. Headings,
 * list items, tables and fences are skipped so the hero never repeats the title
 * or shows a code line as a sentence.
 */
export function heroDescription(source: string, limit = 220): string {
  const lines = source.split("\n");
  const collected: string[] = [];
  let inFence = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!trimmed) {
      if (collected.length > 0) break;
      continue;
    }
    if (/^#{1,6}\s/.test(trimmed)) continue;
    if (/^([-*+]\s|\d+\.\s|>|\||!\[)/.test(trimmed)) continue;
    if (/^([-=*_]{3,})$/.test(trimmed)) continue;
    collected.push(trimmed);
    if (collected.join(" ").length > limit) break;
  }
  const text = collected.join(" ").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/** Last path segment, tolerating Windows separators on any platform. */
export function fileName(path: string | null): string | null {
  if (!path) return null;
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

/** Folder part of the source path; empty string means the library root. */
export function folderOf(path: string | null): string {
  if (!path) return "";
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "" : normalized.slice(0, index);
}

export type CatalogFolder = {
  /** Full folder path, `""` for documents without one. */
  path: string;
  /** Last path segment, or `""` for the root group. */
  label: string;
  documents: KnowledgeDocument[];
};

/** Groups library documents by their source folder, alphabetically. */
export function catalogFolders(documents: KnowledgeDocument[]): CatalogFolder[] {
  const groups = new Map<string, KnowledgeDocument[]>();
  for (const document of documents) {
    const folder = folderOf(document.sourcePath);
    const rows = groups.get(folder);
    if (rows) rows.push(document);
    else groups.set(folder, [document]);
  }
  return [...groups.entries()]
    .map(([path, rows]) => ({
      path,
      label: path ? path.split("/").pop() ?? path : "",
      documents: [...rows].sort((left, right) => left.title.localeCompare(right.title)),
    }))
    .sort((left, right) => {
      if (!left.path) return -1;
      if (!right.path) return 1;
      return left.path.localeCompare(right.path);
    });
}
