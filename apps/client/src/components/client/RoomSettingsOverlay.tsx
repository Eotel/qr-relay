import { Button } from "@qr-relay/ui/button";
import { cn } from "@qr-relay/ui/cn";
import { Settings, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { JoinQrDisplay, joinUrlFor } from "../JoinQrDisplay.js";

type OverlayProps = {
  open: boolean;
  onClose: () => void;
  code: string;
  playerName: string;
  /**
   * Called with the user's chosen nickname after they submit. Caller is
   * responsible for collision resolution (resolveNickname) and persistence.
   */
  onRename: (name: string) => void;
};

/**
 * Client-side "room settings" overlay. Opens from the gear FAB in ClientRoom
 * and bundles the two things a player ever needs to adjust mid-match:
 *
 *   1. their own nickname (top — identity comes first)
 *   2. the room-share QR + URL (below — sending a friend in is secondary)
 *
 * The original "share-only" framing was misleading: the FAB icon was a Share
 * glyph but the overlay also let you rename yourself. A gear is the honest
 * affordance.
 *
 * Visual contract mirrors JoinScannerOverlay: fixed inset-0 + role="dialog" +
 * aria-modal="true", no glass/blur (DESIGN.md禁則).
 */
export function RoomSettingsOverlay({ open, onClose, code, playerName, onRename }: OverlayProps) {
  const labelId = useId();
  const [draft, setDraft] = useState(playerName);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const url = joinUrlFor(code);

  // Sync draft when the source name changes (e.g. external rename) and on open
  // so the user always starts from the current value.
  useEffect(() => {
    if (open) setDraft(playerName);
  }, [open, playerName]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    closeBtnRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = draft.trim();
    if (!next || next === playerName) {
      onClose();
      return;
    }
    onRename(next);
    onClose();
  };

  return (
    <div
      // biome-ignore lint/a11y/useSemanticElements: native <dialog> brings top-layer / inert-backdrop
      //   semantics that fight the in-flow scanner + inactivity overlays already on the page.
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center",
        "p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
        "sm:items-center",
      )}
    >
      <button
        type="button"
        aria-label="閉じる"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60"
      />
      <div
        className={cn(
          "relative flex w-full max-w-[420px] flex-col gap-4 rounded-[var(--radius-lg)] bg-card p-5 text-card-foreground",
          "border border-border shadow-[var(--shadow-card)]",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id={labelId} className="m-0 text-base font-extrabold tracking-tight">
            ルーム設定
          </h2>
          <Button
            ref={closeBtnRef}
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="閉じる"
          >
            <X size={20} />
          </Button>
        </div>

        {/* Nickname first: the player's own identity is the primary thing they
            adjust here. Save/Cancel only act on the rename — the QR section
            below has no save state of its own. */}
        <form className="flex flex-col gap-2" onSubmit={onSubmit}>
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            ニックネーム
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="ニックネーム"
              maxLength={40}
              autoCorrect="off"
              className="h-11 rounded-[var(--radius-md)] border-2 border-border bg-background px-3 text-base font-bold text-foreground outline-none focus-visible:border-ring"
            />
          </label>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="submit" onClick={onClose}>
              <span>キャンセル</span>
            </Button>
            <Button type="submit" variant="primary" size="submit">
              <span>保存</span>
            </Button>
          </div>
        </form>

        {/* Room share lives below the rename form: handing a friend the invite
            QR is the secondary thing you do in this overlay, not the headline. */}
        <section
          aria-label="ルームをシェア"
          className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] border border-border bg-background p-3"
        >
          <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
            ルームをシェア
          </span>
          <strong className="text-[28px] font-black leading-none tracking-[0.18em]">{code}</strong>
          <div className="flex aspect-square w-full max-w-[220px] items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-white">
            <JoinQrDisplay code={code} />
          </div>
          <p className="m-0 text-center text-xs font-bold text-foreground/85">
            この QR で同じルームに参加できます
          </p>
          <p className="m-0 break-all text-center text-[11px] font-medium text-foreground/70">
            {url}
          </p>
        </section>
      </div>
    </div>
  );
}

type FabProps = {
  onClick: () => void;
};

/**
 * Floating action button that opens RoomSettingsOverlay. Pinned bottom-right
 * with safe-area-inset respect; touch target floor is 44px
 * (`pointer-coarse:size-14` gives a 56px tile, well above PRODUCT.md's
 * --tap-min). Sits on z-30 so the scanner / inactivity overlays (z-50) can
 * still cover it.
 *
 * The gear icon honestly advertises what the overlay does: nickname edit +
 * room share. A share glyph would be a lie about the rename behavior inside.
 */
export function RoomSettingsFab({ onClick }: FabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="ルーム設定"
      className={cn(
        "fixed z-30 inline-flex size-12 items-center justify-center rounded-full",
        "right-[calc(env(safe-area-inset-right)+1rem)] bottom-[calc(env(safe-area-inset-bottom)+1rem)]",
        "pointer-coarse:size-14",
        "bg-primary text-primary-foreground shadow-[var(--shadow-cta-primary)]",
        "transition-transform duration-[80ms] ease-out active:scale-[0.97]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      <Settings size={20} aria-hidden />
    </button>
  );
}
