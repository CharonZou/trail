# Knowledge base and Agent applications

Schema v29 adds two host-owned domains behind the JSON-RPC dispatcher:

- `knowledge.*` — local document libraries with keyword and optional semantic
  retrieval, plus the activity trail the hub visualizes.
- `apps.*` — a registry of web applications the desktop opens in the existing
  work-panel Browser tab.

Both are written only by `crates/host-core`. The renderer reaches them through
`host.call` and never opens SQLite. See
[ADR 0338](../../adr/0338-knowledge-base-and-agent-apps.md) for the decision.

## 1. Storage

| Table | Owner | Contents |
|---|---|---|
| `knowledge_libraries` | `knowledge` | name, description, semantic flag, embedding provider/model |
| `knowledge_documents` | `knowledge` | source path or note title, media type, byte size, status, error |
| `knowledge_chunks` | `knowledge` | chunk ordinal, text, optional `f32` embedding blob |
| `knowledge_chunks_fts` | `knowledge` | FTS5 `trigram` external-content index over `knowledge_chunks.text` |
| `knowledge_activity` | `knowledge` | action, library/document id, short title, timestamp |
| `agent_apps` | `agent_apps` | name, description, kind, entry, icon, enabled, sort order, last opened |

`knowledge_chunks_fts` is kept in sync by insert/update/delete triggers on
`knowledge_chunks`; nothing writes it directly. Trigram tokenization is required:
the default `unicode61` tokenizer treats a run of Chinese characters as a single
token, which makes substring retrieval useless.

Fresh databases run the v28 DDL plus the v29 activity table; the upgrade chain
is v27→v28→v29. Each step is idempotent (`IF NOT EXISTS`) and reuses the same
`knowledge::SCHEMA` constant, so a new install and an upgraded install cannot
diverge. The v28→v29 step only adds a table and its indexes; it does not rewrite
existing rows.

### Library payload

`knowledge.listLibraries` returns counts the hub needs without a second query:

- `documentCount` — ready (searchable) documents;
- `documentTotal` — every row, including failed imports;
- `failedDocumentCount` — imports that produced no usable text;
- `vectorPendingDocumentCount` — ready documents with at least one unembedded
  chunk;
- `chunkCount` / `embeddedChunkCount` — index progress.

### Activity trail

Every mutating knowledge call appends one best-effort row to
`knowledge_activity`: `base.create`, `base.delete`, `doc.upload`,
`doc.manual`, `doc.delete`, `index.run`, plus `search` for each successful
retrieval. Writes are best-effort: a failure is logged and never fails the
operation the user asked for. Global retention is 500 rows, pruned on insert;
deleting a library removes its document-level rows but keeps `base.create` and
`base.delete` so the trail still shows the lifecycle.

`knowledge.listActivities` returns `{ activities[] }` ordered newest first,
with optional `libraryId` and `limit` (clamped 1–50, default 5).
`knowledge.activityTrend` returns `{ days, points[] }` where each point is
`{ day: "YYYY-MM-DD", searches }` in local time. Only `search` and `ask`
actions count as visits; uploads and edits are not visits. The window is
clamped 1–30 days (default 7).

## 2. Ingestion

`knowledge.importFiles` accepts a library id and an array of absolute paths.
The desktop obtains those paths from `dialog.showOpenDialog` in the main
process; renderer code never invents a path for this method.

Extraction supports:

- plain text and code — prose (`txt`, `md`, `markdown`, `rst`, `log`), data
  (`json`, `jsonl`, `csv`, `tsv`, `yaml`, `yml`, `toml`, `ini`, `xml`), markup
  (`html`, `htm`, stripped of tags), and source (`py`, `js`, `jsx`, `ts`, `tsx`,
  `go`, `rs`, `java`, `kt`, `c`, `h`, `cpp`, `sql`, `sh`, `css`);
- `pdf` via text extraction;
- `docx`, `pptx`, `xlsx` via ZIP + XML text.

`knowledge.supportedExtensions` is the authoritative list the desktop uses to
build its picker filter; this section and that constant must not drift.

Legacy binary Office formats (`.doc`, `.ppt`, `.xls`) are rejected with an
actionable message; they are not OOXML and cannot be read without a converter.

Limits: 16 MB per file, 4,000,000 extracted characters, 2,000 chunks per
document. Chunks aggregate whole paragraphs up to 1,200 characters; a longer
paragraph is hard-split with 200 characters of overlap.

`knowledge.importText` takes `{ libraryId, title, text }` and stores a note as a
document. Duplicate content in the same library is reported as `duplicate`
rather than stored twice; per-file failures are returned as `outcomes[]` with
`status: "failed"` and an error code, so one bad file does not abort a batch.

## 3. Retrieval

`knowledge.search` takes:

```json
{ "query": "string", "libraryId": "optional", "mode": "hybrid|keyword|semantic", "limit": 8 }
```

- `keyword` uses `bm25` over the trigram index. Queries shorter than three
  characters cannot match a trigram index, so the method falls back to a
  bounded `LIKE` scan; two-character CJK queries are common and must work.
- `semantic` embeds the query with the library's configured provider/model and
  ranks embedded chunks by cosine similarity.
- `hybrid` fuses both ranked lists with reciprocal-rank fusion.

