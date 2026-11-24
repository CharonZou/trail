//! Text extraction for knowledge-base imports.
//!
//! Text-like files are read directly. Office Open XML files (`.docx`, `.pptx`,
//! `.xlsx`) are zip archives of XML, so their text is pulled out of the archive
//! part with a small regex pass instead of a full document model. PDF goes
//! through `pdf-extract`. Legacy binary Office formats (`.doc`, `.ppt`, `.xls`)
//! are rejected explicitly rather than imported as garbage.

use std::fs::File;
use std::io::Read;
use std::path::Path;

use regex::Regex;
use zip::ZipArchive;

/// Import cap. A larger file is refused before it is read into memory.
pub const MAX_IMPORT_BYTES: u64 = 16 * 1024 * 1024;
/// Extracted text cap, so one pathological PDF cannot blow up the chunker.
pub const MAX_EXTRACTED_CHARS: usize = 4_000_000;

#[derive(Debug)]
pub enum ExtractError {
    TooLarge(u64),
    Unsupported(String),
    Io(String),
    Parse(String),
}

impl std::fmt::Display for ExtractError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExtractError::TooLarge(size) => write!(
                f,
                "file is {size} bytes; the import limit is {} bytes",
                MAX_IMPORT_BYTES
            ),
            ExtractError::Unsupported(ext) => {
                write!(f, "unsupported file type: {ext}")
            }
            ExtractError::Io(message) => write!(f, "{message}"),
            ExtractError::Parse(message) => write!(f, "{message}"),
        }
    }
}

impl ExtractError {
    pub fn code(&self) -> &'static str {
        match self {
            ExtractError::TooLarge(_) => "FILE_TOO_LARGE",
            ExtractError::Unsupported(_) => "UNSUPPORTED_FORMAT",
            ExtractError::Io(_) => "IO_ERROR",
            ExtractError::Parse(_) => "PARSE_ERROR",
        }
    }
}

#[derive(Debug)]
pub struct Extracted {
    pub text: String,
    pub media_type: String,
}

pub fn supported_extensions() -> &'static [&'static str] {
    &[
        "md", "markdown", "txt", "rst", "log", "json", "jsonl", "csv", "tsv", "yaml", "yml",
        "toml", "ini", "xml", "html", "htm", "py", "ts", "tsx", "js", "jsx", "go", "rs", "java",
        "kt", "c", "h", "cpp", "sql", "sh", "pdf", "docx", "pptx", "xlsx",
    ]
}

pub fn extract(path: &Path) -> Result<Extracted, ExtractError> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if extension.is_empty() || !supported_extensions().contains(&extension.as_str()) {
        return Err(ExtractError::Unsupported(if extension.is_empty() {
            "file without an extension".to_string()
        } else {
            format!(".{extension}")
        }));
    }
    let media_type = media_type_for(&extension).to_string();
    let size = std::fs::metadata(path)
        .map_err(|error| ExtractError::Io(error.to_string()))?
        .len();
    if size > MAX_IMPORT_BYTES {
        return Err(ExtractError::TooLarge(size));
    }

    let text = match extension.as_str() {
        ext if is_plain_text(ext) => read_text_file(path)?,
        "html" | "htm" => strip_html(&read_text_file(path)?),
        "pdf" => {
            let raw = pdf_extract::extract_text(path)
                .map_err(|error| ExtractError::Parse(format!("could not read PDF: {error}")))?;
            raw
        }
        "docx" => extract_docx(path)?,
        "pptx" => extract_pptx(path)?,
        "xlsx" => extract_xlsx(path)?,
        other => {
            return Err(ExtractError::Unsupported(if other.is_empty() {
                "file without an extension".to_string()
            } else {
                format!(".{other}")
            }))
        }
    };

    let text = normalize_extracted(&text);
    if text.trim().is_empty() {
        return Err(ExtractError::Parse(
            "no readable text was found in the file".to_string(),
        ));
    }
    Ok(Extracted { text, media_type })
}

