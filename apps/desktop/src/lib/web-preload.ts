/**
 * Dev-mode Web shim for the `window.piDesktop` preload bridge (Browser Dev
 * Mode).
 *
 * In Electron the preload script exposes `window.piDesktop`; in a browser there
 * is no preload. This module re-implements the same surface over the loopback
 * WebSocket served by `electron/main/web-bridge.ts`, so the existing renderer
 * boots unchanged. It is injected before `main.tsx` by the dev-only Vite
 * plugin in `electron.vite.config.ts` and is a no-op when the real preload
 * bridge is already present.
 *
 * Desktop-only capabilities degrade here: `getDroppedFilePath` always returns
 * null (browsers cannot resolve a dropped File to a filesystem path) and live
 * voice over a transferred MessagePort is unavailable.
 */
import { IPC } from "@trail/shared/protocol";
import type { Result } from "@trail/shared";

const BRIDGE_URL = "ws://127.0.0.1:5174";

type PendingRequest = {
  id: number;
  resolve: (value: Result<unknown>) => void;
  reject: (error: Error) => void;
};

// `window.piDesktop`'s shape is declared by `./api.ts` (declare global); this
// module only fills it in when the real preload bridge is absent.

if (typeof window !== "undefined" && !window.piDesktop) {
  let socket: WebSocket | null = null;
  let connecting: Promise<WebSocket> | null = null;
  let nextRequestId = 1;
  const pending = new Map<number, PendingRequest>();
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  function connect(): Promise<WebSocket> {
    if (socket && socket.readyState === WebSocket.OPEN) {
      return Promise.resolve(socket);
    }
    if (connecting) return connecting;
    connecting = new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(BRIDGE_URL);
      ws.onopen = () => {
        socket = ws;
        connecting = null;
        resolve(ws);
      };
      ws.onerror = () => {
        connecting = null;
        reject(new Error("piDesktop web bridge unavailable at " + BRIDGE_URL));
      };
      ws.onclose = () => {
        socket = null;
        connecting = null;
        for (const request of pending.values()) {
          request.reject(new Error("piDesktop web bridge closed"));
        }
        pending.clear();
      };
      ws.onmessage = (event) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (typeof message.event === "string") {
          const channel = message.event;
          const args = (message.args as unknown[] | undefined) ?? [];
          const channelListeners = listeners.get(channel);
          if (channelListeners) {
            for (const listener of channelListeners) {
              try {
                listener(...args);
              } catch (error) {
                console.error(`[web-preload] listener for ${channel} failed`, error);
              }
            }
          }
          return;
        }
        const id = message.id;
        if (typeof id !== "number") return;
        const request = pending.get(id);
        if (!request) return;
        pending.delete(id);
        if (message.ok === true) {
          request.resolve({ ok: true, data: message.data } as Result<unknown>);
        } else {
          request.resolve({
            ok: false,
            error: {
              code: (message.error as { code?: string })?.code ?? "INTERNAL",
              message: (message.error as { message?: string })?.message ?? "bridge error",
            },
          } as Result<never>);
        }
      };
    });
    return connecting;
  }

  async function invoke<T>(channel: string, ...args: unknown[]): Promise<Result<T>> {
    const ws = await connect();
    const id = nextRequestId++;
    return new Promise<Result<T>>((resolve, reject) => {
      pending.set(id, { id, resolve: resolve as (value: Result<unknown>) => void, reject });
      ws.send(JSON.stringify({ id, channel, args }));
    });
  }

  function on(channel: string, listener: (...args: unknown[]) => void): () => void {
    let channelListeners = listeners.get(channel);
    if (!channelListeners) {
      channelListeners = new Set();
      listeners.set(channel, channelListeners);
    }
    channelListeners.add(listener);
    return () => {
      channelListeners?.delete(listener);
      if (channelListeners && channelListeners.size === 0) {
        listeners.delete(channel);
      }
    };
  }

  window.piDesktop = {
    invoke,
    on,
    onLiveVoicePort: () => () => undefined,
    channels: IPC,
    platform: "win32",
    locale: "zh-CN",
    getDroppedFilePath: () => null,
  };
}

export {};
