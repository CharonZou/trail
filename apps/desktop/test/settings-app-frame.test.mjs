/**
 * Main-window frame (`AppSettings.appFrame`, General ▸ Appearance ▸ 界面排版).
 *
 * Guards the frame preference: the stored field stays optional and absent means
 * the shipped continuous surface, the Appearance card's segmented row writes it,
 * the shell plates the main pane from it, only the ground and the plate change,
 * and the Settings page's own tier (`settingsLayout`) is never touched by it.
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { loadStylesSync } from "./helpers/styles.mjs";
import {
  readSettingsSourceSync,
  readSharedTypesSourceSync,
} from "./helpers/source-contracts.mjs";

const settings = readSettingsSourceSync();
const sharedTypes = readSharedTypesSourceSync();
const apiSource = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const mainSource = readFileSync(
  new URL("../electron/main/runtime/provider-catalog.ts", import.meta.url),
  "utf8",
);
const frameSource = readFileSync(new URL("../src/lib/app-frame.ts", import.meta.url), "utf8");
const rowSource = readFileSync(
  new URL("../src/components/settings/AppFrameRow.tsx", import.meta.url),
  "utf8",
);
const shellSource = readFileSync(
  new URL("../src/features/app/AppShell.tsx", import.meta.url),
  "utf8",
);
const runtimeSource = readFileSync(
  new URL("../src/features/app/useAppShellRuntime.tsx", import.meta.url),
  "utf8",
);
const chromeCss = readFileSync(new URL("../src/styles/chrome.css", import.meta.url), "utf8");
const styles = loadStylesSync();

function cssRule(selector) {
  const from = styles.indexOf(`\n${selector} {`);
  assert.ok(from >= 0, `${selector} rule missing`);
  return styles.slice(from, styles.indexOf("}", from));
}

test("the frame is an optional field validated on both write paths", () => {
  // Optional, so an upgrade never rewrites a profile that predates the row.
  assert.match(sharedTypes, /appFrame\?: "window" \| "floating";/);
  // Renderer write path.
  assert.match(
    apiSource,
    /function isAppFrameValue\(value: unknown\): value is NonNullable<AppSettings\["appFrame"\]> \{[\s\S]{0,160}?return value === "window" \|\| value === "floating";/,
  );
  assert.match(
    apiSource,
    /hasOwnProperty\.call\(settings, "appFrame"\)[\s\S]{0,80}?isAppFrameValue\(settings\.appFrame\)/,
  );
  // Main write path (the settings blob validator).
  assert.match(mainSource, /appFrame\?: unknown;/);
  assert.match(mainSource, /value\.appFrame !== "window"/);
  assert.match(mainSource, /value\.appFrame !== "floating"/);
});

test("an absent frame resolves to the shipped continuous surface", () => {
  assert.match(frameSource, /export type AppFrame = NonNullable<AppSettings\["appFrame"\]>/);
  assert.match(frameSource, /settings\?\.appFrame === "floating" \? "floating" : "window"/);
});

test("the appearance card exposes the frame as a segmented row", () => {
  assert.match(settings, /<AppFrameRow settings=\{settings\} saveSettings=\{saveSettings\} \/>/);
  const appearanceCard = settings.indexOf('title={t("settings.appearance")}');
  const rowMount = settings.indexOf("<AppFrameRow");
  const fontSizeRow = settings.indexOf("<FontSizeRow");
  const sidebarCard = settings.indexOf('title={t("settings.sidebar")}');
  assert.ok(appearanceCard >= 0, "appearance card missing");
  assert.ok(rowMount > appearanceCard, "the row must live inside the appearance card");
  assert.ok(rowMount > fontSizeRow, "the row follows the font-size row");
  assert.ok(rowMount < sidebarCard, "the row must not fall into the sidebar card");

  // One resolver, not a second read of the raw field.
  assert.match(rowSource, /const current = appFrameOf\(settings\);/);
  assert.match(rowSource, /value=\{current\}/);
  assert.match(rowSource, /value: "window", label: t\("settings\.appFrameWindow"\)/);
  assert.match(rowSource, /value: "floating", label: t\("settings\.appFrameFloating"\)/);
  assert.match(rowSource, /saveSettings\(\{ appFrame: value \}\)/);

  // The frame is not the Settings page's size tier: that stays on the chrome
  // button and on `settingsLayout`, which this row never writes.
  assert.doesNotMatch(rowSource, /saveSettings\(\{\s*settingsLayout/);
  assert.doesNotMatch(rowSource, /settingsTierOf\(/);
  assert.doesNotMatch(rowSource, /from "\S*settings-tier"/);
  // Read-only surface: the row owns no destination and never mounts a card.
  assert.doesNotMatch(rowSource, /settings-search|setSettingsTab|SettingsCard/);
});

test("the shell plates the main pane only while the frame is floating", () => {
  assert.match(runtimeSource, /const appFrame = appFrameOf\(settings\);/);
  assert.match(
    shellSource,
    /appFrame === "floating" && page !== "settings" && "app-frame-floating"/,
  );
  // Settings keeps its own tier, so the frame class steps aside there.
  assert.match(shellSource, /page === "settings" && ready && "settings-mode"/);
});

test("only the ground and the plate change in the floating frame", () => {
  const shellRule = cssRule(".app-shell.app-frame-floating");
  assert.match(shellRule, /padding-bottom:/, "the rail keeps the sheet's bottom seam");
  assert.match(
    shellRule,
    /background: var\(--ds-bg-sidebar\)/,
    "the ground becomes the rail's own colour, so the rail reads as part of it",
  );
  // The chrome band is not part of the sheet: the window buttons, the
  // breadcrumb and the history pair keep reading on the ground, on route
  // pages and in conversations alike.
  assert.match(
    chromeCss,
    /\.app-shell\.app-frame-floating \.main-pane,\n\.app-shell\.app-frame-floating \.main-titlebar,\n\.app-shell\.app-frame-floating \.conversation-topbar \{\n  background: transparent;/,
  );
  // The caption lane keeps its hit band but must not lay a second strip of the
  // work area's colour over the ground.
  assert.match(
    chromeCss,
    /\.app-shell\.app-frame-floating > \.window-controls \{\n  background: transparent;/,
  );
  const sheetRule = cssRule(
    ".app-shell.app-frame-floating .main-pane > :where(.chat-surface, .route-surface)",
  );
  assert.match(sheetRule, /border-radius: var\(--app-frame-radius\)/);
  assert.match(sheetRule, /margin: var\(--ds-toolbar-height\)/, "the sheet starts below the band");
  assert.match(sheetRule, /background: var\(--ds-bg-primary\)/);
  // The sheet sits below the band, so the transcript's own reserve is dropped.
  assert.match(
    chromeCss,
    /\.app-shell\.app-frame-floating \.thread-content \{\n  padding-top: 0;/,
  );
  // Nothing else may be re-plated: the sidebar keeps painting on the ground,
  // so no second rule may restyle it.
  assert.doesNotMatch(chromeCss, /\.app-frame-floating\s*\.sidebar/);
});

test("the work dock joins the sheet instead of standing outside it", () => {
  const dockRule = cssRule(".app-shell.app-frame-floating .work-panel");
  assert.match(dockRule, /margin: var\(--ds-toolbar-height\)/, "the dock starts below the band");
  assert.match(
    dockRule,
    /border-radius: 0 var\(--app-frame-radius\) var\(--app-frame-radius\) 0/,
    "the dock closes the sheet's right edge, so only its own corners round",
  );
  assert.match(
    chromeCss,
    /:has\(\.work-panel\) \.main-pane > :where\(\.chat-surface, \.route-surface\) \{\n  margin-right: 0;\n  border-radius: var\(--app-frame-radius\) 0 0 var\(--app-frame-radius\);/,
    "the sheet drops its right seam and right corners while the dock is open",
  );
});

test("every shipped catalog localizes the frame row", () => {
  // The row labels are the only surfaces these strings reach, so a missing one
  // would fall through to the raw key.
  for (const locale of ["en", "zh-CN", "zh-TW", "de", "es", "fr", "ko", "pt-BR", "tr"]) {
    const source = readFileSync(
      new URL(`../../../packages/i18n/src/locales/${locale}/index.ts`, import.meta.url),
      "utf8",
    );
    for (const key of ["appFrame", "appFrameDesc", "appFrameWindow", "appFrameFloating"]) {
      assert.match(source, new RegExp(`"?${key}"?:\\s*"`), `${locale} settings.${key}`);
    }
  }
});
