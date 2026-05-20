import type { GameEvent, Metric, Player, ScanHandler } from "@qr-relay/core";
import { type ScanPayloadV1, requireHandler } from "@qr-relay/core";
import "@qr-relay/handlers";

export const NONCE_TTL_MS = 5 * 60_000;
export const TS_WINDOW_MS = 60_000;

export type RoomMeta = {
  code: string;
  handlerId: string;
  handlerConfig: unknown;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
};

export type Stored = {
  meta: RoomMeta;
  players: Player[];
  state: unknown;
};

export type InitInput = {
  code: string;
  handlerId: string;
  handlerConfig: unknown;
};

export type InitResult =
  | { kind: "ok"; stored: Stored }
  | { kind: "error"; status: number; body: { error: string; issues?: unknown } };

export function reduceInit(input: InitInput, now: number): InitResult {
  let handler: ScanHandler<unknown, unknown, unknown>;
  try {
    handler = requireHandler(input.handlerId);
  } catch {
    return {
      kind: "error",
      status: 400,
      body: { error: `unknown handler: ${input.handlerId}` },
    };
  }
  const cfg = handler.configSchema.safeParse(input.handlerConfig);
  if (!cfg.success) {
    return {
      kind: "error",
      status: 400,
      body: { error: "invalid handler config", issues: cfg.error.issues },
    };
  }
  const meta: RoomMeta = {
    code: input.code,
    handlerId: input.handlerId,
    handlerConfig: cfg.data,
    createdAt: now,
    startedAt: null,
    endedAt: null,
  };
  return {
    kind: "ok",
    stored: { meta, players: [], state: undefined },
  };
}

export type JoinInput = {
  playerId: string;
  name: string;
};

export function reduceJoin(stored: Stored, input: JoinInput, now: number): Stored {
  const players = stored.players.slice();
  const existing = players.find((p) => p.id === input.playerId);
  if (!existing) {
    players.push({ id: input.playerId, name: input.name, joinedAt: now });
  } else if (existing.name !== input.name) {
    const idx = players.indexOf(existing);
    players[idx] = { ...existing, name: input.name };
  }
  return { ...stored, players };
}

export type StartResult = {
  stored: Stored;
  metrics: Metric[];
};

export function reduceStart(stored: Stored, now: number): StartResult {
  const handler = requireHandler(stored.meta.handlerId);
  const state = handler.initialState({
    config: stored.meta.handlerConfig,
    players: stored.players,
    now,
  });
  const meta: RoomMeta = { ...stored.meta, startedAt: now, endedAt: null };
  const next: Stored = { ...stored, meta, state };
  const metrics = handler.metrics({
    state,
    config: stored.meta.handlerConfig,
    players: stored.players,
    now,
  });
  return { stored: next, metrics };
}

export type GetStateResult = {
  state: unknown;
  metrics: Metric[];
};

export function computeStateAndMetrics(stored: Stored, now: number): GetStateResult {
  const handler = requireHandler(stored.meta.handlerId);
  const state =
    stored.state ??
    handler.initialState({
      config: stored.meta.handlerConfig,
      players: stored.players,
      now,
    });
  const metrics = handler.metrics({
    state,
    config: stored.meta.handlerConfig,
    players: stored.players,
    now,
  });
  return { state, metrics };
}

export type ScanInput = {
  stored: Stored;
  scannerId: string;
  payload: typeof ScanPayloadV1._type;
  recentNonces: Map<string, number>;
  now: number;
};

export type ScanResult =
  | {
      kind: "error";
      message: string;
      recentNonces: Map<string, number>;
    }
  | {
      kind: "ok";
      stored: Stored;
      metrics: Metric[];
      events: GameEvent[];
      recentNonces: Map<string, number>;
    };

export function gcNonces(map: Map<string, number>, now: number): Map<string, number> {
  const next = new Map<string, number>();
  for (const [k, exp] of map) {
    if (exp > now) next.set(k, exp);
  }
  return next;
}

export function reduceScan(input: ScanInput): ScanResult {
  const { stored, scannerId, payload, now } = input;

  if (Math.abs(now - payload.ts) > TS_WINDOW_MS) {
    return {
      kind: "error",
      message: "timestamp out of window",
      recentNonces: input.recentNonces,
    };
  }

  const gcd = gcNonces(input.recentNonces, now);
  if (gcd.has(payload.nonce)) {
    return { kind: "error", message: "duplicate nonce", recentNonces: gcd };
  }
  const nextNonces = new Map(gcd);
  nextNonces.set(payload.nonce, now + NONCE_TTL_MS);

  if (payload.pid === scannerId) {
    return { kind: "error", message: "cannot scan self", recentNonces: nextNonces };
  }

  const scanner = stored.players.find((p) => p.id === scannerId);
  const scanned = stored.players.find((p) => p.id === payload.pid);
  if (!scanner || !scanned) {
    return { kind: "error", message: "unknown player", recentNonces: nextNonces };
  }

  const handler = requireHandler(stored.meta.handlerId);
  const dataResult = handler.dataSchema.safeParse(payload.data ?? {});
  if (!dataResult.success) {
    return { kind: "error", message: "invalid payload data", recentNonces: nextNonces };
  }

  const startedAt = stored.meta.startedAt ?? now;
  const initialState =
    stored.state ??
    handler.initialState({
      config: stored.meta.handlerConfig,
      players: stored.players,
      now,
    });

  const result = handler.onScan({
    state: initialState,
    config: stored.meta.handlerConfig,
    scanner,
    scanned,
    payloadData: dataResult.data,
    now,
  });

  const isOver = handler.isOver?.({
    state: result.nextState,
    config: stored.meta.handlerConfig,
    now,
  });
  const meta: RoomMeta = {
    ...stored.meta,
    startedAt,
    endedAt: isOver ? now : stored.meta.endedAt,
  };
  const nextStored: Stored = { ...stored, meta, state: result.nextState };
  const metrics = handler.metrics({
    state: result.nextState,
    config: stored.meta.handlerConfig,
    players: stored.players,
    now,
  });

  return {
    kind: "ok",
    stored: nextStored,
    metrics,
    events: result.events,
    recentNonces: nextNonces,
  };
}
