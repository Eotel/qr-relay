import type { Preset } from "@qr-relay/handlers";
import { AppTitle } from "@qr-relay/ui/app-title";
import { Button } from "@qr-relay/ui/button";
import { Card } from "@qr-relay/ui/card";
import { cn } from "@qr-relay/ui/cn";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom, listHandlersAndPresets } from "../lib/api.js";

export function NewRoom() {
  const navigate = useNavigate();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listHandlersAndPresets()
      .then((data) => {
        setPresets(data.presets);
        if (data.presets[0]) setSelected(data.presets[0].id);
      })
      .catch((err) => setError(String(err)));
  }, []);

  const onCreate = async () => {
    const preset = presets.find((p) => p.id === selected);
    if (!preset) return;
    setCreating(true);
    setError(null);
    try {
      const code = await createRoom("relay", preset.rule);
      navigate(`/r/${encodeURIComponent(code)}`);
    } catch (err) {
      setError(String(err));
      setCreating(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-8">
      <AppTitle main="ルームを作る" sub="プリセットを選んでコードを共有" align="left" />

      {error && (
        <Card className="border border-destructive/40 bg-destructive/10 text-sm font-bold text-destructive">
          {error}
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
          プリセットを選ぶ
        </h2>
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
                <span className="text-xs leading-snug text-muted-foreground">{p.description}</span>
              </button>
            );
          })}
        </div>
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
