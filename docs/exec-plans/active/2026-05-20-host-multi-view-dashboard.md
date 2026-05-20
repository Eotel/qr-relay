# Plan: Host Multi-View Dashboard & Host Scoreboard Retirement

Owner: miura
Status: Implemented (pending review / merge)
Created: 2026-05-20

> **Update 2026-05-20**: 本プラン本文中の `OperatorStrip` / `op` area / 下部固定帯への言及は、後続の [ADR-0007](../../adr/0007-host-operator-strip-to-header.md) で superseded。`OperatorStrip.tsx` は削除され、start / pause / resume / reset は `RoomLayout` ヘッダ右端の `HostHeaderOperator` (pill button × 2) に移った。同時に dashboard tick driver も `StopwatchTileLive` に閉じ込め、focus tile (`RankingsTile` / `TokenPathTile` / `InfectionGridTile`) は `React.memo` + mode-gated memo で hidden 時の再計算を skip するようになった。`overview-play` の下段には `ScanCountTile` が追加されている。本文の「全 mode で OperatorStrip 常時可視」「6 grid templates」等の記述は、ADR-0007 §Decision を正規とする。

## Context

「ホストが ゲーム終了を明示する状態」は作らない方針で合意した。`paused` phase は scan ブロックと最終 metrics 計算を既に担っており、結果は「pause 中に止まったライブ値を眺める」で足りる (`apps/server/src/room.ts` 内 `reduceScan`)。

その代わり、ホストには複数の観点の realtime view を提供する。dashboard は overview を担い、加えて個別 metric の focus view を switcher で切り替えられる。pause しても view はそのまま、ただ scan-driven な値が更新を止めるだけ。

副作用として、現在 `/r/:code/scoreboard` で出している MetricsPanel は host にとって冗長になる。RoomLayout 上部の 2-tab は **host 側だけ消し**、`/scoreboard` route と client 側 (handheld) の tab は **残す** — handheld でも自分のスコアを確認したい player のため。

必要なデータは `RelayState.history { scannerId, scannedId, ts }[]` (`packages/handlers/src/relay-rule.ts:54`) に全て揃っており、新規バインディング (D1 / KV / R2) は不要。inactivity DO alarm (warn 10m → close 15m, `apps/server/src/room.ts:137-173`) で十分なクリーンアップが回る。

関連:
- `packages/core/src/types.ts:14-17` — Phase 定義 (`ended` 追加なし)
- `apps/client/src/routes.tsx:27-39` — `/r/:code` (HostRoom) / `/r/:code/scoreboard` (Scoreboard)
- `apps/client/src/routes/RoomLayout.tsx:198-210` — 2-tab (NavLink) ヘッダ。host で非表示にする対象。
- `apps/client/src/routes/HostRoom.tsx:47-52` — viewport 分岐 (md+ → HostDashboard / <md → HostRoomHandheld)
- `apps/client/src/routes/HostDashboard.tsx:90-207` — grid-template-areas、OperatorStrip は `op` 領域
- `apps/client/src/components/host/{HeroTile,PlayerBoardTile,LastScanTicker,StopwatchTile,JoinQrTile,OperatorStrip}.tsx`
- `apps/client/src/routes/Scoreboard.tsx` / `MetricsPanel` — client 用に残す
- `apps/client/src/lib/host-view.ts` — `pickHostHeroView`, `summarizeMetricsForHost`
- `apps/client/src/lib/ws-store.ts:28-96` — `parseScanEvent`, `lastScanEvent`
- 進行中プラン: `docs/exec-plans/active/2026-05-20-host-stage-dashboard.md` (上位)、`2026-05-20-room-inactivity-timer.md` (close は wipe)

## Goal

Host 用 stage dashboard に view switcher を入れ、5 つの realtime view (Overview / Rankings / TokenPath / InfectionGrid / Participants) を切り替えられるようにする。Host 側の `/scoreboard` tab を廃止し、client 側は従来通り残す。Pause は scan-driven な値が止まるだけで view は変えない。新 phase / D1 / KV / 永続化は一切足さない。

## Scope

