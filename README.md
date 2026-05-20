# QR Relay

スマホ同士をかざして QR を交換する汎用ゲームツール。
バトン / 鬼ごっこ / 感染 / コレクション など 9 つのプリセットを内蔵。

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
| value | `token` / `score` / `status` |
| onScan.source | `keep` / `lose` / `decrement` / `increment` / `set-status` |
| onScan.sink   | `keep` / `gain` / `increment` / `decrement` / `set-status` |
| onScan.swap   | true → 値を入れ替え |
| constraints   | `uniquePerPair` / `requireSourceHas` / `requireSinkLacks` / `min/maxValue` |
| end           | `target` / `all-have-status` / `only-one-left` / `timer-ms` / `manual` |

新しい遊び方を追加するには `packages/handlers/src/presets.ts` に entry を足すだけ。
relay で表現しきれない novel ロジックは別 `ScanHandler` を登録すれば良い。

## プリセット

- **バトン** — 1 人だけ持つ、スキャンで移動
- **ホットポテト** — バトン + 60秒タイマー
- **奪い合い** — 初期 10 点、スキャンで相手から 1 点奪う
- **コレクション** — 出会った人数 (重複なし)
- **あいさつ** — スキャンで両者 +1
- **ノルマ** — 10 人と出会うまで
- **鬼ごっこ** — 鬼の QR をスキャンで鬼が交代
- **感染** — 感染者からスキャンされた人も感染
- **鬼交代** — スキャンで鬼が swap

## デプロイ (将来)

- `apps/server`: `pnpm wrangler deploy`
- `apps/client`: Cloudflare Pages or 静的ホスティング
- HTTPS 必須 (カメラ API のため)
