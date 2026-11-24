# ADR 0338: Knowledge base and Agent application registry as host-owned domains

- Status: Accepted (implementation candidate; desktop E2E pending)
- Date: 2026-11-23
- Deciders: Trail maintainers
- Related: [0330](0330-open-html-files-in-work-panel-browser-from-plugins.md) ·
  [0328](0328-browser-arbitrary-local-files.md) ·
  [03-runtime/23-knowledge-and-agent-apps](../spec/03-runtime/23-knowledge-and-agent-apps.md) ·
  [03-runtime/04-data-storage](../spec/03-runtime/04-data-storage.md) ·
  [04-ux/01-ui-ia](../spec/04-ux/01-ui-ia.md)

## Context

Trail has no way to keep reference material the agent can search. Conversations
carry context, and `messages_fts` indexes transcripts, but a user's handbook,
specification, or exported PDF has to be pasted into a prompt every time. There
is also no place to register a web tool the user wants beside the conversation:
extensions cover plugins, MCP, Skills, and Subagents, and the work-panel Browser
is reachable only through a plugin view or an ad-hoc URL.

The reference product (EvoFlow) models both features as a library of documents
with chunk-level retrieval, and as a registry of applications that the product
opens inside its own workspace and binds to employees and workflows. Trail has
no "employees" or "workflows", so the second feature maps onto a registry plus
the existing `pi.browser` work-panel tab.

The repository requires that SQLite is owned exclusively by Rust host-core, that
new domains and public contracts get an ADR, and that renderer code never opens
the database.

## Decision

1. **Two host-core domains, one schema step.** `crates/host-core/src/knowledge`
   owns libraries, documents, chunks, retrieval, and the activity trail;
   `agent_apps` owns the application registry. Schema v28 adds the core tables
   and v29 adds `knowledge_activity`; fresh databases and the v27→v28→v29
   upgrade share the same DDL constants so the two paths cannot drift.
2. **Retrieval is keyword-first, vectors optional.** Chunks are indexed with an
   FTS5 `trigram` external-content table plus sync triggers, because the default
   `unicode61` tokenizer treats a whole Chinese paragraph as one token. Queries
   shorter than three characters fall back to a bounded `LIKE` scan. Semantic
   search needs a library-level provider, model, and credential; without one the
   search reports `degraded: true` and returns keyword hits instead of failing.
3. **Embeddings are stored locally and scanned exactly.** Vectors are
   little-endian `f32` blobs; a query embeds once and scores every embedded chunk
   by cosine similarity. No ANN index in the MVP — libraries are bounded and an
   index would be a second consistency surface. Changing a library's provider or
   model clears its vectors rather than mixing incompatible spaces.
4. **Import goes through a native picker.** The renderer never supplies an
   absolute path on its own: main-process IPC opens `dialog.showOpenDialog`, then
   passes paths to `knowledge.importFiles`, which validates extension, size, and
   readability again. Legacy `.doc`, `.ppt`, and `.xls` are rejected with an
   actionable message instead of silently producing empty text.
5. **Applications are entries, not a second web runtime.** A registered
   application is `remote` (http/https URL) or `folder` (absolute directory with
   `index.html`). Host-core computes `openUrl` at read time and reports
   `available` plus an `unavailableReason`; the desktop opens it with the
   existing `browserPluginTab(openUrl)` tab. No new Browser, no embedded second
   renderer, no plugin permission bypass.
6. **One new built-in tool.** `KnowledgeSearch` (risk `low`) is defined in
   `builtin_tool_defs` and answered by `tools.execute` before the path and shell
   permission pipeline, because it only reads host-owned tables and registers no
   process. It defaults to six passages so one call cannot flood the model
   context.

## Alternatives

- **Index documents in the renderer or the agent runtime.** Rejected: it moves
  persistence out of host-core and splits SQLite ownership.
- **Keep chunks only in FTS5 (no vectors).** Simpler, but misses paraphrase
  queries; the vector path is optional per library, so keyword-only libraries
  pay nothing for it.
- **Add an ANN library (sqlite-vec, hnsw).** Faster at scale, but a new native
  dependency and index lifecycle for an MVP whose libraries are small; cosine
  scanning keeps one source of truth.
- **Reuse `messages_fts`.** Rejected: transcript rows are turn-shaped and
  user-deletable per session, and mixing document chunks into them would leak
  library content into transcript search.
- **Open applications in the system browser.** Rejected by the product decision:
  the point is to work beside the conversation, and the work panel already
  supports `http(s)` and `file:` locations.
- **A new "AI employees/workflows" layer.** Out of scope: Trail has no such
  concept, and inventing one would be larger than the two requested features.

## Consequences

- Schema v29 adds six tables (`knowledge_libraries`, `knowledge_documents`,
  `knowledge_chunks`, `knowledge_chunks_fts`, `knowledge_activity`,
  `agent_apps`). Apps older than v29 refuse the database as newer, which is the
  existing downgrade rule.
- The activity trail is bounded (500 rows, pruned on insert) and stores action,
  target ids, and a short title — never document text. Record writes are
  best-effort so telemetry cannot fail an import or a search.
- Libraries are bounded (500 libraries, 2000 chunks per document, 16 MB / 4M
  characters per file) so a local scan stays predictable. Raising a bound is a
  product decision, not a storage change.
- Semantic search depends on the user's provider credentials. A missing key or a
  failing endpoint degrades to keyword results with a visible reason instead of
  an error the user cannot act on.
- Folder applications open read-only through `file://`; a folder that loses
  `index.html` stays in the list with an unavailable reason rather than
  disappearing, so the user can fix or remove it.
- `KnowledgeSearch` is stateful-free and permission-free; auditing records the
  call like any other tool, and the result is excerpts with document titles so
  the agent can cite them.
- The reader reuses the stored chunk rows through `knowledge.getDocument`
  instead of a second extraction path. That keeps preview and retrieval honest
  with each other and adds no table, but it also bounds a preview to the first
  400 chunks / 240k characters of a document; a future full-text reader would
  need a new persisted representation rather than a larger limit.
