# ADR-0005: ホスト stage から全員 PlayerBoard を外し、人数チップと room code に集約する

**Date**: 2026-05-20
**Status**: accepted
**Supersedes**: [ADR-0004](0004-host-stage-dashboard.md) §Decision 4 のみ
**Deciders**: miura

## Context

[ADR-0004](0004-host-stage-dashboard.md) §Decision 4 で「PlayerBoard を主役 tile に / 全員の
名前 + 値を 6m 先から読めるサイズ (名前 20–30px、値 28–56px、セル最小 200×96px) で
grid 表示」と決めた。

その後の dev サーバでの目視確認と運用想定の見直しで、次の問題が明確になった:

- ホストの `<main>` が handheld と同じ `md:max-w-[1200px]` を継承していたため、
  2000px+ のプロジェクター環境で **左右に大きな白マージン**ができて
  「dashboard が viewport を埋めない」状態になっていた。
- PlayerBoard セル (200×96px × N 人) は dashboard グリッドの右半分 (4–8 col) に
  押し込まれて結局縮み、6m 先から名前 + 値を 1 秒で探せるサイズには
  ならない。grid セルが viewport 比例で縮む構造上、20–30 人入ると名前 16px 程度に
  圧縮される。
- 一方、会場 = 物理的に同じ場にいる人たちで join するので、参加者が「自分が
  入れているか不安」になる状況自体がほぼ起きない。**room code が画面に出ていて、
  人数が増えていれば十分**という運用観察。
- waiting 状態でも PlayerBoard が「PLAYERS / 0 / 人参加中」の `0` を巨大表示する
  ためにセルがオーバーフローし、STOPWATCH 領域と重なるバグもあった。

関連:
- `apps/client/src/components/host/PlayerBoardTile.tsx` (削除対象)
- `apps/client/src/routes/HostDashboard.tsx` (grid 再編対象)
- `apps/client/src/routes/RoomLayout.tsx:128-148` (max-w-none + 人数 chip 追加対象)

## Decision

ADR-0004 の §Decision 4 を撤回する。具体的には:

1. **`PlayerBoardTile` を完全削除**。`HostDashboard.tsx` の grid から `board`
   area を消去。
2. **`gridTemplateAreas` を 2 種に縮約** (`waiting` / `play`)。preset 差は
   Hero タイルの中身でだけ表現する。`token-single` / `token-many` / `score-leader`
   は全て同じ `play` レイアウト (hero 12×7 + ticker 6×2 + clock 4×2 + qr 2×2 +
   op 12×1) を使う。
3. **「人数」は 2 箇所で表現**:
   - **常時**: `RoomLayout` ヘッダーに `12人` の小さな chip (md+ のみ)。
   - **waiting のみ**: Hero タイルの subtitle に `12 人参加中` を中サイズで。
     room code が hero の主役なので、その下に控えめに添える。
4. **`max-w-[1200px]` の制約を host のみ撤廃**: `role === "host"` のとき
   `md:max-w-none md:px-6` を当てて viewport 幅いっぱいに広がる。handheld
   client は従来通り 1200px キャップで読みやすい列幅を維持。
5. **`JoinQrTile` featured の room code 表示を削除**: waiting で Hero が room code
   を表示するので、QR タイル側で同じ文字列を巨大表示するのは情報重複だった。
   featured は `JOIN` ラベル + QR + URL だけにする。
6. **clamp() の上限を全体的に引き上げ**: viewport が 2560px+ まで広がる前提に
   対応。Hero (token-single) `clamp(64,13vw,260)`、Hero (token-many)
   `clamp(72,14vw,280)`、Stopwatch は逆に cell が狭くなったので
   `clamp(32,5vw,96)` に下げる。

## Alternatives Considered

### Alternative 1: PlayerBoard を残してフォント自動ダウンスケールで吸収

ADR-0004 §M4.2 で予定していた `fontFit` 系 hook を入れて、人数が増えても
セルが破綻しないようにする案。

- **Pros**: 既存の view-kind 切替ロジックを維持できる。「全員が自分を 1 秒で
  探せる」要件を諦めなくて済む。
- **Cons**: そもそも 6m 先から 16px 以下の名前を読むのは物理的に無理。
  自動ダウンスケールしてもスケール先のサイズが読めないなら意味がない。
  さらに `fontFit` 系の DOM 計測は dashboard 内 grid 切替 + dvh 制約と
  相性が悪く、計算ループが入る分テストも難しくなる。
- **Why not**: 「読めないものを綺麗に縮める」最適化に意味がない。
  そもそもの要件 (全員が自分を探せる) が物理的に達成不可能だった。

### Alternative 2: PlayerBoard を縦サイドバーに格下げ

右に 2-3 col 幅の narrow リストとして残し、名前 + 値を縦スクロール可能に。

- **Pros**: 「自分の名前を確認したい」操作が一応できる。
- **Cons**: スクロールが必要な時点で「会場全員が見る」前提と矛盾。
  プロジェクター画面でスクロールするわけにいかない。
- **Why not**: 中途半端。Hero / ticker が主役なら参加者表示は header の
  人数 chip で必要十分。

### Alternative 3: ADR-0004 のまま放置して max-w だけ直す

PlayerBoard は残し、viewport 幅制約だけ外す。

- **Pros**: 変更最小。
- **Cons**: viewport が広がっても、PlayerBoard セル 4 col × 8 row に「全員の
  名前 + 値」を 24px+ で並べるのは依然として困難 (人数 = 20 で 1 セル 200×96px
  確保すると合計 4000×192px、cell 4 col = ~640px 幅では 3 列しか並ばない →
  下 17 人がスクロール領域に隠れる)。問題の本質が解決しない。
- **Why not**: viewport を埋めても PlayerBoard の物理破綻は変わらない。

## Consequences

### Positive

- ホスト画面が **viewport 全体を使う** stage dashboard に正しくなった。
  2000–4000px 級プロジェクター/4K ディスプレイでも左右余白なし。
- 5 tile (Hero / LastScanTicker / Stopwatch / JoinQr / OperatorStrip) で構成が
  簡素化。`pickHostHeroView` の view-kind 切替は維持 (Hero の中身選択は preset
  特化のままで価値が残る) する一方、grid template 数が 4 → 2 に半減した。
- room code の表示が冗長でなくなった (header chip + waiting hero の 2 箇所、
  どちらも役割が違う)。
- 「自分が join できたか」の安心感は **header の人数 chip + waiting hero の
  人数 subtitle** が引き受ける。物理的同席が前提なので情報量として十分。

### Negative

- 「会場全員が自分の名前を画面で確認できる」体験は消える。
  例: 名前の入力ミスや同名衝突に気付くタイミングが減る。
  対応: 名前変更は `RoomSettingsOverlay` (client 側) で行う既存導線が
  残るので fatal ではない。
- score preset で「全員のランキング」を host 画面で見せられなくなる。
  scoreboard tab は client から見られるが、host stage の主役には来ない。
  プロジェクター運用では Hero (leader 1 名) と LastScanTicker (直前イベント) で
  代替する。

### Risks

- 9 preset まで増えた (PRODUCT.md 宣言) ときに、Hero 1 タイルだけで preset の
  「主役指標」を表現しきれない preset が出てくる可能性がある (例: ノルマ系で
  「達成 / 未達成の二極を同時に見せたい」など)。その場合は ADR-0006 で
  view-kind を増やすか、Hero を分割するかを再検討する。
- score-leader の Hero は「leaders[0] の名前 + 得点」しか出さなくなったので、
  接戦のとき会場が状況を読みづらい可能性。LastScanTicker の表示時間や
  メッセージ密度で補う。
