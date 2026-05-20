# Plan: Initial MVP (QR Relay 汎用エンジン)

Owner: 自分
Status: Completed
Created: 2026-05-19
Completed: 2026-05-19

## Goal

スマホ同士をかざして QR で情報を交換できる汎用ゲームエンジンを MVP として作る。
特定ゲームではなく、`ScanRule` 駆動で複数の遊び方をデータとして表現する形にする。

## 採用したスタック

| 役割 | 採用 |
|---|---|
| Server | Hono + Cloudflare Workers + Durable Objects + WebSocket |
| Client | Vite + React PWA + react-router-dom + Zustand |
| QR 表示 | `qrcode` |
| QR 読取 | `qr-scanner` (`nimiq/qr-scanner`、BarcodeDetector fallback あり) |
| Validation | `zod` |
| Monorepo | `pnpm workspaces` |
| Test | `vitest` |
| Format/Lint | `biome` |

## 重要な設計の途中変更

### 4 つの別 handler → 1 つの統合 relay エンジン + プリセット

**当初**: tag-passer / counter / timer / infector を別個の `ScanHandler` 実装として
4 つ作る予定だった。

**変更後**: 「スキャン時に相手から消えるか / 残るか」のような直交する option を一元
管理するため、`relayHandler` 1 つに `ScanRule` config を渡して 9 プリセット (バトン /
ホットポテト / 奪い合い / コレクション / あいさつ / ノルマ / 鬼ごっこ / 感染 / 鬼交代)
を表現することにした。

**理由**: 別 handler だと似たコードが指数的に重複し、新しい遊び方追加に高いコスト。
統合してプリセットを data 化すれば「`presets.ts` に entry 1 行 + テスト 1 ケース」で
新しい遊び方を足せる。

詳しくは [../../design-docs/core-beliefs.md §1](../../design-docs/core-beliefs.md#1-統合エンジン--プリセット-vs-別個-handler)。

### バリエーション名のテイスト

「奪い合いコロシアム」「絵手紙バケツリレー」のような装飾的な命名を、まず採用したが
ユーザー指摘で **既存行為に近い短い名前** (バトン / 鬼ごっこ / 感染 等) に再統一。

### `/camera.html` という想定外の URL

ユーザーが `/camera.html` を叩いたら空表示になった (vite SPA fallback + react-router の
catch-all 不在)。`*` Route で `/` にリダイレクトする対応を追加。

## やったこと (Phase 0-10)

- Phase 0: pnpm workspaces / TS strict / wrangler / vite / biome のブートストラップ
- Phase 1: `packages/core` の Player/Metric/GameEvent 型, ScanHandler interface,
  registry, Zod schema, 5 ユニットテスト
- Phase 2: `packages/handlers` の `relay.ts` 統合エンジンと `presets.ts` 9 プリセット、
  19 ユニットテスト
- Phase 3 + 4: Hono ルート + Room Durable Object + WebSocket scan 経路 (nonce + ts
  検証)、wrangler dev での REST + WS smoke 確認
- Phase 5 + 6 + 7: Vite + React PWA、QrDisplay (qrcode) / QrScanner (qr-scanner),
  MetricsPanel, Home/NewRoom/Room/Scoreboard ルート、Zustand WS store
- Phase 8: MetricsPanel と Scoreboard
- Phase 9: vite-plugin-pwa による PWA 化
- Phase 10: 実機検証は未 (tech-debt 行き)

## 検証結果

- `pnpm -r typecheck`: clean
- `pnpm -r test`: 24 tests pass (core 5 + handlers 19)
- `pnpm --filter @qr-relay/client build`: PWA SW 生成成功
- wrangler dev + curl REST: ルーム作成 → join → start → state 取得が動作
- wrangler dev + WebSocket smoke: 2 socket で scan → 両方に state push、重複 nonce
  拒否、self-scan 拒否を確認

## 残作業 (tech-debt-tracker.md に移行済み)

- 実機 (iOS Safari) でのカメラ起動テスト
- E2E 自動化 (Playwright)
- `/new` で ScanRule の上級者編集 UI
- carrier handler (画像 / トークン転送)
- HMAC 署名 (`sig` フィールド)
- デプロイパイプライン
- handler pure function 原則の ast-grep 機械化

詳細: [../tech-debt-tracker.md](../tech-debt-tracker.md)

## 学び

- ユーザーとの設計対話で「別 handler を全部入りに統合」という方針転換ができた。MVP の
  最初の 1 週目で出てきた良い構造判断。
- DO + WebSocket + Hibernation API は wrangler dev (Miniflare) で十分動く。本番デプロイ
  なしで pure function 中心の TDD と smoke test だけで MVP まで届く。
- vite SPA + react-router で `path="*"` の catch-all を最初から書いておくべき。
