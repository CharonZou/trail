import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const LOCALES = ["en", "zh-CN", "zh-TW", "de", "es", "fr", "ko", "pt-BR", "tr"];

const [
  catalog,
  picker,
  shapes,
  sidebar,
  projectSlice,
  initialState,
  appStore,
  ...localeSources
] = await Promise.all([
  read("../src/lib/project-appearance.ts"),
  read("../src/components/ProjectAppearance.tsx"),
  read("../src/lib/project-icon-shapes.ts"),
  read("../src/components/Sidebar.tsx"),
  read("../src/stores/slices/project-slice.ts"),
  read("../src/stores/slices/initial-state.ts"),
  read("../src/stores/app-store.ts"),
  ...LOCALES.map((locale) =>
    read(`../../../packages/i18n/src/locales/${locale}/index.ts`),
  ),
]);

/** The `value:` list of one choice array, in source order. */
function choiceValues(source, listName) {
  const start = source.indexOf(`export const ${listName}`);
  const end = source.indexOf("];", start);
  assert.ok(start >= 0 && end > start, `${listName} should be exported`);
  return [...source.slice(start, end).matchAll(/value:\s*(?:("(?:[^"]*)")|(null))/g)].map(
    (match) => match[1] ?? match[2],
  );
}

/** One catalog choice per source line — the readability both catalogs keep. */
function choiceLines(source, listName) {
  const declaration = source.indexOf(`export const ${listName}`);
  const open = source.indexOf("= [", declaration);
  const end = source.indexOf("];", declaration);
  return source
    .slice(open + 3, end)
    .split("\n")
    .filter((line) => line.trim().length > 0);
}

test("the workspace icon catalog is a stable, host-safe id list", () => {
  const values = choiceValues(catalog, "PROJECT_ICON_CHOICES");
  assert.equal(values.length, 22);
  // A hand-maintained row per choice, so widening a row stays a one-line diff
  // and a reviewer can see which tile moved.
  assert.equal(choiceLines(catalog, "PROJECT_ICON_CHOICES").length, values.length);
  // The first tile is the untouched default: it stores nothing, so a project
  // keeps the historical folder glyph instead of a stored copy of it.
  assert.equal(values[0], "null");
  assert.equal(values.filter((value) => value !== "null").length, 21);
  assert.equal(new Set(values).size, values.length);
  for (const value of values) {
    if (value === "null") continue;
    const id = value.replaceAll('"', "");
    // Same charset and length the Rust validator accepts, so no tile can
    // become a record the host would refuse on the next save.
    assert.match(id, /^[a-z0-9][a-z0-9._-]{0,39}$/);
  }
});

test("the workspace colour catalog stores lowercase hex or nothing", () => {
  const values = choiceValues(catalog, "PROJECT_COLOR_CHOICES");
  assert.equal(values.length, 15);
  assert.equal(choiceLines(catalog, "PROJECT_COLOR_CHOICES").length, values.length);
  assert.equal(values[0], "null");
  assert.equal(new Set(values).size, values.length);
  for (const value of values) {
    if (value === "null") continue;
    assert.match(value, /^"#[0-9a-f]{6}"$/);
  }
  // Anything the host stored that is not a plain hex colour is dropped rather
  // than reaching a style, so a hand-edited record cannot inject CSS.
  assert.match(catalog, /return HEX_COLOR\.test\(candidate\) \? candidate : null;/);
});

test("every appearance tile is labelled in every shipped locale", () => {
  const keys = [
    ...[...catalog.matchAll(/labelKey:\s*"project\.appearance\.([^"]+)"/g)].map(
      (match) => match[1],
    ),
  ];
  assert.deepEqual(
    keys.filter((key) => key.startsWith("icons.")),
    [
      "icons.folder",
      "icons.coffee",
      "icons.martini",
      "icons.cake",
      "icons.moon",
      "icons.sailboat",
      "icons.bot",
      "icons.flower",
      "icons.bug",
      "icons.leaf",
      "icons.cat",
      "icons.ghost",
      "icons.rocket",
      "icons.bell",
      "icons.flask",
      "icons.cocktail",
      "icons.archiveBox",
      "icons.folderOpen",
      "icons.binders",
      "icons.boxStack",
      "icons.folderSolid",
      "icons.tray",
    ],
  );
  assert.equal(keys.length, 37);
  for (const [index, source] of localeSources.entries()) {
    const start = source.search(/"appearance": \{|appearance: \{/);
    assert.ok(start >= 0, `${LOCALES[index]}: appearance block`);
    // The whole `project.appearance` object, so a growing catalog cannot walk
    // out of a fixed-size window and make a present key read as missing.
    const block = source.slice(start, source.indexOf("\n    },", start));
    assert.ok(
      block.includes("icons") && block.includes("colors"),
      `${LOCALES[index]}: appearance block truncated`,
    );
    for (const key of keys) {
      const [group, name] = key.split(".");
      assert.match(
        block,
        new RegExp(`"?${group}"?:\\s*\\{[\\s\\S]*?"?${name}"?\\s*:`),
        `${LOCALES[index]}: ${key}`,
      );
    }
    for (const label of ["iconLabel", "colorLabel"]) {
      assert.match(block, new RegExp(`"?${label}"?:`), `${LOCALES[index]}: ${label}`);
    }
  }
});

test("the picker marks the stored pair as selected and stores the tile value", () => {
  assert.match(picker, /onClick=\{\(\) => onChange\(\{ \.\.\.appearance, icon: choice\.value \}\)\}/);
  assert.match(picker, /icon: choice\.value \}\)/);
  assert.match(picker, /color: choice\.value \}\)/);
  // Tile one is selected when nothing is stored, so a fresh dialog shows the
  // default highlighted instead of nothing at all.
  assert.match(picker, /index === 0 \? !appearance\.icon/);
  assert.match(picker, /index === 0 \? !appearance\.color/);
  assert.match(picker, /aria-pressed=\{selected\}/);
  assert.match(picker, /role="group"/);
});

