//! Time-bucketed and per-model token totals over completed turns.
//!
//! One SQL pass feeds both views of `stats.getTokenUsageHistory`, so the
//! per-model ranking always adds up to the bucketed history the card charts.

use anyhow::Result;
use rusqlite::params;
use serde_json::{json, Value};

use crate::db::Database;

fn normalize_usage_bucket(bucket: &str) -> &'static str {
    match bucket {
        "week" => "week",
        "month" => "month",
        _ => "day",
    }
}

fn local_from_ms(ms: i64) -> Option<chrono::DateTime<chrono::Local>> {
    chrono::DateTime::from_timestamp_millis(ms).map(|dt| dt.with_timezone(&chrono::Local))
}

fn usage_bucket_key(dt: &chrono::DateTime<chrono::Local>, bucket: &str) -> String {
    match bucket {
        "month" => dt.format("%Y-%m").to_string(),
        "week" => dt.format("%G-W%V").to_string(),
        _ => dt.format("%Y-%m-%d").to_string(),
    }
}

fn default_history_start(
    end: chrono::DateTime<chrono::Local>,
    bucket: &str,
) -> chrono::DateTime<chrono::Local> {
    match bucket {
        "month" => end - chrono::Duration::days(365 * 2),
        "week" => end - chrono::Duration::weeks(52),
        _ => end - chrono::Duration::weeks(53),
    }
}

fn resolve_history_range(
    start_date: Option<i64>,
    end_date: Option<i64>,
    bucket: &str,
) -> (i64, i64) {
    let now = chrono::Local::now();
    let end = end_date
        .filter(|v| *v > 0)
        .and_then(local_from_ms)
        .unwrap_or(now);
    let start = start_date
        .filter(|v| *v > 0)
        .and_then(local_from_ms)
        .unwrap_or_else(|| default_history_start(end, bucket));
    if start <= end {
        (start.timestamp_millis(), end.timestamp_millis())
    } else {
        (end.timestamp_millis(), start.timestamp_millis())
    }
}

/// The bucket key of a local date — the same string `usage_bucket_key` gives
/// any instant inside that day, which is what keeps a bucket from missing rows.
fn usage_date_key(date: chrono::NaiveDate, bucket: &str) -> String {
    match bucket {
        "month" => date.format("%Y-%m").to_string(),
        "week" => date.format("%G-W%V").to_string(),
        _ => date.format("%Y-%m-%d").to_string(),
    }
}

/// The first local instant of a day, in epoch milliseconds.
///
/// Midnight is not a local time everywhere: a spring-forward can start at 00:00
/// (Santiago) and one Pacific zone once deleted a whole calendar day. Only the
/// timestamp has to cope with that, so it searches forward through the hours;
/// the bucket key stays a property of the date. A day with no local instant at
/// all holds no turns, so its UTC midnight only orders an empty cell.
fn local_day_start_ms(date: chrono::NaiveDate) -> i64 {
    use chrono::{LocalResult, TimeZone};
    (0..24)
        .find_map(|hour| {
            date.and_hms_opt(hour, 0, 0).and_then(|naive| {
                match chrono::Local.from_local_datetime(&naive) {
                    LocalResult::Single(dt) | LocalResult::Ambiguous(dt, _) => {
                        Some(dt.timestamp_millis())
                    }
                    LocalResult::None => None,
                }
            })
        })
        .unwrap_or_else(|| {
            date.and_time(chrono::NaiveTime::MIN)
                .and_utc()
                .timestamp_millis()
        })
}

