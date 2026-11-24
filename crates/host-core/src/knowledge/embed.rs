//! OpenAI-compatible embedding calls and vector math.
//!
//! Only the `/embeddings` request shape is supported. A provider that speaks a
//! different protocol is refused when the library is configured, so no call here
//! can return a silently wrong vector.

use anyhow::{anyhow, bail, Result};
use serde_json::{json, Value};

use super::EmbeddingConfig;

const MAX_BATCH: usize = 64;
const REQUEST_TIMEOUT_SECS: u64 = 60;

pub async fn embed_texts(config: &EmbeddingConfig, texts: &[String]) -> Result<Vec<Vec<f32>>> {
    if texts.is_empty() {
        return Ok(Vec::new());
    }
    if texts.len() > MAX_BATCH {
        bail!("embedding batch is too large");
    }
    let endpoint = format!(
        "{}/embeddings",
        config.base_url.trim().trim_end_matches('/')
    );
    let mut request = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()?
        .post(endpoint)
        .json(&json!({
            "model": config.model,
            "input": texts,
            "encoding_format": "float",
        }));
    if let Some(key) = config.api_key.as_deref().filter(|value| !value.is_empty()) {
        request = request.bearer_auth(key);
    }
    for (name, value) in &config.headers {
        request = request.header(name.as_str(), value.as_str());
    }
    let response = request.send().await?;
    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|error| anyhow!("embedding provider returned invalid JSON: {error}"))?;
    if !status.is_success() {
        let message = body
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("embedding request failed");
        bail!("embedding provider error {status}: {message}");
    }
    let data = body
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("embedding provider response has no data array"))?;
    if data.len() != texts.len() {
        bail!(
            "embedding provider returned {} vectors for {} inputs",
            data.len(),
            texts.len()
        );
    }
    let mut vectors = Vec::with_capacity(data.len());
    for entry in data {
        let embedding = entry
            .get("embedding")
            .and_then(Value::as_array)
            .ok_or_else(|| anyhow!("embedding provider response is missing a vector"))?;
        let vector = embedding
            .iter()
            .map(|value| value.as_f64().map(|number| number as f32))
            .collect::<Option<Vec<f32>>>()
            .ok_or_else(|| anyhow!("embedding vector contains a non-number"))?;
        if vector.is_empty() {
            bail!("embedding provider returned an empty vector");
        }
        vectors.push(vector);
    }
    Ok(vectors)
}

pub fn vector_to_blob(vector: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(vector.len() * 4);
    for value in vector {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

pub fn blob_to_vector(blob: &[u8], dimension: usize) -> Option<Vec<f32>> {
    if blob.len() != dimension * 4 {
        return None;
    }
    Some(
        blob.chunks_exact(4)
            .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            .collect(),
    )
}

pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f64;
    let mut norm_a = 0.0f64;
    let mut norm_b = 0.0f64;
    for (left, right) in a.iter().zip(b.iter()) {
        let left = *left as f64;
        let right = *right as f64;
        dot += left * right;
        norm_a += left * left;
        norm_b += right * right;
    }
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot / (norm_a.sqrt() * norm_b.sqrt())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blob_round_trips() {
        let vector = vec![0.5f32, -1.25, 3.0];
        let blob = vector_to_blob(&vector);
        assert_eq!(blob_to_vector(&blob, 3), Some(vector));
        assert_eq!(blob_to_vector(&blob, 2), None);
    }

    #[test]
    fn cosine_matches_known_values() {
        assert!((cosine_similarity(&[1.0, 0.0], &[1.0, 0.0]) - 1.0).abs() < 1e-6);
        assert!(cosine_similarity(&[1.0, 0.0], &[0.0, 1.0]).abs() < 1e-6);
        assert_eq!(cosine_similarity(&[0.0], &[1.0]), 0.0);
        assert_eq!(cosine_similarity(&[1.0], &[1.0, 2.0]), 0.0);
    }
}
