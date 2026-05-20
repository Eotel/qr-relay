# Plan: ホスト画面を Stage Dashboard に再構成する

Owner: miura
Status: In Progress (M5 docs & ADR done; 6m 視認 / 解像度キャプチャは手動残)
Created: 2026-05-20

## Goal

ホスト画面を「プロジェクター / 大画面に映した瞬間に、その場の全員が一目で
状況を把握できる」 dashboard に作り変える。スクロールするモバイル縦リストではなく、
**1 画面に収まる**情報密度を持ち、preset ごとに「いま見るべき指標」が支配的に
立ち上がる stage register を作る。

**前提 (CRITICAL)**: プレイヤーは自分のスマホを **incame + QR 表示のために
外側に向けて掲げている**。つまり プレイヤー自身は手元の画面を見ていない /
見られない。会場全員が **ホスト画面 (= プロジェクター / 大画面) を見ながら
プレイする**。よってホスト画面は「運営の監視盤」ではなく **会場全員の
ゲーム経過フィードバック画面**である。設計判断はすべてこの前提に従う:

- 「自分がいま何点か」「誰がバトンを持っているか」「直前に何が起きたか」を
  6m 離れた席からでも読めること。
- スコア更新・保持者交代・スキャン成立は **即時に視覚的に揺れる**こと
  (DESIGN.md の motion 規約 = press feedback だけ、を逸脱しない範囲で
  `transform: scale` + 80ms ease-out で実装)。
- ホスト操作 UI (start / pause / reset / 接続状態) は **会場視線からは
  邪魔**なので、dashboard 内では周縁に追いやる。

## Context

このプランを再開するときに必要なファイル / docs / 既存挙動を列挙。

### 現状の問題

- `apps/client/src/routes/HostRoom.tsx` は handheld 寸法 (`max-w-[720px]` を
  `RoomLayout.tsx` から継承、`md:max-w-[1200px]`) の縦スタック構成: Stopwatch →
  Room code/QR → Players (chip 折返し) → Scoreboard (chip 折返し) → 下部 sticky
  action bar。
- そのため大画面に映すと、(a) どこに注目すべきかが平坦で読めない、(b) 参加者が
  20 人を超えると Players / Scoreboard が縦に膨らんでスクロールが必要、(c)
  preset 固有の「主役指標」(例: バトン保持者の名前、奪い合いの 1 位スコア) が
  他のチップに紛れて 1 秒で読めない。
- 既に `RoomLayout.tsx` が `role === "host"` のとき `<html class="dark">` で
  stage register に切り替える設計は入っている。dark register の「大画面前提」
  実装はまだ HostRoom の構造には反映されていない。

### preset と「主役指標」の対応 (handlers / presets.ts より)

5 preset (PRODUCT.md は 9 と宣言、まだ 4 つ未実装):

| preset      | value | 主役指標 (一目で読みたいもの) |
|-------------|-------|------------------------------|
| baton       | token | **保持者 1 名の名前** (巨大), 直前のパス (`A → B`), 経過時間 |
| infection   | token | **感染 X / N** (進捗バー), 感染者一覧, 直近の感染イベント |
| steal       | score | **全員のスコア順位** (全員が自分を探せる), 直近のスティール |
| collection  | score | **全員の収集数** (全員が自分を探せる), 直近の遭遇 |
| greeting    | score | **全員の挨拶数**, 直近の挨拶イベント |

共通要件として、**プレイヤー全員が「自分」を 1 秒で見つけられる**ことが
最優先。chip 折り返しで縦に流すのではなく、**roster grid + 自分の行が
ハイライトされる**形にする (host 自身に "自分" 概念は無いが、player から
見ると "自分の名前" は最重要視点)。

`packages/core/src/types.ts` の `Metric` は `time | count | score`、`byPlayer` で
プレイヤー別の値を持つ。HOST 側で受け取るのは
`useWs((s) => s.metrics)` と `useWs((s) => s.state)` の 2 経路。token-holder の
判定は `apps/client/src/lib/token-holder.ts` の `isTokenHolder` で
`state.values[playerId]` を見ている (= metric label 非依存)。

