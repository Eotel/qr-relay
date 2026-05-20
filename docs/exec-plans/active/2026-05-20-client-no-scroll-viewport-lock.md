# Plan: Client viewport lock (no-scroll handheld)

Owner: miura
Status: Draft
Created: 2026-05-20

## Goal

プレイヤー (client role) のルーム画面で **縦スクロールを発生させない**。
QR と カメラのタイルは常に viewport 内に見えていなければならない (片手で
画面をかざしながら相手と QR を交換するゲーム性そのものに直結する)。

Stage (host) はすでに `md:h-dvh md:overflow-hidden` で固定枠化済み。
今回は handheld (client) も同じ思想で固定枠にする。前提として
**client は基本スマホで開く** (PRODUCT.md §"Users")。md+ でも開けはするが、
レイアウトの第一優先は handheld。

副題として、固定枠化に合わせて **top header の縦占有を削る**:
ルーム情報 (HOME / role badge / code / 接続 pill) と表示切替タブが現状 2 行で
縦を食っているので、handheld では 1 行に詰めるか、より小さい要素に置き換える。

**狙う体験は "native app っぽい挙動"**:
- ページ全体のスクロールが起きない (アドレスバーが引っ込む挙動も起きない)。
- pull-to-refresh / overscroll-bounce が出ない (ゲーム中に誤って引っ張られない)。
- セーフエリア (notch / home indicator) は既に `env(safe-area-inset-*)` で
  尊重しているので維持。
- ブラウザのスクロール慣性 / ラバーバンドが play 領域に出ない。
- ピンチズームは可能なまま (PRODUCT.md は accessibility の観点で禁止していない)、
  ただし二本指スクロール / ダブルタップズームによる layout shift が play 領域を
  壊さない範囲に抑える。

## Context

このプランを再開するときに必要なファイル / 既存挙動:

- 関連コード:
  - `apps/client/src/routes/RoomLayout.tsx:124` — `<main>` の縦伸び挙動。
    現状 client は `min-h-dvh` (=スクロール可)。host だけ md+ で `h-dvh overflow-hidden`。
  - `apps/client/src/routes/ClientRoom.tsx:79` — top bar / `<section aria-label="QR と撮影">` /
    `<details>` score panel / FAB の縦積み構造。
  - `apps/client/src/routes/ClientRoom.tsx:146` — `<details>` が開くと縦に伸びる箇所。
    PRODUCT.md §"Inline disclosure over modals" で `<details>` は禁則ではないが、
    今回の制約 (QR+カメラ常時表示) と直接バッティングする。
  - `apps/client/src/components/client/RoomShareOverlay.tsx` — `RoomShareFab` は
    `position: fixed` の FAB。viewport ロック後も問題なし。
  - `apps/client/src/components/InactivityOverlay.tsx` — `position: fixed`、影響なし。
  - `apps/client/src/routes.tsx:37` — `/r/:code/scoreboard` は別ルート。
    スコアは元々ここで全画面表示できる。
- 関連 docs:
  - `PRODUCT.md` §"Mobile-real, not mobile-mimicked" — `env(safe-area-inset-*)`、
    `viewport-fit=cover`、44px tap floor、屋外光下を前提。
  - `PRODUCT.md` §"Inline disclosure over modals" — `<details>` を default にする方針。
    今回は **画面領域を奪わない範囲で** その方針を維持する (=削除ではなく退避)。
  - `docs/adr/README.md` — viewport / register 関連の ADR があれば追従。
- 関連プラン:
  - `docs/exec-plans/active/2026-05-20-host-stage-dashboard.md` — host 側の
    "固定枠ダッシュボード" 化を完了済みパターンとして参照。

## Scope

In scope:

- `RoomLayout` の `<main>` を client role × handheld でも `h-dvh overflow-hidden`
  に切り替える (host 側パターンの拡張)。
- `ClientRoom` の縦レイアウト見直し: top bar / play section / 追加 UI が
  常に viewport 内に収まるようにする。play section が `flex-1 min-h-0` で
  残り高さを吸収する形を維持。
- `<details>` score panel の扱いを決定: a) `/scoreboard` タブへ完全退避、
  b) 開いたら overlay として被せる、c) 折りたたみ時のみ表示。
  → 既定案は **(a) 削除して `/scoreboard` タブに集約**。
- 縦 (portrait) / 横 (landscape) 両方で QR + camera tile が見切れずに収まることを
  実機相当 (Chrome DevTools mobile emulation, iOS Safari 実機 1 台) で確認。
- `pointer-coarse` で 44px tap floor を保ったまま、top bar の縦占有を必要最小限に。
  具体策: handheld では `flex-row` 1 行に詰め、`<nav>` (ルーム / スコア) を
  右上の小さいタブ群に縮約。HOME ボタン・role badge・code は最小幅の chip 表示。