In scope:
- Host `HostDashboard.tsx` 内に **view switcher** を追加 (top, stage register 向け segmented control)。
  - View modes: `overview` (default) / `rankings` / `token-path` / `infection` / `participants`
  - mode は internal state (route ではない)、reload 後 default に戻ってよい
- 新規 tile (single-focus full-area で使えるもの):
  - `RankingsTile` — scan-out / scan-in 降順 (tiebreak: joinedAt 昇順)
  - `TokenPathTile` — history 昇順の縦 chain (A → B → C → A)、最大 20 行で fade-truncate
  - `ParticipantListTile` — joinedAt 昇順、最小
  - `PlayerBoardTile` に `variant?: "compact" | "infection-grid"` を増やす (新規 tile を作らない)
- `apps/client/src/lib/host-view.ts` に集計関数を追加:
  - `rankings(history, players): { scanOut: Ranked[]; scanIn: Ranked[] }`
  - `tokenPathChain(history, players): { id: string; name: string }[]`
- `HostDashboard.tsx` の `grid-template-areas` を **mode 別** に拡張:
  - `overview` mode: 既存 (Hero / Board / Ticker / Stopwatch / QR / Op)
  - 他 mode: focus tile を中央に大きく + Stopwatch / Op を周辺維持
- **Host 側のみ** RoomLayout 2-tab を非表示にする (role-based)
- Client 側 `/scoreboard` route / `MetricsPanel` / 2-tab は **そのまま残す**
- `OperatorStrip` (start / pause / reset) は **全 mode で常時表示**、bottom band 維持
- handheld フォールバック (`HostRoomHandheld`) は scope 外 (現状維持)

Out of scope:
- 新しい `ended` phase (合意済)
- D1 / R2 / KV 等の追加バインディング
- `/scoreboard` route 自体の削除 (client が使う)
- `ScanRule` への `winCondition` フィールド
- token transition の graph / chord / sankey 可視化 (縦 chain で固定)
- player (handheld) 側 UI への影響 (client は何も変えない)
- view mode の URL 化・persist (internal state のみ)
- 4 未実装 preset (hot-potato / oni-tag / oni-swap / quota)

## Milestones

1. **M1 — metric 集計 utility**: `host-view.ts` に `rankings()` / `tokenPathChain()` を追加 + Vitest。5 preset で破綻しないこと。
2. **M2 — 新規 tile**: `RankingsTile` / `TokenPathTile` / `ParticipantListTile` 実装 (pure presentational + 単体テスト)、`PlayerBoardTile` に variant 追加。
3. **M3 — view switcher**: `HostDashboard.tsx` に segmented control を組み込み、`mode` state を保持、mode 別 `grid-template-areas` を切り替え。OperatorStrip は全 mode で見える。
4. **M4 — host 側 2-tab 撤去**: `RoomLayout.tsx` の `<nav aria-label="表示切替">` を `role === "host"` で非表示。client の挙動は不変。
5. **M5 — verification**: `pnpm -r typecheck` / `pnpm -r test` / 手動 (2-3 名で 5 preset × 5 view mode を巡回) / E2E (`e2e/host-view-switcher.spec.ts` 新規)。

## Progress

- [x] M1: metric 集計 utility + 単体テスト (`rankings`, `tokenPathChain` + 12 cases)
- [x] M2: 新規 tile + 単体テスト (Rankings / TokenPath / ParticipantList / InfectionGrid + ViewSwitcher、16 cases)
- [x] M3: HostDashboard view switcher + mode 別 layout (6 grid templates、tile は mount したまま)
- [x] M4: RoomLayout host 側 2-tab 非表示 (`role === "client"` で nav を gate)
- [x] M5: typecheck green / client unit test 145 pass / E2E `host-view-switcher.spec.ts` 3 pass

## Critical files

Create:
- `apps/client/src/components/host/RankingsTile.tsx` (+ `.test.tsx`)
- `apps/client/src/components/host/TokenPathTile.tsx` (+ `.test.tsx`)
- `apps/client/src/components/host/ParticipantListTile.tsx` (+ `.test.tsx`)
- `apps/client/src/components/host/ViewSwitcher.tsx` (+ `.test.tsx`) — segmented control
- `e2e/host-view-switcher.spec.ts`

