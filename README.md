# QR Relay

スマホ同士をかざして QR を交換する汎用ゲームツール。
バトン / 感染 / 奪い合い / コレクション / あいさつ の 5 プリセットを内蔵。

> エージェントとして作業する場合: [AGENTS.md](AGENTS.md) → [ARCHITECTURE.md](ARCHITECTURE.md)
> → [docs/index.md](docs/index.md) の順に読む。

## 構成

- `apps/server` — Hono + Cloudflare Workers + Durable Objects + WebSocket
- `apps/client` — Vite + React PWA, `qrcode` 表示 / `qr-scanner` 読取
- `packages/core` — 共通型・ScanHandler interface・レジストリ・Zod schema
- `packages/handlers` — 統合 Relay エンジン + プリセット定義

## 開発

```bash
pnpm install

# 2 ターミナルで:
pnpm dev:server   # http://localhost:8787 (wrangler dev)
pnpm dev:client   # http://localhost:5173 (vite)

# テスト + 型チェック
pnpm test
pnpm typecheck
```

ブラウザの 2 タブで `http://localhost:5173` を開き、片方で `ルーム作成` → コード共有、
もう片方で `参加` → コード入力。スマホ実機でのカメラ確認は `vite dev --host` + HTTPS が必要
(`ngrok` / `cloudflared tunnel` 推奨)。

## アーキテクチャ要点

1 つの統合 `relay` ScanHandler が `ScanRule` config で全プリセットを表現:

| 軸 | 取りうる値 |
|---|---|
| value | `token` / `score` |
| onScan.source | `keep` / `lose` / `decrement` / `increment` |
| onScan.sink   | `keep` / `gain` / `increment` / `decrement` |
| constraints   | `uniquePerPair` / `requireSourceHas` / `requireSinkLacks` / `min/maxValue` |

engine 自身は **時間 / 終了条件 / フェーズ** を持たない (ADR-0001 / 0002 / 0003)。
ゲームの開始 / 一時停止 / 再開 / リセットは server の **phase 状態機械**
(`ready` / `running` / `paused`) が握り、ホスト画面のストップウォッチと start/pause/reset
ボタンで操作する。`paused` 中は server がスキャンを no-op として弾く。

新しい遊び方を追加するには `packages/handlers/src/presets.ts` に entry を足すだけ。
relay で表現しきれない novel ロジックは別 `ScanHandler` を登録すれば良い。

## プリセット

- **バトン** — 1 人だけ持つ、スキャンで移動
- **感染** — 感染者の QR をスキャンすると感染 (感染者は減らない)
- **奪い合い** — 初期 10 点、スキャンで相手から 1 点奪う
- **コレクション** — 出会った人数 (重複なし)
- **あいさつ** — スキャンで両者 +1

「60 秒で打ち切る」「10 人で達成」のような時間 / 目標による終わらせ方は、ホストが
ストップウォッチを見て手動で `リセット` を押す運用に統合した
([ADR-0002](docs/adr/0002-move-end-conditions-out-of-engine.md))。

## デプロイ (将来)

- `apps/server`: `pnpm wrangler deploy`
- `apps/client`: Cloudflare Pages or 静的ホスティング
- HTTPS 必須 (カメラ API のため)