### 関連ファイル

- ホスト画面本体: `apps/client/src/routes/HostRoom.tsx`
- レイアウト / register 切替: `apps/client/src/routes/RoomLayout.tsx:88-96`
- メトリクス描画 (handheld 共通): `apps/client/src/components/MetricsPanel.tsx`
- スコアボード (handheld 用 tab 内): `apps/client/src/routes/Scoreboard.tsx`
- 状態取得: `apps/client/src/lib/ws-store.ts` (`displayMs`, `metrics`, `state`,
  `players`, `phase`)
- token 判定: `apps/client/src/lib/token-holder.ts:13`
- preset 仕様: `packages/handlers/src/presets.ts`
- relay state shape: `packages/handlers/src/relay-rule.ts:47-55`
- design tokens / 禁則: `DESIGN.md`, `PRODUCT.md`

### 関連プラン

- `docs/exec-plans/active/2026-05-20-token-holder-tint.md`
  (client 側の保持者 tint — host dashboard でも同じ判定を流用する)
- `docs/exec-plans/active/2026-05-20-room-inactivity-timer.md`
  (inactivity overlay — dashboard でも継続して上に被せる)
- `docs/exec-plans/completed/2026-05-20-engine-simplification.md`

## Scope

### In scope

- `HostRoom.tsx` の **layout を register 別に分岐**:
  - `md` 未満 (= ホストがスマホ立ち上げした緊急時) は現行に近い 1 カラム
    スタックを維持。
  - `md` 以上 (= 想定本線。PC + プロジェクター) は **CSS Grid の dashboard
    レイアウト**。スクロールを排除して `100dvh` に収める。
- **preset-aware "Hero Tile"** を新規追加: 現在の `room.handlerConfig.value.kind`
  と holder 数で「token preset なら保持者の名前を一番大きく」「score preset なら
  1 位のスコアとプレイヤー名」を巨大表示。Hero Tile は dashboard 内の左上
  または中央上を占有する 1 つの大きなセル。
- **Player Board Tile (主役)**: 参加者全員を **名前 + 値 (score or
  保持アイコン) のカード grid** で並べる。score preset では値で降順ソートし
  上位は強調 (1 位は yellow badge、`Crown` アイコン)。token preset では
  保持者の名前カードだけ accent tint。「全員が自分の名前を 6m 先から探せる」
  サイズが要件 (= 名前は最低 24px、値は 40–64px)。`MetricsPanel` の chip
  折返しは host では使わない。
- **Last Scan Ticker**: 直前の `scan` イベント (例: `タロウ → ハナコ`) を
  1〜2 秒表示してフェードアウトする横長帯。**会場が反応する**ためのキュー。
  state.history の末尾を購読する。`prefers-reduced-motion` の場合は静的に
  最新行を残す。
- **Stopwatch Tile**: 経過時間を `clamp` で巨大化 (`min(14vw, 180px)` 目安)。
  会場全員の "残り時間感覚" を共有するための時計。
- **Join QR Tile**: 待機中(`phase.kind === "ready"`) は QR を巨大化、開始後は
  **明示的に隠す** (presence by phase)。プレイ中に QR が居座ると、後から
  来た人の合流動線にはなるが画面の情報密度を奪う。トレードオフは「あえて
  隠す + ホストが必要時に F キー / クリックで再表示」とする (後続検討)。
- **Host Operator Strip (周縁)**: start / pause / reset とエラーは
  画面下端 12px 程度の薄い帯にまとめる。会場視線の主役にはならない位置。
  既存の sticky 下部 action bar は `md+` ではこれに置換。
- **接続 / inactivity 状態**: header (`RoomLayout` 既存) はそのまま使う。
  dashboard 内に重複表示しない。
- 上記タイルを **`HostDashboard.tsx` 1 ファイル**にまとめて、`HostRoom.tsx` は
  responsive スイッチに徹する。
- Hero / PlayerBoard の **役割選択ロジック** (preset kind から味付けを
  決める) を `lib/host-view.ts` に切り出し、unit test で preset 5 種 +
  異常系をカバー。
