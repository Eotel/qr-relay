import type { Preset } from "@qr-relay/handlers";

export type RoomInfo = {
  code: string;
  handlerId: string;
  handlerConfig: unknown;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
};

export type RoomState = {
  room: RoomInfo;
  players: { id: string; name: string; joinedAt: number }[];
  state: unknown;
  metrics: import("@qr-relay/core").Metric[];
};

export async function listHandlersAndPresets(): Promise<{
  handlers: { id: string; name: string; description?: string }[];
  presets: Preset[];
}> {
  const res = await fetch("/api/handlers");
  if (!res.ok) throw new Error(`handlers: ${res.status}`);
  return (await res.json()) as {
    handlers: { id: string; name: string; description?: string }[];
    presets: Preset[];
  };
}

export async function createRoom(handlerId: string, handlerConfig: unknown): Promise<string> {
  const res = await fetch("/api/rooms", {
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
}

export async function joinRoom(code: string, playerId: string, name: string): Promise<RoomState> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, name }),
  });
  if (!res.ok) throw new Error(`join failed: ${res.status}`);
  const body = (await res.json()) as { room: RoomInfo; players: RoomState["players"] };
  const stateRes = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
  if (!stateRes.ok) throw new Error(`state failed: ${stateRes.status}`);
  return (await stateRes.json()) as RoomState;
}

export async function startRoom(code: string): Promise<void> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/start`, { method: "POST" });
  if (!res.ok) throw new Error(`start failed: ${res.status}`);
}
