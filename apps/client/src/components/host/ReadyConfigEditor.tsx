import type { Phase } from "@qr-relay/core";
import type { ScanRule } from "@qr-relay/handlers";
import { ScanRule as ScanRuleSchema } from "@qr-relay/handlers";
import { Card } from "@qr-relay/ui/card";
import { useEffect, useId, useRef, useState } from "react";
import type { RoomInfo } from "../../lib/api-client.js";
import { updateRoomConfig } from "../../lib/api.js";
import { useWs } from "../../lib/ws.js";

type PlayerLite = { id: string; name: string; joinedAt: number };

type Props = {
  code: string;
  /**
   * Host's player id. Sent to `POST /api/rooms/:code/config` as proof of
   * authority; the server rejects with 403 if this does not match
   * `room.hostId`. Pass the host's own playerId from production routes;
   * debug consoles may pass `room.hostId` (server cannot tell the
   * difference, but debug already has full operator access).
   */
  playerId: string | null | undefined;
  /**
   * Overrides for callers that use their own zustand store instance (e.g.
   * DebugRoom builds a private store with `createWsStore`, so the global
   * `useWs` would be stale there). Default null/empty → read from `useWs`.
   */
  room?: RoomInfo | null;
  phase?: Phase;
  players?: PlayerLite[];
};

const AUTO_VALUE = "__auto__";

function parseRule(raw: unknown): ScanRule | null {
  const parsed = ScanRuleSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function defaultAmountFor(rule: ScanRule): number {
  if (rule.initial.amount !== undefined) return rule.initial.amount;
  if (rule.value.kind === "score") return rule.value.defaultAmount ?? 0;
  return 0;
}

/**
 * Ready-phase config editor. Lets the host override the auto-pick "first
 * holder" (preset `initial.holders === "one"`) and the initial amount for
 * score-based presets. Hidden in any other phase — the server enforces the
 * same guard, but we don't even show controls to avoid implying they'd work.
 *
 * relay handler 限定 (他 handler は ScanRule 形では無いので「設定なし」表示)。
 */
export function ReadyConfigEditor({
  code,
  playerId,
  room: roomProp,
  phase: phaseProp,
  players: playersProp,
}: Props) {
  const roomFromStore = useWs((s) => s.room);
  const phaseFromStore = useWs((s) => s.phase);
  const playersFromStore = useWs((s) => s.players);
  const room = roomProp !== undefined ? roomProp : roomFromStore;
  const phase = phaseProp ?? phaseFromStore;
  const players = playersProp ?? playersFromStore;

  const holderSelectId = useId();
  const amountInputId = useId();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Controlled draft for the amount input. Syncs from the current rule
  // whenever the server publishes a new room broadcast AND the user is not
  // mid-edit (`focused === false`). Without this, a `defaultValue`-based
  // uncontrolled input would silently overwrite fresher server state on
  // blur with the value that was rendered at mount.
  const currentAmount = room && room.handlerId === "relay" ? (() => {
    const rule = parseRule(room.handlerConfig);
    return rule ? defaultAmountFor(rule) : 0;
  })() : 0;
  const [amountDraft, setAmountDraft] = useState<string>(String(currentAmount));
  const [amountFocused, setAmountFocused] = useState(false);
  const lastSyncedAmountRef = useRef<number>(currentAmount);

  useEffect(() => {
    if (amountFocused) return;
    if (lastSyncedAmountRef.current === currentAmount) return;
    lastSyncedAmountRef.current = currentAmount;
    setAmountDraft(String(currentAmount));
  }, [currentAmount, amountFocused]);

  if (phase.kind !== "ready") return null;
  if (!room || room.handlerId !== "relay") return null;
  if (typeof playerId !== "string" || playerId.length === 0) return null;

  const rule = parseRule(room.handlerConfig);
  if (!rule) return null;

  const send = async (patch: unknown) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateRoomConfig(code, playerId, patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const holders = rule.initial.holders;
  const showHolderSelect = holders === "one" || Array.isArray(holders);
  const showAmountInput = rule.value.kind === "score" && holders !== "none";

  const selectedHolder = (() => {
    if (Array.isArray(holders) && holders.length === 1) return holders[0] ?? AUTO_VALUE;
    return AUTO_VALUE;
  })();

  const onHolderChange = (next: string) => {
    if (next === AUTO_VALUE) {
      void send({ initial: { holders: "one" } });
      return;
    }
    void send({ initial: { holders: [next] } });
  };

  const commitAmount = () => {
    setAmountFocused(false);
    const v = Number(amountDraft);
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
      // invalid input → snap draft back to authoritative current
      setAmountDraft(String(currentAmount));
      return;
    }
    if (v === currentAmount) return;
    lastSyncedAmountRef.current = v;
    void send({ initial: { amount: v } });
  };

  if (!showHolderSelect && !showAmountInput) return null;

  return (
    <Card className="flex flex-col gap-3" data-testid="ready-config-editor">
      <h2 className="m-0 text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
        スタート前の設定
      </h2>

      {showHolderSelect && (
        <label className="flex flex-col gap-1.5" htmlFor={holderSelectId}>
          <span className="text-xs font-bold text-foreground/85">最初の保持者</span>
          <select
            id={holderSelectId}
            value={selectedHolder}
            onChange={(e) => onHolderChange(e.target.value)}
            disabled={busy}
            className="rounded-[var(--radius-md)] border border-border bg-background px-3 py-2 text-sm"
          >
            <option value={AUTO_VALUE}>(自動: 最初の参加者)</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {Array.isArray(holders) && holders.length > 1 && (
            <span className="text-[11px] text-muted-foreground">
              現在 {holders.length} 人指定中 (複数指定は API 経由のみ)
            </span>
          )}
        </label>
      )}

      {showAmountInput && (
        <label className="flex flex-col gap-1.5" htmlFor={amountInputId}>
          <span className="text-xs font-bold text-foreground/85">初期点数</span>
          <input
            id={amountInputId}
            type="number"
            min={0}
            step={1}
            value={amountDraft}
            disabled={busy}
            onFocus={() => setAmountFocused(true)}
            onChange={(e) => setAmountDraft(e.target.value)}
            onBlur={commitAmount}
            className="rounded-[var(--radius-md)] border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive"
        >
          {error}
        </div>
      )}
    </Card>
  );
}