- **Last Scan Ticker** の購読源として、ws-store に `lastScanEvent` (直近の
  scan イベントだけを保持) を追加するか、`state.history` 末尾を React
  selector で取り出す。前者を採用 (history 全体を購読すると無駄な再描画)。
- スコア / 保持者更新時のマイクロモーション (`scale(1.05)` を 80ms で 1 回
  だけ、`prefers-reduced-motion` で無効化)。DESIGN.md の motion 規約を
  逸脱しない範囲で「会場が気づける程度の揺れ」を入れる。
- ストーリーレベルでスクリーンショットを取れるよう、`presets` 5 種で
  visual smoke を可能にする (Playwright は別タスク化検討)。

### Out of scope

- 9 preset の残り 4 つ (ホットポテト / 鬼ごっこ / 鬼交代 / ノルマ) の実装。
  これは別タスク。dashboard 側は `value.kind` だけで分岐するので、後から
  preset が増えても再設計不要にしておく。
- WebSocket protocol の変更。今ある `state` / `metrics` / `phase` / `players`
  からだけで派生させる。
- ホスト操作系の追加 (例えば "次のラウンド" のような round 概念)。Phase は
  既存の ready / running / paused のままで進む。
- ライブ TV 用の 16:9 比率最適化や複数プロジェクタ表示。今回は **PC ブラウザ
  全画面**を主ターゲットにする。
- 客出し用の view-only URL。後続プランで検討。

## Milestones

1. **M1 — view 選択ロジック + last-scan 配信**
   - `lib/host-view.ts` に `pickHostHeroView(state, metrics, players, room)`:
     `{ kind: "token-single" | "token-many" | "score-leader" | "waiting", ... }`
     を返す純関数を作る。unit test (vitest) を 5 preset + 0 人 + 全員同点 +
     state なし の 8 ケース。
   - `ws-store.ts` に `lastScanEvent: { scanner, scanned, ts } | null` を追加し、
     `event` メッセージで更新する。表示側は selector で参照。
   - `MetricsPanel` を sweep して、dashboard 用に metrics を集約する純関数
     (`summarizeMetricsForHost`) を抽出。
2. **M2 — タイル骨組み (player-facing 視点)**
   - `components/host/` 配下に
     `HeroTile.tsx` / `PlayerBoardTile.tsx` / `LastScanTicker.tsx` /
     `StopwatchTile.tsx` / `JoinQrTile.tsx` / `OperatorStrip.tsx` を新設。
     各タイルは CSS Grid セルに収まる前提で `min-h-0` を持つ。
   - 各タイルは props 入力だけで描画する pure presentational component に保ち、
     `useWs` 直読は HostDashboard 1 箇所だけ。
   - PlayerBoardTile は **「6m 先から自分を探せる」**を最優先要件にし、
     名前 24px+、値 40–64px、grid セルサイズ最小 200×100px を目安にする。
     人数が多い場合は `text-fit` 風に縮める。
3. **M3 — dashboard レイアウト**
   - `routes/HostDashboard.tsx` を新規作成。`grid-template-areas` を
     `value.kind` ごとに切替 (`100dvh` を 12 cols × 12 rows):
     - token (baton): Hero (保持者) 8×6 / PlayerBoard 4×8 /
       LastScanTicker 8×1 / Stopwatch 4×2 / JoinQR 4×2 / Operator 12×1
     - token (infection): Hero (X / N + 感染者) 6×6 / PlayerBoard 6×9 /
       LastScanTicker 12×1 / Stopwatch + Operator は baton と同じ
     - score: PlayerBoard 8×9 (主役) / Hero (1 位アイコン) 4×4 /
       LastScanTicker 12×1 / Stopwatch + Operator は同上
     - waiting: JoinQR + RoomCode を中央 8×8 に拡大、Hero/PlayerBoard は
       縮める or 待機メッセージに置換。
   - `HostRoom.tsx` を `md+` で `HostDashboard` を返す薄い分岐に書き換え、
     `md` 未満はこれまでの実装をそのまま残す。
