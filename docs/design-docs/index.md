# Design Docs Index

Last reviewed: 2026-05-19

設計判断と契約。短期的な実装計画ではなく、長期的に守りたい原則と境界。

## ドキュメント

- [core-beliefs.md](core-beliefs.md) — 採用した 4 つの設計原則と、それぞれを担保する
  検証経路
- [scan-handler-contract.md](scan-handler-contract.md) — `ScanHandler` interface と
  `ScanRule` の仕様、新しい遊び方を追加するときの手順

## 何をここに書くか

ここに置くもの:
- 「なぜ X を採用したか」「なぜ Y を避けるか」が文書化されていないと、未来の自分や
  他のエージェントが繰り返し間違える種類の判断
- 複数モジュールにまたがる契約 (interface, schema, データフロー)

ここに**置かない**もの:
- ユーザー視点での機能仕様 → `../product-specs/`
- 進行中のタスク状態 → `../exec-plans/active/`
- 外部ライブラリ /API の使い方メモ → 必要なら `../references/` を新設
