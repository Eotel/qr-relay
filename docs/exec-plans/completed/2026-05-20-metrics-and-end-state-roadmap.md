# Plan: Metrics Expansion And End-State Decision

Owner: miura
Status: Completed
Created: 2026-05-20
Completed: 2026-05-20

## Goal

1. **End-state**: 「ゲーム終了 (スコア確定)」を独立した phase として導入するかを再判断する。結論案: 導入しない (`paused` を結果ビューとして使い続ける)。本プランで論拠を残し、`ended` phase 導入要望が再燃した時の参照点にする。
2. **Metrics 拡張**: PRODUCT.md の方針「測る機能・比べる機能を提供するが、勝敗判定はユーザー (ゲーム制作者)」を強化するため、host dashboard に渡せる候補メトリクス / scope-view を棚卸しし、`ship-now / nice-to-have / defer` の 3 バケツに整理する。最初の実装バッチを決め切る。
3. **D1 要否**: 上記メトリクスのうち永続化バインディング (D1 / KV / R2) を要するものがあるか確認する。結論案: 不要 (`RelayState.history` + DO storage で完結)。

## Context

直近の `2026-05-20-host-multi-view-dashboard.md` (Implemented) で `overview / rankings / token-path / infection / participants` の 5 view mode が出荷済。ユーザーが今回挙げた 4 つの metric (token 遷移経路 / 感染 grid / scan & 被 scan ランキング / 参加者一覧) は実装済み。残るのは「他にあったらいい metrics は」「end-state はどうするか」「D1 必要か」。

### 既に存在する metrics / view

- Server side `relayHandler.metrics()` (`packages/handlers/src/relay.ts:168-204`):
  - 「総スキャン数」(`count`, total + byPlayer)
  - 「スコア」(`score`, byPlayer) — score preset のみ
  - 「保持中」(`count`, total + byPlayer) — token preset のみ
- Client side aggregates (`apps/client/src/lib/host-view.ts`):
  - `pickHostHeroView` — preset shape から hero 表示を選ぶ (waiting / token-single / token-many / score-leader)
  - `rankings()` — scan-out / scan-in 順
  - `tokenPathChain()` — `history` 昇順 chain
- Host tiles (`apps/client/src/components/host/`):
  - `HeroTile` / `JoinQrTile` / `LastScanTicker` / `StopwatchTile` / `RankingsTile` / `TokenPathTile` / `InfectionGridTile` / `ParticipantListTile` / `ViewSwitcher` / `OperatorStrip`

### 既存判断の継続性

- ADR-0003 (`docs/adr/0003-game-phase-state-machine.md`): Phase は `ready / running / paused` のみ。`ended` は意図的に持たない。
- `2026-05-20-host-multi-view-dashboard.md` Decision Log:
  - 「`ended` phase を追加しない — `paused` が既に scan ブロック + final metrics 計算済み」
  - 「`ScanRule` に `winCondition` を持たせない — 測る側に徹する」
  - 「D1 / KV 不要 — `RelayState.history` で必要情報は揃う」
- `reduceScan` (`apps/server/src/room-domain.ts:301-310`): `phase.kind !== "running"` で no-op。`paused` での scan は既に止まる。

## Scope

### 分類原則 (本プラン全体に効くガード)

「**新 view mode を増やすのは data shape が違う時だけ**。同じ list を別観点で見たいだけなら、既存 tile に **column 追加 / sort トグル / filter チップ** で吸収する」を原則にする。

判定マトリクス:

| 提案 metric | data shape | 採用形 |
|---|---|---|
| `encounters` (ユニーク相手数) | list の追加列 | RankingsTile / ParticipantListTile に column |
| `dormant` (未参加者) | list の filter (count=0) | RankingsTile に sort toggle + 未参加 badge |
| `first-movers` (初動順) | list の別 sort (firstScanAt) | ParticipantListTile に sort toggle |
| `score-gap` (リード差) | list の追加列 (score preset 限定) | RankingsTile に column (+0 / -5 のような delta 表記) |
| `throughput` (直近 60s scans) | scalar | StopwatchTile 脇に 1 行同居 (tile / view 不要) |
| `longest-chain` (最長連鎖) | scalar | TokenPathTile のヘッダに callout 同居 |
| `pair-heatmap` (N×N) | matrix (list ではない) | **新 view mode** で focus layout に置く |
| graph centrality | network (matrix と別物) | defer (graph 描画は Stage 可読性に反する) |