4. **M4 — Stage Register 仕上げ + マイクロモーション**
   - `100dvh` に収める。`overflow: hidden` を許容しつつ、`min-h-0` と `gap` で
     どの dashboard tile も内部 scroll しない設計に揃える。PlayerBoard で
     人数が多すぎる場合は **fontSize 自動ダウンスケール** で吸収、
     スクロールバーを出さない。
   - スコア / 保持者の変化に `transform: scale(1.05)` を 80ms ease-out で
     1 回だけ当てる (DESIGN.md motion 規約の範囲内)。`prefers-reduced-motion`
     で完全無効化。
   - inactivity overlay と RoomLayout 既存 header (Home / Badge / 接続) は
     そのまま重ねる。**dashboard 主領域には接続状態を二重表示しない**。
   - Buy-Me-a-Coffee / footer はホスト画面では表示しない (時間予算)。
5. **M5 — 検証 & ドキュメント**
   - `pnpm -r typecheck` / `pnpm -r test`。
   - 5 preset で `pnpm --filter @qr-relay/client dev` を立ち上げ、
     1920×1080 + 2560×1440 + 1366×768 の 3 解像度で各 preset を手動撮影。
   - **6m 視認テスト**: 1920×1080 を 27 インチで表示し、PC から 4〜6m
     離れた位置から自分の名前と値が読めるか確認。読めない場合は
     PlayerBoard の最小サイズを上げる。
   - `DESIGN.md` の §5 Components に Host Dashboard の tile contract を
     1 セクション追記。
   - `docs/adr/` に「stage dashboard は preset-aware で grid 切替する /
     ホスト画面はプレイヤー視聴前提」ADR を新規作成。

## Progress

- [x] M1.1 `lib/host-view.ts` + テスト (`pickHostHeroView`, 13 tests, vitest pass)
- [x] M1.2 `ws-store` に `lastScanEvent` + テスト (event(scan) ハンドラ + parser + 2 tests)
- [x] M1.3 `summarizeMetricsForHost` 抽出 + テスト
- [x] M2.1 HeroTile (`components/host/HeroTile.tsx`)
- [x] M2.2 PlayerBoardTile (`components/host/PlayerBoardTile.tsx`)
- [x] M2.3 LastScanTicker (`components/host/LastScanTicker.tsx`)
- [x] M2.4 StopwatchTile (`components/host/StopwatchTile.tsx`, `formatStopwatch` 共通化は
  各 tile が pure 視点のため `StopwatchTile` 内に閉じた版で十分と判断)
- [x] M2.5 JoinQrTile (`components/host/JoinQrTile.tsx`, `variant: compact|featured`)
- [x] M2.6 OperatorStrip (`components/host/OperatorStrip.tsx`)
- [x] M3.1 `HostDashboard.tsx` + grid-template-areas (token-single / token-many /
  score-leader / waiting)
- [x] M3.2 `HostRoom.tsx` を `useMediaQuery('(min-width:768px)')` 分岐に書き換え
  (CSS 表示切替ではなく mount 切替にした — 不要 subscribe を避けるため)
- [x] M4.1 `RoomLayout` に `md:h-dvh md:overflow-hidden` (role=host のみ)
- [ ] M4.2 PlayerBoard の自動ダウンスケール
  (M2 では `grid auto-fill` で代用。50 人超の検証は手動キャプチャ後に判断)
- [x] M4.3 値変化時の `scale(1.05)` モーション = `.hero-pulse` keyframe +
  React `key` 再マウント駆動 (`prefers-reduced-motion` で global 停止)
- [ ] M4.4 InactivityOverlay の重なり確認 (手動。実装上は既存 overlay が `<Outlet>`
  の外側で fixed なので影響なしのはず)
- [x] M5.1 typecheck / test (`pnpm -r typecheck` / `pnpm -r test` 共に green、
  全 221 tests pass)
- [ ] M5.2 5 preset × 3 解像度の手動キャプチャ (operator 残)
- [ ] M5.3 6m 視認テスト (operator 残)
- [x] M5.4 DESIGN.md §5 Components に "Host Stage Dashboard" セクション追記
- [x] M5.5 ADR `docs/adr/0004-host-stage-dashboard.md`