pub fn media_type_for(extension: &str) -> &'static str {
    match extension {
        "pdf" => "application/pdf",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "html" | "htm" => "text/html",
        "md" | "markdown" => "text/markdown",
        "csv" => "text/csv",
        "json" | "jsonl" => "application/json",
        "xml" => "application/xml",
        _ => "text/plain",
    }
}

fn is_plain_text(extension: &str) -> bool {
    matches!(
        extension,
        "md" | "markdown"
            | "txt"
            | "rst"
            | "log"
            | "json"
            | "jsonl"
            | "csv"
            | "tsv"
            | "yaml"
            | "yml"
            | "toml"
            | "ini"
            | "xml"
            | "py"
            | "ts"
            | "tsx"
            | "js"
            | "jsx"
            | "go"
            | "rs"
            | "java"
            | "kt"
            | "c"
            | "h"
            | "cpp"
            | "sql"
            | "sh"
    )
}

fn read_text_file(path: &Path) -> Result<String, ExtractError> {
    let bytes = std::fs::read(path).map_err(|error| ExtractError::Io(error.to_string()))?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

fn open_archive(path: &Path) -> Result<ZipArchive<File>, ExtractError> {
    let file = File::open(path).map_err(|error| ExtractError::Io(error.to_string()))?;
    ZipArchive::new(file).map_err(|error| ExtractError::Parse(format!("invalid archive: {error}")))
}

fn read_zip_entry(archive: &mut ZipArchive<File>, name: &str) -> Result<String, ExtractError> {
    let mut entry = archive
        .by_name(name)
        .map_err(|error| ExtractError::Parse(format!("missing {name}: {error}")))?;
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .read_to_end(&mut bytes)
        .map_err(|error| ExtractError::Io(error.to_string()))?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

fn extract_docx(path: &Path) -> Result<String, ExtractError> {
    let mut archive = open_archive(path)?;
    let xml = read_zip_entry(&mut archive, "word/document.xml")?;
    let paragraph_break = "</w:p>".to_string();
    let with_breaks = xml.replace(&paragraph_break, "</w:p>\n\n");
    Ok(xml_text(&with_breaks, r"<w:t(?:\s[^>]*)?>(.*?)</w:t>"))
}

fn extract_pptx(path: &Path) -> Result<String, ExtractError> {
    let mut archive = open_archive(path)?;
    let mut slides: Vec<(usize, String)> = Vec::new();
    for index in 0..archive.len() {
        let name = archive
            .by_index(index)
            .map_err(|error| ExtractError::Parse(error.to_string()))?
            .name()
            .to_string();
        if !name.starts_with("ppt/slides/slide") || !name.ends_with(".xml") {
            continue;
        }
        let ordinal = name
            .trim_start_matches("ppt/slides/slide")
            .trim_end_matches(".xml")
            .parse::<usize>()
            .unwrap_or(index);
        let xml = read_zip_entry(&mut archive, &name)?;
        let text = xml_text(
            &xml.replace("</a:p>", "</a:p>\n"),
            r"<a:t(?:\s[^>]*)?>(.*?)</a:t>",
        );
        if !text.trim().is_empty() {
            slides.push((ordinal, text.trim().to_string()));
        }
    }
    slides.sort_by_key(|(ordinal, _)| *ordinal);
    Ok(slides
        .into_iter()
        .map(|(_, text)| text)
        .collect::<Vec<_>>()
        .join("\n\n"))
}

fn extract_xlsx(path: &Path) -> Result<String, ExtractError> {
    let mut archive = open_archive(path)?;
    let mut blocks: Vec<String> = Vec::new();
    let shared = read_zip_entry(&mut archive, "xl/sharedStrings.xml").unwrap_or_default();
    let shared_text = xml_text(&shared, r"<t(?:\s[^>]*)?>(.*?)</t>");
    if !shared_text.trim().is_empty() {
        blocks.push(shared_text);
    }

    let mut sheet_names: Vec<String> = Vec::new();
    for index in 0..archive.len() {
        let name = archive
            .by_index(index)
            .map_err(|error| ExtractError::Parse(error.to_string()))?
            .name()
            .to_string();
        if name.starts_with("xl/worksheets/") && name.ends_with(".xml") {
            sheet_names.push(name);
        }
    }
    sheet_names.sort();
    for name in sheet_names {
        let xml = read_zip_entry(&mut archive, &name)?;
        let rows: Vec<String> = xml
            .split("</row>")
            .map(|row| xml_text(row, r"<t(?:\s[^>]*)?>(.*?)</t>"))
            .filter(|row| !row.trim().is_empty())
            .collect();
        if !rows.is_empty() {
            blocks.push(rows.join("\n"));
        }
    }
    Ok(blocks.join("\n\n"))
}

/// Join the capture group of every match, one match per line.
fn xml_text(xml: &str, pattern: &str) -> String {
    let Ok(regex) = Regex::new(pattern) else {
        return String::new();
    };
    let mut out = String::new();
    for capture in regex.captures_iter(xml) {
        if let Some(value) = capture.get(1) {
            let decoded = decode_entities(value.as_str());
            if !decoded.trim().is_empty() {
                out.push_str(decoded.trim());
                out.push('\n');
            }
        }
    }
    out
}

pub fn decode_entities(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut rest = value;
    while let Some(start) = rest.find('&') {
        out.push_str(&rest[..start]);
        let tail = &rest[start..];
        let Some(end) = tail.find(';') else {
            out.push_str(tail);
            return out;
        };
        let entity = &tail[1..end];
        let replacement: Option<char> = match entity {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            "nbsp" => Some(' '),
            _ if entity.starts_with("#x") || entity.starts_with("#X") => {
                u32::from_str_radix(&entity[2..], 16)
                    .ok()
                    .and_then(char::from_u32)
            }
            _ if entity.starts_with('#') => {
                entity[1..].parse::<u32>().ok().and_then(char::from_u32)
            }
            _ => None,
        };
        match replacement {
            Some(ch) => out.push(ch),
            None => out.push_str(&tail[..=end]),
        }
        rest = &tail[end + 1..];
    }
    out.push_str(rest);
    out
}

fn strip_html(html: &str) -> String {
    let block_break = Regex::new(r"(?i)</?(p|div|br|li|tr|h[1-6]|section|article|table)[^>]*>")
        .expect("static regex");
    let stripped = block_break.replace_all(html, "\n");
    let tags = Regex::new(r"<[^>]*>").expect("static regex");
    let text = tags.replace_all(&stripped, "");
    let decoded = decode_entities(&text);
    decoded
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn normalize_extracted(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for line in text.replace("\r\n", "\n").replace('\r', "\n").lines() {
        out.push_str(line.trim_end());
        out.push('\n');
    }
    let mut collapsed = String::with_capacity(out.len());
    let mut blank = 0usize;
    for line in out.lines() {
        if line.trim().is_empty() {
            blank += 1;
            if blank > 1 {
                continue;
            }
            collapsed.push('\n');
        } else {
            blank = 0;
            collapsed.push_str(line.trim_start());
            collapsed.push('\n');
        }
    }
    let mut result = collapsed.trim().to_string();
    if result.chars().count() > MAX_EXTRACTED_CHARS {
        result = result.chars().take(MAX_EXTRACTED_CHARS).collect();
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_named_and_numeric_entities() {
        assert_eq!(decode_entities("a &amp; b &#65; &#x4f60;"), "a & b A 你");
        assert_eq!(decode_entities("no entities"), "no entities");
        assert_eq!(decode_entities("bad &bogus; entity"), "bad &bogus; entity");
    }

    #[test]
    fn strips_html_and_keeps_block_breaks() {
        let html = "<p>one</p><p>two <b>bold</b></p>";
        assert_eq!(strip_html(html), "one\ntwo bold");
    }

    #[test]
    fn rejects_unknown_extension() {
        let error = extract(Path::new("installer.exe")).unwrap_err();
        assert_eq!(error.code(), "UNSUPPORTED_FORMAT");
    }

    #[test]
    fn normalizes_blank_line_runs() {
        assert_eq!(normalize_extracted("a\r\n\r\n\r\nb"), "a\n\nb");
    }
}