The result is the flat object `{ query, mode, degraded, hits[] }`, where each
hit carries the document id, title, source path, chunk ordinal, snippet, and
score. The desktop API reads `hits` and `degraded` at the top level, so the
payload must not be wrapped in a second `result` object. A library without
semantic configuration, or an embedding call that fails, sets
`degraded: true` and returns keyword hits; the call does not fail. `semantic`
without any vectors returns no hits rather than inventing them.

`knowledge.indexLibrary` embeds every unembedded chunk in bounded batches and
reports `{ embedded, remaining, providerId, model }`. Re-running it resumes
where the previous run stopped. Each run appends an `index.run` activity row.

Limits: 512 characters per query, `limit` clamped to 1–32. Vectors are stored
as little-endian `f32` blobs; changing a library's provider or model clears the
library's vectors instead of mixing incompatible spaces.

## 4. Document preview

`knowledge.getDocument` takes `{ libraryId, documentId }` and returns
`{ document, chunks[], truncated }`. The document must belong to that library;
a mismatch is rejected instead of leaking a row from another library.

`chunks[]` are the stored extraction rows (`ordinal`, `text`, `charCount`,
`embedded`) in ordinal order. The reader joins them to render the document,
which keeps preview and retrieval on one source of truth: whatever the agent
can retrieve is exactly what the user can read. A failed import returns its
document row with an empty chunk list, so the reader can show the stored
`errorCode`/`errorMessage` rather than an empty page.

Limits: at most 400 chunks and 240,000 characters per request; a larger source
is cut at a chunk boundary and `truncated` is true. Nothing new is persisted —
the method reads `knowledge_documents` and `knowledge_chunks` only.

## 5. Retrieval for the agent

`KnowledgeSearch` is a built-in tool with risk `low`:

```json
{ "query": "string", "libraryId": "optional", "mode": "hybrid", "limit": 6 }
```

`tools.execute` answers it before the path/shell permission pipeline because it
reads only host-owned tables and registers no process. Omitted `libraryId`
searches all libraries; the default limit is six passages. The tool result is
the same `{ query, mode, degraded, hits }` object, so the model can cite document
titles and say when nothing matched.

## 6. Agent applications

`apps.create` / `apps.update` accept `{ name, description, kind, entry, icon?,
enabled? }` where `kind` is `remote` or `folder`:

- `remote` requires an `http` or `https` URL with a non-empty host. Whitespace,
  control characters, and other schemes are rejected.
- `folder` requires an absolute directory path that contains `index.html` or
  `index.htm`. The stored entry is a path; `openUrl` is a percent-encoded
  `file://` URL.

`apps.list` returns each row plus the computed `openUrl`, `available`, and
`unavailableReason`. A folder whose `index.html` disappeared stays listed with
`available: false` so the user can repair or delete it; rows are not pruned by
inspection.

`apps.pickFolder` exists only in the desktop main process (native directory
dialog); it returns a path or `null` and is not an RPC method.

`apps.markOpened` records `lastOpenedAt`. Opening itself is a renderer action:
`openWorkPanelTab(browserPluginTab(openUrl))`, which reuses the `pi.browser`
panel tab rather than creating a second Browser or opening the system browser.

## 7. Security boundaries

- Paths arrive from native dialogs, are re-validated in host-core, and are never
  assembled from user-typed strings inside the renderer.
- Applications accept only `http(s)` and `file://`-eligible absolute folders;
  `javascript:`, `data:`, and remote-path inputs are rejected.
- Folder applications open read-only; they cannot write to the user's tree
  through the Browser surface.
- `KnowledgeSearch` exposes excerpts, not whole documents, and does not disclose
  file paths outside the result metadata.

## 8. Desktop surface

The knowledge page has two levels:

- **Hub** — hero, a library filter (`Ctrl/⌘ K` scoped to the page), four stat
  cards (libraries, documents, processing, availability), the library list, and
  a pager (20/50/100 per page, persisted in `localStorage`). Each row shows a
  status dot, a health line derived from the library payload, the document
  count, the embedding model, and the last-update date. The context menu and the
  `⋯` menu expose open, rebuild index (semantic libraries only), and delete.
- **Detail** — back to the hub, ingest actions, semantic index progress, the
  retrieval box with mode selection (semantic modes are disabled when the
  library has no vectors), result passages, and the document list with a
  "needs attention" filter for failed imports. Every document row is a button:
  it opens the **reader**, which loads `knowledge.getDocument` on demand,
  renders the extracted chunks as Markdown, and shows status, size, chunk
  count, character count, source path, and index coverage in a side card. The
  reader has no editing, outline, summary, or activity features yet; a failed
  document shows its stored import error instead of an empty page.

Library health counts vector backlog as "processing" only when semantic search
is enabled: a keyword-only library with unembedded chunks is healthy, not
pending.

The insight rail shows health, a seven-day search trend, recent activity, and
three quick actions. Health aggregates ready/total documents across libraries
with penalties for failed and still-processing documents; the score is not
stored. Quick actions open the relevant library (focusing search or the failed
documents filter) or rebuild the semantic index — Trail has no in-library
"ask AI" surface, so the page does not pretend to send a chat message. All
strings go through the nine locale catalogs.
