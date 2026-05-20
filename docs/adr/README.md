# Architecture Decision Records

Last reviewed: 2026-05-20

このディレクトリは「なぜ X を採用したか」「なぜ Y を捨てたか」を 1 件 1 ファイルで残す
場所。長期的な設計原則は [../design-docs/core-beliefs.md](../design-docs/core-beliefs.md)、
進行中の作業は [../exec-plans/active/](../exec-plans/active/)。ADR は **個別の判断点**
を時系列の証跡として残すためのもの。

書式は [Michael Nygard 流](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
に準拠。テンプレートは [template.md](template.md)。

## 索引

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0001](0001-drop-status-value-kind.md) | `status` value kind を廃止し `token` に統合 | accepted | 2026-05-20 |
| [0002](0002-move-end-conditions-out-of-engine.md) | 終了条件を engine から外し manual + 外部ストップウォッチに移行 | accepted | 2026-05-20 |
| [0003](0003-game-phase-state-machine.md) | ready / running / paused のゲームフェーズ状態機械を導入 | accepted | 2026-05-20 |
| [0004](0004-host-stage-dashboard.md) | ホスト画面を会場全員向けの stage dashboard に再構成 (md+) | accepted (§Decision 4 superseded by [0005](0005-drop-player-board-from-host-stage.md); §Decision 2/3 evolved by [0006](0006-host-multi-view-dashboard.md)) | 2026-05-20 |
| [0005](0005-drop-player-board-from-host-stage.md) | ホスト stage から全員 PlayerBoard を外し、人数チップと room code に集約 | accepted | 2026-05-20 |
| [0006](0006-host-multi-view-dashboard.md) | ホスト dashboard に ViewSwitcher を内蔵し host 側 `/scoreboard` tab を撤去 | accepted | 2026-05-20 |

## ADR と他のドキュメントの使い分け

| 種類 | 場所 | 中身 |
|---|---|---|
| 個別判断の証跡 | `docs/adr/` (ここ) | 「X を採用、Y を捨てた、理由はこれ」を時系列で |
| 長期原則 | `docs/design-docs/` | 採用済みの原則をまとめ直したもの (ADR の知見が育って原則になったらここに昇格) |
| 進行中の作業 | `docs/exec-plans/active/` | 実装計画 |
| プロダクト仕様 | `docs/product-specs/` | プレイヤー視点のゲームルール |

ADR を書くべきとき:
- フレームワーク / ライブラリ / 設計パターンの選択
- API / スキーマの設計判断
- 既存の構造を捨てる / 移行する判断
- 「やらない」と決めたこと (negative decision) も含む

書かなくていいとき:
- 変数命名やフォーマッタの設定
- 自明なバグ修正
- 単発の typo
