use super::{create_migration_backup, Connection, Context, Path, Result};
use rusqlite::Transaction;

/// v30 stores the extracted document body (`content_md`) next to the chunks that
/// already back keyword and vector search. Chunks overlap by 200 characters and
/// hard-split long paragraphs, so a preview rebuilt from them repeats text and
/// breaks code blocks; a reading surface needs the original text.
///
/// Rows that predate v30 keep `content_state = 'legacy'` and are backfilled by
/// `knowledge.getDocumentContent` on first open (re-extract from `source_path`,
/// or a de-duplicating chunk join when the source file is gone).
const ADD_COLUMNS: &str = r#"
ALTER TABLE knowledge_documents ADD COLUMN content_md TEXT NOT NULL DEFAULT '';
ALTER TABLE knowledge_documents ADD COLUMN content_state TEXT NOT NULL DEFAULT 'legacy'
  CHECK (content_state IN ('legacy', 'ready', 'failed'));
ALTER TABLE knowledge_documents ADD COLUMN content_kind TEXT NOT NULL DEFAULT 'text'
  CHECK (content_kind IN ('markdown', 'text', 'pdf-text', 'office-text'));
ALTER TABLE knowledge_documents ADD COLUMN char_count INTEGER NOT NULL DEFAULT 0;
"#;

fn migrate_v29_to_v30_tx(tx: &Transaction<'_>) -> Result<()> {
    tx.execute_batch(ADD_COLUMNS)?;
    tx.pragma_update(None, "user_version", 30i64)?;
    Ok(())
}

pub(crate) fn migrate_v29_to_v30(conn: &Connection, path: &Path) -> Result<()> {
    let backup = create_migration_backup(conn, path, 29)?;
    let tx = conn.unchecked_transaction()?;
    migrate_v29_to_v30_tx(&tx)?;
    tx.commit().with_context(|| {
        format!(
            "commit schema v29 to v30 migration; backup {} remains",
            backup.display()
        )
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    #[test]
    fn fresh_database_has_the_document_body_columns() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("fresh.sqlite")).unwrap();
        let version: i64 = db
            .conn()
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, crate::db::SCHEMA_VERSION);
        for column in ["content_md", "content_state", "content_kind", "char_count"] {
            let count: i64 = db
                .conn()
                .query_row(
                    &format!(
                        "SELECT COUNT(*) FROM pragma_table_info('knowledge_documents')
                           WHERE name = ?1"
                    ),
                    [column],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "knowledge_documents.{column} must exist");
        }
    }

    #[test]
    fn migrating_a_v29_database_keeps_documents_and_marks_body_legacy() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("v29.sqlite");
        let db = Database::open(&path).unwrap();
        db.conn()
            .pragma_update(None, "user_version", 29i64)
            .unwrap();
        db.conn()
            .execute_batch(
                "INSERT INTO knowledge_libraries
                   (id, name, description, semantic_enabled, created_at, updated_at)
                 VALUES ('lib', 'L', '', 0, 1, 1);
                 INSERT INTO knowledge_documents
                   (id, library_id, title, media_type, byte_size, status, chunk_count,
                    content_hash, created_at, updated_at)
                 VALUES ('doc', 'lib', 'D', 'text/plain', 3, 'ready', 1, 'hash', 1, 1);
                 INSERT INTO knowledge_chunks
                   (library_id, document_id, ordinal, text, char_count)
                 VALUES ('lib', 'doc', 0, 'abc', 3);",
            )
            .unwrap();

        migrate_v29_to_v30(db.conn(), &path).unwrap();

        let version: i64 = db
            .conn()
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 30);
        let (state, body, count): (String, String, i64) = db
            .conn()
            .query_row(
                "SELECT content_state, content_md, chunk_count FROM knowledge_documents
                  WHERE id = 'doc'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(state, "legacy");
        assert_eq!(body, "");
        assert_eq!(count, 1, "existing chunks must survive the migration");
    }

    #[test]
    fn migration_is_not_applied_twice() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("double.sqlite");
        let db = Database::open(&path).unwrap();
        migrate_v29_to_v30(db.conn(), &path).unwrap();
        assert!(migrate_v29_to_v30(db.conn(), &path).is_err());
    }
}
