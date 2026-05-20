export type Player = {
  id: string;
  name: string;
  joinedAt: number;
};

export type Room = {
  code: string;
  handlerId: string;
  handlerConfig: unknown;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
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
