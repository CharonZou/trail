import { app } from "electron";
import { APP_ID, APP_NAME } from "@trail/shared";
import { applyDevelopmentUserData, applyPackagedUserData, desktopDataDir } from "./data-paths";
import { ignoreBrokenStdio } from "./logger";
import { installMainProcessErrorHandlers } from "./main-process-errors";

// Complete identity and locking synchronously, before the ready promise or any writer.
ignoreBrokenStdio();
installMainProcessErrorHandlers();
export const isDevelopmentBuild = process.env.TRAIL_DEV === "1" || !app.isPackaged;
app.setName(APP_NAME);
applyDevelopmentUserData(app, isDevelopmentBuild);
applyPackagedUserData(app, !isDevelopmentBuild);
if (process.platform === "win32") app.setAppUserModelId(APP_ID);

// A profile override set under the pre-Trail variable name still means the same
// thing; normalizing it keeps the lock verdict below reading one variable. Only
// a name that is actually present may be copied: assigning `undefined` into
// `process.env` stores the string "undefined", which would read back as a
// published profile and take the installation off its own data directory.
if (process.env.TRAIL_DATA_DIR === undefined && process.env.PI_DESKTOP_DATA_DIR !== undefined) {
  process.env.TRAIL_DATA_DIR = process.env.PI_DESKTOP_DATA_DIR;
}

// A managed restart inherits the root published for children, not an explicit profile override.
if (process.argv.includes("--trail-managed-storage")) delete process.env.TRAIL_DATA_DIR;
export const singleInstanceRequired = !process.env.TRAIL_DATA_DIR;
export const hasSingleInstanceLock = singleInstanceRequired ? app.requestSingleInstanceLock() : true;
export const defaultDataDir = desktopDataDir(isDevelopmentBuild);
if (!hasSingleInstanceLock) app.quit();

// Preserve the existing Chromium accessibility crash workaround before ready.
app.commandLine.appendSwitch("disable-renderer-accessibility");