Modify:
- `apps/client/src/lib/host-view.ts` — `rankings()` / `tokenPathChain()` を追加 (隣接 `host-view.test.ts` を更新)
- `apps/client/src/routes/HostDashboard.tsx` — `mode` state + ViewSwitcher 挿入 + mode 別 `grid-template-areas` (CSS only で切替、tile は両 mode 共通 mount → flash しない)
- `apps/client/src/components/host/PlayerBoardTile.tsx` — `variant?: "compact" | "infection-grid"` prop を追加
- `apps/client/src/routes/RoomLayout.tsx` — 2-tab を `role === "host"` で非表示 (line 198-210)

Reuse (新規不要):
- `RelayState.history` — そのまま読む
- `useWs` (`apps/client/src/lib/ws-store.ts`) — phase / state / players / metrics
- `OperatorStrip` — そのまま全 mode で使う

Touch but keep:
- `apps/client/src/routes/Scoreboard.tsx` / `MetricsPanel` — client 用に残す (削除しない)
- `apps/client/src/routes.tsx` — `/scoreboard` route は残す
- `apps/client/src/routes/HostRoomHandheld.tsx` — 現状維持

## Verification

Commands:
- `pnpm -r typecheck`
- `pnpm -r test`
- `pnpm --filter @qr-relay/client test` (新規 tile + host-view util)
- `pnpm dev` で host を md+ viewport で開き、ViewSwitcher で 5 mode を巡回。各 mode で OperatorStrip が押せること。
- 5 preset (baton / infection / steal / collection / greeting) × 5 view mode で 値が破綻しないこと
- pause を押して全 view が更新を止めることを確認 (data freeze の単純挙動)
- client (`<md` または別端末) で `/r/:code/scoreboard` が従来通り見えること
- E2E: `e2e/host-view-switcher.spec.ts` — 5 mode に切替できる、OperatorStrip がどの mode でも click 可能、pause → resume で各 mode の値が変化

受け入れ挙動:
- Host (md+) でルームを開くと `overview` mode が default
- ViewSwitcher で `overview / rankings / token-path / infection / participants` を 1 tap で切替
- 切替は CSS の `grid-template-areas` のみで実現 (tile re-mount なし、LastScanTicker の fade が崩れない)
- Pause を押すと scan が止まり、全 view の値も止まる (view は変わらない)
- Resume で realtime 更新が再開
- Host で RoomLayout 上部の「ルーム / スコア」tab は **見えない** (role-based 非表示)
- Client で同じ tab は **見える**、`/scoreboard` も従来通り
- 同点 ranking は joinedAt 昇順で tiebreak (lobby 順と整合)
- TokenPathChain は history 昇順、20 行超過は最古を fade-truncate

## Decision Log

- **`ended` phase を追加しない** — `paused` が既に scan ブロック + final metrics 計算済み。phase enum 拡張は reducer / handler / ADR-0003 / WS protocol / UI 全層に波及するため見送り。Pause = realtime の値が止まるだけ、というシンプルな意味付けに統一する。
- **Pause で view を切り替えない** — pause は単に scan が止まる効果。view 切替は host の能動操作。「pause 中だけ専用レイアウト」を作ると、resume で flash + scroll リセットが起こり Design Principle 1 (Time-to-play is sacred) に逆行する。
- **View mode は internal state、route 化しない** — URL に出すと bookmark / 共有時に意味が出てしまうが、stage 視聴体験は ephemeral。reload で default に戻ってよい。実装も最小。
- **Host 側のみ 2-tab を非表示、client 側は残す** — host の MetricsPanel は dashboard の rankings / infection / participants で完全に置換できる。client (handheld) はスコアを覗きたい局面があるため tab を残し、現行 UX を壊さない。`/scoreboard` route と `Scoreboard.tsx` / `MetricsPanel` は client のために残置。
- **OperatorStrip は全 mode で常時表示** — start / pause / reset は host のみの責務だが、view を切り替えるたびに失われると操作不能になる。`grid-template-areas` で `op` を全 mode の bottom 帯に固定。
- **D1 / KV 不要** — `RelayState.history` で必要情報は揃う。30 分 / 30 名 / 2 scan/sec ≈ 100 KB、DO state soft 25 MB の 0.4 %。
- **Token 遷移は縦 chain テキスト** — Stage register の 6m 視認性最優先。graph 描画 (directed / sankey / chord) は library 依存と可読性低下のリスクで見送り。
- **`PlayerBoardTile` に variant を増やす** — 同種データを 2 つ並べる二重 tile は重複。`variant` prop 1 つで `overview` の compact 表示と `infection` mode の full-area 表示を分ける。
- **mode 別 layout は CSS のみで切替、tile は mount したまま** — re-mount による flash / state loss を避ける。`display: none` ではなく `grid-area` の動的 assign で「隠れた tile も生きている」状態にする。
- **`ScanRule` に `winCondition` を持たせない** — PRODUCT.md の「測る機能・比べる機能を提供するが、勝敗判定はユーザー (ゲーム制作者)」を維持。

