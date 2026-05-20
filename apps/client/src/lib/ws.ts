import type { Metric } from "@qr-relay/core";
import { create } from "zustand";
import type { RoomInfo } from "./api.js";

export type WsMessage =
  | { t: "state"; state: unknown; metrics: Metric[]; players: PlayerLite[] }
  | { t: "players"; players: PlayerLite[] }
  | { t: "event"; event: Record<string, unknown> }
  | { t: "error"; message: string }
  | { t: "pong" };

export type PlayerLite = { id: string; name: string; joinedAt: number };

type WsStore = {
  connected: boolean;
  players: PlayerLite[];
  state: unknown;
  metrics: Metric[];
  room: RoomInfo | null;
  lastError: string | null;
  socket: WebSocket | null;
  reconnectTimer: number | null;
  connect: (code: string, playerId: string) => void;
  disconnect: () => void;
  send: (msg: unknown) => void;
  setRoom: (room: RoomInfo) => void;
  setSnapshot: (snap: { players?: PlayerLite[]; state?: unknown; metrics?: Metric[] }) => void;
};

export const useWs = create<WsStore>((set, get) => ({
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
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/ws/${encodeURIComponent(code)}?pid=${encodeURIComponent(playerId)}`;
    const ws = new WebSocket(url);
    set({ socket: ws, lastError: null });

    ws.addEventListener("open", () => {
      set({ connected: true });
    });
    ws.addEventListener("message", (ev) => {
      try {
        const data = JSON.parse(ev.data) as WsMessage;
        if (data.t === "state") {
          set({ state: data.state, metrics: data.metrics, players: data.players });
        } else if (data.t === "players") {
          set({ players: data.players });
        } else if (data.t === "error") {
          set({ lastError: data.message });
        }
      } catch {
        // ignore
      }
    });
    ws.addEventListener("close", () => {
      set({ connected: false, socket: null });
      const timer = window.setTimeout(() => get().connect(code, playerId), 1500);
      set({ reconnectTimer: timer });
    });
    ws.addEventListener("error", () => {
      set({ lastError: "WebSocket error" });
    });
  },

  disconnect() {
    const { socket, reconnectTimer } = get();
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
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
