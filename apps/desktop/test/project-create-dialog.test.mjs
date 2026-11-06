import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readMainSource } from "./helpers/main-source.mjs";
import { readStoreSource } from "./helpers/store-source.mjs";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

const [dialogSource, editDialog, store, api, protocol, main, styles, appearanceSource] = await Promise.all([
  read("../src/components/ProjectCreateDialog.tsx"),
  read("../src/components/ProjectEditDialog.tsx"),
  readStoreSource(),
  read("../src/lib/api.ts"),
  read("../../../packages/shared/src/protocol.ts"),
  readMainSource(),
  read("../src/styles/project-create-dialog.css"),
  read("../src/components/ProjectAppearance.tsx"),
]);

const dialog = dialogSource + await read("../src/components/ProjectFolderPicker.tsx");

test("create project dialog supports named multi-folder setup", () => {
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /useBlockingOverlay\(\)/);
  assert.doesNotMatch(dialog, /project\.createNamePlaceholder/);
  assert.match(dialog, /api\.pickProjectFolders\(\)/);
  assert.match(dialog, /result\.folders/);
  assert.match(dialog, /project\.createRemoveFolder/);
  assert.match(dialog, /project\.createPrimary/);
  assert.match(dialog, /data-project-source="local"/);
  assert.doesNotMatch(dialog, /project\.createMemoryHint/);
  assert.doesNotMatch(dialog, /project\.createAddFolderHint/);
  assert.doesNotMatch(dialog, /aria-describedby="project-create-memory-hint"/);
  assert.match(dialog, /project-create-dialog-content/);
  assert.match(dialog, /project-create-dialog-section/);
  assert.match(dialog, /project-create-dialog-field-label/);
  // The name field is optional: the dialog derives a default from the source.
  assert.match(dialog, /defaultProjectName\(\{/);
  assert.match(dialog, /resolveProjectName\(name, defaultName\)/);
  assert.match(dialog, /setName\(defaultName\)/);
  assert.match(dialog, /: !projectName \|\| folders\.length === 0 \|\| busy/);
  assert.match(dialog, /querySelectorAll<HTMLElement>\(/);
});

test("create project dialog can create the project from a git checkout", () => {
  // Same dialog, same name field: the source toggle turns the folder list into
  // one repository URL plus its clone destination.
  assert.match(dialog, /type ProjectSource = "local" \| "git" \| "remote"/);
  assert.match(dialog, /data-project-source="git"/);
  assert.match(dialog, /parseGitCloneUrl/);
  assert.match(dialog, /project\.createSourceLabel/);
  assert.match(dialog, /project\.createRepositoryLabel/);
  assert.match(dialog, /project\.createChooseLocation/);
  assert.match(dialog, /project\.cloneDestHint/);
  assert.match(dialog, /api\.pickProjectFolders\(\)/);
  assert.match(dialog, /createProjectFromGit\(\{/);
  assert.match(dialog, /url: cloneTarget\.url/);
  assert.match(dialog, /parentPath: cloneParent/);
  assert.match(dialog, /!projectName \|\| !cloneTarget \|\| !cloneParent \|\| busy/);
  assert.match(dialog, /project\.cloning/);
  assert.match(
    store,
    /createProjectFromGit: async \(\{ name, url, parentPath, choices \}\)/,
  );
  assert.match(store, /api\.cloneProjectInto\(url, parentPath\)/);
  assert.match(store, /folders: \[checkout\.path\],\s*primaryPath: checkout\.path,\s*choices,/);
  assert.match(api, /cloneProjectInto: \(url: string, parentPath: string\)/);
  assert.match(protocol, /projectCloneCheckout:\s*"pi-desktop\/project\/cloneCheckout"/);
});

test("project creation creates one logical group with a primary workspace", () => {
  assert.match(store, /createProjectDialogOpen: boolean/);
  assert.match(
    store,
    /openProject: async \(options\) => \{\s*set\(\{\s*createProjectDialogOpen: true,\s*createProjectDialogRemoteHostKey: options\?\.remoteHostKey\s*\}\)/,
  );
  assert.match(
    store,
    /createProjectFromFolders: async \(\{ name, folders, primaryPath, choices \}\)/,
  );
  assert.match(store, /const orderedFolders = \[/);
  assert.match(store, /api\.createProjectGroup\(normalizedName, orderedFolders, choices\)/);
  assert.match(store, /const \{ groups \} = await api\.listProjectGroups\(\)/);
  assert.match(store, /group\.roots\.some\(\(root\) => normalizeProjectPath\(root\.path\) === selectedPath\)/);
  assert.match(store, /const existingPrimary = existing\.primaryPath \|\| orderedFolders\[0\]/);
  assert.match(store, /get\(\)\.activateProject\(existingPrimary/);
  assert.match(store, /created\.group\.primaryPath/);
  assert.doesNotMatch(store, /for \(const path of orderedFolders\)/);
  assert.match(store, /get\(\)\.renameProject\(groupPrimary, normalizedName\)/);
  assert.match(
    store,
    /set\(\{\s*createProjectDialogOpen: false,\s*createProjectDialogRemoteHostKey: undefined,\s*onboarding,\s*page: "chat"\s*\}\)/,
  );
  // Folder picks and git checkouts share one project creation semantic.
  assert.match(store, /async function createNamedProjectGroup\(/);
  assert.match(
    store,
    /createProjectFromFolders: async \(\{ name, folders, primaryPath, choices \}\) =>\s*createNamedProjectGroup\(/,
  );
});

test("folder picker is a renderer-only multi-directory selection", () => {
  assert.match(protocol, /projectPickFolders:\s*"pi-desktop\/project\/pickFolders"/);
  assert.match(protocol, /projectGroupCreate:\s*"pi-desktop\/project-group\/create"/);
  assert.match(
    api,
    /createProjectGroup: \(\s*name: string,\s*folders: string\[\],\s*choices: ProjectGroupChoices = \{\},?\s*\)/,
  );
  assert.match(main, /project\.group\.create/);
  assert.match(api, /pickProjectFolders: \(\) =>[\s\S]*?projectPickFolders/);
  const start = main.indexOf("IPC.invoke.projectPickFolders");
  const end = main.indexOf("IPC.invoke.projectClone", start);
  const handler = main.slice(start, end);
  assert.ok(start >= 0 && end > start, "folder picker handler should exist");
  assert.match(handler, /openDirectory/);
  assert.match(handler, /multiSelections/);
  assert.match(handler, /createDirectory/);
  assert.match(handler, /folders:/);
  assert.doesNotMatch(handler, /workspace\.set/);
});

test("project folder pickers ignore repeated requests while a dialog is open", () => {
  for (const source of [dialog, editDialog]) {
    assert.match(source, /const folderPickerInFlightRef = useRef\(false\)/);
    assert.match(
      source,
      /if \(busyRef\.current \|\| folderPickerInFlightRef\.current\) return;/,
    );
    assert.match(
      source,
      /folderPickerInFlightRef\.current = true;\s*setFolderPickerBusy\(true\);[\s\S]*?api\.pickProjectFolders\(\)/,
    );
    assert.match(
      source,
      /folderPickerInFlightRef\.current = false;\s*setFolderPickerBusy\(false\);/,
    );
  }
  assert.match(main, /let projectPickerActive = false/);
  assert.match(main, /const openProjectPicker = async/);
  assert.match(main, /if \(!result \|\| result\.canceled/);
  assert.match(main, /const owner = getMainWindow\(\)/);
});

test("both project dialogs offer the workspace index switch", () => {
  for (const source of [dialog, editDialog]) {
    // The shared boolean primitive rather than a hand-rolled switch, and on by
    // default because indexing is the behaviour every existing project already
    // had.
    assert.match(source, /const \[workspaceIndex, setWorkspaceIndex\] = useState\(true\);/);
    assert.match(source, /<SettingsToggle/);
    assert.match(source, /checked=\{workspaceIndex\}/);
    assert.match(source, /className="project-create-dialog-index-toggle"/);
    assert.match(source, /project\.createWorkspaceIndexLabel/);
    assert.match(source, /project\.createWorkspaceIndexHint/);
  }
  // A remote workspace has no local tree to index, so neither dialog offers it.
  assert.match(dialog, /\{source === "remote" \? null : \(/);
  assert.match(editDialog, /\{group\?\.remote \? null : \(/);
  // The choice travels with creation and with the edit that saves it.
  assert.match(dialog, /primaryPath: folders\[0\],\s*choices: \{ workspaceIndex, \.\.\.appearance \},/);
  assert.match(dialog, /parentPath: cloneParent,\s*choices: \{ workspaceIndex, \.\.\.appearance \},/);
  assert.match(dialog, /setWorkspaceIndex\(true\);/);
  assert.match(editDialog, /setWorkspaceIndex\(resolved\.workspaceIndex !== false\);/);
  assert.match(styles, /\.project-create-dialog-index-hint \{[^}]*color: var\(--ds-text-muted\);/);
});

test("both project dialogs offer the workspace icon and colour pickers", () => {
  // One shared component draws both rows, so the tile order and the stored
  // pair cannot drift apart between create and edit.
  for (const source of [dialog, editDialog]) {
    assert.match(source, /const \[appearance, setAppearance\] = useState<ProjectGroupAppearance>\(\{\}\);/);
    assert.match(source, /<ProjectAppearancePicker/);
    assert.match(source, /onChange=\{setAppearance\}/);
    assert.match(source, /\{ workspaceIndex, \.\.\.appearance \}/);
  }
  assert.match(dialog, /setAppearance\(\{\}\);/);
  assert.match(editDialog, /setAppearance\(resolved\.appearance \?\? \{\}\);/);
  // A remote workspace has no local glyph to decorate.
  assert.match(dialog, /\{source === "remote" \? null : \(\s*<>/);
  assert.match(editDialog, /\{group\?\.remote \? null : \(\s*<>/);

  assert.match(appearanceSource, /export function ProjectAppearancePicker/);
  assert.match(appearanceSource, /export function ProjectAppearanceGlyph/);
  assert.match(appearanceSource, /PROJECT_ICON_CHOICES\.map/);
  assert.match(appearanceSource, /PROJECT_COLOR_CHOICES\.map/);
  assert.match(appearanceSource, /t\("project\.appearance\.iconLabel"\)/);
  assert.match(appearanceSource, /t\("project\.appearance\.colorLabel"\)/);
  // Decoration reads workspace → icon → colour, then the index switch below the
  // colour row; the same order in both dialogs keeps the two entry points from
  // drifting apart.
  for (const source of [dialog, editDialog]) {
    const picker = source.indexOf("<ProjectAppearancePicker");
    const indexSection = source.indexOf('project-create-dialog-index"');
    assert.ok(picker >= 0 && indexSection > picker, "index switch below the colour row");
  }
  assert.match(
    styles,
    /\.project-appearance-row \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(var\(--appearance-tile\), 1fr\)\);/,
  );
  assert.match(styles, /\.project-appearance-row \{[^}]*grid-auto-rows: var\(--appearance-tile\);/);
  assert.match(styles, /\.project-appearance-swatch-dot \{[^}]*background: currentColor;/);
});

test("clone checkout handler clones without touching the active workspace", () => {
  const start = main.indexOf("IPC.invoke.projectCloneCheckout");
  const end = main.indexOf("IPC.invoke.projectSet", start);
  const handler = main.slice(start, end);
  assert.ok(start >= 0 && end > start, "clone checkout handler should exist");
  assert.match(handler, /parentPath/);
  assert.match(handler, /cloneGitRepository\(\{ url, parentPath \}\)/);
  // The renderer still creates the group, so the handler never sets a workspace.
  assert.doesNotMatch(handler, /workspace\.set/);
  assert.doesNotMatch(handler, /dialog\.showOpenDialog/);
});

test("the stylesheet keeps balanced blocks and no duplicated tail", () => {
  // A stray trailing fragment still matched every surface assertion above while
  // breaking the Tailwind build ("Missing opening {"), so the sheet's blocks are
  // checked structurally instead of by pattern.
  const open = (styles.match(/{/g) ?? []).length;
  const close = (styles.match(/}/g) ?? []).length;
  assert.equal(open, close, "every style block must be closed");
  const tail = styles.slice(-200);
  assert.equal(
    (tail.match(/transition: none;/g) ?? []).length,
    1,
    "the reduced-motion block keeps exactly one declaration group",
  );
  assert.match(tail, /\}\s*\}\s*$/);
});

test("create project dialog remains usable on narrow screens and reduced motion", () => {
  assert.match(styles, /width: min\(100%, 480px\)/);
  assert.match(styles, /border-radius: var\(--radius-lg-plus\)/);
  assert.match(styles, /font-size: var\(--text-lg\)/);
  assert.match(styles, /font-size: var\(--text-base\)/);
  assert.match(styles, /gap: 16px/);
  assert.match(styles, /padding: 14px 18px 18px/);
  assert.match(styles, /@media \(max-width: 520px\)/);
  assert.match(styles, /align-items: flex-end/);
  assert.match(styles, /min-height: 48px/);
  assert.match(styles, /project-create-dialog-actions/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /overflow-y: auto/);
  assert.match(styles, /\.project-create-dialog-source-options \{/);
  assert.match(styles, /\.project-create-dialog-source-option\.is-active \{/);
  assert.match(styles, /\.project-create-dialog-location\.is-chosen/);
  assert.match(styles, /\.project-create-dialog-clone-hint \{/);
});

test("create project dialog stays lineless (D297)", () => {
  assert.match(styles, /\.project-create-dialog-source-option \{[^}]*border: 0;/);
  assert.match(
    styles,
    /\.project-create-dialog-source-option\.is-active \{[^}]*background: var\(--ds-tile-deep\);/,
  );
  assert.doesNotMatch(styles, /border: 1px solid var\(--ds-border-subtle\)/);
  assert.doesNotMatch(styles, /\.project-create-dialog-name-field:focus-visible/);
  assert.doesNotMatch(styles, /outline-offset: 2px/);
  assert.match(
    styles,
    /\.project-create-dialog-source-option:focus-visible,[^}]*box-shadow: 0 0 0 2px color-mix\(in oklab, var\(--ds-accent\) 22%, transparent\);/,
  );
});