## Surprises and Discoveries

- **`PlayerBoardTile` は実在しなかった**: 探索フェーズで言及した PlayerBoardTile は ADR-0005 で既に削除済 (HostDashboard.tsx のコメントに記録あり)。当初プランの「variant 追加」を取りやめ、`InfectionGridTile.tsx` を独立 tile として新規作成。
- **e2e の 2 failure は本プラン外の既存破損**:
  - `e2e/host-client-roles.spec.ts:27` (`スコアボード` text) — `feat(host): stage dashboard` 以降、md+ では HostDashboard が描画され `スコアボード` 見出しは存在しない。
  - `e2e/room-flow.spec.ts:37` (`max-w != none`) — 作業ツリーの未コミット変更で host main が `md:max-w-none md:px-6` に変わっており、HEAD (`md:max-w-[1200px]`) では pass。テストが prior 変更に追従していない。
  - 両方とも本プランで触れた範囲外。修正は別タスクに送る。`room-flow.spec.ts:11` は本プランの変更 (host の 2-tab 撤去) に追従して更新済 (ViewSwitcher tablist + WAITING text を assert)。
- **`display: none` 隠蔽が `getByText` を hidden 扱いに**: 初版 e2e で `LastScanTicker` の "まだスキャンはありません" が hidden node のまま resolve され Playwright が fail させた。`getByRole("region", { name: "..." })` で `<section aria-label="...">` 越しに対象を指定する形に書き直し。新規 tile は全部 `aria-label` を持つので今後も使える。

## Outcomes and Retrospective

What changed:
- Host stage dashboard が `overview / rankings / token-path / infection / participants` の 5 mode を持つ ViewSwitcher を内蔵。Pause しても view は変わらず、scan-driven な値が止まるだけ。
- Host 側 RoomLayout の `表示切替` nav と `/scoreboard` 経由のスコア表示は撤去 (client は従来通り)。
- `host-view.ts` に preset 非依存の集計関数 `rankings()` / `tokenPathChain()` を追加。`RelayState.history` から直接読むので新規 binding (D1 等) なし。
- 新規 tile 4 枚 + ViewSwitcher を `apps/client/src/components/host/` に追加し、全て pure presentational。Tile は常時 mount のままで `display: none` 切替するため、`LastScanTicker` の pulse / QR canvas が switch でリセットしない。

Verification done:
- `pnpm -r typecheck` green (全 5 workspace).
- `pnpm -r test` 145/145 pass.
- `pnpm e2e e2e/host-view-switcher.spec.ts` 3/3 pass.
- `pnpm e2e e2e/room-flow.spec.ts:11` 更新後 pass (新 assertion: ViewSwitcher tablist + WAITING text)。

Remaining tech debt (別タスクで対応):
- `e2e/host-client-roles.spec.ts:27` の `スコアボード` assert は HostDashboard 化以降の死語。新しい host UI に合わせた書き換えが必要。
- `e2e/room-flow.spec.ts:37` の `max-w != none` assert は host main が `md:max-w-none` になった prior 未コミット変更に追従していない。
- 手動 5 preset × 5 view mode の巡回テストは未実施 (preset 切替には room recreate が必要)。

Next:
- `completed/` への移動前に上記 2 件の e2e を別プランとして整理する。
- Token preset で実 scan を流した時の `RankingsTile` / `TokenPathTile` 表示確認 (現状は空状態のみ verify)。
