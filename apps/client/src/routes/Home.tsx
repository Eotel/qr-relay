import { AppTitle } from "@qr-relay/ui/app-title";
import { Button } from "@qr-relay/ui/button";
import { Card } from "@qr-relay/ui/card";
import { RoleCard } from "@qr-relay/ui/role-card";
import { LogIn, Monitor, QrCode, UserPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HomeFaq } from "../components/HomeFaq.js";
import { JoinScannerOverlay } from "../components/JoinScannerOverlay.js";
import { getRoom } from "../lib/api.js";
import {
  ensurePlayerName,
  getPlayerId,
  getPlayerName,
  setPlayerName,
  setRole,
} from "../lib/identity.js";
import { resolveNickname } from "../lib/nickname.js";

export function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState(getPlayerName());
  const [scannerOpen, setScannerOpen] = useState(false);

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

  const joinAsClient = async (rawCode: string) => {
    const trimmedCode = rawCode.trim().toUpperCase();
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
    setRole(trimmedCode, "client");
    navigate(`/r/${encodeURIComponent(trimmedCode)}`);
  };

  const onJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    await joinAsClient(code);
  };

  const onScanResult = (scanned: string) => {
    setScannerOpen(false);
    void joinAsClient(scanned);
  };

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-8">
      <AppTitle main="QR Relay" sub="スマホをかざして遊ぶ汎用ゲームツール" />

      <Card className="rounded-[var(--radius-md)] border-2 border-dashed border-border bg-muted/20 p-3 text-center">
        <p className="m-0 text-sm font-bold text-muted-foreground">
          使い方: 1台でホストを立ち上げ → 別の端末で QR を読んで参加
        </p>
      </Card>

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
          icon={<Monitor aria-hidden size={18} />}
          title="ホストとして開催"
          desc="この端末でルームを開きます。次の画面で表示される QR を参加者にスキャンしてもらってください。"
          ctaLabel="ホストを立ち上げる"
          ctaIcon={<Monitor aria-hidden size={18} />}
          ctaVariant="host"
          onCtaClick={onCreateHost}
        />

        <RoleCard
          step={2}
          stepVariant="player"
          icon={<UserPlus aria-hidden size={18} />}
          title="プレイヤーとして参加"
          desc="ホスト画面の QR を読み取るか、ルームコードを入力して参加します。"
          ctaLabel="QR コードをスキャン"
          ctaIcon={<QrCode aria-hidden size={18} />}
          ctaVariant="primary"
          onCtaClick={() => setScannerOpen(true)}
        >
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <span aria-hidden className="h-px flex-1 bg-border" />
            または
            <span aria-hidden className="h-px flex-1 bg-border" />
          </div>
          <form className="flex items-end gap-2" onSubmit={onJoinByCode}>
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-bold">
              <span className="sr-only">ルームコード</span>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ルームコード"
                autoCapitalize="characters"
                autoCorrect="off"
                required
                className="h-11 rounded-[var(--radius-md)] border-2 border-border bg-card px-3 text-base font-bold tracking-[0.2em] text-foreground outline-none focus-visible:border-ring"
              />
            </label>
            <Button type="submit" variant="primary" size="submit" className="w-auto">
              <LogIn size={16} />
              <span>参加</span>
            </Button>
          </form>
        </RoleCard>
      </div>

      <HomeFaq />

      <JoinScannerOverlay
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onJoin={onScanResult}
      />
    </main>
  );
}