→ ship-now バッチに「新 view mode 追加」は **なし**。`ViewSwitcher` の 5 mode は不変。

In scope:

- **End-state**: `ended` phase を導入しないことを ADR 級の決定として確定 (本プラン Decision Log)。
- **D1**: 不要であることを再確認、根拠 (DO storage 概算) を記録。
- **Metrics ship-now バッチ** (実装まで、全て既存 tile への内包):
  - `M1` `encounters` 列: 各プレイヤーが何人の異なる相手と scan を成立させたか。`pairCounts` から導出。RankingsTile の各行に小さく付与、または ParticipantListTile に列追加。impl 時にどちらが読めるか試して 1 箇所だけ採用。
  - `M2` `RankingsTile` の sort トグル + 未参加 badge: 既定の降順に加えて、ヘッダの ↕ で昇順に切替可能。count=0 行に `未参加` チップを薄く表示。「dormant view」を別 mode 化せずに済む。
  - `M3` `throughput` (直近 60s scan 数): `StopwatchTile` の脇に 1 行同居。pause 中は最後の値を保持。
- **Metrics nice-to-have バッチ** (別プラン化、本プランでは起票だけ):
  - `N1` `pair-heatmap` を **新 view mode** として導入 (matrix shape は filter/sort で吸収不可)。
  - `N2` `score-gap` 列を RankingsTile に追加 (score preset 限定)。
  - `N3` `longest-chain` を TokenPathTile に callout として同居。
  - `N4` `first-movers`: ParticipantListTile に sort トグル (joinedAt / firstScanAt) を追加。
- **Metrics defer バッチ** (今回は議論のみ、実装は別プラン化しない):
  - `D1` ネットワーク中心性 (graph centrality) — graph 描画を伴うので Stage register の 6m 可読性方針に反する。
  - `D2` グループ分け統計 (joined-time cohort 等) — 30 人想定では情報過多。
  - `D3` セッション履歴 (過去ルームとの比較) — D1 / KV を要する。Out of scope。

Out of scope:

- 新しい phase の追加 (再確認の上、不採用)。
- `ScanRule` に `winCondition` を載せること。
- 永続バインディング (D1 / KV / R2) の追加。
- handheld (`HostRoomHandheld`) への波及 — md+ dashboard 限定の拡張。
- client (`Scoreboard.tsx` / `MetricsPanel`) の構造変更。
- preset 追加 (hot-potato / oni-tag / oni-swap / quota は別トラック)。
- `ViewSwitcher` への mode 追加 (ship-now バッチでは行わない。`pair-heatmap` を入れる時のみ +1 mode)。
- 新規 `DormantTile` / `ThroughputTile` 等の独立 tile 作成 (filter/sort/列に吸収する原則の徹底)。

## Milestones

1. **M0 — 決定確定**: 本プランがレビューされ、`ended` phase 不採用 / D1 不要 / ship-now バッチ (`encounters` 列 / `RankingsTile` sort+badge / `throughput`) が approve される。Implementation は M0 後。
2. **M1 — `encounters` 列**:
   - `host-view.ts` に `encounterCounts(state, players): Record<playerId, number>` を追加 (pure)。`RelayState.pairCounts` のキー `"scannerId>scannedId"` を parse して `scannerId` ごとの distinct `scannedId` を数える。
   - `RankingsTile` の Row に小さな副数値、または `ParticipantListTile` に列として表示。impl 時に 1 箇所だけ採用 (`PRODUCT.md` の情報密度方針)。
   - Vitest: 5 preset で破綻しない / scan 0 件で全員 0 / `uniquePerPair` の collection で integer 一致。
3. **M2 — `RankingsTile` sort トグル + 未参加 badge**:
   - `RankingsTile` の各 Column ヘッダに ↕ ボタンを追加 (`order: "desc" | "asc"`)、internal state で保持。
   - count=0 の Row に小さな `未参加` チップを薄く表示 (`muted-foreground` + `border-current/40`)。
   - rankings 関数自体は不変 (sort は tile 内側で並べ替えるだけ)。
   - Vitest: order toggle で 1 番目と最後が入れ替わる / count=0 のみ badge が出る / tiebreak (joinedAt) が両 order で安定。
