import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("sidebar, lazy routes, and page state expose Knowledge and Agent apps", async () => {
  const [sidebar, shell, state] = await Promise.all([
    read("../src/components/Sidebar.tsx"),
    read("../src/features/app/AppShell.tsx"),
    read("../src/stores/app-state.ts"),
  ]);
  assert.match(sidebar, /data-nav="knowledge"/);
  assert.match(sidebar, /page === "knowledge"[\s\S]*setPage\("knowledge"\)/);
  assert.match(sidebar, /data-nav="apps"/);
  assert.match(sidebar, /page === "apps"[\s\S]*setPage\("apps"\)/);
  assert.match(shell, /import\("\.\.\/\.\.\/pages\/KnowledgePage"\)/);
  assert.match(shell, /import\("\.\.\/\.\.\/pages\/AgentAppsPage"\)/);
  assert.match(shell, /page === "knowledge"[\s\S]*<KnowledgePage \/>/);
  assert.match(shell, /page === "apps"[\s\S]*<AgentAppsPage \/>/);
  assert.match(state, /"assets" \| "knowledge" \| "apps" \| "settings"/);
});

test("pages call the renderer API instead of IPC channels or SQLite", async () => {
  const [knowledge, hub, detail, apps] = await Promise.all([
    read("../src/pages/KnowledgePage.tsx"),
    read("../src/pages/knowledge/KnowledgeHub.tsx"),
    read("../src/pages/knowledge/KnowledgeLibraryDetail.tsx"),
    read("../src/pages/AgentAppsPage.tsx"),
  ]);
  assert.match(knowledge, /api\.knowledgeListLibraries\(\)/);
  assert.match(knowledge, /api\.knowledgeListActivities\(\{ limit: 6 \}\)/);
  assert.match(knowledge, /api\.knowledgeActivityTrend\(\{ days: 7 \}\)/);
  assert.match(knowledge, /api\.knowledgeImportFiles\(libraryId\)/);
  assert.match(knowledge, /api\.knowledgeImportText\(\{ libraryId: selectedId, title, text \}\)/);
  assert.match(knowledge, /api\.knowledgeIndexLibrary\(library\.id\)/);
  assert.match(knowledge, /api\.knowledgeDeleteDocument\(document\.id\)/);
  assert.match(detail, /api\.knowledgeSearch\(\{/);
  // The hub is a pure view: it receives data and callbacks, never IPC or SQL.
  assert.doesNotMatch(hub, /api\./);
  assert.match(apps, /api\.agentAppsList\(\)/);
  assert.match(apps, /api\.agentAppsCreate\(input\)/);
  assert.match(apps, /api\.agentAppsPickFolder\(\)/);
  assert.match(apps, /openWorkPanelTab\(browserPluginTab\(app\.openUrl\)\)/);
  assert.match(apps, /api\.agentAppsMarkOpened\(app\.id\)/);
  for (const source of [knowledge, hub, detail, apps]) {
    assert.doesNotMatch(source, /window\.api|pi-desktop\/|sqlite/i);
  }
});

test("main-process IPC registers both domains and derives channels from shared protocol", async () => {
  const [register, protocol, knowledgeIpc, appsIpc] = await Promise.all([
    read("../electron/main/ipc/register.ts"),
    read("../../../packages/shared/src/protocol.ts"),
    read("../electron/main/ipc/knowledge-ipc.ts"),
    read("../electron/main/ipc/agent-apps-ipc.ts"),
  ]);
  assert.match(register, /registerKnowledgeIpc\(/);
  assert.match(register, /registerAgentAppsIpc\(/);
  assert.match(knowledgeIpc, /dialog\.showOpenDialog/);
  assert.match(knowledgeIpc, /\.call\("knowledge\.listLibraries"/);
  assert.match(appsIpc, /dialog\.showOpenDialog/);
  assert.match(appsIpc, /\.call\("apps\.list"/);
  for (const channel of [
    "knowledgeListLibraries",
    "knowledgeImportFiles",
    "knowledgeSearch",
    "knowledgeIndexLibrary",
    "knowledgeListActivities",
    "knowledgeActivityTrend",
    "agentAppsList",
    "agentAppsPickFolder",
  ]) {
    assert.match(protocol, new RegExp(`${channel}: "pi-desktop/`));
  }
});

test("knowledge schema keeps CJK substring search and agent apps stay a registry", async () => {
  const [knowledgeSchema, appSchema, migration, current, search] = await Promise.all([
    read("../../../crates/host-core/src/knowledge/schema.sql"),
    read("../../../crates/host-core/src/agent_apps/schema.sql"),
    read("../../../crates/host-core/src/db/knowledge_apps_migration.rs"),
    read("../../../crates/host-core/src/db/knowledge_activity_migration.rs"),
    read("../../../crates/host-core/src/knowledge/mod.rs"),
  ]);
  assert.match(knowledgeSchema, /tokenize = 'trigram'/);
  assert.match(knowledgeSchema, /CREATE TRIGGER IF NOT EXISTS knowledge_chunks_ai/);
  assert.match(knowledgeSchema, /CREATE TABLE IF NOT EXISTS knowledge_activity/);
  assert.match(appSchema, /CREATE TABLE IF NOT EXISTS agent_apps/);
  assert.doesNotMatch(appSchema, /http_get|reqwest|proxy/i);
  assert.match(migration, /migrate_v27_to_v28_tx/);
  assert.match(migration, /crate::knowledge::SCHEMA/);
  assert.match(current, /fn migrate_v28_to_v29_tx/);
  assert.match(current, /crate::knowledge::SCHEMA/);
  assert.match(search, /pub async fn search_for_tool/);
});

test("every locale carries the knowledge and agent application catalogs", async () => {
  const localeRoot = new URL("../../../packages/i18n/src/locales/", import.meta.url);
  const locales = await readdir(localeRoot, { withFileTypes: true });
  const english = await read("../../../packages/i18n/src/locales/en/index.ts");
  const knowledgeBlock = english.split("  knowledge: {")[1].split("  agentApps: {")[0];
  const appBlock = english.split("  agentApps: {")[1].split("} as const;")[0];
  const keysOf = (block) =>
    [...block.matchAll(/^    ([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]);
  const knowledgeKeys = keysOf(knowledgeBlock);
  const appKeys = keysOf(appBlock);
  assert.ok(knowledgeKeys.length >= 45);
  assert.ok(appKeys.length >= 25);
  for (const locale of locales.filter((entry) => entry.isDirectory())) {
    const source = await read(`../../../packages/i18n/src/locales/${locale.name}/index.ts`);
    const localizedKnowledge = source.split(/  ["']?knowledge["']?: \{/)[1]?.split(/  ["']?agentApps["']?: \{/)[0];
    const localizedApps = source.split(/  ["']?agentApps["']?: \{/)[1]?.split(/} (?:as const|satisfies EnglishCatalog);/)[0];
    assert.ok(localizedKnowledge, `${locale.name} is missing knowledge`);
    assert.ok(localizedApps, `${locale.name} is missing agentApps`);
    for (const key of knowledgeKeys) {
      assert.match(
        localizedKnowledge,
        new RegExp(`^    ["']?${key}["']?:`, "m"),
        `${locale.name}.knowledge.${key}`,
      );
    }
    for (const key of appKeys) {
      assert.match(
        localizedApps,
        new RegExp(`^    ["']?${key}["']?:`, "m"),
        `${locale.name}.agentApps.${key}`,
      );
    }
  }
});

test("document rows open a reader backed by knowledge.getDocument", async () => {
  const [detail, reader, api, ipc, protocol, sharedTypes] = await Promise.all([
    read("../src/pages/knowledge/KnowledgeLibraryDetail.tsx"),
    read("../src/pages/knowledge/KnowledgeDocumentReader.tsx"),
    read("../src/lib/api.ts"),
    read("../electron/main/ipc/knowledge-ipc.ts"),
    read("../../../packages/shared/src/protocol.ts"),
    read("../../../packages/shared/src/types/knowledge.ts"),
  ]);
  assert.match(protocol, /knowledgeGetDocument: "pi-desktop\/knowledge\/getDocument"/);
  assert.match(ipc, /IPC\.invoke\.knowledgeGetDocument/);
  assert.match(api, /knowledgeGetDocument: \(input: \{ libraryId: string; documentId: string \}\)/);
  assert.match(sharedTypes, /export type KnowledgeDocumentPreview/);
  assert.match(detail, /className="knowledge-document-open"/);
  assert.match(detail, /setOpenDocument\(document\)/);
  assert.match(detail, /<KnowledgeDocumentReader/);
  assert.match(reader, /knowledgeGetDocument\(\{ libraryId: library\.id, documentId: document\.id \}\)/);
  assert.match(reader, /<Markdown source=\{body\}/);
  assert.doesNotMatch(reader, /window\.api|pi-desktop\/|sqlite/i);
});

test("titlebar carries browser-style back and forward over the nav stack", async () => {
  const [chrome, shell, topbar, state] = await Promise.all([
    read("../src/features/app/chrome.tsx"),
    read("../src/features/app/AppShell.tsx"),
    read("../src/components/ConversationTopbar.tsx"),
    read("../src/stores/app-state.ts"),
  ]);
  assert.match(chrome, /data-nav="nav-back"/);
  assert.match(chrome, /data-nav="nav-forward"/);
  assert.match(chrome, /state\.navBack/);
  assert.match(chrome, /state\.navForward/);
  assert.match(chrome, /state\.navStack\.length/);
  assert.match(shell, /<HistoryTitlebarActions \/>/);
  assert.match(topbar, /<HistoryTitlebarActions buttonClassName="ct-icon-btn" \/>/);
  assert.match(state, /navBack: \(\) => void/);
  assert.match(state, /navForward: \(\) => void/);
});

test("knowledge styling uses semantic tokens", async () => {
  const styles = await read("../src/styles/knowledge-apps.css");
  assert.match(styles, /var\(--ds-tile-deep\)/);
  assert.match(styles, /var\(--leading-relaxed\)/);
  assert.doesNotMatch(styles, /line-height: 1\.5/);
});