- 接続切れ / 参加エラーの `Card role="alert"` も viewport 内に収める
  (= flex-1 の play section 側を圧迫する形で良い)。
- "native app っぽい挙動" のための CSS / meta 調整:
  - `<html>` または `<body>` レベルで `overscroll-behavior: contain` を入れる
    (pull-to-refresh と overscroll bounce の抑制)。`<body>` 側に `overflow: hidden`
    を入れて、page スクロール自体を root で禁止。
  - `index.html` の `<meta name="viewport">` を確認し、`viewport-fit=cover`、
    `width=device-width, initial-scale=1` を維持。`user-scalable=no` は a11y 上
    入れない (PRODUCT.md §accessibility と矛盾する)。
  - iOS Safari の dynamic viewport を考慮し `100dvh` ベースに統一 (`100vh` 使用箇所が
    残っていないかを軽く grep)。
  - `touch-action` は scanner / QR の操作に影響しない範囲で root に
    `touch-action: manipulation` を検討 (ダブルタップズームの遅延を消す副次効果)。
    ただし pinch-zoom は維持したいので `none` にはしない。

Out of scope:

- host (stage) 側のレイアウト変更。
- `/scoreboard` ルートの中身そのものの再設計 (スクロール可で良い)。
- `RoomClosed` (`/r/:code/closed`) — 別 `<main>`、影響範囲外。
- ViewToggle (split/qr/scan) の挙動変更。今回はあくまで縦の枠を固定するだけ。
- 新規アニメーション。`prefers-reduced-motion` 境界を超えない。

## Milestones

1. **観察フェーズ** — DevTools で iPhone SE / iPhone 14 Pro / Pixel 7 / Galaxy Fold-open
   の portrait & landscape を再現し、現状でどこが viewport を超えるかスクショで記録。
   特に `<details>` open 時、`Card role="alert"` 表示時、`InactivityOverlay` 表示時。
2. **`<details>` の扱いを確定** — In scope 3点 (a/b/c) のうち (a) を仮採用し、
   `/scoreboard` 側で同等以上の情報が出ているかを確認。不足があれば scoreboard 側を
   先に補強する。最終決定は Decision Log に書く。
3. **`<main>` を固定枠化** — `RoomLayout.tsx:124` の `cn(...)` を改修。
   - client role: `h-dvh overflow-hidden`、ただし `min-h-dvh` は外す
     (両立すると `min-h-dvh + h-dvh` で safari の dynamic viewport 計算が崩れることがある)。
   - safe-area の `pt`/`pb` 計算は維持。
   - host の既存挙動 (`md:h-dvh md:overflow-hidden`) は不変。
4. **`ClientRoom` の内部レイアウト調整** — `<section>` が `flex-1 min-h-0` を
   既に持っているので、`<details>` を削除して play section が viewport の残り高を
   常に占有するようにする。FAB は `fixed` のまま。
5. **テスト追加** — `apps/client/src/routes/*.test.tsx` に、
   - client room の `<main>` が `overflow-hidden` クラスを持つことを assert。
   - `<details>` (score) が camera タブの DOM に存在しないことを assert。
   - `/scoreboard` 側で score が引き続き読めることの smoke。
   e2e 側: `e2e/` に `client-no-scroll.spec.ts` を追加。viewport 高さ = `document.documentElement.scrollHeight`
   を満たす (=スクロール量 0) ことを portrait/landscape で確認。
6. **検証** — `pnpm -r typecheck`、`pnpm -r test`、`pnpm -F @qr-relay/client e2e`
   (もしくは該当する e2e コマンド) を通す。

## Progress

- [x] M1 観察フェーズ: 現状の超過箇所を特定
  - `100vh` 残存なし。`min-h-dvh` のみ。
  - `overscroll-behavior: none` は既に `html, body` に設定済み。
  - 不足: client × handheld での `<main>` 固定枠化、`<details>` 削除、header 縮約。
- [x] M2 `<details>` 扱い決定: 削除 (`/scoreboard` タブに集約)
- [x] M3 `RoomLayout` の `<main>` を全幅で `h-dvh overflow-hidden` 化 (host/client 共通)
- [x] M4 top header を 1 行化 + room code を小さくクワイエットに (Shake Counter 風)
  - role badge は handheld で隠す (`hidden md:inline-flex`)
  - HOME ボタンを `size-7` に縮小 (md+ で `size-8` 復帰)
  - room code: `text-[11px] font-bold text-muted-foreground` (handheld) / md+ で復帰
  - nav の label テキストを handheld で隠してアイコンのみ表示 (`hidden md:inline`)
