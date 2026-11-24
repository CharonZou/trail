use super::*;
use serde_json::json;

fn open_db() -> (tempfile::TempDir, Database) {
    let dir = tempfile::tempdir().expect("temp dir");
    let db = Database::open(&dir.path().join("test.sqlite")).expect("open db");
    (dir, db)
}

fn create_plain_library(db: &Database, secrets: &crate::secrets::SecretStore) -> String {
    let value = create_library(
        db,
        secrets,
        &json!({ "name": "Docs", "description": "test library" }),
    )
    .expect("create library");
    value["library"]["id"].as_str().unwrap().to_string()
}

#[test]
fn schema_creates_libraries_with_zero_counts() {
    let (dir, db) = open_db();
    let secrets = crate::secrets::SecretStore::open(dir.path()).unwrap();
    let id = create_plain_library(&db, &secrets);
    let libraries = list_libraries(&db).unwrap();
    let first = &libraries["libraries"][0];
    assert_eq!(first["id"], id);
    assert_eq!(first["documentCount"], 0);
    assert_eq!(first["semanticEnabled"], false);
}

#[test]
fn imports_text_and_finds_it_with_cjk_substring_query() {
    let (dir, db) = open_db();
    let secrets = crate::secrets::SecretStore::open(dir.path()).unwrap();
    let id = create_plain_library(&db, &secrets);
    let outcome = import_text(
        &db,
        &json!({
            "libraryId": id,
            "title": "路线图",
            "text": "第一阶段先做知识库，第二阶段做 Agent 应用。",
        }),
    )
    .unwrap();
    assert_eq!(outcome["outcome"]["status"], "ready");
    assert_eq!(outcome["outcome"]["chunkCount"], 1);

    // Two-character CJK query goes through the LIKE fallback.
    let hits = keyword_search(&db, Some(&id), "应用", 8).unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].document_title, "路线图");
    assert!(hits[0].snippet.contains("应用"));

    // A three-character query goes through the trigram FTS index.
    let hits = keyword_search(&db, Some(&id), "知识库", 8).unwrap();
    assert_eq!(hits.len(), 1);
}

#[test]
fn duplicate_import_reuses_the_existing_document() {
    let (dir, db) = open_db();
    let secrets = crate::secrets::SecretStore::open(dir.path()).unwrap();
    let id = create_plain_library(&db, &secrets);
    let text = "same body";
    let first = import_text(&db, &json!({ "libraryId": id, "title": "a", "text": text })).unwrap();
    let second = import_text(&db, &json!({ "libraryId": id, "title": "b", "text": text })).unwrap();
    assert_eq!(first["outcome"]["status"], "ready");
    assert_eq!(second["outcome"]["status"], "duplicate");
    assert_eq!(
        first["outcome"]["documentId"],
        second["outcome"]["documentId"]
    );
    let documents = list_documents(&db, &json!({ "libraryId": id })).unwrap();
    assert_eq!(documents["documents"].as_array().unwrap().len(), 1);
}

