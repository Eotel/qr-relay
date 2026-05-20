import type { ScanPayloadV1 } from "@qr-relay/core";
import type { FetchLike, JoinRole } from "../api-client.js";

export type BotStatus = {
  readyState: number;
  sentCount: number;
  errorCount: number;
  lastError: string | null;
  lastTargetId: string | null;
};

export type BotMessageHandler = (msg: unknown) => void;

export type BotConnectionOpts = {
  code: string;
  playerId: string;
  name: string;
  role?: JoinRole;
  fetchImpl: FetchLike;
  socketFactory: (url: string) => WebSocket;
  buildUrl: (code: string, playerId: string) => string;
};

export type BotConnection = {
  readonly playerId: string;
  readonly name: string;
  readonly role: JoinRole;
  join: () => Promise<void>;
  connect: () => void;
  disconnect: () => void;
  sendScan: (payload: ScanPayloadV1) => void;
  sendRaw: (text: string) => void;
  onMessage: (fn: BotMessageHandler) => () => void;
  getStatus: () => BotStatus;
};

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

export function createBotConnection(opts: BotConnectionOpts): BotConnection {
  const { code, playerId, name, fetchImpl, socketFactory, buildUrl } = opts;
  const role: JoinRole = opts.role ?? "client";

  let socket: WebSocket | null = null;
  let sentCount = 0;
  let errorCount = 0;
  let lastError: string | null = null;
  let lastTargetId: string | null = null;
  const handlers = new Set<BotMessageHandler>();

  const status = (): BotStatus => ({
    readyState: socket?.readyState ?? CLOSED,
    sentCount,
    errorCount,
    lastError,
    lastTargetId,
  });

  return {
    playerId,
    name,
    role,

    async join() {
      const res = await fetchImpl(`/api/rooms/${encodeURIComponent(code)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, name, role }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`bot join failed: ${res.status}${text ? ` ${text}` : ""}`);
      }
    },

    connect() {
      if (socket && socket.readyState !== CLOSED) return;
      const ws = socketFactory(buildUrl(code, playerId));
      socket = ws;
      ws.addEventListener("message", (ev) => {
        try {
          const raw = (ev as MessageEvent).data;
          const data = JSON.parse(typeof raw === "string" ? raw : String(raw)) as unknown;
          if (data && typeof data === "object" && (data as { t?: unknown }).t === "error") {
            const message = (data as { message?: unknown }).message;
            if (typeof message === "string") {
              lastError = message;
            }
            errorCount += 1;
          }
          for (const h of handlers) h(data);
        } catch {
          // Malformed payload — surface as a synthetic error to subscribers
          // so the Event log can still note it without crashing the bot.
          errorCount += 1;
          lastError = "invalid server payload";
        }
      });
      ws.addEventListener("close", () => {
        // leave readyState=CLOSED visible via socket
      });
      ws.addEventListener("error", () => {
        errorCount += 1;
        lastError = "websocket error";
      });
    },

    disconnect() {
      if (!socket) return;
      try {
        socket.close();
      } catch {
        // ignore
      }
    },

    sendScan(payload) {
      if (!socket || socket.readyState !== OPEN) return;
      try {
        socket.send(JSON.stringify({ t: "scan", payload }));
        sentCount += 1;
        lastTargetId = payload.pid;
      } catch (err) {
        errorCount += 1;
        lastError = err instanceof Error ? err.message : "send failed";
      }
    },

    sendRaw(text) {
      if (!socket || socket.readyState !== OPEN) return;
      try {
        socket.send(text);
        sentCount += 1;
      } catch (err) {
        errorCount += 1;
        lastError = err instanceof Error ? err.message : "send failed";
      }
    },

    onMessage(fn) {
      handlers.add(fn);
      return () => {
        handlers.delete(fn);
      };
    },

    getStatus: status,
  };
}

export const BOT_WS_READY_STATE = {
  CONNECTING,
  OPEN,
  CLOSED,
} as const;
