/**
 * Browser Dev Mode IPC bridge (Settings ▸ 存储 regression).
 *
 * `dev:web` has no preload: `startWebBridge` re-exposes the desktop IPC over a
 * loopback WebSocket and dispatches through the map `registerIpcHandlers`
 * returns. That map used to hold only `handle` channels, so every
 * `handleWithEvent` channel (storage, notifications, windows) answered
 * "IPC channel is not available to external agents" in the browser even
 * though the desktop handler existed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const [register, storageIpc, webBridge] = await Promise.all([
  read("../electron/main/ipc/register.ts"),
  read("../electron/main/storage/ipc.ts"),
  read("../electron/main/web-bridge.ts"),
]);

test("event-taking channels stay reachable from the dev bridge", () => {
  assert.match(
    register,
    /const handleWithEvent = \([\s\S]*?ipcHandlers\.set\(channel, \(\.\.\.args: any\[\]\) =>/,
  );
  assert.match(
    register,
    /\{ sender: getMainWindow\(\)\?\.webContents \?\? \{ id: -1 \} \} as IpcMainInvokeEvent/,
  );
  // The desktop contract (real event, main-window sender check) is unchanged.
  assert.match(register, /ipcMain\.handle\(channel, async \(event, \.\.\.args\) =>\s*wrap\(\(\) => fn\(event, \.\.\.args\)\)/);
});

test("the storage card's channels are the event-taking kind it now serves", () => {
  assert.match(storageIpc, /registrar\.handleWithEvent\(IPC\.invoke\.storageGet,/);
});

test("the dev bridge dispatches through that same map and the shared whitelist", () => {
  assert.match(webBridge, /startWebBridge\(invokeIpc: IpcInvoker\)/);
  assert.match(webBridge, /const data = await invokeIpc\(channel, args\)/);
  assert.match(webBridge, /IPC_WHITELIST\.has\(channel\)/);
});
