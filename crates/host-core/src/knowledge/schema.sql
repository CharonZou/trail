-- Knowledge libraries, documents and chunks (schema v28; document body v30).
--
-- `knowledge_chunks_fts` is an external-content FTS5 index over
-- `knowledge_chunks.text`. The `trigram` tokenizer is deliberate: the default
-- `unicode61` tokenizer treats a run of CJK characters as one token, so a
-- Chinese query would only match a whole paragraph. Trigram search is
-- substring search, which works for CJK without a word segmenter.
CREATE TABLE IF NOT EXISTS knowledge_libraries (
  id                    TEXT PRIMARY KEY NOT NULL,
  name                  TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  -- Optional embedding provider/model. Keyword search works without them;
  -- semantic search and hybrid fusion light up once an index pass succeeds.
  embedding_provider_id TEXT,
  embedding_model       TEXT,
  semantic_enabled      INTEGER NOT NULL DEFAULT 0
                        CHECK (semantic_enabled IN (0, 1)),
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id            TEXT PRIMARY KEY NOT NULL,
  library_id    TEXT NOT NULL REFERENCES knowledge_libraries(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  source_path   TEXT,
  media_type    TEXT NOT NULL DEFAULT 'text/plain',
  byte_size     INTEGER NOT NULL DEFAULT 0,
  -- 'ready' means the chunks below are searchable. A failed import keeps the
  -- row (and the reason) so a re-import can replace it instead of the file
  -- silently disappearing.
  status        TEXT NOT NULL CHECK (status IN ('ready', 'failed')),
  error_code    TEXT,
  error_message TEXT,
  chunk_count   INTEGER NOT NULL DEFAULT 0,
  content_hash  TEXT NOT NULL,
  -- Full extracted body (schema v30). Chunks are a search index; they overlap and
  -- are hard-split, so they are not a readable document. `content_md` keeps the
  -- source text (Markdown preserved for `.md`) so the reader and future wiki /
  -- link features can render the real document instead of gluing chunks.
  content_md    TEXT NOT NULL DEFAULT '',
  -- `ready` once content_md was written; `legacy` for rows imported before v30,
  -- whose body is backfilled on first open; `failed` when extraction failed.
  content_state TEXT NOT NULL DEFAULT 'legacy'
                CHECK (content_state IN ('legacy', 'ready', 'failed')),
  content_kind  TEXT NOT NULL DEFAULT 'text'
                CHECK (content_kind IN ('markdown', 'text', 'pdf-text', 'office-text')),
  char_count    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_library
  ON knowledge_documents(library_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id            INTEGER PRIMARY KEY,
  library_id    TEXT NOT NULL,
  document_id   TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  ordinal       INTEGER NOT NULL,
  text          TEXT NOT NULL,
  char_count    INTEGER NOT NULL,
  -- Little-endian f32 vector, or NULL until an index pass embeds the chunk.
  embedding     BLOB,
  embedding_dim INTEGER,
  UNIQUE (document_id, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document
  ON knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_library
  ON knowledge_chunks(library_id, id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_unembedded
  ON knowledge_chunks(library_id) WHERE embedding IS NULL;

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
  text,
  content = 'knowledge_chunks',
  content_rowid = 'id',
  tokenize = 'trigram'
);

CREATE TRIGGER IF NOT EXISTS knowledge_chunks_ai AFTER INSERT ON knowledge_chunks BEGIN
  INSERT INTO knowledge_chunks_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER IF NOT EXISTS knowledge_chunks_ad AFTER DELETE ON knowledge_chunks BEGIN
  INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, text)
    VALUES ('delete', old.id, old.text);
END;
CREATE TRIGGER IF NOT EXISTS knowledge_chunks_au AFTER UPDATE ON knowledge_chunks BEGIN
  INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, text)
    VALUES ('delete', old.id, old.text);
  INSERT INTO knowledge_chunks_fts(rowid, text) VALUES (new.id, new.text);
END;

-- User-facing activity trail (schema v29). The hub's "recent activity" and
-- "visit trend" cards read this table; it holds no document text, only the
-- action, the target library/document and a short title.
CREATE TABLE IF NOT EXISTS knowledge_activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id  TEXT,
  document_id TEXT,
  action      TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_knowledge_activity_time
  ON knowledge_activity(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_activity_library
  ON knowledge_activity(library_id, created_at DESC);
