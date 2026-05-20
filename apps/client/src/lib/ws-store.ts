import type { Metric, Phase } from "@qr-relay/core";
import { type StoreApi, type UseBoundStore, create } from "zustand";
import type { RoomInfo } from "./api-client.js";
import { type Clock, type TimerId, systemClock } from "./clock.js";

export type WsMessage =
  | {
      t: "state";
      state: unknown;
      metrics: Metric[];
      players: PlayerLite[];
      phase?: Phase;
    }
  | { t: "players"; players: PlayerLite[] }
  | { t: "room"; room: RoomInfo }
  | { t: "event"; event: Record<string, unknown> }
  | { t: "error"; message: string }
  | { t: "pong" }
  | { t: "inactivity-warning"; closeAt: number }
  | { t: "inactivity-cleared" }
  | { t: "closed"; reason: "inactivity" };

export type RoomClosed = { reason: "inactivity" };

export type PlayerLite = { id: string; name: string; joinedAt: number };

export type WsRole = "host" | "client";

/** Most recent scan event. Host dashboard reads this to drive the LastScanTicker. */
export type ScanEvent = { scannerId: string; scannedId: string; ts: number };

export type WsStoreState = {
  connected: boolean;
  players: PlayerLite[];
  state: unknown;
  metrics: Metric[];
  phase: Phase;
  room: RoomInfo | null;
  role: WsRole | null;
  lastError: string | null;
  socket: WebSocket | null;
  reconnectTimer: TimerId | null;
  /** Non-null while the server has issued an inactivity warning. */
  inactivity: { closeAt: number } | null;
  /** Non-null once the server has closed the room. RoomLayout reads this to navigate. */
  closed: RoomClosed | null;
  /**
   * Last `scan` GameEvent received. Selector exists so the host ticker can
   * subscribe without re-rendering on every state broadcast (history is
   * embedded in `state`, which churns on every scan). Cleared by `reset`.
   */
  lastScanEvent: ScanEvent | null;
  connect: (code: string, playerId: string, role: WsRole) => void;
  disconnect: () => void;
  send: (msg: unknown) => void;
  setRoom: (room: RoomInfo) => void;
  setRole: (role: WsRole | null) => void;
  clearClosed: () => void;
  setSnapshot: (snap: {
    players?: PlayerLite[];
    state?: unknown;
    metrics?: Metric[];
    phase?: Phase;
  }) => void;
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

/**
 * Narrow a `t: "event"` payload's inner record to a ScanEvent shape.
 * Server emits `{ kind: "scan", scannerId, scannedId, ts, detail? }`; any
 * other event kind (or malformed shape) returns null so the store ignores it.
 */
export function parseScanEvent(ev: unknown): ScanEvent | null {
  if (!ev || typeof ev !== "object") return null;
  const e = ev as Record<string, unknown>;
  if (e.kind !== "scan") return null;
  const scannerId = e.scannerId;
  const scannedId = e.scannedId;
  const ts = e.ts;
  if (typeof scannerId !== "string" || typeof scannedId !== "string" || typeof ts !== "number") {
    return null;
  }
  return { scannerId, scannedId, ts };
}

/**
 * Stopwatch elapsed time derived from phase + now. Pure so HostRoom can
 * re-render at its own cadence without an extra source of truth.
 */
export function displayMs(phase: Phase, now: number): number {
  switch (phase.kind) {
    case "ready":
      return 0;
    case "paused":
      return phase.accumulatedMs;
    case "running":
      return phase.accumulatedMs + Math.max(0, now - phase.startedAt);
  }
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
    phase: { kind: "ready" },
    room: null,
    role: null,
    lastError: null,
    socket: null,
    reconnectTimer: null,
    inactivity: null,
    closed: null,
    lastScanEvent: null,

    connect(code, playerId, role) {
      get().disconnect();
      const ws = deps.socketFactory(buildUrl(code, playerId));
      set({ socket: ws, role, lastError: null });

      ws.addEventListener("open", () => {
        set({ connected: true });
      });
      ws.addEventListener("message", (ev) => {
        try {
          const raw = (ev as MessageEvent).data;
          const data = JSON.parse(typeof raw === "string" ? raw : String(raw)) as WsMessage;
          if (data.t === "state") {
            set((prev) => ({
              state: data.state,
              metrics: data.metrics,
              players: data.players,
              phase: data.phase ?? prev.phase,
            }));
          } else if (data.t === "players") {
            set({ players: data.players });
          } else if (data.t === "room") {
            set({ room: data.room, phase: data.room.phase });
          } else if (data.t === "event") {
            const scan = parseScanEvent(data.event);
            if (scan) set({ lastScanEvent: scan });
          } else if (data.t === "error") {
            set({ lastError: data.message });
          } else if (data.t === "inactivity-warning") {
            set({ inactivity: { closeAt: data.closeAt } });
          } else if (data.t === "inactivity-cleared") {
            set({ inactivity: null });
          } else if (data.t === "closed") {
            // Server is tearing the room down. Stop the auto-reconnect loop and
            // surface a one-shot "closed" so the route layer can navigate.
            set({ closed: { reason: data.reason }, inactivity: null });
            get().disconnect();
          }
        } catch {
          // ignore malformed payloads
        }
      });
      ws.addEventListener("close", () => {
        set({ connected: false, socket: null });
        // Skip reconnect if the room is closed — there's nothing to reconnect to.
        if (get().closed) return;
        const timer = clock.setTimeout(() => get().connect(code, playerId, role), reconnectDelayMs);
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
      set({ room, phase: room.phase });
    },

    setRole(role) {
      set({ role });
    },

    clearClosed() {
      set({ closed: null });
    },

    setSnapshot(snap) {
      set((prev) => ({
        players: snap.players ?? prev.players,
        state: snap.state ?? prev.state,
        metrics: snap.metrics ?? prev.metrics,
        phase: snap.phase ?? prev.phase,
      }));
    },
  }));
}
