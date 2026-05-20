import type { ScanPayloadV1 } from "@qr-relay/core";

export type EdgeCaseId =
  | "replay-nonce"
  | "stale-ts"
  | "future-ts"
  | "wrong-rid"
  | "self-scan"
  | "unknown-pid"
  | "invalid-data"
  | "malformed-json"
  | "scan-while-ready"
  | "host-scan";

export type EdgeCase = {
  id: EdgeCaseId;
  label: string;
  /** What the user has to set up beforehand for this case to fire usefully. */
  precondition?: string;
};

export const EDGE_CASES: EdgeCase[] = [
  { id: "replay-nonce", label: "replay nonce", precondition: "1 件以上成功した scan が必要" },
  { id: "stale-ts", label: "stale ts (古いタイムスタンプ)" },
  { id: "future-ts", label: "future ts (未来のタイムスタンプ)" },
  { id: "wrong-rid", label: "wrong rid" },
  { id: "self-scan", label: "self scan (自分を scan)" },
  { id: "unknown-pid", label: "unknown player" },
  { id: "invalid-data", label: "invalid payload data" },
  { id: "malformed-json", label: "malformed json (生テキスト送信)" },
  {
    id: "scan-while-ready",
    label: "scan while not running",
    precondition: "phase=ready/paused 状態で発火",
  },
  { id: "host-scan", label: "host が scan", precondition: "role=host で join した bot が必要" },
];

export type EdgeCaseContext = {
  rid: string;
  scannerId: string;
  targetId: string;
  now: number;
  lastSuccessNonce: string | null;
  nonce: () => string;
};

export type EdgeCasePayload =
  | { kind: "scan"; payload: ScanPayloadV1 }
  | { kind: "raw"; text: string }
  | { kind: "unavailable"; reason: string };

const TS_WINDOW_MS = 60_000;
const STALE_OFFSET_MS = 120_000;
const FUTURE_OFFSET_MS = 120_000;

function basePayload(ctx: EdgeCaseContext): ScanPayloadV1 {
  return {
    v: 1,
    rid: ctx.rid,
    pid: ctx.targetId,
    ts: ctx.now,
    nonce: ctx.nonce(),
  };
}

export function buildEdgeCasePayload(id: EdgeCaseId, ctx: EdgeCaseContext): EdgeCasePayload {
  switch (id) {
    case "replay-nonce": {
      if (!ctx.lastSuccessNonce) {
        return {
          kind: "unavailable",
          reason: "成功した scan が無いと replay できません。先に 1 件成功させてください。",
        };
      }
      return { kind: "scan", payload: { ...basePayload(ctx), nonce: ctx.lastSuccessNonce } };
    }
    case "stale-ts":
      return { kind: "scan", payload: { ...basePayload(ctx), ts: ctx.now - STALE_OFFSET_MS } };
    case "future-ts":
      return { kind: "scan", payload: { ...basePayload(ctx), ts: ctx.now + FUTURE_OFFSET_MS } };
    case "wrong-rid":
      // Server doesn't validate rid against the room directly, but with a wrong
      // rid the QR isn't part of this room — the closest server reaction is
      // "unknown player" once we couple it with a non-participant pid.
      return {
        kind: "scan",
        payload: { ...basePayload(ctx), rid: "ZZZZZZ", pid: `ghost-${ctx.nonce()}` },
      };
    case "self-scan":
      return { kind: "scan", payload: { ...basePayload(ctx), pid: ctx.scannerId } };
    case "unknown-pid":
      return { kind: "scan", payload: { ...basePayload(ctx), pid: `ghost-${ctx.nonce()}` } };
    case "invalid-data":
      return {
        kind: "scan",
        payload: { ...basePayload(ctx), data: { __debug_invalid__: 1, garbage: true } },
      };
    case "malformed-json":
      return { kind: "raw", text: "<not json>" };
    case "scan-while-ready":
      // Same shape as a valid scan; the server side will reject because
      // phase != running. UI is responsible for setting phase first.
      return { kind: "scan", payload: basePayload(ctx) };
    case "host-scan":
      // Host scanner case — UI must pick a host-role bot before calling.
      // Payload itself is well-formed.
      return { kind: "scan", payload: basePayload(ctx) };
  }
  // exhaustiveness guard
  const _exhaustive: never = id;
  throw new Error(`unknown edge case: ${_exhaustive as string}`);
}

const EXPECTED_ERRORS: Record<EdgeCaseId, string> = {
  "replay-nonce": "duplicate nonce",
  "stale-ts": "timestamp out of window",
  "future-ts": "timestamp out of window",
  "wrong-rid": "unknown player",
  "self-scan": "cannot scan self",
  "unknown-pid": "unknown player",
  "invalid-data": "invalid payload data",
  "malformed-json": "invalid json / invalid message",
  "scan-while-ready": "game is not running",
  "host-scan": "host cannot scan",
};

export function describeExpectedServerError(id: EdgeCaseId): string {
  return EXPECTED_ERRORS[id];
}
