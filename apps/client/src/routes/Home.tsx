import { AppTitle } from "@qr-relay/ui/app-title";
import { Button } from "@qr-relay/ui/button";
import { Card } from "@qr-relay/ui/card";
import { RoleCard } from "@qr-relay/ui/role-card";
import { LogIn, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRoom } from "../lib/api.js";
import { ensurePlayerName, getPlayerId, getPlayerName, setPlayerName } from "../lib/identity.js";
import { resolveNickname } from "../lib/nickname.js";

export function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState(getPlayerName());

  const handleNicknameChange = (value: string) => {
    setNickname(value);
    setPlayerName(value);
  };

  const onCreateHost = () => {
    const base = nickname.trim() || ensurePlayerName();
    setPlayerName(base);
    setNickname(base);
    navigate("/new");
  };

  const onJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) return;
    const selfId = getPlayerId();
    const input = nickname.trim();
    let finalName: string;
    try {
      const snap = await getRoom(trimmedCode);
      finalName = resolveNickname({ input, selfId, players: snap.players });
    } catch {
      finalName = input || ensurePlayerName();
    }
    setPlayerName(finalName);
    setNickname(finalName);
    navigate(`/r/${encodeURIComponent(trimmedCode)}`);
  };

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-8">
      <AppTitle main="QR Relay" />

      <Card className="flex flex-col gap-2">
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          ニックネーム
          <input
            type="text"
            value={nickname}
            onChange={(e) => handleNicknameChange(e.target.value)}
            placeholder="未入力ならランダムで自動生成"
            maxLength={40}
            autoCorrect="off"
            className="h-11 rounded-[var(--radius-md)] border-2 border-border bg-card px-3 text-base font-bold text-foreground outline-none focus-visible:border-ring"
          />
        </label>
      </Card>

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        <RoleCard
          step={1}
          stepVariant="host"
          icon={<Plus aria-hidden size={18} />}
          title="ルームを作る"
          desc="コードを発行して招待。"
          ctaLabel="ルームを作成"
          ctaVariant="host"
          onCtaClick={onCreateHost}
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
