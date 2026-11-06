import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  buildUsageHeatGrid,
  usageHeatLevel,
  usageHeatThresholds,
  usageModelBreakdown,
} from "../src/lib/token-usage.ts";

const read = (relative) =>
  readFile(new URL(relative, import.meta.url), "utf8");

const cardSource = await read("../src/components/TokenUsageCard.tsx");
const homeSource = await read("../src/components/ChatSurface.tsx");
const sidebarSource = await read("../src/components/Sidebar.tsx");
const settingsSource = await read("../src/features/settings/SettingsPage.tsx");
const windowActionsSource = await read("../src/features/settings/window-actions.tsx");
const cardStyles = await read("../src/styles/token-usage.css");
const usageTypesSource = await read("../../../packages/shared/src/types/filesystem.ts");

const item = (date, totalTokens) => ({ date, totalTokens });

test("the heat grid starts each column on a Monday and pads the partial edges", () => {
  // 2026-10-29 is a Thursday, 2026-11-03 the following Tuesday.
  const grid = buildUsageHeatGrid([
    item("2026-10-29", 10),
    item("2026-10-30", 20),
    item("2026-11-02", 0),
    item("2026-11-03", 5),
  ]);

  assert.equal(grid.length, 2);
  assert.deepEqual(
    grid.map((week) => week.map((cell) => cell.date)),
    [
      [null, null, null, "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"],
      ["2026-11-02", "2026-11-03", null, null, null, null, null],
    ],
  );
  assert.equal(grid[0][3].totalTokens, 10);
  // A day the host left out stays a real, idle cell instead of shifting the
  // following week onto the wrong weekday.
  assert.equal(grid[0][5].totalTokens, 0);
  // An empty range still renders nothing rather than a stray week.
  assert.deepEqual(buildUsageHeatGrid([]), []);
});

test("heat levels split the active days into quartiles and keep idle days flat", () => {
  const items = [
    item("2026-01-05", 0),
    ...[2, 4, 8, 16, 32, 64, 128, 256].map((total, index) =>
      item(`2026-01-${String(index + 6).padStart(2, "0")}`, total),
    ),
  ];
  const thresholds = usageHeatThresholds(items);
  assert.equal(thresholds.length, 3);
  assert.ok(
    thresholds[0] <= thresholds[1] && thresholds[1] <= thresholds[2],
    `thresholds must stay ordered, got ${thresholds.join(",")}`,
  );

  assert.equal(usageHeatLevel(0, thresholds), 0, "an idle day gets no ink");
  assert.equal(usageHeatLevel(256, thresholds), 4, "the busiest day tops out");
  const levels = items.map((entry) => usageHeatLevel(entry.totalTokens, thresholds));
  assert.deepEqual(
    new Set(levels.filter((level) => level > 0)).size > 1,
    true,
    "a single level for every active day would erase the ranking",
  );
});

test("a range with no usage has thresholds that light nothing up", () => {
  const thresholds = usageHeatThresholds([item("2026-01-01", 0)]);
  assert.deepEqual(thresholds, [0, 0, 0]);
  assert.equal(usageHeatLevel(0, thresholds), 0);
});

test("the model view keeps the tail in one honest row", () => {
  const model = (modelId, totalTokens, turnCount = 1) => ({
    providerId: "openai",
    modelId,
    totalTokens,
    turnCount,
    inputTokens: totalTokens,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
  });
  const models = [
    model("gpt-5", 500),
    model("gpt-5-mini", 200),
    model("a", 100),
    model("b", 60),
    model("c", 40),
    model("d", 30),
    model("e", 30),
  ];
  const total = models.reduce((sum, entry) => sum + entry.totalTokens, 0);
  const breakdown = usageModelBreakdown(models, total);

  assert.equal(breakdown.rows.length, 5);
  assert.equal(breakdown.rows[0].modelId, "gpt-5");
  assert.equal(breakdown.othersCount, 2);
  assert.equal(breakdown.others.totalTokens, 60);
  assert.equal(
    [...breakdown.rows, breakdown.others].reduce((sum, row) => sum + row.totalTokens, 0),
    total,
  );
  assert.equal(
    [...breakdown.rows, breakdown.others].reduce((sum, row) => sum + row.share, 0).toFixed(6),
    "1.000000",
  );
  assert.equal(breakdown.scale, 500);

  // Turn counts are counted, not averaged, so a merged tail stays truthful.
  assert.equal(breakdown.others.turnCount, 2);
});

