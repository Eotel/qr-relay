# ADR-0004: Host screen is a player-facing stage dashboard, not an operator console

**Date**: 2026-05-20
**Status**: accepted (§Decision 4 は [ADR-0005](0005-drop-player-board-from-host-stage.md) で、§Decision 5 と §Decision 3 のタイル列挙の OperatorStrip 部分は [ADR-0007](0007-host-operator-strip-to-header.md) で superseded)
**Superseded-in-part-by**: [ADR-0005](0005-drop-player-board-from-host-stage.md) (§Decision 4), [ADR-0007](0007-host-operator-strip-to-header.md) (§Decision 5)
**Deciders**: miura

## Context

QR Relay の運用フィードバックから:

- プレイヤーはスマホを incame + QR 表示用に外側へ掲げているため、自分の手元の
  画面を見られない / 見ない。
- 会場全員が **ホスト画面 (= プロジェクター / 大画面)** を見ながらプレイする。
- それまでの `HostRoom.tsx` は handheld 寸法 (`max-w-[720px]` を `RoomLayout` から
  継承) の縦スタック構成で、(a) どこに注目すべきかが平坦、(b) 20 人を超えると
  縦スクロールが必要、(c) preset 固有の「主役指標」(バトン保持者の名前、奪い合いの
  1 位スコア) が他のチップに紛れて 1 秒で読めない、という問題があった。

関連:
- `DESIGN.md` §5 — handheld / stage の 2 register。stage register は dark slate。
- `packages/handlers/src/presets.ts` — 5 preset (`baton` / `infection` / `steal` /
  `collection` / `greeting`)。
- `apps/client/src/routes/RoomLayout.tsx` — `role === "host"` で `<main class="dark">`。
- `docs/exec-plans/active/2026-05-20-host-stage-dashboard.md` — 本決定の実装プラン。

## Decision

ホスト画面を **会場全員のゲーム経過フィードバック画面** として再構成する。

1. **md+ では新規 `HostDashboard.tsx`** を出す。`md` 未満は既存の handheld 縦スタック
   をそのまま残す (緊急時のホスト端末用)。
2. **`pickHostHeroView(phase, state, players, rule)` で view kind を選ぶ**:
   `waiting` / `token-single` (baton 系) / `token-many` (infection 系) /
   `score-leader` (score preset)。
3. **`grid-template-areas` を view kind ごとに切替**: タイルの種類は固定だが
   ("Hero" / "PlayerBoard" / "LastScanTicker" / "Stopwatch" / "JoinQR" /
   "OperatorStrip" の 6 つ)、area のサイズ比は preset ごとに本質的に異なるため
   `gridTemplateAreas` 文字列そのものを切り替える。
4. **`PlayerBoard` を主役 tile に**: 全員の名前 + 値を 6m 先から読めるサイズ
   (名前 20–30px、値 28–56px、セル最小 200×96px) で grid 表示。chip 折返しは
   ホストでは使わない。
5. **ホスト操作 UI (start / pause / reset) は周縁化**: 画面下端の 1 行 strip に
   まとめる。会場視線の主役にはならない位置。
6. **マイクロモーション**: 値変化時に `.hero-pulse` クラスで 240ms / `scale(1.05)` を
   1 回。React の `key` 変化で再マウントしてキーフレームを再発火させる。
   `prefers-reduced-motion` で全停止 (`styles.css` の global rule)。
7. **100dvh 制約**: `<main>` に `md:h-dvh md:overflow-hidden` を付けて、
   PlayerBoard / Hero の内部スクロールを禁止する。

## Alternatives Considered

### Alternative 1: 既存 `HostRoom` の Card スタックを大画面用に膨らませる

- **Pros**: 実装変更が少ない。
- **Cons**: 縦スクロールが残る。preset ごとに「主役指標」を立たせる仕組みがなく、
  会場が 1 秒で読めない。
- **Why not**: 「会場全員が見る画面」という前提に対して情報密度と階層が
  足りない。dashboard の価値を失う。

### Alternative 2: タイルを固定レイアウトに置き、preset 差は中身だけで吸収

- **Pros**: grid 切替不要で実装が単純。
- **Cons**: baton (保持者 1 名巨大) と steal (全員ランキング) では Hero と
  PlayerBoard の **物理サイズ比が本質的に違う**。固定レイアウトだと baton で
  PlayerBoard が無駄に大きく、steal では逆。
- **Why not**: 「area 名で切替」の方が将来 4 残 preset を追加するときの diff も
  小さく、preset の意図が grid 定義に表れる。

### Alternative 3: ホスト画面を「運営の監視盤」最適化のまま据え置き

- **Pros**: 既存の感覚で運用できる。
- **Cons**: プレイヤーが自端末を見られない前提と矛盾。会場が「いま誰が持ってる
  のか」「自分は何点か」を体感する場が消える。
- **Why not**: 製品の core 価値を毀損する。

## Consequences

### Positive

- 会場全員が「いま誰が主役か」「自分の名前と値」を 1 秒で読める dashboard を
  獲得。
- preset を追加するときに `pickHostHeroView` の switch と
  `gridTemplateAreas` の 1 ケースを足すだけで対応できる
  (M2 のタイル API は preset 不可知)。
- handheld register は変更なし — モバイルブラウザでホストが立ち上げる
  緊急ケースは従来通り動く。
- 値変化の `.hero-pulse` は DESIGN.md の motion 規約 (80ms press feedback)
  と整合する最小モーションで「会場が気づける程度の揺れ」を実現。

### Negative

- PlayerBoard の自動フォントダウンスケールはまだ未実装 — 50 人超のルームでは
  タイルが grid からはみ出す可能性 (M4.2 で対応予定)。
- 6m 視認テスト (27" / 1920×1080 / 4–6m) は手動検証が必須で、CI に組み込めない。

### Risks

- preset が 9 まで増えたとき (`PRODUCT.md` 宣言) に view-kind が `token-single` /
  `token-many` / `score-leader` の 3 種で吸収しきれない可能性がある。新規 preset
  追加時に view-kind を増やす判断を毎回行う必要がある。
- `gridTemplateAreas` のインライン CSS は静的解析しづらい — 将来 PlayerBoard
  のオーバーフロー対策で grid を flex に切り替える等の構造変更時、preset 数だけ
  並んだ template を触ることになる。