#[test]
fn deleting_a_document_removes_its_chunks() {
    let (dir, db) = open_db();
    let secrets = crate::secrets::SecretStore::open(dir.path()).unwrap();
    let id = create_plain_library(&db, &secrets);
    let outcome = import_text(
        &db,
        &json!({ "libraryId": id, "title": "gone", "text": "alpha beta gamma" }),
    )
    .unwrap();
    let document_id = outcome["outcome"]["documentId"]
        .as_str()
        .unwrap()
        .to_string();
    delete_document(&db, &json!({ "id": document_id })).unwrap();
    let hits = keyword_search(&db, Some(&id), "alpha", 8).unwrap();
    assert!(hits.is_empty());
    let chunks: i64 = db
        .conn()
        .query_row(
            "SELECT COUNT(*) FROM knowledge_chunks WHERE library_id = ?1",
            params![id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(chunks, 0);
}

#[test]
fn get_document_returns_ordered_preview_chunks() {
    let (dir, db) = open_db();
    let secrets = crate::secrets::SecretStore::open(dir.path()).unwrap();
    let first = create_plain_library(&db, &secrets);
    let second = create_plain_library(&db, &secrets);
    let body = format!(
        "# Guide\n\n{}\n\n{}\n",
        "alpha paragraph ".repeat(60),
        "beta paragraph ".repeat(60)
    );
    let outcome = import_text(
        &db,
        &json!({ "libraryId": first, "title": "guide", "text": body }),
    )
    .unwrap();
    let document_id = outcome["outcome"]["documentId"]
        .as_str()
        .unwrap()
        .to_string();

    let detail = get_document(
        &db,
        &json!({ "libraryId": first, "documentId": document_id }),
    )
    .unwrap();
    assert_eq!(detail["document"]["title"], "guide");
    let chunks = detail["chunks"].as_array().unwrap();
    assert!(!chunks.is_empty());
    let mut previous = -1;
    for chunk in chunks {
        let ordinal = chunk["ordinal"].as_i64().unwrap();
        assert!(ordinal > previous, "chunks must be ordered");
        previous = ordinal;
    }
    let joined: String = chunks
        .iter()
        .map(|chunk| chunk["text"].as_str().unwrap())
        .collect::<Vec<_>>()
        .join("\n\n");
    assert!(joined.contains("alpha paragraph"));
    assert!(joined.contains("beta paragraph"));

    let error = get_document(
        &db,
        &json!({ "libraryId": second, "documentId": document_id }),
    )
    .unwrap_err();
    assert_eq!(error.kind, "INVALID_PARAMS");
}

#[test]
fn semantic_requires_provider_and_model() {
    let (dir, db) = open_db();
    let secrets = crate::secrets::SecretStore::open(dir.path()).unwrap();
    let error = create_library(
        &db,
        &secrets,
        &json!({ "name": "Semantic", "semanticEnabled": true }),
    )
    .unwrap_err();
    assert_eq!(error.kind, "INVALID_PARAMS");
}

#[test]
fn rejects_relative_import_paths_without_creating_a_row() {
    let (dir, db) = open_db();
    let secrets = crate::secrets::SecretStore::open(dir.path()).unwrap();
    let id = create_plain_library(&db, &secrets);
    let outcomes =
        import_files(&db, &json!({ "libraryId": id, "paths": ["relative.txt"] })).unwrap();
    assert_eq!(outcomes["outcomes"][0]["status"], "failed");
    assert_eq!(outcomes["outcomes"][0]["errorCode"], "INVALID_PATH");
}

#[test]
fn changing_the_embedding_config_clears_vectors() {
    let (dir, db) = open_db();
    let secrets = crate::secrets::SecretStore::open(dir.path()).unwrap();
    let id = create_plain_library(&db, &secrets);
    let outcome = import_text(
        &db,
        &json!({ "libraryId": id, "title": "vectors", "text": "alpha beta" }),
    )
    .unwrap();
    let document_id = outcome["outcome"]["documentId"]
        .as_str()
        .unwrap()
        .to_string();
    // A vector written under the old configuration must not survive a model
    // change, or semantic search would compare vectors from two spaces.
    db.conn()
        .execute(
            "UPDATE knowledge_chunks SET embedding = X'00000000', embedding_dim = 1
              WHERE document_id = ?1",
            params![document_id],
        )
        .unwrap();
    db.conn()
        .execute(
            "UPDATE knowledge_libraries SET embedding_provider_id = 'old', embedding_model = 'old'
              WHERE id = ?1",
            params![id],
        )
        .unwrap();

    update_library(
        &db,
        &secrets,
        &json!({
            "id": id,
            "name": "Docs",
            "embeddingProviderId": null,
            "embeddingModel": null,
            "semanticEnabled": false,
        }),
    )
    .unwrap();

    let vectors: i64 = db
        .conn()
        .query_row(
            "SELECT COUNT(*) FROM knowledge_chunks WHERE library_id = ?1 AND embedding IS NOT NULL",
            params![id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(vectors, 0);
}

#[test]
fn library_reports_total_failed_and_vector_pending_counts() {
    let (dir, db) = open_db();
    let secrets = crate::secrets::SecretStore::open(dir.path()).unwrap();
    let id = create_plain_library(&db, &secrets);
    import_text(
        &db,
        &json!({ "libraryId": id, "title": "ok", "text": "alpha beta gamma" }),
    )
    .unwrap();
    import_files(&db, &json!({ "libraryId": id, "paths": ["relative.txt"] })).unwrap();

    let library = get_library_row(&db, &id).unwrap();
    assert_eq!(library.document_count, 1, "ready documents only");
    assert_eq!(library.document_total, 2, "failed imports are counted");
    assert_eq!(library.failed_document_count, 1);
    assert_eq!(
        library.vector_pending_document_count, 0,
        "keyword-only libraries are not waiting for vectors"
    );
    // Turning semantic search on is what makes unembedded chunks pending.
    db.conn()
        .execute(
            "UPDATE knowledge_libraries SET semantic_enabled = 1 WHERE id = ?1",
            params![id],
        )
        .unwrap();
    let enabled = get_library_row(&db, &id).unwrap();
    assert_eq!(enabled.vector_pending_document_count, 1);
}

#[test]
fn activity_rows_are_recorded_for_manual_imports_and_deletes() {
    let (dir, db) = open_db();
    let secrets = crate::secrets::SecretStore::open(dir.path()).unwrap();
    let id = create_plain_library(&db, &secrets);
    let outcome = import_text(
        &db,
        &json!({ "libraryId": id, "title": "notes", "text": "alpha beta" }),
    )
    .unwrap();
    let document_id = outcome["outcome"]["documentId"].as_str().unwrap();
    delete_document(&db, &json!({ "id": document_id })).unwrap();

    let activities = list_activities(&db, &json!({ "limit": 10 })).unwrap();
    let actions = activities["activities"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["action"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert!(actions.contains(&"base.create"));
    assert!(actions.contains(&"doc.manual"));
    assert!(actions.contains(&"doc.delete"));
    assert_eq!(activities["activities"][0]["title"], "notes");
}

#[tokio::test]
async fn search_returns_a_flat_payload_and_records_a_search_activity() {
    let dir = tempfile::tempdir().unwrap();
    let state = Arc::new(Mutex::new(
        crate::state::AppState::open(dir.path()).unwrap(),
    ));
    let id = {
        let st = state.lock().await;
        create_plain_library(&st.db, &st.secrets)
    };
    {
        let st = state.lock().await;
        import_text(
            &st.db,
            &json!({ "libraryId": id, "title": "alpha", "text": "alpha beta gamma" }),
        )
        .unwrap();
    }

    let result = search(
        state.clone(),
        &json!({ "libraryId": id, "query": "alpha", "mode": "keyword" }),
    )
    .await
    .unwrap();
    // The desktop API reads `hits` and `degraded` off the top level, so the
    // payload must not be wrapped in an extra `result` object.
    assert!(result.get("result").is_none(), "payload must be flat");
    assert_eq!(result["query"], "alpha");
    assert!(!result["hits"].as_array().unwrap().is_empty());

    let st = state.lock().await;
    let activities = list_activities(&st.db, &json!({ "limit": 10 })).unwrap();
    assert_eq!(activities["activities"][0]["action"], "search");
    let trend = activity_trend(&st.db, &json!({ "days": 7 })).unwrap();
    let points = trend["points"].as_array().unwrap();
    assert_eq!(points.len(), 7);
    assert!(points.last().unwrap()["searches"].as_i64().unwrap() >= 1);
}

use super::documents::*;
use super::retrieval::*;
