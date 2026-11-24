//! Deterministic chunking for knowledge-base documents.
//!
//! Chunks are character windows, not token windows: no tokenizer is bundled, and
//! a character budget is stable across languages. Paragraph boundaries are
//! preferred so a citation can quote a whole thought instead of half a sentence.

pub const MAX_CHUNK_CHARS: usize = 1200;
pub const CHUNK_OVERLAP_CHARS: usize = 200;
pub const MAX_CHUNKS_PER_DOCUMENT: usize = 2000;
/// A single paragraph above this size is split with overlap instead of becoming
/// one oversized chunk.
const PARAGRAPH_HARD_SPLIT_CHARS: usize = MAX_CHUNK_CHARS;

/// Split extracted document text into searchable chunks.
///
/// - line endings and runs of blank lines are normalized
/// - paragraphs accumulate until the character budget is reached
/// - an over-budget paragraph is hard-split with `CHUNK_OVERLAP_CHARS` overlap
/// - the result is capped at `MAX_CHUNKS_PER_DOCUMENT`
pub fn chunk_text(text: &str) -> Vec<String> {
    let normalized = normalize(text);
    if normalized.is_empty() {
        return Vec::new();
    }

    let mut chunks: Vec<String> = Vec::new();
    let mut current = String::new();

    for paragraph in normalized.split("\n\n") {
        let paragraph = paragraph.trim();
        if paragraph.is_empty() {
            continue;
        }
        if paragraph.chars().count() > PARAGRAPH_HARD_SPLIT_CHARS {
            if !current.is_empty() {
                chunks.push(std::mem::take(&mut current));
            }
            chunks.extend(hard_split(paragraph));
            continue;
        }
        let separator = if current.is_empty() { 0 } else { 2 };
        let projected = current.chars().count() + separator + paragraph.chars().count();
        if projected > MAX_CHUNK_CHARS && !current.is_empty() {
            chunks.push(std::mem::take(&mut current));
        }
        if !current.is_empty() {
            current.push_str("\n\n");
        }
        current.push_str(paragraph);
    }
    if !current.is_empty() {
        chunks.push(current);
    }

    chunks.truncate(MAX_CHUNKS_PER_DOCUMENT);
    chunks
}

fn normalize(text: &str) -> String {
    let unified = text.replace("\r\n", "\n").replace('\r', "\n");
    let mut out = String::with_capacity(unified.len());
    let mut blank_run = 0usize;
    for line in unified.split('\n') {
        let trimmed_end = line.trim_end();
        if trimmed_end.trim().is_empty() {
            blank_run += 1;
            if blank_run > 1 {
                continue;
            }
            out.push('\n');
        } else {
            blank_run = 0;
            out.push_str(trimmed_end);
            out.push('\n');
        }
    }
    out.trim().to_string()
}

fn hard_split(paragraph: &str) -> Vec<String> {
    let chars = paragraph.chars().count();
    let mut chunks = Vec::new();
    let mut start = 0usize;
    while start < chars {
        let end = (start + MAX_CHUNK_CHARS).min(chars);
        let slice: String = paragraph
            .chars()
            .skip(start)
            .take(end - start)
            .collect::<String>()
            .trim()
            .to_string();
        if !slice.is_empty() {
            chunks.push(slice);
        }
        if end == chars {
            break;
        }
        start = end.saturating_sub(CHUNK_OVERLAP_CHARS);
        if start == 0 {
            break;
        }
    }
    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_short_documents_in_one_chunk() {
        let chunks = chunk_text("hello world");
        assert_eq!(chunks, vec!["hello world".to_string()]);
    }

    #[test]
    fn normalizes_line_endings_and_blank_runs() {
        let chunks = chunk_text("a\r\n\r\n\r\nb\rc");
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], "a\n\nb\nc");
    }

    #[test]
    fn splits_paragraphs_when_budget_exceeded() {
        let paragraph = "x".repeat(800);
        let text = format!("{paragraph}\n\n{paragraph}");
        let chunks = chunk_text(&text);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].len(), 800);
    }

    #[test]
    fn hard_splits_long_paragraph_with_overlap() {
        let paragraph = "a".repeat(3000);
        let chunks = chunk_text(&paragraph);
        assert!(chunks.len() >= 3);
        for chunk in &chunks {
            assert!(chunk.chars().count() <= MAX_CHUNK_CHARS);
        }
        // Consecutive chunks overlap by CHUNK_OVERLAP_CHARS.
        assert_eq!(
            chunks[0].chars().count() - CHUNK_OVERLAP_CHARS,
            1000,
            "first chunk should hold the full budget"
        );
    }

    #[test]
    fn caps_the_chunk_count() {
        let paragraph = "p".repeat(700);
        let mut text = String::new();
        for _ in 0..(MAX_CHUNKS_PER_DOCUMENT + 10) {
            text.push_str(&paragraph);
            text.push_str("\n\n");
        }
        assert_eq!(chunk_text(&text).len(), MAX_CHUNKS_PER_DOCUMENT);
    }

    #[test]
    fn empty_text_has_no_chunks() {
        assert!(chunk_text(" \n\n ").is_empty());
    }
}