4. **M3 — `throughput` 1-liner**:
   - `host-view.ts` に `recentThroughput(state, now, windowMs): number` を追加 (history を window で filter)。
   - `StopwatchTile` の脇 (または `OperatorStrip` の上) に「直近 60s: NN」を 1 行表示。pause 中は `phase.kind !== "running"` を検知して 0 ではなく最後の値を `useRef` で保持。
   - Vitest: window 端カット / history 空 / pause 凍結。
5. **M4 — 検証**:
   - `pnpm -r typecheck` / `pnpm -r test` green。
   - `pnpm e2e e2e/host-view-switcher.spec.ts` (既存) が壊れないこと。新規 e2e は追加しない (ship-now バッチは tile 内部の振る舞いのみで、view mode の数も layout も変わらない)。
   - 手動: 5 preset × 5 view mode の Rankings / Participants を md+ で巡回。sort トグルで count=0 の行が先頭に来る / `encounters` 列が見える / `throughput` が pause で凍結。
6. **M5 — promotion**:
   - nice-to-have を別プラン (`2026-05-2x-host-metrics-nice-to-have.md`) として `active/` に skeleton で起票:
     - `N1 pair-heatmap` (matrix で唯一 view mode 追加が要るやつ)
     - `N2 score-gap` (RankingsTile に score preset 限定列)
     - `N3 longest-chain` (TokenPathTile に callout)
     - `N4 first-movers` (ParticipantListTile に sort)
   - 本プランを `completed/` に移し、Outcomes を埋める。

## Progress

- [x] M0 — 決定 approve (auto-mode で execute へ)
- [x] M1 — `encounters` 列 (`RankingsTile` scan-out 側に副数値で採用)
- [x] M2 — `RankingsTile` sort トグル + 未参加 badge
- [x] M3 — `throughput` 1-liner (`StopwatchTile` 内に同居)
- [x] M4 — verification (`pnpm -r typecheck` / `pnpm -r test` / `pnpm e2e e2e/host-view-switcher.spec.ts` green)
- [x] M5 — promotion + nice-to-have の skeleton 起票
  (`docs/exec-plans/active/2026-05-20-host-metrics-nice-to-have.md`)

## Critical files

Create:

- (M5) `docs/exec-plans/active/2026-05-2x-host-metrics-nice-to-have.md` — skeleton。

Modify:

- `apps/client/src/lib/host-view.ts` — `encounterCounts` / `recentThroughput` を追加 (純関数、テストは隣接 `host-view.test.ts`)。
- `apps/client/src/components/host/RankingsTile.tsx` (+ `.test.tsx`):
  - `encounters` 値を表示する列 / 副数値 (M1 でここを選んだ場合)。
  - sort order の internal state + ↕ トグル (M2)。
  - count=0 行に `未参加` badge (M2)。
- `apps/client/src/components/host/ParticipantListTile.tsx` (+ `.test.tsx`) — M1 でここを選んだ場合のみ `encounters` 列。
- `apps/client/src/components/host/StopwatchTile.tsx` または `OperatorStrip.tsx` — `recentThroughput` を読む 1 行を追加 (M3、どちらか impl 時に選定)。pause 凍結ロジックは `useRef` で持つ最小実装。

Reuse (新規不要):

- `RelayState.pairCounts` / `RelayState.history` (`packages/handlers/src/relay-rule.ts:50-55`).
- `useWs` (`apps/client/src/lib/ws-store.ts`).
- `rankings()` / `tokenPathChain()` (`host-view.ts`)。

Touch but keep:

- `relayHandler.metrics()` — server 側は **触らない**。新メトリクスは全て client-side 集計で `state.history` / `state.pairCounts` から導出する。WS protocol も不変。
- `ViewSwitcher.tsx` / `HostDashboard.tsx` の grid templates — ship-now バッチでは **不変**。view mode は 5 のまま。
- `HostRoomHandheld.tsx` — 現状維持。
- `Scoreboard.tsx` / `MetricsPanel.tsx` — client は不変。
- `e2e/host-view-switcher.spec.ts` — 既存 5 mode を assert しているので、これも **不変** (新規 e2e は追加しない)。

## Verification

Commands:

- `pnpm -r typecheck`
- `pnpm -r test`
- `pnpm --filter @qr-relay/client test`
- `pnpm e2e e2e/host-view-switcher.spec.ts`

受け入れ挙動:

