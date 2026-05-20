export type Player = {
  id: string;
  name: string;
  joinedAt: number;
};

/**
 * Game phase state machine (ADR-0003).
 *
 * - `ready`: 開始前 / リセット直後
 * - `running`: 進行中。`accumulatedMs + (now - startedAt)` がストップウォッチ表示
 * - `paused`: 中断中。`accumulatedMs` がそのまま表示。scan は server で no-op
 */
export type Phase =
  | { kind: "ready" }
  | { kind: "running"; startedAt: number; accumulatedMs: number }
  | { kind: "paused"; pausedAt: number; accumulatedMs: number };

export type Room = {
  code: string;
  handlerId: string;
  handlerConfig: unknown;
  createdAt: number;
  hostId: string | null;
  phase: Phase;
};

export type Metric =
  | {
      kind: "time";
      label: string;
      ms: number;
      byPlayer?: Record<string, number>;
    }
  | {
      kind: "count";
      label: string;
      total: number;
      byPlayer?: Record<string, number>;
    }
  | {
      kind: "score";
      label: string;
      byPlayer: Record<string, number>;
    };

export type GameEvent =
  | {
      kind: "scan";
      scannerId: string;
      scannedId: string;
      ts: number;
      detail?: Record<string, unknown>;
    }
  | { kind: "round-start"; ts: number }
  | { kind: "round-end"; ts: number; winnerIds?: string[] }
  | { kind: "info"; ts: number; message: string };