## Surprises And Discoveries

実装中に気づいたこと、想定外の挙動、変更した方針を都度追記する。

- **(2026-05-20) `data-pulse-key` だけではアニメーションが再発火しない**:
  最初は `data-pulse-key={...}` 属性で CSS アニメを再トリガする想定だったが、
  React は属性変化だけでは DOM 要素を unmount せず、`@keyframes` も再発火しない。
  修正: React の `key={pulseKey}` を使って要素を再マウントし、`.hero-pulse`
  クラスがマウント時に 1 回発火するようにした。HeroTile / PlayerCell /
  LastScanTicker いずれもこのパターン。
- **(2026-05-20) `useWs` selector 増やすと既存テストが壊れない**:
  HostRoom テストの `useWs` モックは `{players, metrics, phase}` のみ返すが、
  HostDashboard が `state` / `room` / `lastScanEvent` を読んでも selector が
  `undefined` を返すだけで TypeError にならず、`pickHostHeroView` が
  `waiting` view にフォールバックする。よってテスト追加なしで通った。
  ただし JSDOM では `matchMedia` 未対応で常に handheld 分岐が走る
  → 既存 HostRoom テストはそのまま使い続けられる。これは意図した設計。
- **(2026-05-20) `md+` 切替を CSS visibility ではなく mount で切った理由**:
  当初は `hidden md:flex` + `flex md:hidden` で両方マウントする案だったが、
  非表示側の HostDashboard も `useWs` を 6 つ購読してしまうため、handheld 端末
  でも常に dashboard 用 selector が走る不要コストが発生。`matchMedia` 駆動の
  分岐に切り替えて mount を排他に。テスト副作用も同時に消えた。

## Decision Log

判断点と採用理由。後から「なぜ X を選んだか」を読み返せるように。

- **(2026-05-20) preset 別 grid-template-areas で切り替える**:
  Hero / Leaderboard / Token-Holders の3つを「同じ場所に重ねて条件分岐」
  ではなく、grid の area 定義そのものを切り替える。理由 = タイル間の物理
  サイズ比 (token preset では Hero が大きく Leaderboard が要らない、score
  では Hero と Leaderboard を併置する) が preset で本質的に違うから、
  area 名で表現したほうが将来 4 残 preset を追加するときの diff も小さい。
- **(2026-05-20) `md` 未満は redesign しない**:
  ホストが iPad/スマホで立ち上げる緊急ケースは存在するが (PRODUCT.md
  "ホスト 1 名: ... 手持ちの PC・iPad・スマホのいずれかで")、stage dashboard
  の価値は「会場全員が見る画面」であって、片手の host 端末では狭くて
  逆効果。既存 1 カラムを残す。
- **(2026-05-20) ホスト画面は player-facing**:
  プレイヤーは自分の端末を外向きに掲げているため、自分の手元画面は
  読めない。ホスト画面を運営盤として最適化するのではなく、**会場全員の
  ゲーム経過パネル**として最適化する。これにより:
  - 「自分を探せる」PlayerBoard が最重要 tile になる (Leaderboard 上位
    だけでは下位プレイヤーが置き去り)。
  - 直近イベントの ticker と微モーションが必要 (会場が "今" 起きたことに
    反応するため)。
  - 接続状態 / ホスト操作は周縁化。
  - QR は ready/開始後で出す or 隠すを明確化 (プレイ中は情報密度を奪う)。

## Verification

- コマンド:
  - `pnpm -r typecheck`
  - `pnpm -r test`
  - `pnpm --filter @qr-relay/client dev` で手動確認