- Host (md+) の `ViewSwitcher` は **5 mode のまま** (ship-now バッチで mode は増えない)。
- `RankingsTile` または `ParticipantListTile` に「ユニーク相手数」の列 / 副数値が 1 箇所だけ出る。
- `RankingsTile` の各列ヘッダに ↕ トグルがあり、押すと sort 順が降順 ↔ 昇順で切り替わる。count=0 の行に `未参加` badge が薄く出る。
- `StopwatchTile` 付近に「直近 60s: NN」が常時見え、pause 中は最後の値を維持 (0 にはならない)。
- 5 mode × 5 preset で値が破綻しない。
- `paused` で全ての scan-driven 値が止まる (既存挙動の継続)。
- `OperatorStrip` (start / pause / reset) は全 mode から押せる。
- D1 / KV / R2 等のバインディングが `wrangler.toml` に増えていない。

## Decision Log

- **`ended` phase は導入しない (継続決定)** — 以下を根拠とする:
  - `paused` が既に scan を no-op にし (`reduceScan` 304-309)、`metrics()` を再計算済 (`reducePause` 184-195)。「結果を眺める」「リセットして再戦する」のいずれにも `paused → ready (reset)` で到達でき、`ended` は state machine に新エッジを増やすだけで挙動を増やさない。
  - PRODUCT.md「測る機能・比べる機能を提供するが、勝敗判定はユーザー」を `winCondition` 抜きで体現するには「ホストが自分の判断で pause し、その瞬間の view が結果」というシンプルな意味付けが整合的。
  - 新 phase を入れると ADR-0003 / reducer / WS protocol / host UI / handheld UI / 各 preset / 5 view mode の全層を波及する。投資対比のリターンが薄い。
- **D1 / KV / R2 不要** — 30 分 / 30 名 / 2 scan/sec ≈ 100 KB、Cloudflare DO の soft 25 MB 上限の 0.4%。inactivity timer (warn 10m / close 15m) が wipe するため永続化要求も無い。「過去ルームと比較したい」が出たら別プランで D1 を検討する。
- **`ScanRule` に `winCondition` を載せない (継続決定)** — preset は data 1 つで 9 ゲームを表現する設計。判定軸を engine 側に持ち込むと preset 表の cardinality が爆発し、新ゲームを足す閾値が上がる。
- **新メトリクスは server に追加せず client-side 集計に寄せる** — `state.history` / `state.pairCounts` は既に WS で配信済み。`relayHandler.metrics()` を膨らませると payload が増え、また「測り方は host UI の関心事」という layering と整合しなくなる。
- **filter / sort で済むものは view mode を新設しない (本プランの新原則)** — 「同じ list を別観点で見たい」は filter / sort / column 追加で解く。new view mode は data shape が違う時 (`pair-heatmap` の matrix のような) だけ。理由:
  - `ViewSwitcher` の mode 数が増えるほど、host は「今どの mode を見ているか」を覚える負担が増える。Time-to-play is sacred と逆行。
  - mode 切替は grid template の再 layout が要るが、同じ list の sort 切替は tile 内側で済み、`LastScanTicker` の pulse や ↕ トグルへのフォーカスを失わない。
  - 結果として、当初案の `dormant` view は採用せず、`RankingsTile` の sort トグル + 未参加 badge に吸収する。
- **`throughput` / `longest-chain` のような scalar は新 tile を作らない** — 1 数値のために grid 1 セルを使うのは density 不経済。`StopwatchTile` / `TokenPathTile` の既存ヘッダに同居させる。
- **`encounters` は 1 箇所だけに置く** — RankingsTile と ParticipantListTile の両方に出すと、同じ数値が 2 列に並んで読み難い。impl 時に試して「どちらに置くと一番自然か」を 1 箇所だけ決める。
- **`pair-heatmap` だけは view mode 追加の例外** — matrix shape は list の filter/sort では表現できない。これだけは別プランで mode を +1 する。
- **`graph centrality` 系は defer** — graph 描画は外部 library を呼ばないと崩れやすく、Stage register の硬さに反する。本当に必要になったら ADR で議論する。

## Surprises and Discoveries

- **biome `useExhaustiveDependencies` が `tick` 依存を冗長扱いした** —
  `useMemo` 内で `Date.now()` を呼び出すパターンは、tick だけが recompute
  trigger だが lint には伝わらない。`// biome-ignore` で抑制する以外に
  クリーンな手はない。
