import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [
  sidebarSource,
  projectsSource,
  dialogSource,
  apiSource,
  protocolSource,
  hostSource,
  ipcSource,
  enSource,
  zhSource,
  trSource,
] =
  await Promise.all([
    read("../src/components/Sidebar.tsx"),
    read("../src/pages/ProjectsPage.tsx"),
    read("../src/components/ProjectEditDialog.tsx"),
    read("../src/lib/api.ts"),
    read("../../../packages/shared/src/protocol.ts"),
    read("../../../crates/host-core/src/rpc/mod.rs"),
    read("../electron/main/ipc/workspace-ipc.ts"),
    read("../../../packages/i18n/src/locales/en/index.ts"),
    read("../../../packages/i18n/src/locales/zh-CN/index.ts"),
    read("../../../packages/i18n/src/locales/tr/index.ts"),
  ]);

test("project rows expose an edit action in both project surfaces", () => {
  assert.match(sidebarSource, /id: "edit-project"/);
  assert.match(sidebarSource, /setEditProjectFor\(entry\)/);
  assert.match(sidebarSource, /ProjectEditDialog/);
  assert.match(projectsSource, /data-action="edit-project"/);
  assert.match(projectsSource, /setEditProjectFor\(\{\s*path: project\.path/);
  assert.match(projectsSource, /roots: project\.roots/);
  assert.match(projectsSource, /ProjectEditDialog/);
});

test("project edit dialog updates names and adjusts folder roots", () => {
  assert.match(dialogSource, /export function ProjectEditDialog/);
  assert.match(dialogSource, /listProjectGroups\(\)/);
  assert.match(
    dialogSource,
    /api\.updateProjectGroup\(\s*group\.id,\s*trimmedName,\s*folders,\s*primaryPath,\s*\{ workspaceIndex, \.\.\.appearance \},/,
  );
  assert.match(dialogSource, /api\.pickProjectFolders\(\)/);
  assert.match(dialogSource, /setFolders\(\(current\) =>[\s\S]*?current\.filter/);
  assert.match(dialogSource, /busy \|\| primary/);
  assert.match(dialogSource, /project\.editPrimaryLocked/);
  assert.match(dialogSource, /aria-modal="true"/);
  assert.match(dialogSource, /useBlockingOverlay\(\)/);
  assert.match(dialogSource, /event\.key === "Escape"/);
});

test("project edit dialog promotes another folder to primary", () => {
  // Promotion is one state change: the rows derive their order from it, and the
  // dialog sends it as the group's primary root on save.
  assert.match(dialogSource, /const promoteFolder = \(path: string\) => \{/);
  assert.match(dialogSource, /setPrimaryPath\(path\)/);
  assert.match(
    dialogSource,
    /const orderedFolders = \[[\s\S]*?folders\.filter\(\(path\) => !samePath\(path, primaryPath\)\)/,
  );
  assert.match(dialogSource, /\{orderedFolders\.map\(\(path\) => \{/);
  assert.match(dialogSource, /project\.editSetPrimary/);
  assert.match(dialogSource, /className="project-create-folder-primary"/);
  // A remote project keeps its host-owned binding and never promotes.
  assert.match(dialogSource, /\{primary \|\| group\?\.remote \? null : \(/);
});

test("project group update is available through the host RPC and preload API", () => {
  assert.match(protocolSource, /projectGroupUpdate:\s*"pi-desktop\/project-group\/update"/);
  assert.match(
    apiSource,
    /updateProjectGroup: \([\s\S]*?groupId: string,[\s\S]*?name: string,[\s\S]*?folders: string\[\],[\s\S]*?primary\?: string,/,
  );
  assert.match(apiSource, /\.\.\.\(primary \? \{ primary \} : \{\}\)/);
  assert.match(hostSource, /"project\.group\.update"/);
  assert.match(hostSource, /update_project_group\(group_id, name, &folders, primary\)/);
  assert.match(hostSource, /params\.get\("primary"\)/);
  assert.match(ipcSource, /primary\?: unknown;/);
  assert.match(ipcSource, /\.\.\.\(safePrimary \? \{ primary: safePrimary \} : \{\}\)/);
});

test("project group update carries the icon and colour pair", () => {
  // Both keys are optional on the wire: an omitted pair must not clear what
  // the host already stored, so the preload only forwards what the dialog set.
  for (const handler of ["projectGroupCreate", "projectGroupUpdate"]) {
    const start = ipcSource.indexOf(`IPC.invoke.${handler},`);
    const body = ipcSource.slice(start, start + 2600);
    assert.match(body, /icon\?: unknown;/);
    assert.match(body, /color\?: unknown;/);
    assert.match(body, /appearanceParams\(input\)/);
    assert.match(body, /\.\.\.\(appearance \? appearance : \{\}\)/);
  }
  assert.match(
    ipcSource,
    /if \(!\("icon" in input\) && !\("color" in input\)\) return undefined;/,
  );
  assert.match(hostSource, /"project\.group\.update"/);
  assert.match(hostSource, /appearance_param\(&params\)\?/);
  assert.match(hostSource, /apply_appearance\(&st\.db, group, appearance\)/);
  // A remote binding has no local glyph, so its rename path stays untouched.
  const remoteBranch = dialogSource.slice(
    dialogSource.indexOf("const result = group.remote"),
    dialogSource.indexOf("api.updateProjectGroup"),
  );
  assert.match(remoteBranch, /api\.renameProjectGroup\(group\.id, trimmedName\)/);
  assert.doesNotMatch(remoteBranch, /appearance|choices/);
});

test("only project group creation pre-checks folder existence here", () => {
  // #1869: an update must reach the host even when a stored root is missing
  // on disk (externally renamed/unmounted); the host validates new roots and
  // exempts roots the group already owns. Creation still pre-checks because
  // every submitted folder is new there.
  const updateHandler = ipcSource.slice(
    ipcSource.indexOf("IPC.invoke.projectGroupUpdate,"),
    ipcSource.indexOf("IPC.invoke.projectGroupRename,"),
  );
  const createHandler = ipcSource.slice(
    ipcSource.indexOf("IPC.invoke.projectGroupCreate,"),
    ipcSource.indexOf("IPC.invoke.projectGroupUpdate,"),
  );
  assert.doesNotMatch(updateHandler, /must be directories/);
  assert.match(createHandler, /project group folders must be directories/);
});

test("the edit dialog survives a language switch while it is open", () => {
  // `t` in the loader's deps re-ran the fetch on every language change and
  // overwrote name, folders, primary path, index toggle and appearance with
  // what the host had — silently discarding unsaved edits.
  assert.match(dialogSource, /const loadFailed = useEffectEvent\(/);
  assert.match(dialogSource, /throw loadFailed\(\);/);
  assert.doesNotMatch(
    dialogSource,
    /\[project\.groupId, project\.path, t\]/,
    "the loader must not restart when the language changes",
  );
});

for (const [locale, source] of [["en", enSource], ["zh-CN", zhSource], ["tr", trSource]]) {
  test(`project edit labels are present in ${locale}`, () => {
    for (const key of [
      "edit",
      "editTitle",
      "editDescription",
      "editAction",
      "editSaving",
      "editCancel",
      "editPrimaryLocked",
      "editSetPrimary",
      // The edit dialog reuses the create dialog's indexing copy.
      "createWorkspaceIndexLabel",
      "createWorkspaceIndexHint",
      // Icon and colour rows share one nested copy block per locale.
      "appearance",
    ]) {
      assert.match(source, new RegExp(`(?:\\b${key}|"${key}"):`));
    }
  });
}
