import { z } from "zod";

/**
 * Relay engine の一元化された設定型。
 *
 * - `value`: プレイヤーが保持する値の種類
 *   - token: boolean 的な保有 (持つ / 持たない)
 *   - score: 数値の累積
 * - `initial`: 初期配布
 * - `onScan`: スキャン時の変化 (source = 被スキャナ, sink = スキャナ)
 * - `constraints`: 適用条件
 *
 * 開始 / 一時停止 / 終了などのフェーズ概念は engine の責務ではない
 * (ADR-0002 / ADR-0003: ゲーム制御層で管理)。
 */
export const ScanRule = z.object({
  value: z.union([
    z.object({ kind: z.literal("token") }),
    z.object({ kind: z.literal("score"), defaultAmount: z.number().int().optional() }),
  ]),

  initial: z.object({
    holders: z.union([z.literal("all"), z.literal("one"), z.literal("none"), z.array(z.string())]),
    amount: z.number().int().optional(),
  }),

  onScan: z.object({
    source: z.enum(["keep", "lose", "decrement", "increment"]),
    sink: z.enum(["keep", "gain", "increment", "decrement"]),
    amount: z.number().int().optional(),
  }),

  constraints: z
    .object({
      maxValue: z.number().int().optional(),
      minValue: z.number().int().optional(),
      uniquePerPair: z.boolean().optional(),
      requireSourceHas: z.boolean().optional(),
      requireSinkLacks: z.boolean().optional(),
      direction: z.enum(["scanner-to-scanned", "scanned-to-scanner", "either"]).optional(),
    })
    .optional(),
});

export type ScanRule = z.infer<typeof ScanRule>;

/** プレイヤー単位の値スロット */
export type ValueSlot = { kind: "token"; has: boolean } | { kind: "score"; amount: number };

export type RelayState = {
  values: Record<string, ValueSlot>;
  scanCounts: Record<string, number>;
  pairCounts: Record<string, number>; // key: "scannerId>scannedId"
  history: { scannerId: string; scannedId: string; ts: number }[];
};

export const ScanRuleData = z.object({
  /** 任意の payload (画像 URL 等)。relay 単体では未使用、carrier 等で拡張 */
  payload: z.unknown().optional(),
});

export type ScanRuleData = z.infer<typeof ScanRuleData>;
