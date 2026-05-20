import type { Phase } from "@qr-relay/core";
import type { Preset } from "@qr-relay/handlers";

export type RoomInfo = {
  code: string;
  handlerId: string;
  handlerConfig: unknown;
  createdAt: number;
  hostId: string | null;
  phase: Phase;
};

export type RoomSnapshot = {
  room: RoomInfo;
  players: { id: string; name: string; joinedAt: number }[];
  state: unknown;
  metrics: import("@qr-relay/core").Metric[];
};

export type HandlersAndPresets = {
  handlers: { id: string; name: string; description?: string }[];
  presets: Preset[];
};

export type JoinRole = "host" | "client";

export type ApiClient = {
  listHandlersAndPresets: () => Promise<HandlersAndPresets>;
  createRoom: (handlerId: string, handlerConfig: unknown) => Promise<string>;
  getRoom: (code: string) => Promise<RoomSnapshot>;
  joinRoom: (code: string, playerId: string, name: string, role: JoinRole) => Promise<RoomSnapshot>;
  leaveRoom: (code: string, playerId: string) => Promise<void>;
  startRoom: (code: string) => Promise<void>;
  pauseRoom: (code: string) => Promise<void>;
  resumeRoom: (code: string) => Promise<void>;
  resetRoom: (code: string) => Promise<void>;
  /**
   * Apply a partial patch to the room's handlerConfig. Only the host (proven
   * by `playerId === room.hostId` on the server) may call this; non-hosts
   * receive 403. Only valid in the `ready` phase (409 otherwise). Currently
   * only the `relay` handler supports this.
   */
  updateRoomConfig: (code: string, playerId: string, patch: unknown) => Promise<void>;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function createApiClient(fetchImpl: FetchLike): ApiClient {
  return {
    async listHandlersAndPresets() {
      const res = await fetchImpl("/api/handlers");
      if (!res.ok) throw new Error(`handlers: ${res.status}`);
      return (await res.json()) as HandlersAndPresets;
    },

    async createRoom(handlerId, handlerConfig) {
      const res = await fetchImpl("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handlerId, handlerConfig }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`createRoom failed: ${text}`);
      }
      const body = (await res.json()) as { code: string };
      return body.code;
    },

    async getRoom(code) {
      const res = await fetchImpl(`/api/rooms/${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error(`getRoom: ${res.status}`);
      return (await res.json()) as RoomSnapshot;
    },

    async joinRoom(code, playerId, name, role) {
      const encoded = encodeURIComponent(code);
      const res = await fetchImpl(`/api/rooms/${encoded}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, name, role }),
      });
      if (!res.ok) throw new Error(`join failed: ${res.status}`);
      // join のレスポンスは破棄して、最新 state を別 GET で取り直す
      // (broadcast との競合を避けるため)
      await res.json();
      const stateRes = await fetchImpl(`/api/rooms/${encoded}`);
      if (!stateRes.ok) throw new Error(`state failed: ${stateRes.status}`);
      return (await stateRes.json()) as RoomSnapshot;
    },

    async leaveRoom(code, playerId) {
      const res = await fetchImpl(`/api/rooms/${encodeURIComponent(code)}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      if (!res.ok) throw new Error(`leave failed: ${res.status}`);
    },

    async startRoom(code) {
      const res = await fetchImpl(`/api/rooms/${encodeURIComponent(code)}/start`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`start failed: ${res.status}`);
    },

    async pauseRoom(code) {
      const res = await fetchImpl(`/api/rooms/${encodeURIComponent(code)}/pause`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`pause failed: ${res.status}`);
    },

    async resumeRoom(code) {
      const res = await fetchImpl(`/api/rooms/${encodeURIComponent(code)}/resume`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`resume failed: ${res.status}`);
    },

    async resetRoom(code) {
      const res = await fetchImpl(`/api/rooms/${encodeURIComponent(code)}/reset`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`reset failed: ${res.status}`);
    },

    async updateRoomConfig(code, playerId, patch) {
      const res = await fetchImpl(`/api/rooms/${encodeURIComponent(code)}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, patch }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`updateRoomConfig failed (${res.status}): ${text}`);
      }
    },
  };
}

export const defaultApiClient: ApiClient = createApiClient((input, init) => fetch(input, init));
