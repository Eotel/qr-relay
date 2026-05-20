import type { GameEvent, Metric, Phase, Player, ScanHandler } from "@qr-relay/core";
import { type ScanPayloadV1, requireHandler } from "@qr-relay/core";
import "@qr-relay/handlers";

export const NONCE_TTL_MS = 5 * 60_000;
export const TS_WINDOW_MS = 60_000;

/** Default: warn after 10 minutes of no activity. */
export const DEFAULT_WARN_AFTER_MS = 10 * 60_000;
/** Default: close after 15 minutes of no activity (= 5 minutes after warning). */
export const DEFAULT_CLOSE_AFTER_MS = 15 * 60_000;

export type AlarmDecision =
  | { kind: "reschedule"; at: number }
  | { kind: "warn"; closeAt: number; rescheduleAt: number }
  | { kind: "close" };

/**
 * Decide what an alarm() fire should do given the last activity time. Pure:
 * caller is responsible for broadcast / storage / setAlarm side effects.
 *
 * - idle < warn: activity happened between scheduling and firing — reschedule
 *   forward to lastActivityAt + warnAfterMs (no broadcast).
 * - warn ≤ idle < close: broadcast `inactivity-warning` and arm the close alarm.
 * - idle ≥ close: close the room.
 */
export function decideAlarmAction(
  lastActivityAt: number,
  now: number,
  warnAfterMs: number,
  closeAfterMs: number,
): AlarmDecision {
  const idle = now - lastActivityAt;
  if (idle < warnAfterMs) {
    return { kind: "reschedule", at: lastActivityAt + warnAfterMs };
  }
  if (idle < closeAfterMs) {
    const closeAt = lastActivityAt + closeAfterMs;
    return { kind: "warn", closeAt, rescheduleAt: closeAt };
  }
  return { kind: "close" };
}

export type RoomMeta = {
  code: string;
  handlerId: string;
  handlerConfig: unknown;
  createdAt: number;
  /**
   * Last time an activity signal touched this room (scan / start / reset /
   * join / keepalive). Used by the inactivity timer to schedule warn → close.
   */
  lastActivityAt: number;
  hostId: string | null;
  phase: Phase;
};

/**
 * Stamp `meta.lastActivityAt = now`. Pure; returns a new Stored so callers
 * can compose without mutating shared state.
 */
export function touchActivity(stored: Stored, now: number): Stored {
  return { ...stored, meta: { ...stored.meta, lastActivityAt: now } };
}

export type PlayerRole = "host" | "client";

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
    lastActivityAt: now,
    hostId: null,
    phase: { kind: "ready" },
  };
  return {
    kind: "ok",
    stored: { meta, players: [], state: undefined },
  };
}

export type JoinInput = {
  playerId: string;
  name: string;
  role: PlayerRole;
};

export function reduceJoin(stored: Stored, input: JoinInput, now: number): Stored {
  if (input.role === "host") {
    const hostId = stored.meta.hostId ?? input.playerId;
    const meta: RoomMeta = { ...stored.meta, hostId, lastActivityAt: now };
    return { ...stored, meta };
  }
  const players = stored.players.slice();
  const existing = players.find((p) => p.id === input.playerId);
  if (!existing) {
    players.push({ id: input.playerId, name: input.name, joinedAt: now });
  } else if (existing.name !== input.name) {
    const idx = players.indexOf(existing);
    players[idx] = { ...existing, name: input.name };
  }
  return touchActivity({ ...stored, players }, now);
}

export type PhaseResult =
  | { kind: "ok"; stored: Stored; metrics: Metric[] }
  | { kind: "error"; message: string };

/** ready → running. ready 以外からは error. */
export function reduceStart(stored: Stored, now: number): PhaseResult {
  if (stored.meta.phase.kind !== "ready") {
    return { kind: "error", message: `cannot start from ${stored.meta.phase.kind}` };
  }
  const handler = requireHandler(stored.meta.handlerId);
  const state = handler.initialState({
    config: stored.meta.handlerConfig,
    players: stored.players,
    now,
  });
  const meta: RoomMeta = {
    ...stored.meta,
    phase: { kind: "running", startedAt: now, accumulatedMs: 0 },
    lastActivityAt: now,
  };
  const next: Stored = { ...stored, meta, state };
  const metrics = handler.metrics({
    state,
    config: stored.meta.handlerConfig,
    players: stored.players,
    now,
  });
  return { kind: "ok", stored: next, metrics };
}

/** running → paused. running 以外からは error. */
export function reducePause(stored: Stored, now: number): PhaseResult {
  const phase = stored.meta.phase;
  if (phase.kind !== "running") {
    return { kind: "error", message: `cannot pause from ${phase.kind}` };
  }
  const accumulatedMs = phase.accumulatedMs + (now - phase.startedAt);
  const meta: RoomMeta = {
    ...stored.meta,
    phase: { kind: "paused", pausedAt: now, accumulatedMs },
  };
  const next: Stored = { ...stored, meta };
  const handler = requireHandler(stored.meta.handlerId);
  const metrics = handler.metrics({
    state:
      next.state ??
      handler.initialState({
        config: stored.meta.handlerConfig,
        players: stored.players,
        now,
      }),
    config: stored.meta.handlerConfig,
    players: stored.players,
    now,
  });
  return { kind: "ok", stored: next, metrics };
}

/** paused → running. paused 以外からは error. */
export function reduceResume(stored: Stored, now: number): PhaseResult {
  const phase = stored.meta.phase;
  if (phase.kind !== "paused") {
    return { kind: "error", message: `cannot resume from ${phase.kind}` };
  }
  const meta: RoomMeta = {
    ...stored.meta,
    phase: { kind: "running", startedAt: now, accumulatedMs: phase.accumulatedMs },
  };
  const next: Stored = { ...stored, meta };
  const handler = requireHandler(stored.meta.handlerId);
  const metrics = handler.metrics({
    state:
      next.state ??
      handler.initialState({
        config: stored.meta.handlerConfig,
        players: stored.players,
        now,
      }),
    config: stored.meta.handlerConfig,
    players: stored.players,
    now,
  });
  return { kind: "ok", stored: next, metrics };
}

/**
 * 任意 phase → ready。state を initialState 直後に戻し accumulatedMs を 0 にする。
 * players / hostId / meta.code 等は維持。
 */
export function reduceReset(stored: Stored, now: number): PhaseResult {
  const handler = requireHandler(stored.meta.handlerId);
  const state = handler.initialState({
    config: stored.meta.handlerConfig,
    players: stored.players,
    now,
  });
  const meta: RoomMeta = { ...stored.meta, phase: { kind: "ready" }, lastActivityAt: now };
  const next: Stored = { ...stored, meta, state: undefined };
  const metrics = handler.metrics({
    state,
    config: stored.meta.handlerConfig,
    players: stored.players,
    now,
  });
  return { kind: "ok", stored: next, metrics };
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

  if (stored.meta.phase.kind !== "running") {
    return {
      kind: "error",
      message: "game is not running",
      recentNonces: input.recentNonces,
    };
  }

  if (stored.meta.hostId !== null && scannerId === stored.meta.hostId) {
    return {
      kind: "error",
      message: "host cannot scan",
      recentNonces: input.recentNonces,
    };
  }

  if (stored.meta.hostId !== null && payload.pid === stored.meta.hostId) {
    return {
      kind: "error",
      message: "cannot scan host",
      recentNonces: input.recentNonces,
    };
  }

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

  const nextStored: Stored = touchActivity({ ...stored, state: result.nextState }, now);
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