- 受け入れ挙動 (どれも `1920×1080` フルスクリーンを基準):
  - baton: 中央に「○○ がバトン保持中」 1 名分が >120px のフォントで読める。
    保持者が変わったら 1 秒以内に Hero が差し替わり、新保持者カードに
    1 回だけ `scale(1.05)` の pulse が走る。直前のパス (`A → B`) が
    LastScanTicker に 2 秒残る。
  - infection: Hero に「感染 7 / 12」が >100px で読める。PlayerBoard に
    全員が並び、感染済みは accent 背景。新規感染が起きたらそのカードに
    pulse。
  - steal: PlayerBoard が全員のスコアを 36px+ で読める形で並ぶ。1 位は
    yellow + Crown。スコア変化があった 2 人 (奪った / 奪われた) に pulse。
    会場の任意のプレイヤーが「自分の名前」を 1 秒で探せる。
  - collection / greeting: 全員 0 のままでも空白でなく、PlayerBoard と
    stopwatch だけで dashboard 然と見える。値が動いた人にだけ pulse。
  - 待機中 (ready): QR と room code が中央 8×8 セルに大きく出る。
    PlayerBoard は「○ 人参加中」だけの軽い表示。
  - 一時停止: 全 tile が dimmed (`opacity-60` 程度) になり、stopwatch が
    `paused` 色 (destructive) に変わる。
  - inactivity overlay は dashboard の上に被さって読める。
  - **6m 視認**: 27 インチ画面から 4〜6m 離れた位置で、PlayerBoard 内の
    任意の名前 + 値が読める。
  - 1366×768 でも縦スクロールが発生しない。

## Outcomes And Retrospective

`completed/` に移す直前に書く。最終的に何が変わったか / 残ったこと /
次に注意点。

### Changed

- `apps/client/src/lib/host-view.ts` (new): `pickHostHeroView` 純関数 +
  `summarizeMetricsForHost` 純関数。
- `apps/client/src/lib/ws-store.ts`: `lastScanEvent` + `parseScanEvent` 追加、
  `t: "event"` メッセージを scan のみフィルタしてストア更新。
- `apps/client/src/components/host/` (new dir): HeroTile / PlayerBoardTile /
  LastScanTicker / StopwatchTile / JoinQrTile / OperatorStrip の 6 tile
  (pure presentational; no `useWs`)。
- `apps/client/src/routes/HostDashboard.tsx` (new): タイル合成 + grid 切替 +
  ホスト操作の owner。
- `apps/client/src/routes/HostRoom.tsx`: `useDashboardViewport` で md+ → Dashboard、
  未満は handheld にフォールバック。handheld 実装は本質的に元のまま (file 内に
  `HostRoomHandheld` として隔離)。
- `apps/client/src/routes/RoomLayout.tsx`: role=host のとき `md:h-dvh
  md:overflow-hidden` を main に追加。
- `packages/ui/src/styles.css`: `.hero-pulse` keyframe を `@layer base` に追加。
- `DESIGN.md` §5: "Host Stage Dashboard" セクション追加。
- `docs/adr/0004-host-stage-dashboard.md` (new): 設計決定の記録。

### Verified

- `pnpm -r typecheck` clean (5 projects)。
- `pnpm -r test` clean (221 tests / 全 11 client files + handlers + core + server +
  ui)。新規 host-view test 13、ws-store の scan event test 2 を含む。
- Vite dev server (5173) で `HTTP 200` を確認。

### Remaining

- M4.2 PlayerBoard 自動フォントダウンスケール (現状は grid auto-fill で
  カラム数調整のみ。50 人超の検証で必要なら fontFit 系の hook を導入)。
- M4.4 InactivityOverlay の重なり確認 (実装上は無問題のはずだが目視必須)。
- M5.2 5 preset × 3 解像度 (1920×1080 / 2560×1440 / 1366×768) の手動キャプチャ。
- M5.3 6m 視認テスト (27" panel から 4–6m 離れて読めるか確認、PlayerCell の
  値 fontSize 下限を上げる調整が必要なら適用)。

### Next-Plan Hooks

- preset を 9 まで増やしたとき (PRODUCT.md 宣言の残 4 preset = hot-potato /
  oni-tag / oni-swap / quota)、`pickHostHeroView` の switch と
  `layoutStyles` のエントリ追加で対応。view kind を増やす必要が出たら
  ADR-0004 を superseded で更新する。
- view-only URL (客出し用) — ADR で out of scope と明記。次プランで切り出す。