fn filled_history_keys(start_ms: i64, end_ms: i64, bucket: &str) -> Vec<(String, i64)> {
    use chrono::Datelike;
    let start = local_from_ms(start_ms).unwrap_or_else(chrono::Local::now);
    let end = local_from_ms(end_ms).unwrap_or_else(chrono::Local::now);
    let mut keys = Vec::new();
    match bucket {
        "month" => {
            let mut year = start.year();
            let mut month = start.month();
            let end_y = end.year();
            let end_m = end.month();
            loop {
                if let Some(first) = chrono::NaiveDate::from_ymd_opt(year, month, 1) {
                    keys.push((usage_date_key(first, "month"), local_day_start_ms(first)));
                }
                if year > end_y || (year == end_y && month >= end_m) {
                    break;
                }
                month += 1;
                if month == 13 {
                    month = 1;
                    year += 1;
                }
            }
        }
        "week" => {
            let weekday = start.weekday().num_days_from_monday() as i64;
            let mut cursor = start.date_naive() - chrono::Duration::days(weekday);
            let end_date = end.date_naive();
            while cursor <= end_date {
                keys.push((usage_date_key(cursor, "week"), local_day_start_ms(cursor)));
                cursor += chrono::Duration::days(7);
            }
        }
        _ => {
            let mut cursor = start.date_naive();
            let end_date = end.date_naive();
            while cursor <= end_date {
                keys.push((usage_date_key(cursor, "day"), local_day_start_ms(cursor)));
                cursor += chrono::Duration::days(1);
            }
        }
    }
    keys
}

#[derive(Default, Clone, Copy)]
struct UsageBucketAcc {
    input: i64,
    output: i64,
    cache_read: i64,
    cache_write: i64,
    reasoning: i64,
    turns: i64,
    timestamp: i64,
}

impl UsageBucketAcc {
    fn add(
        &mut self,
        input: i64,
        output: i64,
        cache_read: i64,
        cache_write: i64,
        reasoning: i64,
        ts: i64,
    ) {
        if self.turns == 0 {
            self.timestamp = ts;
        }
        self.input += input;
        self.output += output;
        self.cache_read += cache_read;
        self.cache_write += cache_write;
        self.reasoning += reasoning;
        self.turns += 1;
    }

    fn total_tokens(&self) -> i64 {
        self.input + self.output + self.cache_read + self.cache_write
    }

    fn to_json(self, date: &str) -> Value {
        json!({
            "date": date,
            "timestamp": self.timestamp,
            "inputTokens": self.input,
            "outputTokens": self.output,
            "totalTokens": self.total_tokens(),
            "cacheReadTokens": self.cache_read,
            "cacheWriteTokens": self.cache_write,
            "reasoningTokens": self.reasoning,
            "turnCount": self.turns,
        })
    }
}

