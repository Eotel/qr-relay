import type { Preset } from "@qr-relay/handlers";
import { AppTitle } from "@qr-relay/ui/app-title";
import { Button } from "@qr-relay/ui/button";
import { Card } from "@qr-relay/ui/card";
import { cn } from "@qr-relay/ui/cn";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom, joinRoom, listHandlersAndPresets } from "../lib/api.js";
import { ensurePlayerName, getPlayerId, setRecentHostCode, setRole } from "../lib/identity.js";

type LoadState = "loading" | "ready" | "error";

export function NewRoom() {
  const navigate = useNavigate();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Track preset-load state separately from `presets.length` so the empty
     grid during a cold Worker start (PRODUCT.md: ">3s で待機 UI を出す")
     reads as "loading" rather than "no presets exist". */
  const [loadState, setLoadState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    listHandlersAndPresets()
      .then((data) => {
        if (cancelled) return;
        setPresets(data.presets);
        if (data.presets[0]) setSelected(data.presets[0].id);
        setLoadState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onCreate = async () => {
    const preset = presets.find((p) => p.id === selected);
    if (!preset) return;
    setCreating(true);
    setError(null);
    try {
      const code = await createRoom("relay", preset.rule);
      // Mark this device as the host BEFORE navigating so RoomLayout's role
      // lookup resolves on first render and we go straight into HostRoom.
      setRole(code, "host");
      // Remember for Home's "前回のホストルームに戻る" CTA, so a closed tab /
      // PWA cold start can come back in one tap.
      setRecentHostCode(code);
      await joinRoom(code, getPlayerId(), ensurePlayerName(), "host");
      // Host lands on `/r/CODE/host` so the URL bar visibly differs from a
      // client's `/r/CODE`. Intent-only — RoomLayout still trusts the
      // localStorage host claim set above (see acceptInviteRole in identity.ts).
      navigate(`/r/${encodeURIComponent(code)}/host`);
    } catch (err) {
      setError(String(err));
      setCreating(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-8">
      <AppTitle main="ルームを作る" sub="プリセットを選んでコードを共有" align="left" />

      {error && (
        <Card
          role="alert"
          className="border border-destructive/40 bg-destructive/10 text-sm font-bold text-destructive"
        >
          {error}
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
          プリセットを選ぶ
        </h2>
        {loadState === "loading" && (
          <div
            aria-live="polite"
            className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5"
          >
            <span className="sr-only">プリセットを読み込み中</span>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                aria-hidden
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-[var(--radius-md)] border-2 border-border bg-muted/20 p-3",
                  "h-[68px]",
                )}
              >
                <span className="block h-3 w-1/2 rounded-sm bg-muted/60" />
                <span className="block h-2 w-4/5 rounded-sm bg-muted/40" />
              </div>
            ))}
          </div>
        )}
        {loadState === "ready" && presets.length === 0 && (
          <p className="m-0 text-sm text-foreground/85">
            利用できるプリセットがありません。少し待ってからもう一度お試しください。
          </p>
        )}
        {loadState === "ready" && presets.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
            {presets.map((p) => {
              const active = selected === p.id;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex flex-col items-start gap-1.5 rounded-[var(--radius-md)] border-2 p-3 text-left",
                    "transition-colors duration-150 ease-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    active
                      ? "border-primary bg-primary/10 text-foreground shadow-[var(--shadow-cta-primary)]"
                      : "border-border bg-card text-foreground hover:bg-muted/30",
                  )}
                >
                  <span className="text-base font-extrabold leading-tight">{p.name}</span>
                  <span className="text-xs font-medium leading-snug text-foreground/80">
                    {p.description}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="submit"
          onClick={() => navigate("/")}
          className="w-auto"
        >
          <ArrowLeft size={16} />
          <span>戻る</span>
        </Button>
        <Button
          type="button"
          variant="primary"
          size="submit"
          disabled={!selected || creating}
          onClick={onCreate}
          className="w-auto"
        >
          <span>{creating ? "作成中…" : "このプリセットで作成"}</span>
          {!creating && <ArrowRight size={16} />}
        </Button>
      </div>
    </main>
  );
}