- **Phase の `paused` 型は `pausedAt` を要求する** — テスト fixture を書く
  際に `{ kind: "paused", accumulatedMs: 10_000 }` で型エラー。`pausedAt: 0`
  を補う必要がある (`packages/core/src/phase.ts`)。
- **`encounters` の置き場所を RankingsTile に決めた** — ParticipantListTile
  は lobby roster の役割が強く、scan-out 由来の指標 (encounters) を入れる
  と意味が混ざる。RankingsTile の scan-out column に副数値として置くと
  「count: 5 / 5人」のように「総数 vs ユニーク」の対比が読みやすい。
- **`recentThroughput` の pause 凍結は useRef で素直に書ける** — useMemo
  内で ref.current を更新するパターン (running 時のみ書き込み、それ以外は
  read) で機能する。ref の write-during-render は React 的にも OK。
- **`ArrowUpDown` icon でアフォーダンスは十分** — 「↕」テキストではなく
  lucide icon を使ったほうが視覚的に並び替えと識別しやすい。トグル状態
  (asc / desc) を `aria-pressed` で公開する。

## Outcomes and Retrospective

実装結果 (M1–M5 すべて 2026-05-20 同日着地):

- `apps/client/src/lib/host-view.ts` に純関数 2 つを追加:
  `encounterCounts(state, players)` (pairCounts 由来の distinct partner 数) と
  `recentThroughput(state, now, windowMs)` (history 直近 window のカウント)。
  Vitest 9 ケース追加 (`host-view.test.ts`)。
- `apps/client/src/components/host/RankingsTile.tsx`:
  - `encounters` prop を導入し、SCAN OUT 行に `·N人` の副数値で表示。
  - 各カラムヘッダに ↕ トグル (`ArrowUpDown` icon + `降順`/`昇順` ラベル) を
    追加。`aria-pressed` で状態を公開、stable sort で joinedAt tiebreak を維持。
  - count=0 行に `未参加` チップを薄く表示。「dormant view」は新設しない。
  - テスト追加 (sort トグル / 未参加 badge / encounters 副数値)。
- `apps/client/src/components/host/StopwatchTile.tsx`: `throughput?: number`
  prop を追加し、`直近 60s NN` を 1 行同居表示。新 tile は作らない。
- `apps/client/src/routes/HostDashboard.tsx`: encounters を useMemo で派生、
  throughput を `useRef` + `useMemo` で pause 凍結しつつ tick で recompute。
  `RankingsTile` / `StopwatchTile` に prop で渡す。
- 並行プラン `2026-05-20-infection-grid-fill.md` の進行で OperatorStrip が
  HostDashboard から RoomLayout 側に移されていたため、本プランの編集と衝突
  しないように差分のみ反映 (action runner / RESET_CONFIRM_TIMEOUT_MS 等は
  そちら側で削除済み)。
- D1 / KV / R2 は追加せず (`wrangler.toml` 不変)。`relayHandler.metrics()`
  サーバ側ロジックも不変。
- `ViewSwitcher` の 5 mode は不変。新規 view mode は出していない (原則の
  実践)。
- nice-to-have 4 件 (N1 pair-heatmap / N2 score-gap / N3 longest-chain /
  N4 first-movers) は `docs/exec-plans/active/2026-05-20-host-metrics-nice-to-have.md`
  に skeleton で起票。実施タイミングが来た N から個別 plan を切る方針。

### 検証

- `pnpm -r typecheck` ✅
- `pnpm -r test` ✅ (client 219 / server 74 / handlers 29 = 322 passed)
- `pnpm e2e e2e/host-view-switcher.spec.ts` ✅ (2/2 passed)
- Lint: 自分の変更ファイルは format 適用後 clean。リポジトリ全体の既存 lint
  エラー (HeroTile / identity / bot-pool 等) は本プラン範囲外。

### 残課題 / 次の注意点

- nice-to-have は 1 件ずつ個別 plan で実施する (本プランで束ねない)。
- `encounters` を ParticipantListTile にも置きたくなったら、密度 (情報過多)
  を慎重に評価する (本プラン Decision Log: 1 箇所だけ)。
- 「ended phase 導入したい」要望が再燃した時はこのプランの Decision Log を
  参照すること (ADR-0003 と一貫した不採用判断)。
