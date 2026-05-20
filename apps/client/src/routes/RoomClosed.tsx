import { Button } from "@qr-relay/ui/button";
import { Card } from "@qr-relay/ui/card";
import { Home as HomeIcon } from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useWs } from "../lib/ws.js";

/**
 * Terminal screen shown after the server closes a room (currently only the
 * inactivity timer reaches this state). Standalone — no live room connection,
 * no auth, just the explanation + a path back home. Clears the WS store's
 * `closed` flag on unmount so a future visit doesn't re-trigger navigation.
 */
export function RoomClosed() {
  const { code = "" } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const clearClosed = useWs((s) => s.clearClosed);

  useEffect(() => {
    return () => {
      clearClosed();
    };
  }, [clearClosed]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center gap-4 px-4 py-8">
      <Card className="w-full p-6 text-center">
        <h1 className="text-xl font-extrabold tracking-tight">ルームを終了しました</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          一定時間操作がなかったため、ルーム
          <strong className="mx-1 font-extrabold tracking-[0.14em]">{code}</strong>
          を自動で閉じました。
        </p>
        <Button
          type="button"
          variant="primary"
          size="cta"
          className="mt-6"
          onClick={() => navigate("/", { replace: true })}
        >
          <HomeIcon size={16} aria-hidden />
          ホームへ戻る
        </Button>
      </Card>
    </main>
  );
}
