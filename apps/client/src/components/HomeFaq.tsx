import { Button } from "@qr-relay/ui/button";
import { cn } from "@qr-relay/ui/cn";
import { Camera, Download, LogIn, Monitor, Play, Plus, QrCode, RefreshCw } from "lucide-react";
import type * as React from "react";
import { useEffect, useState } from "react";
import { promptInstall, subscribeInstallable } from "../lib/install-prompt.js";

const itemClass =
  "group rounded-[var(--radius-lg)] bg-card text-card-foreground shadow-[var(--shadow-card)] dark:bg-white/[0.04] dark:shadow-none dark:border dark:border-white/10";
const summaryClass = cn(
  "flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4",
  "text-base font-extrabold tracking-tight",
  "[&::-webkit-details-marker]:hidden",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
);
const bodyClass = "px-5 pb-5 pt-0 text-sm leading-[1.7] text-muted-foreground";

export function HomeFaq() {
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => subscribeInstallable(setCanInstall), []);

  const onInstall = () => {
    void promptInstall();
  };

  return (
    <div className="flex flex-col gap-2.5">
      <details className={itemClass}>
        <summary className={summaryClass}>
          <span>このアプリについて</span>
          <Plus
            aria-hidden
            size={18}
            className="text-muted-foreground transition-transform duration-150 group-open:rotate-45"
          />
        </summary>
        <div className={bodyClass}>
          <p className="m-0">
            スマホ同士をかざして QR を交換する汎用ゲームツールです。バトン / 鬼ごっこ / 感染 /
            コレクションなど 9 つのプリセットを内蔵しています。
          </p>
        </div>
      </details>

      <details className={itemClass}>
        <summary className={summaryClass}>
          <span>使い方とボタンの説明</span>
          <Plus
            aria-hidden
            size={18}
            className="text-muted-foreground transition-transform duration-150 group-open:rotate-45"
          />
        </summary>
        <div className={cn(bodyClass, "flex flex-col gap-3")}>
          <p className="m-0">
            このアプリは 1
            台でホストを立ち上げ、別の端末からスキャンして集まる汎用ゲームツールです。バトン /
            鬼ごっこ / 感染 / コレクションなど 9 つのプリセットから選んで遊べます。
          </p>
          <p className="m-0">
            ホスト用の端末は PC でも、スマートフォンやタブレットでも代用できます。
          </p>

          <strong className="mt-1 block text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
            ボタンの説明
          </strong>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            <ButtonRow
              variant="host"
              icon={<Monitor aria-hidden size={14} />}
              label="ホストを立ち上げる"
              desc="新しいルームを作成して、参加用 QR を表示します。"
            />
            <ButtonRow
              variant="primary"
              icon={<QrCode aria-hidden size={14} />}
              label="QR コードをスキャン"
              desc="カメラを起動してホスト画面の QR を読み取り、ルームに参加します。"
            />
            <ButtonRow
              variant="primary"
              icon={<LogIn aria-hidden size={14} />}
              label="参加"
              desc="ルームコードを入力して参加します(QR が読めないときの代替)。"
            />
            <ButtonRow
              variant="primary"
              icon={<Play aria-hidden size={14} />}
              label="スタート"
              desc="ホスト画面でゲームを開始します。"
            />
            <ButtonRow
              variant="outline"
              icon={<RefreshCw aria-hidden size={14} />}
              label="リセット"
              desc="ホスト画面で状態を初期化してやり直します。"
            />
            <ButtonRow
              variant="primary"
              icon={<Camera aria-hidden size={14} />}
              label="分割 / QR / 撮影"
              desc="プレイヤー画面の右上で、自分の QR・カメラ・両方表示を切り替えます。"
            />
          </ul>
        </div>
      </details>

      <details className={itemClass}>
        <summary className={summaryClass}>
          <span>ホーム画面に追加する</span>
          <Plus
            aria-hidden
            size={18}
            className="text-muted-foreground transition-transform duration-150 group-open:rotate-45"
          />
        </summary>
        <div className={cn(bodyClass, "flex flex-col gap-3")}>
          {canInstall && (
            <Button
              type="button"
              variant="primary"
              size="submit"
              onClick={onInstall}
              className="w-auto self-start"
            >
              <Download size={16} />
              <span>このブラウザでインストール</span>
            </Button>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <strong className="block text-foreground">iOS (Safari)</strong>
              <ol className="m-0 mt-1 list-decimal pl-5">
                <li>下部の共有ボタンをタップ</li>
                <li>「ホーム画面に追加」を選択</li>
                <li>右上の「追加」をタップ</li>
              </ol>
            </div>
            <div>
              <strong className="block text-foreground">Android (Chrome)</strong>
              <ol className="m-0 mt-1 list-decimal pl-5">
                <li>右上のメニューを開く</li>
                <li>「ホーム画面に追加」を選択</li>
                <li>「追加」をタップ</li>
              </ol>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

type ButtonRowProps = {
  variant: "host" | "primary" | "outline";
  icon: React.ReactNode;
  label: string;
  desc: string;
};

function ButtonRow({ variant, icon, label, desc }: ButtonRowProps) {
  return (
    <li className="flex items-start gap-3 sm:items-center">
      <Button
        type="button"
        variant={variant}
        size="pill"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none w-auto shrink-0 whitespace-nowrap"
      >
        {icon}
        <span>{label}</span>
      </Button>
      <span className="text-sm leading-snug text-muted-foreground">{desc}</span>
    </li>
  );
}
