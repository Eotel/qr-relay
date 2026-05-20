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

/**
 * Partial 用 schema。`POST /api/rooms/:code/config` で host が ready phase 中に
 * `initial.holders` / `initial.amount` だけをピンポイントで上書きするために
 * 使う。スコープは **意図的に narrow** にしてあり、`value` / `onScan` /
 * `constraints` を ready 中に書き換える経路は提供しない (preset 選択時に
 * 凍結される)。広範な編集が必要になったら別 endpoint + 別 schema を
 * 切るほうが安全。`.strict()` で未知キーを拒否する。
 */
export const ScanRulePatch = z
  .object({
    initial: z
      .object({
        holders: z
          .union([z.literal("all"), z.literal("one"), z.literal("none"), z.array(z.string())])
          .optional(),
        amount: z.number().int().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ScanRulePatch = z.infer<typeof ScanRulePatch>;

export type MergeScanRuleResult =
  | { ok: true; merged: ScanRule }
  | { ok: false; issues: z.ZodIssue[] };

function pickDefined<T extends Record<string, unknown>>(o: T | undefined): Partial<T> {
  if (!o) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

/**
 * Apply a partial patch to a known-valid ScanRule. The patch is intentionally
 * scoped to `initial.holders` / `initial.amount` (see `ScanRulePatch`); other
 * sections of the rule cannot be edited through this path. The merged
 * candidate is re-validated against the full `ScanRule` schema so any
 * combination that would break invariants surfaces as 400 + issues.
 */
export function mergeScanRule(current: ScanRule, patch: unknown): MergeScanRuleResult {
  const parsed = ScanRulePatch.safeParse(patch);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues };
  const p = parsed.data;

  const candidate: ScanRule = {
    ...current,
    initial: { ...current.initial, ...pickDefined(p.initial) },
  };

  const validated = ScanRule.safeParse(candidate);
  if (!validated.success) return { ok: false, issues: validated.error.issues };
  return { ok: true, merged: validated.data };
}
