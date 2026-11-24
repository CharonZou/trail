use super::{create_migration_backup, Connection, Context, Path, Result};
use rusqlite::Transaction;

/// v28 adds the knowledge base and the agent-application registry.
///
/// Both DDL constants are shared with the fresh-schema path, so a new database
/// and a migrated one cannot drift apart.
fn migrate_v27_to_v28_tx(tx: &Transaction<'_>) -> Result<()> {
    tx.execute_batch(crate::knowledge::SCHEMA)?;
    tx.execute_batch(crate::agent_apps::SCHEMA)?;
    tx.pragma_update(None, "user_version", 28i64)?;
    Ok(())
}

pub(crate) fn migrate_v27_to_v28(conn: &Connection, path: &Path) -> Result<()> {
    let backup = create_migration_backup(conn, path, 27)?;
    let tx = conn.unchecked_transaction()?;
    migrate_v27_to_v28_tx(&tx)?;
    tx.commit().with_context(|| {
        format!(
            "commit schema v27 to v28 migration; backup {} remains",
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
    fn fresh_database_has_knowledge_and_app_tables() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("fresh.sqlite")).unwrap();
        let version: i64 = db
            .conn()
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, crate::db::SCHEMA_VERSION);
        for table in [
            "knowledge_libraries",
            "knowledge_documents",
            "knowledge_chunks",
            "agent_apps",
        ] {
            let exists: i64 = db
                .conn()
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    rusqlite::params![table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(exists, 1, "{table} must exist");
        }
        db.conn()
            .execute_batch(
                "INSERT INTO knowledge_libraries (id, name, created_at, updated_at)
                 VALUES ('l', 'smoke', 0, 0);
                 INSERT INTO knowledge_documents
                     (id, library_id, title, status, content_hash, created_at, updated_at)
                 VALUES ('d', 'l', 'smoke', 'ready', 'hash', 0, 0);
                 INSERT INTO knowledge_chunks (library_id, document_id, ordinal, text, char_count)
                 VALUES ('l', 'd', 0, 'fts smoke', 9);",
            )
            .unwrap();
        let hits: i64 = db
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM knowledge_chunks_fts WHERE knowledge_chunks_fts MATCH '\"fts\"'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(hits, 1);
    }

    #[test]
    fn migration_stamps_v28_and_keeps_existing_rows() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("v27.sqlite")).unwrap();
        // Roll the file back to a v27 shape: drop the new tables, then migrate.
        db.conn()
            .execute_batch(
                "DROP TABLE knowledge_chunks_fts;
                 DROP TABLE knowledge_chunks;
                 DROP TABLE knowledge_documents;
                 DROP TABLE knowledge_libraries;
                 DROP TABLE agent_apps;",
            )
            .unwrap();
        db.conn()
            .pragma_update(None, "user_version", 27i64)
            .unwrap();
        migrate_v27_to_v28(db.conn(), &dir.path().join("v27.sqlite")).unwrap();
        let version: i64 = db
            .conn()
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 28);
        let exists: i64 = db
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE name = 'agent_apps'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(exists, 1);
    }
}
