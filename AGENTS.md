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
3. UI / WS 経路を触ったら `pnpm dev:server` + `pnpm dev:client` で動作確認、または
   `apps/server` 配下で wrangler dev + curl/WebSocket smoke (例:
   [docs/design-docs/scan-handler-contract.md](docs/design-docs/scan-handler-contract.md)
   末尾の smoke スニペット)

走らせられない場合は「何を試みて何が出来なかったか」を明示する (黙ってスキップしない)。

## このファイルの維持

短く保つ。具体的な手順や設計判断はこのファイルに書かず、`docs/` に置いてリンクする。