- [x] M5 native-app 風挙動: `overscroll-behavior: none` を維持、その意図を styles.css にコメント化
- [x] M6 unit テスト追加 (`apps/client/src/routes/ClientRoom.test.tsx` 3 件)
- [x] M7 e2e spec 追加 (`e2e/client-no-scroll.spec.ts`, portrait/landscape)
- [x] M8 typecheck (✅ 緑) / test (✅ 116 件パス) / lint (HEAD 既存の HeroTile a11y 警告 1 件のみ、本変更とは無関係)
- [x] M9 ヘッダーを 1 段に統合 (フォローアップ):
  - ClientRoom 上部の player chips 行を削除 (info は /scoreboard に集約)
  - ViewToggle (split/qr/scan) を `_ClientViewToggle.tsx` に切り出し、RoomLayout
    の header 右側 (nav タブの左) に常駐させた。`role === "client"` のときだけ描画。
  - view state を RoomLayout に lift、`RoomOutletContext` に `clientView` /
    `setClientView` を追加。HostRoom / Scoreboard / RoomRoot は無視。
  - 結果: client 画面の chrome は **1 段** だけ ([home][code][dot] | [split/qr/scan] [room/score])。
  - test 122 件パス (+6)

## Surprises And Discoveries

実装中に気づいたこと、想定外の挙動、変更した方針を都度追記する。

- (未記入)

## Decision Log

判断点と採用理由。

- **score panel の扱い**: 既定案 (a) = camera タブから完全削除し `/scoreboard`
  タブに集約。
  - 理由: 今回の制約 ("QR と カメラ絶対に出ていなければいけない") を最も
    シンプルに満たす。`<details>` open でレイアウトが破綻するなら、そもそも
    その UI は player の "撮影中ホーム" には居場所がない。
  - 退路: もし scoreboard タブへの遷移コストが高い (試合中にスコアをチラ見できない)
    と判明したら、(b) overlay 化 (fixed bottom sheet, 縦の 30% を超えない)
    に切り替える。
- **`min-h-dvh` を残すか外すか**: 外す。`h-dvh` + `overflow-hidden` だけにする。
  iOS Safari の dynamic viewport (アドレスバーの出入りで `100vh` が動く) に
  対しては `dvh` 単位がそもそも追従する。`min-h-dvh` を併記すると min/height の
  優先順位で意図しないスクロールが残るケースがある (host 側はすでに `md:h-dvh`
  単体で固定できているのが傍証)。
- **landscape 対応**: 既存の `landscape:flex-row` で QR と camera を横並びに
  しているのは維持。短辺方向 (=縦) に詰める前提なので、今回の固定枠化と相性が良い。

## Verification

- コマンド:
  - `pnpm -r typecheck`
  - `pnpm -r test`
  - `pnpm -F @qr-relay/client test` (該当ルートのテスト)
  - `pnpm e2e` または `playwright test e2e/client-no-scroll.spec.ts`
- 受け入れ挙動:
  - iPhone SE 相当 (375×667) portrait: ページ全体がスクロールしない
    (`document.documentElement.scrollHeight === window.innerHeight`)。
  - iPhone 14 Pro (393×852) portrait / landscape: 同上。
  - Pixel 7 (412×915) portrait / landscape: 同上。
  - QR タイルと camera タイル両方が viewport 内に visible (各短辺の 40%↑ を占める)。
  - `<details>` (自分のスコア) はカメラタブの DOM に存在しない。
  - `/scoreboard` タブに遷移すれば score が確認できる。
  - `Card role="alert"` (joinError / lastError) が出ても、ページスクロールが発生しない
    (play section 側が圧迫されるだけ)。
  - `RoomShareFab` および `RoomShareOverlay` が従来通り動く。
  - `InactivityOverlay` が従来通り上に被さる。
  - host (stage) 側の挙動に変化なし。

## Outcomes And Retrospective

- ClientRoom の `<details>` (自分のスコア) を削除し、`/scoreboard` タブに完全集約。
  これで開閉によるレイアウト破綻のリスクが消えた。
- `RoomLayout` の `<main>` を `h-dvh + overflow-hidden` に統一 (host も client も)。
  併せて padding を `pt-/pb-[calc(0.5rem+env(safe-area-inset-*))]` (handheld) /
  `0.75rem` (md+) に整理。
- top header を 1 行化。room code は handheld で `text-muted-foreground` の
  目立たないキャップにし、Shake Counter の chrome に揃えた。tabs は handheld で
  アイコンのみ (`aria-label` 維持)。
- 並行編集で playerCount chip (md+ のみ) と host max-width 撤廃が入った。これは
  本プランの方向性と整合するのでそのまま受け入れ。
- 残課題: HEAD で既に存在していた `HeroTile.tsx` の progressbar a11y 警告
  (`tabIndex` 追加が必要) は別タスク扱い。
- e2e は spec を追加したが本セッションでは実行していない (dev server boot を含む
  ため)。CI / 手動で `pnpm e2e e2e/client-no-scroll.spec.ts` を走らせること。
