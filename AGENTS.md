# Agent Notes

このリポジトリで作業するエージェント向けの入口。詳細は `docs/` に置き、ここはマップに留める。

## 最初に読むもの

1. [ARCHITECTURE.md](ARCHITECTURE.md) — リポジトリのコード構成とデータフロー
2. [docs/index.md](docs/index.md) — docs system of record
3. [docs/design-docs/core-beliefs.md](docs/design-docs/core-beliefs.md) — 採用した設計原則
   (なぜ relay 統合エンジンか / なぜ nonce 検証か など)

## よく使う作業の入口

| やりたいこと | 参照先 |
|---|---|
| ルームの URL 規約 | host = `/r/CODE/host`、参加者 = `/r/CODE` (URL = intent / localStorage = authority。`/host` は装飾で、`lib/identity.ts` の `acceptInviteRole` が role を最終決定する) |
| 新しい遊び方 (プリセット) を追加 | [docs/design-docs/scan-handler-contract.md](docs/design-docs/scan-handler-contract.md) の「新プリセット追加 5 ステップ」 |
| relay で表現できない novel ロジックを足す | 同上「novel handler を追加」セクション |
| プリセットの仕様確認 | [docs/product-specs/presets.md](docs/product-specs/presets.md) |
| 大きな実装着手前の計画 | [docs/exec-plans/plan-template.md](docs/exec-plans/plan-template.md) を `docs/exec-plans/active/` にコピー |
| 既知の負債を見る | [docs/exec-plans/tech-debt-tracker.md](docs/exec-plans/tech-debt-tracker.md) |
| MVP 構築時の設計判断 | [docs/exec-plans/completed/2026-05-19-initial-mvp.md](docs/exec-plans/completed/2026-05-19-initial-mvp.md) |

## 開発コマンド

```bash
# 初回セットアップ
pnpm install

# 開発サーバー (2 ターミナル)
pnpm dev:server          # wrangler dev (http://localhost:8787, Miniflare ローカル)
pnpm dev:client          # vite dev    (http://localhost:5173)

# 検証
pnpm -r typecheck        # 全パッケージ型チェック
pnpm -r test             # 全パッケージ vitest (handler は pure function なので主戦場)
pnpm --filter @qr-relay/client build   # PWA ビルド確認
```

## 報告前の必須チェック

タスクを「完了」と報告する前に:

1. `pnpm -r typecheck` が pass
2. `pnpm -r test` が pass (新 handler/preset を足したならテストも増えていること)
3. `pnpm -w lint` (biome) が pass
4. UI / WS 経路を触ったら `pnpm dev:server` + `pnpm dev:client` で動作確認、または
   `apps/server` 配下で wrangler dev + curl/WebSocket smoke (例:
   [docs/design-docs/scan-handler-contract.md](docs/design-docs/scan-handler-contract.md)
   末尾の smoke スニペット)

走らせられない場合は「何を試みて何が出来なかったか」を明示する (黙ってスキップしない)。

## テスト可能性ルール

「良いコードはテストしやすいコード」が前提。以下のルールでドメイン層と I/O 層を分離する。

1. **副作用は port 経由で注入**:
   - 時刻は `Clock.now()` (`apps/server/src/ports.ts` / `apps/client/src/lib/clock.ts`)。
     `Date.now()` の直呼びは禁止 (`systemClock` の中だけ許す)。
   - 乱数 / nonce は `Rng` (`apps/client/src/lib/rng.ts`)。
   - HTTP は `FetchLike` (`apps/client/src/lib/api-client.ts`)。
   - WebSocket は `socketFactory` (`apps/client/src/lib/ws-store.ts`)。
   - DOM ライブラリ (qr-scanner / qrcode) は `ScannerFactory` / `QrGenerator` で注入。
2. **ドメイン (pure) と adapter (I/O) を分離**:
   - `apps/server/src/room.ts` (DurableObject) は storage / broadcast / WS pair の I/O のみ。
   - 判断 / 状態遷移は `apps/server/src/room-domain.ts` の `reduce*` 関数に集約。
     これらは入力固定で `Stored → Stored` を返し、副作用を持たない。
   - client 側も同じ: `routes/*.tsx` は view + DI 受け取り、ロジックは
     `lib/api-client.ts`, `lib/ws-store.ts`, `hooks/useQr*.ts` に置く。
3. **テストはソース隣接**:
   - `foo.ts` の隣に `foo.test.ts`(x)。`*.test.*` / `*.spec.*` / `e2e/**` /
     `vitest.config.*` / `playwright.config.*` は HMR の対象外 (`apps/client/vite.config.ts`
     の `server.watch.ignored` を維持すること)。
4. **新規ファイルを足すときの 1 問**:
   「このファイルを単体テストするのに何が必要か?」と自問する。
   答えに「カメラ」「ネットワーク」「`Date.now()`」「ブラウザ」が出たら、
   その依存を port で外に追い出してから着手する。

## このファイルの維持

短く保つ。具体的な手順や設計判断はこのファイルに書かず、`docs/` に置いてリンクする。