/** The top-level keys of one of the two id -> artwork maps. */
function mapKeys(source, marker) {
  const start = source.indexOf(marker);
  const end = source.indexOf("\n};", start);
  assert.ok(start >= 0 && end > start, `${marker} should be exported`);
  return [
    ...source
      .slice(start, end)
      .matchAll(/^  "?([a-z][a-z0-9-]*)"?:\s/gm)
      .map((match) => match[1]),
  ];
}

test("every catalog id has artwork in the picker or the shapes module", () => {
  const stored = choiceValues(catalog, "PROJECT_ICON_CHOICES")
    .filter((value) => value !== "null")
    .map((value) => value.replaceAll('"', ""));
  const lucide = mapKeys(picker, "const PROJECT_ICON_GLYPHS");
  const uploaded = mapKeys(shapes, "const PROJECT_UPLOADED_ICON_SHAPES");
  // A tile the artwork maps forgot would draw the folder on the sidebar row the
  // user just decorated, so the two maps together must cover the catalog.
  assert.deepEqual([...lucide, ...uploaded].sort(), [...stored].sort());
  assert.equal(new Set([...lucide, ...uploaded]).size, stored.length);
  // An uploaded shape is raw path data: no box means the glyph collapses to a
  // dot, and an empty list means the tile renders nothing at all.
  for (const [, body] of shapes.matchAll(/^  "?[a-z][a-z0-9-]*"?: \{\n([\s\S]*?)\n  \},/gm)) {
    assert.match(body, /viewBox: "[-\d. ]+",/, "each shape declares a viewBox");
    assert.match(body, /paths: \[\n\s*\{ d:/, "each shape carries path data");
  }
  assert.equal(
    (shapes.match(/viewBox:/g) || []).length,
    uploaded.length,
    "one viewBox per uploaded id",
  );
});

test("the appearance helper stays loadable outside React", () => {
  // `node --test` strips types but cannot resolve a `.tsx` specifier, so a value
  // import of a component here would break every test file that reaches the
  // store through project-slice.
  assert.doesNotMatch(catalog, /from "\.\.\/components\//);
  assert.doesNotMatch(shapes, /from "\.\.\/components\//);
  // One dispatcher decides which artwork a tile gets, so the picker row and the
  // sidebar row cannot stop agreeing about an uploaded id.
  assert.match(picker, /<ProjectGlyph value=\{choice\.value\} size=\{15\} \/>/);
  assert.match(picker, /<ProjectGlyph\s+value=\{appearance\?\.icon\}/);
  assert.match(picker, /const shape = value \? PROJECT_UPLOADED_ICON_SHAPES\[value\]/);
  assert.match(
    picker,
    /\(value \? PROJECT_ICON_GLYPHS\[value\] : undefined\) \?\? IconFolder/,
  );
  // The supplied artwork is flattened to `currentColor`, so the stored colour
  // really tints it instead of a hard-coded source fill winning.
  assert.match(picker, /fill="currentColor"\n\s*fillOpacity=\{path\.opacity\}/);
});

test("project rows draw the stored glyph instead of the fixed folder", () => {
  assert.match(sidebar, /const projectAppearance = useAppStore\(\(s\) => s\.projectAppearance\)/);
  assert.match(sidebar, /<ProjectAppearanceGlyph\s*appearance=\{projectAppearance\[entry\.key\]\}/);
  // Pinning keeps its own star: the decoration only replaces the folder.
  assert.match(sidebar, /entry\.meta\.pinned \? \(\s*<IconStar/);
});

test("the appearance lookup is host-owned and refreshed on mutation", () => {
  assert.match(projectSlice, /refreshProjectGroups: async \(\) => \{/);
  assert.match(projectSlice, /set\(\{ projectAppearance: projectAppearanceByPath\(groups\) \}\)/);
  assert.match(projectSlice, /\.\.\.projectAppearanceByPath\(\[created\.group\]\)/);
  assert.match(projectSlice, /await get\(\)\.refreshProjectGroups\(\);/);
  assert.match(initialState, /projectAppearance: \{\}/);
  // Bootstrap warms the lookup so the first paint already carries the glyphs.
  assert.match(appStore, /void get\(\)\.refreshProjectGroups\(\);/);
  // Only decorated projects get a key, and remote bindings never do.
  assert.match(catalog, /if \(group\.remote\) continue;/);
  assert.match(catalog, /if \(!appearance\?\.icon && !appearance\?\.color\) continue;/);
});
