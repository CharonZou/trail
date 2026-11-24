import { dialog, type BrowserWindow } from "electron";
import { IPC } from "@trail/shared";
import type { HostProcess } from "../host-process";
import type { IpcRegistrar } from "./types";

export type AgentAppsIpcDependencies = {
  registrar: IpcRegistrar;
  getHost: () => HostProcess | null;
  getMainWindow: () => BrowserWindow | null;
};

function requireHost(getHost: () => HostProcess | null): HostProcess {
  const host = getHost();
  if (!host) throw new Error("host unavailable");
  return host;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} required`);
  return value.trim();
}

/**
 * Registry-only IPC: opening an application is a renderer action that hands
 * `openUrl` to the existing work-panel browser tab, so this module never loads
 * the target itself.
 */
export function registerAgentAppsIpc({
  registrar,
  getHost,
  getMainWindow,
}: AgentAppsIpcDependencies): void {
  registrar.handle(IPC.invoke.agentAppsList, async () =>
    requireHost(getHost).call("apps.list"),
  );

  registrar.handle(IPC.invoke.agentAppsCreate, async (input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("application input required");
    return requireHost(getHost).call("apps.create", input);
  });

  registrar.handle(IPC.invoke.agentAppsUpdate, async (input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("application input required");
    return requireHost(getHost).call("apps.update", input);
  });

  registrar.handle(IPC.invoke.agentAppsDelete, async (id: unknown) =>
    requireHost(getHost).call("apps.delete", { id: requireString(id, "id") }),
  );

  registrar.handle(IPC.invoke.agentAppsMarkOpened, async (id: unknown) =>
    requireHost(getHost).call("apps.markOpened", { id: requireString(id, "id") }),
  );

  registrar.handle(IPC.invoke.agentAppsPickFolder, async () => {
    const window = getMainWindow();
    const selection = window
      ? await dialog.showOpenDialog(window, {
          title: "Choose application folder",
          properties: ["openDirectory"],
        })
      : await dialog.showOpenDialog({
          title: "Choose application folder",
          properties: ["openDirectory"],
        });
    return selection.canceled ? null : selection.filePaths[0] ?? null;
  });
}
