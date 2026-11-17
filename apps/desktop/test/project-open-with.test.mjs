import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readMainModule, readMainSource } from "./helpers/source-contracts.mjs";
import { loadStyles } from "./helpers/styles.mjs";

const read = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), "utf8");

const [
  protocolSource,
  sharedTypesSource,
  openWithSource,
  apiSource,
  providerCatalogSource,
  mainSource,
  externalAppSource,
  workspaceIpcSource,
  topbarSource,
  launcherSource,
  iconsSource,
  enLocale,
  zhLocale,
  styles,
] = await Promise.all([
  read("../../../packages/shared/src/protocol.ts"),
  read("../../../packages/shared/src/types/settings.ts"),
  read("../../../packages/shared/src/open-with.ts"),
  read("../src/lib/api.ts"),
  readMainModule("runtime/provider-catalog.ts"),
  readMainSource(),
  readMainModule("external-apps.ts"),
  readMainModule("ipc/workspace-ipc.ts"),
  read("../src/components/ConversationTopbar.tsx"),
  read("../src/components/ProjectOpenWithButton.tsx"),
  read("../src/components/icons.tsx"),
  read("../../../packages/i18n/src/locales/en/index.ts"),
  read("../../../packages/i18n/src/locales/zh-CN/index.ts"),
  loadStyles(),
]);

/*
 * The contract: one closed list of programs shared by every layer, one channel
 * for the editors, and the file-manager row keeps the shipped openFolder path.
 * A renderer- or plugin-supplied executable or command string must never reach
 * the operating system.
 */
