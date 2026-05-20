import type { ScanPayloadV1 } from "@qr-relay/core";

export type AutonomyMode =
  | { kind: "idle" }
  | { kind: "random" }
  | { kind: "roundRobin" }
  | { kind: "target"; targetId: string }
  | { kind: "tokenChase" };

export type AutonomyConfig = {
  mode: AutonomyMode;
  intervalMs: number;
  stopAfter: number | null;
  sentInRun: number;
};

export type EventLogItem =
  | {
      kind: "recv";
      ts: number;
      type: string;
      summary: string;
      payload: unknown;
    }
  | {
      kind: "send";
      ts: number;
      botId: string;
      botName: string;
      payload: ScanPayloadV1 | { raw: string };
      summary: string;
    };
