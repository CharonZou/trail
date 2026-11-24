use super::{create_migration_backup, Connection, Context, Path, Result};
use rusqlite::Transaction;

/// v29 adds the knowledge activity trail used by the knowledge hub's
/// "recent activity" and "visit trend" cards.
///
/// The DDL lives in `knowledge::schema.sql` and is shared with the fresh-schema
/// path, so a migrated database and a new one cannot drift apart. Re-running
/// `knowledge::SCHEMA` is safe: every statement is `IF NOT EXISTS`.
fn migrate_v28_to_v29_tx(tx: &Transaction<'_>) -> Result<()> {
    tx.execute_batch(crate::knowledge::SCHEMA)?;
    tx.pragma_update(None, "user_version", 29i64)?;
    Ok(())
}

pub(crate) fn migrate_v28_to_v29(conn: &Connection, path: &Path) -> Result<()> {
    let backup = create_migration_backup(conn, path, 28)?;
    let tx = conn.unchecked_transaction()?;
    migrate_v28_to_v29_tx(&tx)?;
    tx.commit().with_context(|| {
        format!(
            "commit schema v28 to v29 migration; backup {} remains",
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
    fn fresh_database_has_the_activity_table() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("fresh.sqlite")).unwrap();
        let version: i64 = db
            .conn()
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, crate::db::SCHEMA_VERSION);
        let exists: i64 = db
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                   WHERE type = 'table' AND name = 'knowledge_activity'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(exists, 1, "knowledge_activity must exist");
    }

    #[test]
    fn open_migrates_a_v28_database_in_one_launch() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("open-v28.sqlite");
        let db = Database::open(&path).unwrap();
        db.conn()
            .execute_batch(
                "DROP TABLE knowledge_activity;
                 DROP INDEX IF EXISTS idx_knowledge_activity_time;
                 DROP INDEX IF EXISTS idx_knowledge_activity_library;",
            )
            .unwrap();
        db.conn()
            .pragma_update(None, "user_version", 28i64)
            .unwrap();
        drop(db);

        // The open path must accept v28 and complete the v28 to v29 hop, not
        // treat it as newer than supported.
        let reopened = Database::open(&path).unwrap();
        let version: i64 = reopened
            .conn()
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 29);
        let exists: i64 = reopened
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                   WHERE type = 'table' AND name = 'knowledge_activity'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(exists, 1, "knowledge_activity must be recreated");
    }

    #[test]
    fn migration_stamps_v29_and_keeps_existing_rows() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("v28.sqlite");
        let db = Database::open(&path).unwrap();
        db.conn()
            .execute(
                "INSERT INTO knowledge_libraries (id, name, created_at, updated_at)
                 VALUES ('l', 'kept', 0, 0)",
                [],
            )
            .unwrap();
        // Roll the file back to a v28 shape: remove the activity trail, then
        // migrate forward again.
        db.conn()
            .execute_batch(
                "DROP TABLE knowledge_activity;
                 DROP INDEX IF EXISTS idx_knowledge_activity_time;
                 DROP INDEX IF EXISTS idx_knowledge_activity_library;",
            )
            .unwrap();
        db.conn()
            .pragma_update(None, "user_version", 28i64)
            .unwrap();
        migrate_v28_to_v29(db.conn(), &path).unwrap();

        let version: i64 = db
            .conn()
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 29);
        let exists: i64 = db
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE name = 'knowledge_activity'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(exists, 1);
        let kept: String = db
            .conn()
            .query_row(
                "SELECT name FROM knowledge_libraries WHERE id = 'l'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(kept, "kept");
    }
}
