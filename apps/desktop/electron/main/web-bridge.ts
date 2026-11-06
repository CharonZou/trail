import { WebSocketServer, WebSocket, type RawData } from "ws";
import { IPC_WHITELIST } from "@trail/shared/protocol";

/**
 * Dev-mode Web bridge (Browser Dev Mode).
 *
 * Trail's renderer is a plain React app whose only desktop dependency is the
 * `window.piDesktop` preload bridge. When a developer opens the app in a
 * browser, there is no preload — so this module exposes the main-process IPC
 * surface over a loopback WebSocket, and `src/lib/web-preload.ts` re-implements
 * the preload API on top of that socket. The existing renderer runs unchanged;
 * the existing main-process IPC handlers run unchanged; only the transport
 * differs.
 *
 * Security posture: dev tooling only. The server binds 127.0.0.1, accepts no
 * message larger than 1 MiB, and only serves channels on `IPC_WHITELIST`. It is
 * never started outside `TRAIL_WEB=1` (see `dev:web`).
 *
 * Wire protocol (JSON):
 *   client → server:  { id, channel, args }          invoke
 *   server → client:  { id, ok: true, data }         invoke result
 *   server → client:  { id, ok: false, error }       invoke failure
 *   server → client:  { event, args }                renderer event broadcast
 */
type IpcInvoker = (channel: string, args?: readonly unknown[]) => Promise<unknown>;

export type WebBridge = {
  /** The loopback port the WebSocket server listens on. */
  port: number;
  /** Fan out a main-process renderer event to every connected browser client. */
  broadcast: (channel: string, payload: unknown) => void;
  close: () => void;
};

const WEB_BRIDGE_HOST = "127.0.0.1";
const WEB_BRIDGE_PORT = 5174;
const MAX_MESSAGE_BYTES = 1024 * 1024;

type InvokeRequest = { id: number; channel: string; args: unknown[] };
type InvokeResponse =
  | { id: number; ok: true; data: unknown }
  | { id: number; ok: false; error: { code: string; message: string } };

function isInvokeRequest(value: unknown): value is InvokeRequest {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "number" &&
    typeof record.channel === "string" &&
    Array.isArray(record.args)
  );
}

function toBuffer(raw: RawData): Buffer {
  if (Buffer.isBuffer(raw)) return raw;
  if (Array.isArray(raw)) return Buffer.concat(raw);
  return Buffer.from(raw);
}

function toErrorResult(error: unknown): { code: string; message: string } {
  const candidate = error as {
    data?: { errorCode?: unknown };
    errorCode?: unknown;
    message?: unknown;
  };
  const code =
    candidate?.data?.errorCode ?? candidate?.errorCode ?? "INTERNAL";
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown error");
  return { code: String(code), message };
}

export function startWebBridge(invokeIpc: IpcInvoker): WebBridge {
  const server = new WebSocketServer({ host: WEB_BRIDGE_HOST, port: WEB_BRIDGE_PORT });
  const clients = new Set<WebSocket>();

  server.on("connection", (socket) => {
    clients.add(socket);
    socket.on("message", (raw) => {
      let parsed: unknown;
      try {
        const buffer = toBuffer(raw);
        if (buffer.byteLength > MAX_MESSAGE_BYTES) {
          throw new Error("message too large");
        }
        parsed = JSON.parse(buffer.toString());
      } catch {
        socket.send(
          JSON.stringify({
            id: -1,
            ok: false,
            error: { code: "INVALID_ARGUMENT", message: "invalid JSON message" },
          } satisfies InvokeResponse),
        );
        return;
      }
      if (!isInvokeRequest(parsed)) return;
      const { id, channel, args } = parsed;
      if (!IPC_WHITELIST.has(channel)) {
        socket.send(
          JSON.stringify({
            id,
            ok: false,
            error: { code: "FORBIDDEN", message: `channel is not whitelisted: ${channel}` },
          } satisfies InvokeResponse),
        );
        return;
      }
      void (async () => {
        let response: InvokeResponse;
        try {
          const data = await invokeIpc(channel, args);
          response = { id, ok: true, data };
        } catch (error) {
          response = { id, ok: false, error: toErrorResult(error) };
        }
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(response));
        }
      })();
    });
    socket.on("close", () => {
      clients.delete(socket);
    });
    socket.on("error", () => {
      clients.delete(socket);
    });
  });

  server.on("error", (error) => {
    // Surface the bind failure instead of failing silently; the renderer shim
    // will show a clear "bridge unavailable" message until the port is free.
    console.error(`[web-bridge] server error: ${String(error)}`);
  });

  return {
    port: WEB_BRIDGE_PORT,
    broadcast: (channel, payload) => {
      const frame = JSON.stringify({ event: channel, args: payload });
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(frame);
        }
      }
    },
    close: () => {
      for (const client of clients) {
        client.close();
      }
      clients.clear();
      server.close();
    },
  };
}
