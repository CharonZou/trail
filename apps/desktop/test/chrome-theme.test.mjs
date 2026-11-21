/**
 * Chrome palette presets (Settings ▸ Appearance ▸ 主题模式).
 *
 * The contract this pins: a preset only re-colours chrome tokens, `forest`
 * stays the shipped palette, every preset exists for both schemes, the picker
 * previews the real tokens, and a pick repaints immediately.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadStyles } from "./helpers/styles.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, "..");
const repo = join(desktop, "..", "..");

const read = (path) => readFile(join(desktop, path), "utf8");
const readRepo = (path) => readFile(join(repo, path), "utf8");

const styles = await loadStyles();
const settingsStyles = await read("src/styles/settings.css");
const row = await read("src/components/settings/ChromeThemeRow.tsx");
const lib = await read("src/lib/chrome-theme.ts");
const settingsPage = await read("src/features/settings/SettingsPage.tsx");
const runtime = await read("src/features/app/useAppShellRuntime.tsx");
const sharedTheme = await readRepo("packages/shared/src/theme.ts");
const sharedSettings = await readRepo("packages/shared/src/types/settings.ts");

const PRESETS = ["forest", "mint", "honey", "parchment"];
const CHROME_TOKENS = [
  "--ds-bg-primary",
  "--ds-settings-rail-bg",
  "--ds-bg-sidebar",
  "--ds-bg-sidebar-image",
  "--ds-chrome-ground-image",
  "--ds-chrome-accent",
];

function themeBlock(scheme, preset) {
  const escaped = `\\[data-theme="${scheme}"\\]\\[data-chrome-theme="${preset}"\\]`;
  return styles.match(new RegExp(`:root${escaped}[^{]*\\{[^}]*\\}`))?.[0] ?? "";
}

test("the preset ids are declared once in shared and reused everywhere", () => {
  assert.match(sharedTheme, /export type ChromeThemeId = "forest" \| "mint" \| "honey" \| "parchment"/);
  assert.match(sharedTheme, /export const DEFAULT_CHROME_THEME: ChromeThemeId = "forest"/);
  assert.match(sharedTheme, /export const CHROME_THEMES: readonly ChromeThemeId\[\] = \[/);
  assert.match(sharedTheme, /export function isChromeThemeId\(value: unknown\)/);
  // The stored field is optional, so an existing install keeps its palette.
  assert.match(sharedSettings, /chromeTheme\?: import\("\.\.\/theme\.js"\)\.ChromeThemeId/);

  assert.match(lib, /CHROME_THEMES,/);
  assert.match(lib, /isChromeThemeId\(value\) \? value : DEFAULT_CHROME_THEME/);
  assert.match(lib, /root\.dataset\.chromeTheme = theme/);
});

test("each non-default preset defines the whole chrome palette in both schemes", () => {
  // `forest` is the shipped palette: it must not have a block, or the default
  // look would change the moment this field exists.
  for (const preset of ["mint", "honey", "parchment"]) {
    for (const scheme of ["light", "dark"]) {
      // Literal colours live once, in the scheme's root token block.
      for (const role of ["primary", "sidebar", "image", "accent"]) {
        assert.match(
          styles,
          new RegExp(`--ds-preset-${preset}-${role}:`),
          `${preset}/${scheme} needs --ds-preset-${preset}-${role}`,
        );
      }
      const gradient = styles.match(
        new RegExp(`--ds-preset-${preset}-image:\\s*linear-gradient\\(\\s*180deg`),
      );
      assert.ok(gradient, `${preset} must paint a vertical gradient plate`);

      // The preset block itself only remaps surface tokens onto those values.
      const block = themeBlock(scheme, preset);
      assert.ok(block, `${preset}/${scheme} must define a token block`);
      for (const token of CHROME_TOKENS) {
        assert.match(block, new RegExp(`${token}:`), `${preset}/${scheme} needs ${token}`);
      }
      assert.doesNotMatch(block, /#[\da-f]{3,8}\b/i, `${preset}/${scheme} must not carry literals`);
    }
  }
  assert.equal(themeBlock("light", "forest"), "", "forest must fall through to the base block");
  assert.equal(themeBlock("dark", "forest"), "", "forest must fall through to the base block");
});

test("the base blocks own the marker accent so the shipped tile renders", () => {
  const tokenSource = styles.slice(0, styles.indexOf("@theme {"));
  const lightIndex = tokenSource.search(/\n:root\[data-theme="light"\]\s*\{/);
  assert.ok(lightIndex > 0);
  const dark = tokenSource.slice(0, lightIndex);
  const light = tokenSource.slice(lightIndex);
  for (const [scheme, block] of Object.entries({ dark, light })) {
    assert.match(block, /--ds-chrome-accent:/, `${scheme} must define the marker accent`);
  }
});

test("a preset never restyles text, borders, or control accents", () => {
  // Only chrome tokens may appear in a preset block; semantic roles stay put.
  for (const preset of ["mint", "honey", "parchment"]) {
    for (const scheme of ["light", "dark"]) {
      const block = themeBlock(scheme, preset);
      assert.doesNotMatch(block, /--ds-text-/);
      assert.doesNotMatch(block, /--ds-border-/);
      assert.doesNotMatch(block, /--ds-accent:/);
      assert.doesNotMatch(block, /--ds-error|--ds-success|--ds-warning/);
    }
  }
});

test("the picker previews the preset's own tokens and repaints on pick", () => {
  assert.match(row, /CHROME_THEME_OPTIONS\.map/);
  assert.match(row, /data-chrome-theme={id}/);
  assert.match(row, /applyChromeTheme\(id\)/);
  assert.match(row, /saveSettings\(\{ chromeTheme: id \}\)/);
  assert.match(settingsPage, /<ChromeThemeRow settings={settings} saveSettings={saveSettings} \/>/);
  // The tiles sit directly under the appearance picker, not in a second card.
  assert.match(
    settingsPage,
    /<ThemeRow settings={settings} saveSettings={saveSettings} \/>\n\s*<ChromeThemeRow/,
  );
  // Startup + later saves go through the same attribute stamp.
  assert.match(runtime, /applyChromeTheme\(settings\?\.chromeTheme\)/);

  // A tile paints real chrome: plate gradient, content sheet, marker accent.
  assert.match(settingsStyles, /\.chrome-theme-tile\s*\{[\s\S]*?background-image:\s*var\(--ds-bg-sidebar-image/);
  assert.match(settingsStyles, /\.chrome-theme-tile-sheet\s*\{[\s\S]*?background:\s*var\(--ds-bg-primary\)/);
  assert.match(settingsStyles, /\.chrome-theme-tile-accent\s*\{[\s\S]*?background:\s*var\(--ds-chrome-accent\)/);
  // Selection is one accent ring, mirroring the reference's single marker.
  assert.match(settingsStyles, /\.chrome-theme-option\.is-selected \.chrome-theme-tile\s*\{/);
});

test("every locale names the preset row and its four palettes", async () => {
  const locales = ["en", "zh-CN", "zh-TW", "de", "es", "fr", "ko", "pt-BR", "tr"];
  for (const locale of locales) {
    const catalog = await readRepo(`packages/i18n/src/locales/${locale}/index.ts`);
    for (const key of [
      "chromeTheme",
      "chromeThemeDesc",
      "chromeThemeHint",
      "chromeThemeForest",
      "chromeThemeMint",
      "chromeThemeHoney",
      "chromeThemeParchment",
    ]) {
      assert.match(catalog, new RegExp(`\\b${key}\\b`), `${locale} is missing ${key}`);
    }
  }
  // The row's label map covers exactly the shared preset list.
  for (const preset of PRESETS) {
    assert.match(row, new RegExp(`${preset}: "settings\\.chromeTheme`));
  }
});
