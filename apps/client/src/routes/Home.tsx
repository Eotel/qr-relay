import { AppTitle } from "@qr-relay/ui/app-title";
import { Button } from "@qr-relay/ui/button";
import { Card } from "@qr-relay/ui/card";
import { RoleCard } from "@qr-relay/ui/role-card";
import { LogIn, Monitor, QrCode, RotateCcw, UserPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HomeFaq } from "../components/HomeFaq.js";
import { JoinScannerOverlay } from "../components/JoinScannerOverlay.js";
import { getRoom } from "../lib/api.js";
import {
  clearRecentHostCode,
  ensurePlayerName,
  getPlayerId,
  getPlayerName,
  getRecentHostCode,
  setPlayerName,
  setRole,
} from "../lib/identity.js";
import { resolveNickname } from "../lib/nickname.js";

export function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState(getPlayerName());
  const [scannerOpen, setScannerOpen] = useState(false);
  // Read once at mount: identity.ts is the authority and we only need the
  // initial value. State after that is driven locally by rejoin attempts.
  const [recentHostCode, setRecentHostCodeState] = useState<string | null>(() =>
    getRecentHostCode(),
  );
  const [rejoining, setRejoining] = useState(false);
  const [rejoinError, setRejoinError] = useState<string | null>(null);

  const onRejoinHost = async () => {
    if (!recentHostCode || rejoining) return;
    setRejoining(true);
    setRejoinError(null);
    try {
      // Cheapest liveness probe — the room DO may have been closed by the
      // inactivity timer between sessions, in which case rejoin can't work.
      await getRoom(recentHostCode);
      // Re-affirm the host claim before RoomLayout reads it. Idempotent if it
      // was already set, defensive if localStorage was partially cleared.
      setRole(recentHostCode, "host");
      // Host lands on `/r/CODE/host` to match NewRoom's create flow — keeps
      // the host URL distinct from a client's `/r/CODE`.
      navigate(`/r/${encodeURIComponent(recentHostCode)}/host`);
    } catch {
      clearRecentHostCode(recentHostCode);
      setRecentHostCodeState(null);
      setRejoinError("そのルームは既に終了しています");
      setRejoining(false);
    }
  };

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

      {recentHostCode && (
        <Card className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border-2 border-secondary/40 bg-secondary/10 p-3">
          <div className="flex min-w-0 items-center gap-2">
            <Monitor aria-hidden size={18} className="shrink-0 text-secondary" />
            <div className="flex min-w-0 flex-col">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                前回のホストルーム
              </span>
              <strong className="truncate text-base font-extrabold tracking-[0.2em] text-foreground">
                {recentHostCode}
              </strong>
            </div>
          </div>
          <Button
            type="button"
            variant="host"
            size="submit"
            onClick={onRejoinHost}
            disabled={rejoining}
            className="w-auto shrink-0"
          >
            <RotateCcw size={16} aria-hidden />
            <span>{rejoining ? "確認中…" : "戻る"}</span>
          </Button>
        </Card>
      )}

      {rejoinError && (
        <Card
          role="alert"
          className="border border-destructive/40 bg-destructive/10 p-3 text-sm font-bold text-destructive"
        >
          {rejoinError}
        </Card>
      )}

      <Card className="rounded-[var(--radius-md)] border-2 border-dashed border-border bg-muted/20 p-3 text-center">
        <p className="m-0 text-sm font-bold text-foreground/85">
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
          <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
            <span aria-hidden className="h-px flex-1 bg-border" />
            または
            <span aria-hidden className="h-px flex-1 bg-border" />
          </div>
          <form className="flex items-end gap-2" onSubmit={onJoinByCode}>
            {/* min-w-0 on the label: <input> ships with size=20 (~180px intrinsic
               preferred width). Without min-w-0 the flex-1 label refuses to
               shrink past that, and the 参加 button gets pushed past the card's
               right border on narrow grid columns. */}
            <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-bold">
              <span className="sr-only">ルームコード</span>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ルームコード"
                autoCapitalize="characters"
                autoCorrect="off"
                required
                className="h-11 w-full rounded-[var(--radius-md)] border-2 border-border bg-card px-3 text-base font-bold tracking-[0.2em] text-foreground outline-none focus-visible:border-ring"
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
