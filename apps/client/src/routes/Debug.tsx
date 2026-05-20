import type { Preset } from "@qr-relay/handlers";
import { Button } from "@qr-relay/ui/button";
import { Card } from "@qr-relay/ui/card";
import { cn } from "@qr-relay/ui/cn";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom, listHandlersAndPresets } from "../lib/api.js";

type LoadState = "loading" | "ready" | "error";

export function Debug() {
  const navigate = useNavigate();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");

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
      navigate(`/debug/${encodeURIComponent(code)}`);
    } catch (err) {
      setError(String(err));
      setCreating(false);
    }
  };

  const onJoinExisting = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim();
    if (!code) return;
    navigate(`/debug/${encodeURIComponent(code)}`);
  };

  return (
    <main className="mx-auto flex max-w-[960px] flex-col gap-5 px-4 pt-6 pb-8">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
          dev only — bot console
        </p>
        <h1 className="m-0 text-2xl font-extrabold">/debug</h1>
        <p className="m-0 text-sm text-foreground/80">
          実機を増やさずに room を flush するためのラボ。本番ビルドからは除外される。
        </p>
      </header>

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
          既存 room に接続
        </h2>
        <form onSubmit={onJoinExisting} className="flex items-center gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ROOMCODE"
            className="h-11 flex-1 rounded-[var(--radius-md)] border-2 border-border bg-card px-3 font-mono text-base tracking-[0.18em] uppercase focus:outline-none focus:ring-2 focus:ring-ring"
            maxLength={12}
          />
          <Button type="submit" variant="primary" size="submit" className="w-auto" disabled={!joinCode.trim()}>
            接続
          </Button>
        </form>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
          新規 room を作成
        </h2>
        {loadState === "loading" && (
          <p className="m-0 text-sm text-muted-foreground" aria-live="polite">
            プリセットを読み込み中…
          </p>
        )}
        {loadState === "ready" && presets.length === 0 && (
          <p className="m-0 text-sm text-foreground/85">
            利用できるプリセットがありません。
          </p>
        )}
        {loadState === "ready" && presets.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
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
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted/30",
                  )}
                >
                  <span className="text-base font-extrabold leading-tight">{p.name}</span>
                  <span className="text-xs leading-snug text-foreground/80">
                    {p.description}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="primary"
            size="submit"
            className="w-auto"
            disabled={!selected || creating}
            onClick={onCreate}
          >
            {creating ? "作成中…" : "この preset で room を作る"}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-2 text-xs text-foreground/80">
        <p className="m-0 font-bold uppercase tracking-[0.12em] text-muted-foreground">
          tips
        </p>
        <ul className="m-0 list-disc space-y-1 pl-5">
          <li>
            短命な inactivity 動作を確認したいときは server を{" "}
            <code className="font-mono">INACTIVITY_WARN_MS=30000 INACTIVITY_CLOSE_MS=60000</code>{" "}
            で起動する。
          </li>
          <li>
            bot は常に <code className="font-mono">bot-</code> prefix で識別される。
          </li>
          <li>本番 build からは <code className="font-mono">/debug</code> 系ルートが除外される。</li>
        </ul>
      </Card>
    </main>
  );
}