test("the open-with list is one shared allowlist with the explorer row kept separate", () => {
  assert.match(
    openWithSource,
    /export type OpenWithApp = "explorer" \| "vscode" \| "trae" \| "idea"/,
  );
  assert.match(
    openWithSource,
    /export const OPEN_WITH_APPS: readonly OpenWithApp\[\] = \[\s*"explorer",\s*"vscode",\s*"trae",\s*"idea",?\s*\]/s,
  );
  assert.match(
    openWithSource,
    /export type OpenWithEditorApp = Exclude<OpenWithApp, "explorer">/,
  );
  assert.match(
    openWithSource,
    /export function isOpenWithApp\(value: unknown\): value is OpenWithApp/,
  );
  assert.match(
    openWithSource,
    /export function isOpenWithEditorApp\(\s*value: unknown,?\s*\)\s*:\s*value is OpenWithEditorApp/,
  );
  // Both settings write paths validate against the shared list rather than
  // restating its members.
  assert.match(apiSource, /isOpenWithApp\(/);
  assert.match(providerCatalogSource, /isOpenWithApp\(/);
});

test("the remembered app is an optional settings field that defaults to the file manager", () => {
  assert.match(sharedTypesSource, /openWithLastApp\?: OpenWithApp;/);
  assert.match(
    sharedTypesSource,
    /import type \{ OpenWithApp \} from "\.\.\/open-with\.js"/,
  );
  // Absent means explorer, so an upgrade adds a control without changing what
  // a user already sees.
  assert.match(launcherSource, /settings\?\.openWithLastApp/);
  assert.match(launcherSource, /lastApp === "explorer"/);
});

test("the editor launch is its own whitelisted IPC channel with a structured result", () => {
  assert.match(
    protocolSource,
    /projectOpenWith:\s*"pi-desktop\/project\/openWith"/,
  );
  assert.match(
    apiSource,
    /openProjectWith:\s*\(app: OpenWithEditorApp, path: string\)[\s\S]*?IPC\.invoke\.projectOpenWith, \{ app, path \}/,
  );
  assert.match(
    openWithSource,
    /export type ProjectOpenWithResult =[\s\S]*?reason: "not_installed" \| "launch_failed"/,
  );
});

test("main resolves a known program from fixed roots and never uses a shell", () => {
  // The resolver is pure: every filesystem and environment read is injected, so
  // the whole candidate table is testable without an installed IDE.
  assert.match(
    externalAppSource,
    /export function resolveExternalApp\(\s*app: OpenWithEditorApp,\s*probe: ExternalAppProbe,?\s*\)/s,
  );
  assert.match(
    externalAppSource,
    /export type ExternalAppProbe = \{[\s\S]*?which:[\s\S]*?isFile:[\s\S]*?listDirectories:/,
  );
  // Windows: only a real executable. A .cmd or .bat needs a shell, and a shell
  // would put the project path inside a command line.
  assert.match(externalAppSource, /platform === "win32"/);
  assert.match(externalAppSource, /"code\.exe"/);
  assert.match(externalAppSource, /"trae\.exe"/);
  assert.match(externalAppSource, /"idea64\.exe"/);
  // Wrappers may appear as PATH lookup names, but never as a spawn target: the
  // launcher only ever spawns the resolver's verified executable, and on
  // Windows a PATH hit is accepted only when it is (or yields) a real .exe.
  assert.match(
    externalAppSource,
    /const executable = resolveExternalApp\(app, probe\);/,
  );
  assert.match(externalAppSource, /spawn\(executable,/);
  assert.match(externalAppSource, /endsWith\(".exe"\)/);
  assert.doesNotMatch(externalAppSource, /shell:\s*true/);
  assert.match(externalAppSource, /Microsoft VS Code\/Code\.exe/);
  assert.match(externalAppSource, /"JetBrains"/);
  assert.match(externalAppSource, /Visual Studio Code\.app/);
});

test("main launches detached, unrefs the child, and keeps the openFolder project gate", () => {
  assert.match(externalAppSource, /detached:\s*true/);
  assert.match(externalAppSource, /stdio:\s*"ignore"/);
  assert.match(externalAppSource, /\.unref\(\)/);
  assert.match(externalAppSource, /stripWinLongPrefix/);

  const start = mainSource.indexOf("IPC.invoke.projectOpenWith,");
  assert.ok(start >= 0, "project open-with handler should exist");
  const handler = mainSource.slice(start, start + 2600);
  // One gate for both channels: the target must be a registered project folder
  // the host knows, so neither channel can probe an arbitrary path.
  assert.match(handler, /await knownProjectPath\(/);
  assert.match(workspaceIpcSource, /async function knownProjectPath\(/);
  assert.match(workspaceIpcSource, /host\.call\("projects\.list"\)/);
  assert.match(
    workspaceIpcSource.slice(
      workspaceIpcSource.indexOf("async function knownProjectPath("),
    ),
    /resolve\(candidate\) === projectPath/,
  );
  assert.match(handler, /isOpenWithEditorApp\(app\)/);
  assert.match(handler, /openWithLauncher\.open\(app, projectPath\)/);
  assert.match(externalAppSource, /reason: "not_installed"/);
  assert.match(externalAppSource, /reason: "launch_failed"/);
});

test("the top bar seats the control in its action lane", () => {
  assert.match(topbarSource, /import \{ ProjectOpenWithButton \} from "\.\/ProjectOpenWithButton"/);
  assert.match(
    topbarSource,
    /className="ct-right"[\s\S]*?<ProjectOpenWithButton[\s\S]*?className="ct-actions"/,
  );
  assert.match(topbarSource, /projectPath=\{openWithProjectPath\}/);
  const seat = topbarSource.slice(
    topbarSource.indexOf("const openWithProjectPath"),
  );
  assert.ok(
    topbarSource.includes("const openWithProjectPath"),
    "the control's folder is chosen by its own rule",
  );
  // A remote transcript's folder is on the host and a temporary task has none,
  // so neither may fall back to whatever workspace the sidebar shows.
  assert.match(seat, /remoteSession\s*\n\s*\? null/);
  assert.match(seat, /activeSession\.projectPath \?\? null/);
  assert.match(seat, /workspace\?\.path \?\? null/);
});

test("the launcher is two real buttons and a portaled menu", () => {
  assert.match(launcherSource, /className="ct-open-with"/);
  assert.match(launcherSource, /className="ct-open-with-main"/);
  assert.match(launcherSource, /className="ct-open-with-caret"/);
  assert.match(launcherSource, /aria-haspopup="menu"/);
  assert.match(launcherSource, /aria-expanded=\{open\}/);
  assert.match(launcherSource, /<AnchoredMenu/);
  assert.match(launcherSource, /role="menu"/);
  assert.match(launcherSource, /menuClassName="project-open-with-menu"/);
  assert.match(launcherSource, /from "\.\/settings\/AnchoredMenu"/);
  // The remembered app is what the main half will use, so the menu marks it.
  assert.match(launcherSource, /aria-current=\{selected \? "true" : undefined\}/);
  assert.match(launcherSource, /className="project-open-with-check"/);
});

test("the launcher writes the remembered app and routes each row to its own channel", () => {
  assert.match(launcherSource, /useAppStore\.getState\(\)\.settings/);
  assert.match(launcherSource, /openWithLastApp: app/);
  assert.match(launcherSource, /api\.setSettings\(payload\)/);
  assert.match(launcherSource, /useAppStore\.setState\(\{ settings: payload \}\)/);
  assert.match(
    launcherSource,
    /app === "explorer"[\s\S]{0,220}api\.openProjectFolder\(projectPath\)/,
  );
  assert.match(launcherSource, /api\.openProjectWith\(app, projectPath\)/);
  // A remote transcript has no folder on this computer and a temporary task has
  // no folder at all: the control is absent rather than dead chrome.
  assert.match(launcherSource, /if \(!projectPath\) return null/);
});

test("a missing or unstartable program is reported in the user's language", () => {
  assert.match(launcherSource, /reason === "not_installed"/);
  assert.match(launcherSource, /t\("project\.openAppNotInstalled", \{ app \}/);
  assert.match(launcherSource, /t\("project\.openAppLaunchFailed", \{ app \}/);
  assert.match(launcherSource, /showToast\([\s\S]{0,200}variant: "error"/);
});

test("the open-with copy exists in English and Chinese", () => {
  const keys = [
    "openWith",
    "openWithMenu",
    "openWithApp",
    "openWithDefault",
    "openAppNotInstalled",
    "openAppLaunchFailed",
  ];
  for (const source of [enLocale, zhLocale]) {
    for (const key of keys) {
      assert.match(source, new RegExp(`\\n\\s*${key}: `), `missing project.${key}`);
    }
  }
  assert.match(enLocale, /openAppNotInstalled: "[^"]*\{\{app\}\}[^"]*"/);
  assert.match(zhLocale, /openAppNotInstalled: "[^"]*\{\{app\}\}[^"]*"/);
});

test("brand marks are the vendor's shipped raster icons at the menu's row size", () => {
  for (const name of ["explorer", "vscode", "trae", "idea"]) {
    const file = new URL(`../src/assets/open-with/${name}.png`, import.meta.url);
    assert.ok(statSync(file).size > 0, `missing asset ${name}.png`);
    assert.match(
      launcherSource,
      new RegExp(`from "../assets/open-with/${name}\\.png"`),
    );
  }
  // Every row renders the same 14px raster seat, not a theme-tinted glyph.
  assert.match(
    launcherSource,
    /const OPEN_WITH_ICONS: Record<OpenWithApp, string>/,
  );
  assert.match(
    launcherSource,
    /<img[\s\S]{0,200}width=\{14\}[\s\S]{0,80}height=\{14\}/,
  );
  assert.match(launcherSource, /alt=""/);
  assert.match(launcherSource, /aria-hidden="true"/);
  // The hand-drawn approximations are gone; the real mark keeps its own colors.
  for (const name of ["IconExplorer", "IconTrae", "IconIntelliJ"]) {
    assert.doesNotMatch(iconsSource, new RegExp(`export function ${name}\\(`));
  }
  assert.match(
    styles,
    /\.project-open-with-icon \{[^}]*object-fit:\s*contain;/s,
  );
});

test("the split button matches the top bar's action lane geometry", () => {
  assert.match(
    styles,
    /\.conversation-topbar \.ct-open-with \{[^}]*-webkit-app-region:\s*no-drag;/s,
  );
  assert.match(
    styles,
    /\.conversation-topbar \.ct-open-with \{[^}]*background:\s*var\(--ds-tile\);/s,
  );
  assert.match(
    styles,
    /\.conversation-topbar \.ct-open-with-main,[\s\S]{0,120}\.conversation-topbar \.ct-open-with-caret \{[^}]*height:\s*var\(--ds-work-panel-toggle-size\);/s,
  );
  assert.match(styles, /\.project-open-with-menu \{[^}]*position:\s*fixed;/s);
});
