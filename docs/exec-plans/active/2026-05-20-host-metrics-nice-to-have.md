# Plan: Host Metrics Nice-To-Have Batch

Owner: miura
Status: Skeleton (awaiting prioritization)
Created: 2026-05-20

## Goal

Roadmap-only successor to `2026-05-20-metrics-and-end-state-roadmap.md` (Completed).
Captures the 4 nice-to-have items that the ship-now batch deferred, so they have a
landing place when one of them is requested next. **No code is written from this
plan until each item is individually approved and promoted into its own dated
plan or a focused sub-plan.**

## Context

- Parent plan (completed): `docs/exec-plans/completed/2026-05-20-metrics-and-end-state-roadmap.md`.
- Ship-now batch already landed: `encounters` 列 (`RankingsTile`), sort toggle + 未参加 badge. ~~`直近 60s` throughput in `StopwatchTile`~~ は後に削除 (`StopwatchTile` の prop を `phase` / `elapsedMs` のみに整理し、`overview-play` 下段は新 `ScanCountTile` で「総スキャン数」を表示する構成に置換。`recentThroughput` 関数自体は `host-view.ts` に残置)。再導入する場合は [ADR-0007](../../adr/0007-host-operator-strip-to-header.md) §Risks の note 参照。
- Original analysis identified 8 candidate metrics; ship-now took 3, defer took 3, nice-to-have is the remaining 4 (below).
- 設計原則 (from parent Decision Log) は継承する: 「filter / sort / 列で済むものは新 view mode を作らない」「scalar は新 tile を作らない」「server `metrics()` は触らない、client-side 集計に寄せる」。

### Related code

- `apps/client/src/lib/host-view.ts` — pure aggregates (`rankings`, `encounterCounts`, `recentThroughput`, `tokenPathChain`).
- `apps/client/src/components/host/` — RankingsTile / TokenPathTile / ParticipantListTile / ViewSwitcher.
- `apps/client/src/routes/HostDashboard.tsx` — grid templates and view-mode wiring.

## Scope

In scope (each item is a separate workstream; pick one at a time):

- **N1 `pair-heatmap` (NEW view mode +1)** — N×N matrix of pair scan counts.
  Matrix shape can't be expressed by filter/sort on a list, so this is the
  one approved exception to the "no new view mode" rule. Requires a new tile,
  a new entry in `ViewSwitcher`, a new layout key in `HostDashboard`, and a
  new pure aggregator (`pairCountMatrix(state, players)`). Owns its own e2e.

- **N2 `score-gap` column on RankingsTile** — `score` preset 限定の追加列。
  各プレイヤーの「リーダーとのスコア差」(`-5`, `±0` 等) を `RankingsTile` の
  score-mode row に表示。preset 判定は `room.handlerConfig.value.kind === "score"`
  で行う。`pickHostHeroView` の score-leader 計算と同じソースから派生させる。

- **N3 `longest-chain` callout on TokenPathTile** — token preset 限定の
  scalar。`tokenPathChain` の連続成功 streak を計算してヘッダに `最長連鎖: 7`
  と 1 行同居。新 tile を作らない。

- **N4 `first-movers` sort on ParticipantListTile** — `joinedAt` (現状) と
  `firstScanAt` の 2 軸 sort トグル。`firstScanAt` は history から派生
  (`history.find(h => h.scannerId === p.id)?.ts`)。

Out of scope (defer 確定、再燃したら別 plan で議論):

- ネットワーク中心性 (graph centrality) — Stage 可読性方針に反する。
- joined-time cohort 統計 — 30 人想定では情報過多。
- セッション履歴 (過去ルーム比較) — D1 / KV を要するので別議題。

## Milestones

各 N は **独立した sub-plan** として起票する想定。本プランはバックログ。

1. **N1 pair-heatmap** — 新 view mode (matrix なので例外)。
2. **N2 score-gap** — RankingsTile column (score preset 限定)。
3. **N3 longest-chain** — TokenPathTile callout (token preset 限定)。
4. **N4 first-movers** — ParticipantListTile sort toggle。

## Progress

- [ ] N1 起票 → 実装 → 検証 → 完了
- [ ] N2 起票 → 実装 → 検証 → 完了
- [ ] N3 起票 → 実装 → 検証 → 完了
- [ ] N4 起票 → 実装 → 検証 → 完了

## Decision Log

- **本プランはバックログ専用** — 4 つの N を 1 プランに束ねると進捗管理が
  曖昧になる。実施タイミングが来た N から個別 plan を起票する。
- **N1 だけが view mode を +1 する** — matrix shape は list の filter/sort で
  表現できないから (継承決定)。N2 / N3 / N4 は既存 tile 内で完結する。
- **server `metrics()` は触らない** — 親プランの継承決定。すべて
  `state.history` / `state.pairCounts` から client-side 派生で導出する。

## Surprises And Discoveries

(N を実施する際に追記)

-

## Verification

各 N の sub-plan で具体化する。共通の最低ラインは:

- `pnpm -r typecheck`
- `pnpm -r test`
- `pnpm e2e e2e/host-view-switcher.spec.ts` (N1 は spec 更新が必要)
- 5 preset × 6 view mode (N1 後) または 5 mode (N2-N4) で破綻しないこと

## Outcomes And Retrospective

(全 N 完了時、または継続放棄時に記入)

-
