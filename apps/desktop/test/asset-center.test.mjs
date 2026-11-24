import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { register } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));
const {
  assetCenterCounts,
  createAssetBackup,
  EMPTY_ASSET_CENTER_SUMMARY,
} = await import("../src/features/assets/asset-center-model.ts");
const {
  createProjectMemoryEntry,
  filterProjectMemoryEntries,
  normalizeProjectMemoryEntries,
  projectMemoryEntries,
} = await import("../src/lib/project-memory.ts");
const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

const ownedSkill = {
  id: "reviewer",
  name: "Reviewer",
  description: "Reviews changes",
  path: "C:/assets/reviewer",
  skillMdPath: "C:/assets/reviewer/SKILL.md",
  enabled: true,
  scope: "personal",
  level: "global",
  refPath: "C:/assets/reviewer",
};
const ownedSubagent = {
  id: "researcher",
  name: "Researcher",
  description: "Researches a topic",
  path: "C:/agents/researcher",
  definitionPath: "C:/agents/researcher/AGENT.md",
  tools: [],
  fallbackModels: [],
  model: null,
  thinkingLevel: null,
  maxTokens: null,
  enabled: true,
  scope: "personal",
  builtin: false,
  builtinId: null,
};
const summary = {
  memory: {
    content: "",
    entries: [{ id: "fact", title: " Preference ", content: " Use pnpm " }],
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  skills: {
    builtins: [{ ...ownedSkill, id: "builtin-skill", level: "builtin", scope: "system" }],
    global: [ownedSkill],
    project: [],
  },
  subagents: {
    owned: [ownedSubagent],
    builtins: [{ ...ownedSubagent, id: "builtin-agent", builtin: true }],
  },
};

test("memory entries normalize, migrate legacy content, and search consistently", () => {
  assert.deepEqual(projectMemoryEntries({ content: "  durable fact  " }), [
    { id: "legacy-project-memory", title: "", content: "durable fact" },
  ]);
  assert.deepEqual(normalizeProjectMemoryEntries([
    { id: " one ", title: " Title ", content: " Body " },
    { id: "empty", title: "Drop", content: "   " },
  ]), [{ id: "one", title: "Title", content: "Body" }]);
  const entries = [{ id: "one", title: "Package manager", content: "Use pnpm" }];
  assert.equal(filterProjectMemoryEntries(entries, "PNPM").length, 1);
  assert.equal(filterProjectMemoryEntries(entries, "npm").length, 1);
  assert.equal(filterProjectMemoryEntries(entries, "missing").length, 0);
  assert.notEqual(createProjectMemoryEntry().id, createProjectMemoryEntry().id);
});

test("overview counts include builtins without treating them as owned assets", () => {
  const counts = assetCenterCounts(summary);
  assert.equal(counts.memories, 1);
  assert.equal(counts.skills, 2);
  assert.equal(counts.ownedSkills, 1);
  assert.equal(counts.subagents, 2);
  assert.equal(counts.ownedSubagents, 1);
  assert.deepEqual(assetCenterCounts(EMPTY_ASSET_CENTER_SUMMARY), {
    memories: 0,
    skills: 0,
    enabledSkills: 0,
    ownedSkills: 0,
    subagents: 0,
    enabledSubagents: 0,
    ownedSubagents: 0,
  });
});

test("backup is versioned and contains only user-owned documents", () => {
  const backup = createAssetBackup({
    projectName: "Trail",
    projectPath: "C:/work/Trail",
    summary,
    skills: [{ level: "global", skill: ownedSkill, body: "# Reviewer\nRead the diff." }],
    subagents: [{ subagent: ownedSubagent, body: "# Researcher\nCite sources." }],
    exportedAt: "2026-01-02T03:04:05.000Z",
  });
  assert.equal(backup.format, "trail.asset-center");
  assert.equal(backup.version, 1);
  assert.equal(backup.memory[0].id, "fact");
  assert.equal(backup.skills[0].body, "# Reviewer\nRead the diff.");
  assert.equal(backup.subagents[0].body, "# Researcher\nCite sources.");
  const serialized = JSON.stringify(backup);
  assert.doesNotMatch(serialized, /builtin-skill|builtin-agent|skillMdPath|definitionPath/);
});

test("sidebar, destination history, and lazy route expose Asset Center", async () => {
  const [sidebar, shell, state, page] = await Promise.all([
    read("../src/components/Sidebar.tsx"),
    read("../src/features/app/AppShell.tsx"),
    read("../src/stores/app-state.ts"),
    read("../src/pages/AssetCenterPage.tsx"),
  ]);
  assert.match(sidebar, /data-nav="assets"/);
  assert.match(sidebar, /page === "assets"[\s\S]*setPage\("assets"\)/);
  assert.match(shell, /page === "assets"[\s\S]*<AssetCenterPage \/>/);
  assert.match(shell, /import\("\.\.\/\.\.\/pages\/AssetCenterPage"\)/);
  assert.match(state, /"plugins" \| "assets" \| "knowledge" \| "apps" \| "settings"/);
  assert.match(page, /<ProjectMemoryEditor/);
  assert.match(page, /<AgentSkillsPage \/>/);
  assert.match(page, /<AgentSubagentsPage \/>/);
  assert.match(page, /disabled=\{memoryDirty\}/);
  assert.match(page, /visited\.has\("memory"\)/);
});

test("summary and backup reuse authoritative capability and memory APIs", async () => {
  const [source, projects] = await Promise.all([
    read("../src/features/assets/useAssetCenterSummary.ts"),
    read("../src/components/settings/AgentCapabilityLayout.tsx"),
  ]);
  assert.match(source, /api\.getProjectMemory\(projectPath\)/);
  assert.match(source, /api\.getProjectGroupMemory\(groupId\)/);
  assert.match(source, /api\.listBuiltinSkills\(\)/);
  assert.match(source, /api\.listUserSkills\(\{ level: "global" \}\)/);
  assert.match(source, /fetchSubagentPageData\(\)/);
  assert.match(source, /const summary = await fetchSummary\(\)/);
  assert.match(source, /api\.readUserSkill\(skill\.id/);
  assert.match(source, /api\.readUserSubagent\(subagent\.id\)/);
  assert.doesNotMatch(source, /localStorage|indexedDB/);
  assert.match(projects, /api\.listProjectGroups\(\)/);
  assert.match(projects, /groupId: group\.id, legacy: group\.legacy/);
});

test("all locales provide the complete Asset Center catalog", async () => {
  const localeRoot = new URL("../../../packages/i18n/src/locales/", import.meta.url);
  const locales = await readdir(localeRoot, { withFileTypes: true });
  const english = await read("../../../packages/i18n/src/locales/en/index.ts");
  const englishBlock = english.split("  assets: {")[1].split("  app: {")[0];
  const keys = [...englishBlock.matchAll(/^    ([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]);
  assert.ok(keys.length >= 35);
  for (const locale of locales.filter((entry) => entry.isDirectory())) {
    const source = await read(`../../../packages/i18n/src/locales/${locale.name}/index.ts`);
    const block = source.split(/  ["']?assets["']?: \{/)[1]?.split(/  ["']?app["']?: \{/)[0];
    assert.ok(block, `${locale.name} is missing assets`);
    for (const key of keys) {
      assert.match(block, new RegExp(`^    ["']?${key}["']?:`, "m"), `${locale.name}.${key}`);
    }
  }
});

test("asset styling uses semantic tokens and reduced motion", async () => {
  const styles = await read("../src/styles/asset-center.css");
  assert.match(styles, /var\(--ds-tile\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /#[0-9a-fA-F]{3,8}\b/);
});
