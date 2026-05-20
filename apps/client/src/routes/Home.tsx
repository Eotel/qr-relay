import { AppTitle } from "@qr-relay/ui/app-title";
import { Button } from "@qr-relay/ui/button";
import { Card } from "@qr-relay/ui/card";
import { RoleCard } from "@qr-relay/ui/role-card";
import { LogIn, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ensurePlayerName } from "../lib/identity.js";

export function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  const onJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    ensurePlayerName();
    navigate(`/r/${encodeURIComponent(code.trim().toUpperCase())}`);
  };

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-8">
      <AppTitle main="QR Relay" />

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        <RoleCard
          step={1}
          stepVariant="host"
          icon={<Plus aria-hidden size={18} />}
          title="ルームを作る"
          desc="コードを発行して招待。"
          ctaLabel="ルームを作成"
          ctaVariant="host"
          onCtaClick={() => navigate("/new")}
        />

        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="inline-flex size-9 items-center justify-center rounded-full bg-muted/40 text-foreground"
            >
              <LogIn size={18} />
            </span>
            <h3 className="m-0 text-base font-extrabold tracking-tight">ルームに参加</h3>
          </div>
          <p className="m-0 text-sm leading-[1.65] text-muted-foreground">コードを入力して参加。</p>
          <form className="flex flex-col gap-3" onSubmit={onJoin}>
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              ルームコード
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                autoCapitalize="characters"
                autoCorrect="off"
                required
                className="h-11 rounded-[var(--radius-md)] border-2 border-border bg-card px-3 text-base font-bold tracking-[0.2em] text-foreground outline-none focus-visible:border-ring"
              />
            </label>
            <Button type="submit" variant="primary" size="cta">
              <LogIn size={18} />
              <span>参加する</span>
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
