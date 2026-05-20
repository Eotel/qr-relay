import type { Metric } from "@qr-relay/core";
import { type StoreApi, type UseBoundStore, create } from "zustand";
import type { RoomInfo } from "./api-client.js";
import { type Clock, type TimerId, systemClock } from "./clock.js";

export type WsMessage =
  | { t: "state"; state: unknown; metrics: Metric[]; players: PlayerLite[] }
  | { t: "players"; players: PlayerLite[] }
  | { t: "event"; event: Record<string, unknown> }
  | { t: "error"; message: string }
  | { t: "pong" };

export type PlayerLite = { id: string; name: string; joinedAt: number };

export type WsStoreState = {
  connected: boolean;
  players: PlayerLite[];
  state: unknown;
  metrics: Metric[];
  room: RoomInfo | null;
  lastError: string | null;
  socket: WebSocket | null;
  reconnectTimer: TimerId | null;
  connect: (code: string, playerId: string) => void;
  disconnect: () => void;
  send: (msg: unknown) => void;
  setRoom: (room: RoomInfo) => void;
  setSnapshot: (snap: { players?: PlayerLite[]; state?: unknown; metrics?: Metric[] }) => void;
};

export type WsStoreDeps = {
  socketFactory: (url: string) => WebSocket;
  clock?: Clock;
  buildUrl?: (code: string, playerId: string) => string;
  reconnectDelayMs?: number;
};

function defaultBuildUrl(code: string, playerId: string): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws/${encodeURIComponent(code)}?pid=${encodeURIComponent(
    playerId,
  )}`;
}

export type WsStore = UseBoundStore<StoreApi<WsStoreState>>;

export function createWsStore(deps: WsStoreDeps): WsStore {
  const clock = deps.clock ?? systemClock;
  const buildUrl = deps.buildUrl ?? defaultBuildUrl;
  const reconnectDelayMs = deps.reconnectDelayMs ?? 1500;

  return create<WsStoreState>((set, get) => ({
    connected: false,
    players: [],
    state: null,
    metrics: [],
    room: null,
    lastError: null,
    socket: null,
    reconnectTimer: null,

    connect(code, playerId) {
      get().disconnect();
      const ws = deps.socketFactory(buildUrl(code, playerId));
      set({ socket: ws, lastError: null });

      ws.addEventListener("open", () => {
        set({ connected: true });
      });
      ws.addEventListener("message", (ev) => {
        try {
          const raw = (ev as MessageEvent).data;
          const data = JSON.parse(typeof raw === "string" ? raw : String(raw)) as WsMessage;
          if (data.t === "state") {
            set({ state: data.state, metrics: data.metrics, players: data.players });
          } else if (data.t === "players") {
            set({ players: data.players });
          } else if (data.t === "error") {
            set({ lastError: data.message });
          }
        } catch {
          // ignore malformed payloads
        }
      });
      ws.addEventListener("close", () => {
        set({ connected: false, socket: null });
        const timer = clock.setTimeout(() => get().connect(code, playerId), reconnectDelayMs);
        set({ reconnectTimer: timer });
      });
      ws.addEventListener("error", () => {
        set({ lastError: "WebSocket error" });
      });
    },

    disconnect() {
      const { socket, reconnectTimer } = get();
      if (reconnectTimer !== null) {
        clock.clearTimeout(reconnectTimer);
      }
      if (socket) {
        try {
          socket.close();
        } catch {
          // ignore
        }
      }
      set({ socket: null, reconnectTimer: null, connected: false });
    },

    send(msg) {
      const sock = get().socket;
      if (!sock || sock.readyState !== WebSocket.OPEN) return;
      sock.send(JSON.stringify(msg));
    },

    setRoom(room) {
      set({ room });
    },

    setSnapshot(snap) {
      set((prev) => ({
        players: snap.players ?? prev.players,
        state: snap.state ?? prev.state,
        metrics: snap.metrics ?? prev.metrics,
      }));
    },
  }));
}
