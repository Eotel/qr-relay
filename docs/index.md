# Docs Index

Last reviewed: 2026-05-19

このリポジトリの永続的なドキュメントの system of record。エージェント向けの
入口は [../AGENTS.md](../AGENTS.md)、コード構成の入口は
[../ARCHITECTURE.md](../ARCHITECTURE.md)。

## カテゴリ

| カテゴリ | 場所 | 中身 |
|---|---|---|
| 設計判断 (durable) | [design-docs/](design-docs/index.md) | 採用した原則、ScanHandler 契約 |
| プロダクト仕様 | [product-specs/](product-specs/index.md) | 9 プリセットの遊び方 |
| 実装計画 (active) | [exec-plans/active/](exec-plans/active/) | 進行中の多ターン作業 |
| 実装計画 (完了) | [exec-plans/completed/](exec-plans/completed/) | 完了プランの記録 |
| 技術的負債 | [exec-plans/tech-debt-tracker.md](exec-plans/tech-debt-tracker.md) | 既知の負債と対処方針 |
| プラン雛形 | [exec-plans/plan-template.md](exec-plans/plan-template.md) | 新規プラン用テンプレ |

## 維持ルール

- 新しい durable doc を作ったら必ずこの index に追加する
- `Last reviewed:` は対象 doc を改訂したときに更新
- 大改訂や設計判断は design-docs に記録、軽い手順や使い方は product-specs か AGENTS.md
- プランは `exec-plans/active/{yyyy-mm-dd}-{slug}.md` で開始、完了後は `completed/` に
  移動