test("a tail heavier than the leading model scales instead of overflowing", () => {
  // Sizing the bars from the ranked rows alone drew this tail as a full-width
  // bar in a track built for the leader: `overflow: hidden` clipped the
  // difference away and the card quietly overstated the small models.
  const models = [
    { providerId: "p", modelId: "leader", totalTokens: 500, turnCount: 1 },
    ...["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((modelId) => ({
      providerId: "p",
      modelId,
      totalTokens: 200,
      turnCount: 1,
    })),
  ];
  const breakdown = usageModelBreakdown(models, 2500);
  const widths = [...breakdown.rows, breakdown.others].map(
    (row) => row.totalTokens / breakdown.scale,
  );

  assert.equal(breakdown.othersCount, 6);
  assert.equal(breakdown.scale, 1200, "the folded tail is the widest bar in the view");
  assert.ok(
    widths.every((width) => width > 0 && width <= 1),
    `a bar wider than its track is clipped, not drawn: ${widths.join(", ")}`,
  );
  assert.ok(widths[0] < 1, "the leader must read as shorter than the tail it lost to");
});

test("a model with no recorded identity is still a visible row", () => {
  const breakdown = usageModelBreakdown(
    [{ providerId: null, modelId: null, totalTokens: 9, turnCount: 1 }],
    9,
  );
  assert.equal(breakdown.rows[0].key, "unknown/unknown");
  assert.equal(breakdown.rows[0].share, 1);
});

test("zero usage cannot divide by zero in the shares", () => {
  const breakdown = usageModelBreakdown(
    [{ providerId: "p", modelId: "m", totalTokens: 0, turnCount: 0 }],
    0,
  );
  assert.equal(breakdown.rows[0].share, 0);
  assert.equal(breakdown.scale, 0);
});

test("the meter reads one host query and lives under the empty-home hero", () => {
  assert.match(cardSource, /getTokenUsageHistory\(\{ bucket: "day" \}\)/);
  assert.doesNotMatch(
    cardSource,
    /startDate|endDate/,
    "the window belongs to the host default, not a second local rule",
  );
  // Inside the home stack, after the hero and the first-run checklist, so the
  // glance sits where the user already reads the project name.
  const hero = homeSource.indexOf('<div className="empty-hero">');
  const checklist = homeSource.indexOf("<OnboardingChecklist />");
  const meter = homeSource.indexOf("<TokenUsageCard />");
  assert.ok(hero > 0 && checklist > 0 && meter > 0, "the home stack lost a member");
  assert.ok(hero < meter, "the meter belongs below the hero");
  assert.ok(checklist < meter, "the first-run list keeps priority over the meter");
  assert.ok(
    meter < homeSource.indexOf('<div className="home-composer-wrap">'),
    "the meter belongs above the composer",
  );
  // The sidebar no longer carries it: one surface, one meter.
  assert.doesNotMatch(sidebarSource, /TokenUsageCard/);
  assert.match(cardStyles, /\.token-usage-card\s*\{[^}]*width:\s*100%/);
  assert.match(cardStyles, /\.token-usage-card\s*\{[^}]*max-width:\s*880px/);
});

