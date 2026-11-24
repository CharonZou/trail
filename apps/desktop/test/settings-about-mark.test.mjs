import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { loadStyles } from "./helpers/styles.mjs";

const pageSource = await readFile(
  new URL("../src/features/settings/SettingsPage.tsx", import.meta.url),
  "utf8",
);
const globalStyles = await loadStyles();

test("the About block leads with the app mark", () => {
  // Identity first: the mark sits above the name/version pair, exactly like the
  // sidebar brand, so the 信息 tab never opens as bare text.
  const hero = pageSource.match(
    /<div className="settings-about-hero">[\s\S]*?settings-about-hero-meta/,
  )?.[0] ?? "";
  assert.match(hero, /settings-about-hero-mark[\s\S]*?<BrandLogo size=\{(40|[0-9]+)\} \/>/);
  const markIndex = hero.indexOf("settings-about-hero-mark");
  const nameIndex = hero.indexOf("settings-about-hero-name");
  assert.ok(markIndex >= 0 && nameIndex > markIndex);
});

test("the About mark takes a 56px seat on the shared tile tone", () => {
  const markBlock =
    globalStyles.match(/\.settings-about-hero-mark\s*\{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(markBlock, /width:\s*56px/);
  assert.match(markBlock, /height:\s*56px/);
  assert.match(markBlock, /border-radius:\s*var\(--radius-lg\)/);
  assert.match(markBlock, /background:\s*var\(--ds-bg-hover\)/);
});
