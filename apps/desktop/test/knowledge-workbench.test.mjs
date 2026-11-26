import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("the workbench derives its numbers from the stored body", async () => {
  const [stats, health, workbench] = await Promise.all([
    read("../src/pages/knowledge/workbench/doc-stats.ts"),
    read("../src/pages/knowledge/workbench/doc-health.ts"),
    read("../src/pages/knowledge/workbench/KnowledgeWorkbench.tsx"),
  ]);
  // Reading time, headings and hero copy are measured, never hardcoded.
  assert.match(stats, /export function docStats\(source: string\): DocStats/);
  assert.match(stats, /export function heroDescription\(source: string, limit = 220\)/);
  assert.match(stats, /export function catalogFolders\(documents: KnowledgeDocument\[\]\)/);
  assert.doesNotMatch(stats, /from "react"/);
  // Health is a real deduction ladder, not the 92 that GoGo ships.
  assert.match(health, /score -= 60/);
  assert.match(health, /score -= 30/);
  assert.match(health, /score -= 10/);
  assert.match(health, /score -= 5/g);
  assert.doesNotMatch(health, /92/);
  assert.doesNotMatch(workbench, /\bdetailHealthScore\b|visitTrend/);
  // The reader renders the stored Markdown; it never re-joins overlapping chunks.
  assert.doesNotMatch(workbench, /join\("\\n\\n"\)/);
});

test("tabs are declared once and unimplemented phases render an explicit note", async () => {
  const workbench = await read("../src/pages/knowledge/workbench/KnowledgeWorkbench.tsx");
  for (const tab of ["docs", "search", "ask", "wiki", "graph"]) {
    assert.match(workbench, new RegExp(`id: "${tab}"`));
  }
  assert.match(workbench, /{ id: "docs", icon: IconBookOpen, available: true }/);
  assert.match(workbench, /{ id: "search", icon: IconSearch, available: true }/);
  for (const tab of ["ask", "wiki", "graph"]) {
    assert.match(workbench, new RegExp(`{ id: "${tab}", icon: Icon\\w+, available: false }`));
  }
  // Unavailable tabs explain the phase instead of showing placeholder data.
  assert.match(workbench, /knowledge\.workbench\.tabComing/);
  assert.match(workbench, /knowledge\.workbench\.phase\.\$\{tab\}/);
});

test("the catalog groups documents by their source folder", async () => {
  const [catalog, stats] = await Promise.all([
    read("../src/pages/knowledge/workbench/WorkbenchCatalog.tsx"),
    read("../src/pages/knowledge/workbench/doc-stats.ts"),
  ]);
  assert.match(stats, /folderOf\(document\.sourcePath\)/);
  assert.match(stats, /\.replace\(\/\\\\\/g, "\/"\)/);
  assert.match(catalog, /catalogFolders\(documents\)/);
  assert.match(catalog, /knowledge\.workbench\.root/);
  assert.match(catalog, /knowledge\.workbench\.outline/);
  // Filtering matches the document title and its path, nothing else.
  assert.match(catalog, /document\.title\.toLowerCase\(\)\.includes\(needle\)/);
});

test("the workbench is full-bleed and drops panes by breakpoint", async () => {
  const [styles, globals] = await Promise.all([
    read("../src/styles/knowledge-workbench.css"),
    read("../src/styles/globals.css"),
  ]);
  assert.match(globals, /@import "\.\/knowledge-workbench\.css";/);
  assert.match(styles, /\.knowledge-page\.is-workbench \{[\s\S]*max-width: 100%/);
  assert.match(
    styles,
    /grid-template-columns: var\(--kw-side\) minmax\(0, 1fr\) var\(--kw-rail\)/,
  );
  assert.match(styles, /--kw-side: 264px/);
  assert.match(styles, /--kw-rail: 300px/);
  for (const breakpoint of ["1439px", "1199px", "1023px"]) {
    assert.match(styles, new RegExp(`@media \\(max-width: ${breakpoint}\\)`));
  }
  assert.match(styles, /\.kw-body\.is-rail-open \.kw-rail \{[\s\S]*position: absolute/);
  assert.match(styles, /\.kw-body\.is-catalog-open \.kw-catalog \{[\s\S]*position: absolute/);
});

test("every locale carries the workbench catalog", async () => {
  const localeRoot = new URL("../../../packages/i18n/src/locales/", import.meta.url);
  const locales = (await readdir(localeRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(locales.length, 9);
  for (const locale of locales) {
    const source = await read(`../../../packages/i18n/src/locales/${locale}/index.ts`);
    for (const pattern of [
      /^      tabs: \{/m,
      /^        ask:/m,
      /^      phase: \{/m,
      /^      kind: \{/m,
      /^        office:/m,
      /^      hero: \{/m,
      /^      rail: \{/m,
      /^      health: \{/m,
      /^        hintStale:/m,
      /^      info: \{/m,
      /^      related: \{/m,
      /^      activity: \{/m,
      /^      searchHint:/m,
    ]) {
      assert.match(source, pattern, `${locale} is missing ${pattern}`);
    }
  }
});