// A dev profile can reach a host binary built before D682, which answers with
// `items` and `totals` only. Reading `undefined` as an array took the whole
// renderer down with "models is not iterable".
test("an older host without the model dimension degrades instead of crashing", () => {
  assert.match(usageTypesSource, /models\?: TokenUsageModelTotal\[\]/);
  assert.match(cardSource, /usageModelBreakdown\(history\.models \?\? \[\]/);
  assert.match(cardSource, /const hasModelView = Boolean\(history && Array\.isArray\(history\.models\)\)/);
  assert.match(cardSource, /\{hasModelView \? \(/, "the switch is not offered without the dimension");
  assert.match(cardSource, /view === "calendar" \|\| !hasModelView/);
});

test("a year of cells stays legible at the narrow chat band bound", () => {
  // 53 week columns across the 560px floor of the chat band: allowed to shrink,
  // each column lands under 2px — narrower than its own gutter — and the strip
  // reads as a dot field. So a column has a px floor and the older weeks scroll
  // sideways, with the shell's own quiet scrollbar rather than a per-surface
  // hack.
  assert.match(cardStyles, /\.token-usage-heat\s*\{[^}]*display:\s*flex/);
  assert.match(cardStyles, /\.token-usage-heat\s*\{[^}]*overflow-x:\s*auto/);
  assert.doesNotMatch(
    cardStyles.replace(/\/\*[\s\S]*?\*\//g, ""),
    /scrollbar-width\s*:/,
    "setting it here disables the ::-webkit-scrollbar reveal contract for the whole renderer",
  );
  assert.doesNotMatch(
    cardStyles,
    /\.token-usage-heat::-webkit-scrollbar\s*\{[^}]*display:\s*none/,
    "the strip must not opt out of the shared scrollbar contract",
  );

  const weekRule = /\.token-usage-heat-week\s*\{([^}]*)\}/.exec(cardStyles)?.[1] ?? "";
  const floor = Number(/flex:\s*1\s+0\s+(\d+(?:\.\d+)?)px/.exec(weekRule)?.[1]);
  assert.ok(
    Number.isFinite(floor) && floor >= 5,
    `a shrinkable column (flex: ${weekRule.match(/flex:[^;]*/)?.[0]}) collapses the year`,
  );
  assert.match(cardStyles, /aspect-ratio:\s*1/);

  // Only the strip scrolls: the total and the switch stay pinned in the card.
  const cardRule = /\.token-usage-card\s*\{([^}]*)\}/.exec(cardStyles)?.[1] ?? "";
  assert.doesNotMatch(cardRule, /overflow/, "the card itself must never gain a scrollbar");

  // A scrollable region that no key can reach hides the older year from the
  // keyboard, so the strip is a focus target with a visible ring.
  assert.match(cardSource, /className="token-usage-heat"[\s\S]{0,80}tabIndex=\{0\}/);
  assert.match(
    cardStyles,
    /\.token-usage-heat:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ds-focus\)/,
  );
});

test("every meter label is translatable", async () => {
  const used = [...cardSource.matchAll(/t\("tokenUsage\.([a-zA-Z]+)"/g)].map(
    (match) => match[1],
  );
  assert.ok(used.length >= 8, `expected the card to use its namespace, saw ${used.length}`);
  const settingsUsed = [...windowActionsSource.matchAll(/t\("settings\.([a-zA-Z]+)"/g)].map(
    (match) => match[1],
  );
  const locales = [
    "en", "zh-CN", "zh-TW", "tr", "de", "es", "fr", "ko", "pt-BR",
  ];
  for (const locale of locales) {
    const source = await read(`../../../packages/i18n/src/locales/${locale}/index.ts`);
    const usageBlock = catalogBlock(source, "tokenUsage");
    for (const key of new Set(used)) {
      assert.match(
        usageBlock,
        new RegExp(`^\\s*"?${key}"?:`, "m"),
        `${locale} is missing tokenUsage.${key}`,
      );
    }
    const settingsBlock = catalogBlock(source, "settings");
    for (const key of new Set(settingsUsed)) {
      assert.match(
        settingsBlock,
        new RegExp(`^\\s*"?${key}"?:`, "m"),
        `${locale} is missing settings.${key}`,
      );
    }
  }
});

/** Slice a top-level namespace out of a catalog so keys cannot match by luck. */
function catalogBlock(source, name) {
  const start = source.search(new RegExp(`^  "?${name}"?: \\{`, "m"));
  assert.ok(start >= 0, `the ${name} namespace is missing`);
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index);
    }
  }
  assert.fail(`the ${name} namespace never closes`);
}

test("the meter follows finished turns instead of freezing at mount", () => {
  // The numbers only move when a turn is committed. A deps-less effect left
  // the card showing the count from app start for the whole session.
  assert.match(cardSource, /state\) => Object\.keys\(state\.runningSessions\)\.length/);
  assert.match(cardSource, /hadRunningSessions\.current = false;\s*refresh\(\);/);
  // Overlapping fetches can land newest-last, so only the newest may write.
  assert.match(cardSource, /const id = \+\+requestId\.current;/);
  assert.match(cardSource, /id !== requestId\.current/);
  // A narrow sidebar clips the oldest half of the year, so the strip opens on
  // the current week instead of January. A stable ref callback jumps once, when
  // the strip appears, so a refresh cannot drag the view back to January.
  assert.match(cardSource, /const attachHeat = useCallback\(\(node: HTMLDivElement \| null\) => \{/);
  assert.match(cardSource, /node\.scrollLeft = node\.scrollWidth - node\.clientWidth/);
  assert.match(cardSource, /ref=\{attachHeat\}/);
  // Every padding cell in a column needs its own key; six cells sharing
  // key="padding" made React reuse the wrong squares.
  assert.doesNotMatch(cardSource, /key="padding"/);
});

test("settings can minimize and toggle full screen through the existing IPC", () => {
  assert.match(settingsSource, /<WindowActionSection \/>/);
  assert.match(windowActionsSource, /windowControl\("minimize"\)/);
  assert.match(windowActionsSource, /nativeMenuAction\("toggleFullScreen"\)/);
  // The labels come from catalogs that already exist in all nine locales.
  assert.match(windowActionsSource, /t\("window\.minimize"\)/);
  assert.match(windowActionsSource, /t\("settings\.shortcutAction\.toggleFullScreen"\)/);
});
