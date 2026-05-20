import { z } from "zod";

/**
 * Relay engine の一元化された設定型。
 *
 * - `value`: プレイヤーが保持する値の種類
 *   - token: boolean 的な保有 (持つ / 持たない)
 *   - score: 数値の累積
 *   - status: 文字列ラベル (例: "oni", "infected", "safe")
 * - `initial`: 初期配布
 * - `onScan`: スキャン時の変化 (source = 被スキャナ, sink = スキャナ)
 * - `constraints`: 適用条件
 * - `end`: 終了条件
 */
export const ScanRule = z.object({
  value: z.union([
    z.object({ kind: z.literal("token") }),
    z.object({ kind: z.literal("score"), defaultAmount: z.number().int().optional() }),
    z.object({ kind: z.literal("status"), defaultStatus: z.string().optional() }),
  ]),

  initial: z.object({
    holders: z.union([z.literal("all"), z.literal("one"), z.literal("none"), z.array(z.string())]),
    amount: z.number().int().optional(),
    status: z.string().optional(),
  }),

  onScan: z.object({
    source: z.enum(["keep", "lose", "decrement", "increment", "set-status"]),
    sink: z.enum(["keep", "gain", "increment", "decrement", "set-status"]),
    amount: z.number().int().optional(),
    sourceStatus: z.string().optional(),
    sinkStatus: z.string().optional(),
    swap: z.boolean().optional(),
  }),

  constraints: z
    .object({
      maxValue: z.number().int().optional(),
      minValue: z.number().int().optional(),
      uniquePerPair: z.boolean().optional(),
      requireSourceHas: z.union([z.boolean(), z.string()]).optional(),
      requireSinkLacks: z.union([z.boolean(), z.string()]).optional(),
      direction: z.enum(["scanner-to-scanned", "scanned-to-scanner", "either"]).optional(),
    })
    .optional(),

  end: z
    .union([
      z.object({ kind: z.literal("target"), value: z.number().int().positive() }),
      z.object({ kind: z.literal("all-have-status"), status: z.string() }),
      z.object({ kind: z.literal("only-one-left"), status: z.string() }),
      z.object({ kind: z.literal("timer-ms"), ms: z.number().int().positive() }),
      z.object({ kind: z.literal("manual") }),
    ])
    .optional(),
});

export type ScanRule = z.infer<typeof ScanRule>;

/** プレイヤー単位の値スロット */
export type ValueSlot =
  | { kind: "token"; has: boolean }
  | { kind: "score"; amount: number }
  | { kind: "status"; status: string };

export type RelayState = {
  values: Record<string, ValueSlot>;
  scanCounts: Record<string, number>;
  pairCounts: Record<string, number>; // key: "scannerId>scannedId"
  startedAt: number;
  endedAt: number | null;
  history: { scannerId: string; scannedId: string; ts: number }[];
};

export const ScanRuleData = z.object({
  /** 任意の payload (画像 URL 等)。relay 単体では未使用、carrier 等で拡張 */
  payload: z.unknown().optional(),
});

export type ScanRuleData = z.infer<typeof ScanRuleData>;
