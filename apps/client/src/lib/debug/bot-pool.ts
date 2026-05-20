import type { ScanPayloadV1 } from "@qr-relay/core";
import type { FetchLike, JoinRole } from "../api-client.js";
import { type BotConnection, type BotStatus, createBotConnection } from "./bot-connection.js";

export type BotEntry = {
  id: string;
  name: string;
  role: JoinRole;
  status: BotStatus;
};

export type BotPoolOpts = {
  code: string;
  fetchImpl: FetchLike;
  socketFactory: (url: string) => WebSocket;
  buildUrl: (code: string, playerId: string) => string;
  nameFor: (index: number) => string;
  playerIdFor: (index: number) => string;
};

export type AddBotOpts = {
  name?: string;
  role?: JoinRole;
  playerId?: string;
};

export type BotPool = {
  list: () => BotEntry[];
  get: (id: string) => BotEntry | null;
  addBot: (opts?: AddBotOpts) => Promise<string>;
  addBots: (n: number) => Promise<string[]>;
  removeBot: (id: string) => void;
  renameBot: (id: string, name: string) => void;
  disconnectBot: (id: string) => void;
  reconnectBot: (id: string) => void;
  clear: () => void;
  disconnectAll: () => void;
  reconnectAll: () => void;
  sendScan: (id: string, payload: ScanPayloadV1) => void;
  sendRaw: (id: string, text: string) => void;
  lastSuccessNonce: () => string | null;
  /** Most recently confirmed scan as a {scannerId, payloadPid} pair. */
  lastSuccessPair: () => { scannerId: string; scannedId: string } | null;
  subscribe: (fn: () => void) => () => void;
  /** Subscribe to every message a bot receives, tagged with the bot id. */
  onMessage: (fn: (botId: string, msg: unknown) => void) => () => void;
  /** Subscribe to every scan a bot sends, before the server confirms it. */
  onSend: (
    fn: (event: { botId: string; payload: ScanPayloadV1; ts: number }) => void,
  ) => () => void;
};

type Internal = {
  id: string;
  name: string;
  role: JoinRole;
  connection: BotConnection;
  pendingNonces: Set<string>;
};

export function createBotPool(opts: BotPoolOpts): BotPool {
  const { code, fetchImpl, socketFactory, buildUrl, nameFor, playerIdFor } = opts;
  const bots = new Map<string, Internal>();
  let counter = 0;
  let lastNonce: string | null = null;
  let lastPair: { scannerId: string; scannedId: string } | null = null;
  const subs = new Set<() => void>();
  const messageSubs = new Set<(botId: string, msg: unknown) => void>();
  const sendSubs = new Set<(e: { botId: string; payload: ScanPayloadV1; ts: number }) => void>();

  const notify = () => {
    for (const fn of subs) fn();
  };

  const handleMessage = (botId: string, msg: unknown) => {
    if (msg && typeof msg === "object") {
      const m = msg as { t?: unknown; event?: unknown };
      if (m.t === "event" && m.event && typeof m.event === "object") {
        const ev = m.event as { kind?: unknown; scannerId?: unknown; scannedId?: unknown };
        if (
          ev.kind === "scan" &&
          typeof ev.scannerId === "string" &&
          typeof ev.scannedId === "string"
        ) {
          const owner = bots.get(botId);
          if (owner && owner.id === ev.scannerId && owner.pendingNonces.size > 0) {
            // Pop the oldest pending nonce for this bot.
            const iter = owner.pendingNonces.values();
            const first = iter.next();
            if (!first.done) {
              const nonce = first.value;
              owner.pendingNonces.delete(nonce);
              lastNonce = nonce;
              lastPair = { scannerId: ev.scannerId, scannedId: ev.scannedId };
            }
          }
        }
      }
    }
    for (const fn of messageSubs) fn(botId, msg);
    notify();
  };

  const ensureUniqueId = (proposed: string): string => {
    if (!bots.has(proposed)) return proposed;
    let i = 2;
    while (bots.has(`${proposed}-${i}`)) i += 1;
    return `${proposed}-${i}`;
  };

  const buildConnection = (id: string, name: string, role: JoinRole): BotConnection => {
    const connection = createBotConnection({
      code,
      playerId: id,
      name,
      role,
      fetchImpl,
      socketFactory,
      buildUrl,
    });
    connection.onMessage((msg) => handleMessage(id, msg));
    return connection;
  };

  return {
    list() {
      return Array.from(bots.values()).map((b) => ({
        id: b.id,
        name: b.name,
        role: b.role,
        status: b.connection.getStatus(),
      }));
    },

    get(id) {
      const b = bots.get(id);
      if (!b) return null;
      return { id: b.id, name: b.name, role: b.role, status: b.connection.getStatus() };
    },

    async addBot(addOpts) {
      const index = counter++;
      const role: JoinRole = addOpts?.role ?? "client";
      const id = ensureUniqueId(addOpts?.playerId ?? playerIdFor(index));
      const name = addOpts?.name ?? nameFor(index);
      const connection = buildConnection(id, name, role);
      await connection.join();
      bots.set(id, { id, name, role, connection, pendingNonces: new Set() });
      connection.connect();
      notify();
      return id;
    },

    async addBots(n) {
      const ids: string[] = [];
      for (let i = 0; i < n; i += 1) {
        ids.push(await this.addBot());
      }
      return ids;
    },

    removeBot(id) {
      const b = bots.get(id);
      if (!b) return;
      b.connection.disconnect();
      bots.delete(id);
      notify();
    },

    renameBot(id, name) {
      const b = bots.get(id);
      if (!b) return;
      bots.set(id, { ...b, name });
      notify();
    },

    disconnectBot(id) {
      const b = bots.get(id);
      if (!b) return;
      b.connection.disconnect();
      notify();
    },

    reconnectBot(id) {
      const b = bots.get(id);
      if (!b) return;
      b.connection.connect();
      notify();
    },

    clear() {
      for (const b of bots.values()) b.connection.disconnect();
      bots.clear();
      notify();
    },

    disconnectAll() {
      for (const b of bots.values()) b.connection.disconnect();
      notify();
    },

    reconnectAll() {
      for (const b of bots.values()) b.connection.connect();
      notify();
    },

    sendScan(id, payload) {
      const b = bots.get(id);
      if (!b) return;
      b.pendingNonces.add(payload.nonce);
      b.connection.sendScan(payload);
      for (const fn of sendSubs) fn({ botId: id, payload, ts: Date.now() });
      notify();
    },

    sendRaw(id, text) {
      const b = bots.get(id);
      if (!b) return;
      b.connection.sendRaw(text);
      notify();
    },

    lastSuccessNonce() {
      return lastNonce;
    },

    lastSuccessPair() {
      return lastPair;
    },

    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },

    onMessage(fn) {
      messageSubs.add(fn);
      return () => {
        messageSubs.delete(fn);
      };
    },

    onSend(fn) {
      sendSubs.add(fn);
      return () => {
        sendSubs.delete(fn);
      };
    },
  };
}
