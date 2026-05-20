import type { RelayState, ValueSlot } from "@qr-relay/handlers";

/**
 * True when `selfId` currently holds a `token` value slot.
 *
 * Narrows `unknown` ws-store state to RelayState shape without trusting the
 * server (handlers can ship different state shapes). Returns false for score
 * slots, missing players, and malformed input.
 *
 * Derives from `state.values`, not the "保持中" metric label, so the check
 * survives copy / localization changes.
 */
export function isTokenHolder(state: unknown, selfId: string | null | undefined): boolean {
  if (!selfId) return false;
  if (!state || typeof state !== "object") return false;

  const values = (state as { values?: unknown }).values;
  if (!values || typeof values !== "object") return false;

  const slot = (values as Record<string, ValueSlot | undefined>)[selfId];
  return slot?.kind === "token" && slot.has === true;
}

export type { RelayState, ValueSlot };