pub fn get_token_usage_history(
    db: &Database,
    start_date: Option<i64>,
    end_date: Option<i64>,
    bucket: &str,
) -> Result<Value> {
    let bucket = normalize_usage_bucket(bucket);
    let (range_start, range_end) = resolve_history_range(start_date, end_date, bucket);
    let mut stmt = db.conn().prepare_cached(
        "SELECT ended_at, input_tokens, output_tokens, usage_json, provider_id, model_id
         FROM turns
         WHERE status = 'completed' AND ended_at IS NOT NULL AND ended_at >= ?1 AND ended_at <= ?2
         ORDER BY ended_at ASC",
    )?;

    let rows = stmt.query_map(params![range_start, range_end], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
        ))
    })?;

    use std::collections::BTreeMap;
    let mut bucket_map: BTreeMap<String, UsageBucketAcc> = BTreeMap::new();
    let mut model_map: BTreeMap<(String, String), UsageBucketAcc> = BTreeMap::new();
    let mut total_input = 0i64;
    let mut total_output = 0i64;
    let mut total_turns = 0i64;
    let mut total_cache_read = 0i64;
    let mut total_cache_write = 0i64;
    let mut total_reasoning = 0i64;

    for row in rows {
        let (ended_at, input_tokens, output_tokens, usage_json, provider_id, model_id) = row?;
        let Some(dt) = local_from_ms(ended_at) else {
            continue;
        };
        total_turns += 1;
        total_input += input_tokens;
        total_output += output_tokens;

        let parsed_usage = usage_json
            .as_deref()
            .and_then(|s| serde_json::from_str::<Value>(s).ok());
        let cache_read = parsed_usage
            .as_ref()
            .and_then(|u| u.get("cacheReadTokens"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let cache_write = parsed_usage
            .as_ref()
            .and_then(|u| u.get("cacheWriteTokens"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let reasoning = parsed_usage
            .as_ref()
            .and_then(|u| u.get("reasoningTokens"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        total_cache_read += cache_read;
        total_cache_write += cache_write;
        total_reasoning += reasoning;

        let key = usage_bucket_key(&dt, bucket);
        bucket_map.entry(key).or_default().add(
            input_tokens,
            output_tokens,
            cache_read,
            cache_write,
            reasoning,
            ended_at,
        );
        model_map
            .entry((
                provider_id.unwrap_or_default(),
                model_id.unwrap_or_default(),
            ))
            .or_default()
            .add(
                input_tokens,
                output_tokens,
                cache_read,
                cache_write,
                reasoning,
                ended_at,
            );
    }

    let items: Vec<Value> = filled_history_keys(range_start, range_end, bucket)
        .into_iter()
        .map(|(date, timestamp)| {
            let mut acc = bucket_map.remove(&date).unwrap_or_default();
            if acc.turns == 0 {
                acc.timestamp = timestamp;
            }
            acc.to_json(&date)
        })
        .collect();

    // The per-model view has to add up to the bucket view, so both are folded
    // from this one pass over the same rows. Ranking arrives pre-sorted: a
    // rebuild over unchanged data must not reshuffle the bars.
    let mut models: Vec<(String, String, UsageBucketAcc)> = model_map
        .into_iter()
        .map(|((provider_id, model_id), acc)| (provider_id, model_id, acc))
        .collect();
    models.sort_by(|left, right| {
        right
            .2
            .total_tokens()
            .cmp(&left.2.total_tokens())
            .then_with(|| left.1.cmp(&right.1))
            .then_with(|| left.0.cmp(&right.0))
    });
    let optional_id = |raw: String| -> Value {
        if raw.is_empty() {
            Value::Null
        } else {
            Value::String(raw)
        }
    };
    let models: Vec<Value> = models
        .into_iter()
        .map(|(provider_id, model_id, acc)| {
            json!({
                "providerId": optional_id(provider_id),
                "modelId": optional_id(model_id),
                "inputTokens": acc.input,
                "outputTokens": acc.output,
                "totalTokens": acc.total_tokens(),
                "cacheReadTokens": acc.cache_read,
                "cacheWriteTokens": acc.cache_write,
                "reasoningTokens": acc.reasoning,
                "turnCount": acc.turns,
            })
        })
        .collect();

    Ok(json!({
        "bucket": bucket,
        "rangeStart": range_start,
        "rangeEnd": range_end,
        "items": items,
        "models": models,
        "totals": {
            "inputTokens": total_input,
            "outputTokens": total_output,
            "totalTokens": total_input + total_output + total_cache_read + total_cache_write,
            "cacheReadTokens": total_cache_read,
            "cacheWriteTokens": total_cache_write,
            "reasoningTokens": total_reasoning,
            "turnCount": total_turns,
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sessions::{begin_turn, create_session, end_turn, end_turn_settling};
    use uuid::Uuid;

    fn test_db() -> Database {
        let dir = std::env::temp_dir().join(format!("usage-history-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        Database::open(&dir.join("test.sqlite")).unwrap()
    }

    fn completed_turn(db: &Database, provider: Option<&str>, model: &str, input: i64, output: i64) {
        let session = create_session(
            db,
            None,
            None,
            provider.map(str::to_owned),
            Some(model.to_owned()),
            None,
        )
        .unwrap();
        let turn = begin_turn(db, &session.id, provider, Some(model)).unwrap();
        end_turn(
            db,
            &turn,
            "completed",
            None,
            Some(&json!({
                "operationId": format!("op-{turn}"),
                "inputTokens": input,
                "outputTokens": output,
                "cacheReadTokens": 8,
                "totalTokens": input + output + 8,
            })),
            false,
        )
        .unwrap();
    }

    #[test]
    fn model_ranking_adds_up_to_the_bucketed_history() {
        let db = test_db();
        completed_turn(&db, Some("openai"), "gpt-5", 100, 40);
        completed_turn(&db, Some("anthropic"), "claude", 10, 5);
        completed_turn(&db, Some("anthropic"), "claude", 4, 1);

        let history = get_token_usage_history(&db, None, None, "day").unwrap();
        let models = history["models"].as_array().unwrap();
        assert_eq!(models.len(), 2, "one row per model, not per turn");
        assert_eq!(models[0]["providerId"], "openai");
        assert_eq!(models[0]["modelId"], "gpt-5");
        assert_eq!(models[0]["totalTokens"], 148);
        assert_eq!(models[0]["turnCount"], 1);
        assert_eq!(models[1]["modelId"], "claude");
        assert_eq!(models[1]["totalTokens"], 36);
        assert_eq!(models[1]["turnCount"], 2);

        let sum = |key: &str| {
            models
                .iter()
                .map(|row| row[key].as_i64().unwrap())
                .sum::<i64>()
        };
        for key in [
            "inputTokens",
            "outputTokens",
            "totalTokens",
            "cacheReadTokens",
            "turnCount",
        ] {
            assert_eq!(
                sum(key),
                history["totals"][key].as_i64().unwrap(),
                "{key} must not drift from the history totals"
            );
        }
    }

    #[test]
    fn turns_without_a_model_and_aborted_turns_keep_their_bucket() {
        let db = test_db();
        let session = create_session(&db, None, None, None, None, None).unwrap();
        let turn = begin_turn(&db, &session.id, None, None).unwrap();
        end_turn(
            &db,
            &turn,
            "completed",
            None,
            Some(&json!({
                "operationId": format!("op-{turn}"),
                "inputTokens": 7,
                "outputTokens": 3,
                "totalTokens": 10,
            })),
            false,
        )
        .unwrap();
        let aborted = create_session(&db, None, None, None, Some("gpt-5".into()), None).unwrap();
        let aborted_turn = begin_turn(&db, &aborted.id, None, Some("gpt-5")).unwrap();
        end_turn(&db, &aborted_turn, "aborted", None, None, false).unwrap();

        let history = get_token_usage_history(&db, None, None, "day").unwrap();
        let models = history["models"].as_array().unwrap();
        assert_eq!(models.len(), 1, "only the completed turn is billed");
        assert!(
            models[0]["modelId"].is_null(),
            "unmodelled usage stays visible"
        );
        assert!(models[0]["providerId"].is_null());
        assert_eq!(models[0]["totalTokens"], 10);
        assert_eq!(history["totals"]["turnCount"], 1);
    }
    #[test]
    fn token_usage_history_aggregation() {
        let db = test_db();
        let session = create_session(&db, None, None, None, None, None).unwrap();
        let turn = begin_turn(&db, &session.id, None, None).unwrap();

        let usage = json!({
            "inputTokens": 120,
            "outputTokens": 80,
            "cacheReadTokens": 40,
            "cacheWriteTokens": 10,
            "reasoningTokens": 20
        });

        let ended =
            end_turn_settling(&db, &turn, "completed", None, Some(&usage), false, false).unwrap();
        assert!(ended.updated);
        let ended_at: i64 = db
            .conn()
            .query_row(
                "SELECT ended_at FROM turns WHERE id = ?1",
                params![turn],
                |r| r.get(0),
            )
            .unwrap();

        let history =
            get_token_usage_history(&db, Some(ended_at - 1_000), Some(ended_at + 1_000), "day")
                .unwrap();
        let totals = history.get("totals").unwrap();
        assert_eq!(totals.get("inputTokens").unwrap().as_i64(), Some(120));
        assert_eq!(totals.get("outputTokens").unwrap().as_i64(), Some(80));
        assert_eq!(totals.get("totalTokens").unwrap().as_i64(), Some(250));
        assert_eq!(totals.get("cacheReadTokens").unwrap().as_i64(), Some(40));
        assert_eq!(totals.get("turnCount").unwrap().as_i64(), Some(1));

        let items = history.get("items").unwrap().as_array().unwrap();
        assert!(!items.is_empty());
        let active = items
            .iter()
            .find(|item| item.get("turnCount").and_then(|v| v.as_i64()) == Some(1))
            .expect("active day");
        assert_eq!(active.get("totalTokens").unwrap().as_i64(), Some(250));
    }

    #[test]
    fn token_usage_history_uses_iso_week_year() {
        let db = test_db();
        let session = create_session(&db, None, None, None, None, None).unwrap();
        let turn = begin_turn(&db, &session.id, None, None).unwrap();
        let usage = json!({ "inputTokens": 1, "outputTokens": 1 });
        end_turn_settling(&db, &turn, "completed", None, Some(&usage), false, false).unwrap();
        // Monday 2025-12-29 is ISO week 1 of 2026.
        let ended_at = chrono::TimeZone::with_ymd_and_hms(&chrono::Utc, 2025, 12, 29, 12, 0, 0)
            .unwrap()
            .timestamp_millis();
        db.conn()
            .execute(
                "UPDATE turns SET ended_at = ?1 WHERE id = ?2",
                params![ended_at, turn],
            )
            .unwrap();

        let history = get_token_usage_history(
            &db,
            Some(ended_at - 86_400_000),
            Some(ended_at + 86_400_000),
            "week",
        )
        .unwrap();
        let items = history.get("items").unwrap().as_array().unwrap();
        let active = items
            .iter()
            .find(|item| item.get("turnCount").and_then(|v| v.as_i64()) == Some(1))
            .expect("iso week");
        assert_eq!(
            active.get("date").and_then(|v| v.as_str()),
            Some("2026-W01")
        );
    }

    #[test]
    fn token_usage_history_defaults_to_a_bounded_window() {
        let db = test_db();
        let history = get_token_usage_history(&db, None, None, "day").unwrap();
        let items = history.get("items").unwrap().as_array().unwrap();
        assert!(items.len() >= 365);
        assert!(items.len() <= 53 * 7 + 1);
        assert_eq!(
            history
                .get("totals")
                .unwrap()
                .get("turnCount")
                .unwrap()
                .as_i64(),
            Some(0)
        );
    }

    /// One turn on each of 400 consecutive past days, 400 buckets wide.
    ///
    /// The range is long enough to cross a spring-forward in any zone, so a day
    /// that the range fill skipped would show up as history summing below the
    /// totals it was folded from. Turns start a day ago, never today: an
    /// instant after `now` would fall outside the query window.
    fn four_hundred_days_of_turns(db: &Database) {
        let today = chrono::Local::now().date_naive();
        let session = create_session(
            db,
            None,
            None,
            Some("openai".to_owned()),
            Some("gpt-5".to_owned()),
            None,
        )
        .unwrap();
        for offset in 1..=400i64 {
            let turn = begin_turn(db, &session.id, Some("openai"), Some("gpt-5")).unwrap();
            end_turn(
                db,
                &turn,
                "completed",
                None,
                Some(&json!({
                    "operationId": format!("op-{turn}"),
                    "inputTokens": 10,
                    "outputTokens": 5,
                    "totalTokens": 15,
                })),
                false,
            )
            .unwrap();
            let instant = local_day_start_ms(today - chrono::Duration::days(offset)) + 3_600_000;
            db.conn()
                .execute(
                    "UPDATE turns SET ended_at = ?1 WHERE id = ?2",
                    params![instant, turn],
                )
                .unwrap();
        }
    }

    #[test]
    fn every_day_in_the_range_keeps_a_bucket_and_the_views_add_up() {
        let db = test_db();
        four_hundred_days_of_turns(&db);
        let today = chrono::Local::now().date_naive();
        let start = local_day_start_ms(today - chrono::Duration::days(400));
        let end = chrono::Local::now().timestamp_millis();

        for bucket in ["day", "week", "month"] {
            let history = get_token_usage_history(&db, Some(start), Some(end), bucket).unwrap();
            let items = history["items"].as_array().unwrap();
            let models = history["models"].as_array().unwrap();
            let totals = history["totals"]["totalTokens"].as_i64().unwrap();
            let sum = |rows: &[Value]| -> i64 {
                rows.iter()
                    .map(|row| row["totalTokens"].as_i64().unwrap())
                    .sum()
            };
            assert_eq!(
                sum(models),
                totals,
                "{bucket}: the ranking must match the totals of the same pass"
            );
            assert_eq!(
                sum(items),
                totals,
                "{bucket}: a bucket the range fill skipped lost its tokens from the history"
            );
        }

        let history = get_token_usage_history(&db, Some(start), Some(end), "day").unwrap();
        let items = history["items"].as_array().unwrap();
        let active = items
            .iter()
            .filter(|item| item["turnCount"].as_i64().unwrap_or(0) > 0)
            .count();
        assert_eq!(
            active, 400,
            "one non-empty day per day of usage, whatever the zone's clock did"
        );
    }
}
