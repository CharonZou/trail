import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatTurnDuration } from "../src/lib/turn-duration.ts";
import {
  ALLOWED_NON_DS_VARS,
  findLiteralSurfaceColors,
} from "../../../scripts/style-surface-tokens.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const LOCALES = ["en", "zh-CN", "zh-TW", "tr", "de", "es", "fr", "ko", "pt-BR"];

const [
  shared,
  assistantTurn,
  css,
  topbar,
  projectNameLib,
  ...catalogs
] = await Promise.all([
  read("../src/features/chat/transcript/shared.tsx"),
  read("../src/features/chat/transcript/AssistantTurn.tsx"),
  read("../src/styles/messages.css"),
  read("../src/components/ConversationTopbar.tsx"),
  read("../src/lib/project-name.ts"),
  ...LOCALES.map((locale) =>
    read(`../../../packages/i18n/src/locales/${locale}/index.ts`),
  ),
]);

/** The catalogue read the way the chip reads it: keys in, words out. */
function translate(localeSource) {
  const entries = Object.fromEntries(
    [...localeSource.matchAll(/"?([A-Za-z]+)"?\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map(
      (match) => [match[1], match[2]],
    ),
  );
  return (key, options) => {
    const value = entries[key.split(".")[1]];
    assert.notEqual(value, undefined, `${key} is catalogued`);
    return Object.entries(options).reduce(
      (text, [name, replacement]) =>
        text.replaceAll(`{{${name}}}`, String(replacement)),
      value,
    );
  };
}

const [enSource, zhSource] = catalogs;

test("the turn duration reads as the locale's own unit words", () => {
  const en = translate(enSource);
  const zh = translate(zhSource);
  assert.equal(formatTurnDuration(8_300, zh), "8 秒");
  assert.equal(formatTurnDuration(80_000, zh), "1 分 20 秒");
  assert.equal(formatTurnDuration(3_725_000, zh), "1 小时 2 分 5 秒");
  assert.equal(formatTurnDuration(80_000, en), "1 min 20 sec");
  assert.equal(formatTurnDuration(3_725_000, en), "1 hr 2 min 5 sec");
});

test("an unmeasured turn states no duration", () => {
  /*
   * History that recorded no timing reaches the meta row as `undefined`, and a
   * reply that finished inside a second is not measurable at this granularity.
   * Both must stay silent rather than print a number the app never observed.
   */
  for (const ms of [undefined, Number.NaN, 0, 420, -1_000]) {
    assert.equal(formatTurnDuration(ms, translate(enSource)), undefined);
  }
  assert.equal(formatTurnDuration(1_000, translate(enSource)), "1 sec");
});

test("the meta row leads with the project tile and closes with the duration", () => {
  const tile = shared.indexOf("message-meta-project");
  const modelChip = shared.indexOf("message-meta-chip model");
  const durationChip = shared.indexOf("message-meta-chip duration");
  assert.ok(tile > -1, "the project tile is rendered");
  assert.ok(modelChip > tile, "the tile leads the row");
  assert.ok(durationChip > modelChip, "the duration closes the row");
  assert.match(shared, /formatTurnDuration\(turnDurationMs, t\)/);
  assert.match(shared, /background: projectColor\(projectPath\)/);
  assert.match(shared, /aria-label=\{t\("chat\.metaProject"/, "the tile is named");
  assert.match(shared, /<IconFolder size=\{11\} aria-hidden/, "and decorative inside");
});

test("the row stays silent about a turn with nothing to say", () => {
  assert.match(
    shared,
    /!projectPath &&\s*!modelId &&\s*!showThroughput &&\s*!showTurnUsage &&\s*!turnDuration/,
    "every part of the row is optional",
  );
  assert.match(shared, /projectPath \?\s*\(/);
  assert.match(shared, /turnDuration \?\s*\(/);
});

test("the turn duration is the process header's whole-turn clock", () => {
  assert.match(
    assistantTurn,
    /function wholeTurnDurationMs\(parts: readonly AssistantTurnPart\[\]\)/,
  );
  assert.match(
    assistantTurn,
    /const \{ startedAt, endedAt \} = turnProcessTiming\(parts\)/,
    "the same timing source the header reads",
  );
  assert.match(
    assistantTurn,
    /turnDurationMs=\{wholeTurnDurationMs\(entry\.parts\)\}/,
    "read only on the row that shows it",
  );
  assert.doesNotMatch(
    assistantTurn,
    /useMemo\(\(\) => turnProcessTiming/,
    "a streaming turn never pays for a number it cannot show",
  );
  assert.match(assistantTurn, /projectPath=\{projectPath\}/);
  assert.match(
    assistantTurn,
    /isRemoteSession\(session\) \? null : session\?\.projectPath/,
    "a remote session names no local folder",
  );
  assert.match(
    assistantTurn,
    /projectDisplayName\(projectMeta, projectPath\)/,
    "the tile uses the sidebar's own name",
  );
});

test("the crumb and the tile resolve the project name in one place", () => {
  assert.match(topbar, /projectDisplayName\(projectMeta, sessionProjectPath\)/);
  assert.doesNotMatch(
    topbar,
    /projectMeta\[projectKey\]\?\.name/,
    "the topbar no longer keeps its own copy of the chain",
  );
  assert.match(
    projectNameLib,
    /projectMeta\[key\]\?\.name\?\.trim\(\) \|\| folderNameFromPath/,
  );
});

test("the tile is a 20px square that matches the chips' line", () => {
  const rule = css.match(/\.message-meta-project \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(rule, /width: 20px/);
  assert.match(rule, /height: 20px/);
  assert.match(rule, /border-radius: var\(--radius-xs\)/);
  assert.match(rule, /color: var\(--gray-0\)/);
  assert.doesNotMatch(rule, /#[\da-f]{3,8}\b/i);
});

test("the fixed project ink is a stated exemption, not an escape", () => {
  const entry = ALLOWED_NON_DS_VARS.find(
    (candidate) => candidate.selector.test(".message-meta-project"),
  );
  assert.ok(entry?.reason, "the tile's ink is exempted with a reason");
  assert.match(entry.reason, /recent-projects/);
  // The exemption has to actually hold for the shipped rule.
  assert.deepEqual(
    findLiteralSurfaceColors(css).filter(
      (violation) => violation.property === "color",
    ),
    [],
    "messages.css reports no theme-escaping ink",
  );
  // And the checker still catches the same declaration without it.
  assert.equal(
    findLiteralSurfaceColors(".other-row { color: var(--gray-0); }").length,
    1,
    "the guard is not disabled wholesale",
  );
});

test("every locale names the project and its units exactly once", () => {
  for (const [index, locale] of LOCALES.entries()) {
    const source = catalogs[index];
    for (const key of [
      "metaProject",
      "metaTook",
      "durationHours",
      "durationMinutes",
      "durationSeconds",
    ]) {
      assert.equal(
        (source.match(new RegExp(`"?${key}"?\\s*:`, "g")) ?? []).length,
        1,
        `${locale} defines ${key} once`,
      );
    }
    assert.match(
      source,
      /"?metaProject"?\s*:\s*"[^"]*\{\{name\}\}[^"]*"/,
      `${locale} names the project`,
    );
    assert.match(
      source,
      /"?metaTook"?\s*:\s*"[^"]*\{\{time\}\}[^"]*"/,
      `${locale} states the turn's duration`,
    );
    for (const key of ["durationHours", "durationMinutes", "durationSeconds"]) {
      assert.match(
        source,
        new RegExp(`"?${key}"?\\s*:\\s*"[^"]*\\{\\{value\\}\\}[^"]*"`),
        `${locale} keeps the ${key} placeholder`,
      );
    }
  }
});
