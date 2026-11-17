/**
 * The programs a project folder can be opened with, and the answer the
 * main process gives back.
 *
 * One closed list for every layer: the top-bar menu renders it, both settings
 * write paths validate against it, and Electron Main resolves an id from it
 * through fixed install roots. Nothing here accepts a name, command, or path
 * supplied by the renderer or a plugin — launching an arbitrary program would
 * be the largest privilege the desktop could hand out (ADR 0109 keeps the same
 * boundary for `shell.openPath`).
 */

/** A row of the top bar's Open menu. `explorer` is the OS file manager. */
export type OpenWithApp = "explorer" | "vscode" | "trae" | "idea";

export const OPEN_WITH_APPS: readonly OpenWithApp[] = [
  "explorer",
  "vscode",
  "trae",
  "idea",
];

/**
 * The ids that need a program outside the OS shell. `explorer` stays on the
 * shipped `project/openFolder` channel, which already gates the path and calls
 * `shell.openPath`; this channel only starts executables.
 */
export type OpenWithEditorApp = Exclude<OpenWithApp, "explorer">;

export const OPEN_WITH_EDITOR_APPS: readonly OpenWithEditorApp[] = [
  "vscode",
  "trae",
  "idea",
];

export function isOpenWithApp(value: unknown): value is OpenWithApp {
  return typeof value === "string" && OPEN_WITH_APPS.includes(value as OpenWithApp);
}

export function isOpenWithEditorApp(
  value: unknown,
): value is OpenWithEditorApp {
  return (
    typeof value === "string" &&
    OPEN_WITH_EDITOR_APPS.includes(value as OpenWithEditorApp)
  );
}

/**
 * The outcome of one Open-menu press. A program that is not installed is an
 * expected result, not a failure of the call: the renderer turns `reason` into
 * localized copy and the main process logs the diagnostic detail, so no raw OS
 * error string reaches the user.
 */
export type ProjectOpenWithResult =
  | { ok: true; app: OpenWithEditorApp; path: string }
  | { ok: false; reason: "not_installed" | "launch_failed"; app: OpenWithEditorApp };
