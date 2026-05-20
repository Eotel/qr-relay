# ADR-0006: ホスト dashboard に view switcher を内蔵し、`/scoreboard` 経由のスコア閲覧は host から外す

**Date**: 2026-05-20
**Status**: accepted (§Decision 5 と §Decision 6 のうち OperatorStrip 部分は [ADR-0007](0007-host-operator-strip-to-header.md) で superseded)
**Supersedes**: [ADR-0004](0004-host-stage-dashboard.md) §Decision 2 / §Decision 3 (view-kind と grid 切替の運用が変わるため。pickHostHeroView は overview mode 内に残存)
**Superseded-in-part-by**: [ADR-0007](0007-host-operator-strip-to-header.md)
**Related**: [ADR-0003](0003-game-phase-state-machine.md), [ADR-0005](0005-drop-player-board-from-host-stage.md)
**Deciders**: miura

## Context

ADR-0004 / ADR-0005 で host stage dashboard を「会場全員のゲーム経過フィードバック画面」として再構成し、tile を 5 枚 (Hero / LastScanTicker / Stopwatch / JoinQr / OperatorStrip) に整理した。一方、運用の議論で次の論点が再浮上した:

- このアプリは「測る道具」であり、勝敗判定はゲーム制作者 (ホスト) の責務 (`PRODUCT.md` 参照)。したがって host には複数の観点の metric を提供したい:
  - scan / scanned ランキング
  - token 遷移経路 (誰が誰を scan したかの時系列)
  - 感染グリッド (nickname × value を grid で並べ「徐々に染まる」可視化)
  - シンプル参加者一覧 (joinedAt 順)
- これらを「結果ビュー」として pause 時にだけ出す案も検討したが、(a) pause は単に scan が止まるだけの限定的な意味で十分、(b) 観点を切り替えたいのは running 中も同じ、(c) 結果ビュー専用 layout を作ると resume で flash が起きる、という理由から **常に realtime で見え、ホストが手動で切り替える** 方が望ましいと判断した。
- 同時に、現行 `/r/:code/scoreboard` route + `RoomLayout` 上部の「ルーム / スコア」2-tab は、host 側では新しい dashboard が完全に置換できる。重複を残すと「どっちが正規か」が曖昧になる。

関連:
- `packages/core/src/types.ts:14-17` — `Phase = ready | running | paused` (ended は追加しない方針を継続)
- `packages/handlers/src/relay-rule.ts:54` — `RelayState.history { scannerId, scannedId, ts }[]` (新規 metric の全データ源)
- `apps/client/src/routes/HostDashboard.tsx` — dashboard 本体
- `apps/client/src/routes/RoomLayout.tsx:198-237` — 2-tab nav の gate 対象
- `apps/client/src/routes/Scoreboard.tsx` / `MetricsPanel` — client のスコア tab で残置
- `docs/exec-plans/active/2026-05-20-host-multi-view-dashboard.md` — 本決定の実装プラン

## Decision

ホスト dashboard を「**観点を切り替えられる realtime 計測装置**」として再構成する。

1. **`HostDashboard.tsx` 内に `ViewSwitcher` (segmented control) を内蔵**。top 1 行に置く。
2. **5 つの view mode を提供**: `overview` (default) / `rankings` / `token-path` / `infection` / `participants`。mode は internal state で、URL / route には出さない (reload で default に戻ってよい)。
3. **`overview` mode は ADR-0004 / ADR-0005 の構成を継承**: Hero / LastScanTicker / Stopwatch / JoinQr の 4 tile + 上部 ViewSwitcher + 下部 OperatorStrip。waiting / play の 2 サブレイアウトはそのまま。
4. **4 つの focus mode はそれぞれ専用 tile を中央にフル幅で出す**:
   - `rankings` → `RankingsTile` (scan-out / scan-in 2 column、降順 / joinedAt tiebreak、全員表示)
   - `token-path` → `TokenPathTile` (時系列の縦 chain テキスト、最新 20 行表示、それ以前は fade-truncate)
   - `infection` → `InfectionGridTile` (nickname grid、`ValueSlot` で塗り分け。token holders / score amount > 0 のセルが光る)
   - `participants` → `ParticipantListTile` (joinedAt 順の最小一覧)
5. **OperatorStrip と StopwatchTile は全 mode で常時可視**: 下部の固定帯。view を切り替えても start / pause / reset と経過時間に常にアクセスできる。
6. **mode 切替は CSS のみで完結**: 全 tile を常時 mount しておき、`gridTemplateAreas` (mode 別 6 種) と `display: none` の組み合わせで切り替える。tile re-mount を避けることで `LastScanTicker` の pulse / `JoinQrTile` の canvas / `StopwatchTile` の tick が switch で崩れない。
7. **`RoomLayout` 上部の 2-tab nav は host で非表示** (`role === "client"` で gate)。host は dashboard 内の ViewSwitcher が代替。client (handheld) は従来通り「ルーム / スコア」tab + `/r/:code/scoreboard` を維持。
8. **`/scoreboard` route / `Scoreboard.tsx` / `MetricsPanel` は client 用に残置**: handheld player が「自分のスコアを覗きたい」局面はあり、現行 UX を壊さない。
9. **新規 phase を追加しない**: `paused` は scan ブロック + final metrics 計算済みで実質的な終了状態。view 切替と phase は直交する関心。
10. **D1 / KV / R2 等の追加 binding は行わない**: 必要なデータ (`RelayState.history`) は DO state に揃っており、inactivity alarm (warn 10m → close 15m) で十分にクリーンアップが回る。

集計関数 (`rankings()`, `tokenPathChain()`) は `apps/client/src/lib/host-view.ts` に置き、preset 不可知の pure 関数として書く。Tile は全部 pure presentational。

## Alternatives Considered

### Alternative 1: Pause 中だけ「結果ビュー」レイアウトに切り替える

`paused` を検出して dashboard を別レイアウト (rankings 等) に切り替え、resume で running 用に戻す。

- **Pros**: ホストが「pause = 結果」という意味で運用できる。view 切替の能動操作が要らない。
- **Cons**: (a) running 中も観点を切り替えたい需要に応えられない。(b) resume の度に layout が変わって LastScanTicker pulse / scroll 状態がリセットされる。(c) `ended` phase を将来作りたくなる動機を生む (本質的には phase と view は別問題)。
- **Why not**: 「pause は単に scan が止まるだけのシンプルな意味」のままに揃えた方が、`paused` phase の責務が膨張せず、Design Principle 1 (Time-to-play is sacred) を守れる。

### Alternative 2: `ended` phase を新設し、終了 → 結果スナップショットを永続化する

`ready | running | paused | ended` の 4 状態に拡張し、`endedAt` / `finalMetrics` を持たせる。永続化は D1 に。

- **Pros**: tournament / 結果 export / 過去ルーム閲覧が将来可能になる。
- **Cons**: reducer / handler / ADR-0003 / WS protocol / UI 全層に波及する大改修。本プランの主目的 (複数の観点を realtime で見せる) には phase 拡張は不要。
- **Why not**: 「測る道具」というプロダクト定義の範囲では DO 中の realtime state で十分。永続化は別の動機 (アーカイブ / 共有) が出てきた時に別 ADR で議論する。

### Alternative 3: view mode を URL / route 化する (`/r/:code/host?view=rankings` 等)

各 view を別 route または query param で扱い、bookmark / 共有可能にする。

- **Pros**: ホスト同士で「この view を見て」と URL 共有できる。
- **Cons**: stage 視聴体験は ephemeral (reload で default に戻ってよい)。URL に出すと bookmark が増えて意味のないノイズになる。route 化すると component の mount / unmount が起きて switcher の利点 (re-mount しない) が失われる。
- **Why not**: 機能 vs コストが見合わない。internal state で 1 set / 1 reload 寿命のままで十分。

### Alternative 4: 2-tab を host にも残し、`/scoreboard` を「もう 1 つの host view」として並列運用

dashboard と /scoreboard が両方残り、ホストは header tab で行き来できる。

- **Pros**: 既存実装を壊さない。
- **Cons**: dashboard の ViewSwitcher と RoomLayout の 2-tab が二重ナビになる。`/scoreboard` の `MetricsPanel` は handheld 寸法前提で stage register では情報密度が低い。
- **Why not**: ホストには 1 つの正規ナビ (ViewSwitcher) があれば足りる。冗長を削ることで「どっちで見るのが正しい?」の迷いをなくす。

## Consequences

### Positive

- ホストが「いま誰がリードしているか / 経路 / 感染進行 / 参加者」を **1 タップで切り替え** て見られる realtime dashboard を獲得。
- 全 metric が DO state の `RelayState.history` から導出されるため、新 metric を足すのは `host-view.ts` の関数 + tile 1 枚 + ViewSwitcher の option 追加で済む。preset 拡張 (9 preset 計画) にも開かれた構造。
- ホスト side の navigation が 1 系統 (ViewSwitcher) に収束し、`/scoreboard` route の重複が解消される。
- Tile 全部が CSS のみで mount し続けるため、pulse / canvas / tick 等の生きた UI が switch で崩れない。
- Pause / Resume / Reset の制御が **全 view mode で常時可視**。観点を切り替えても操作不能にならない。

### Negative

- HostDashboard は tile 数が 9 (Switcher / Hero / Ticker / QR / Rankings / Path / Infection / Participants / Clock / Op の 10) に増えた。常時 mount している分、初期 render コストが ~1 tile 分追加。実測では問題ないレベル (vitest 145 tests pass)。
- ViewSwitcher の存在自体が「dashboard には複数 view がある」という発見コストを生む。default (overview) のままでも本質的な情報は揃うので fatal ではないが、`ranking` 等の存在を知る導線は switcher だけ。
- ホストが viewport の小さい端末で運用するケース (`< md` handheld フォールバック) では ViewSwitcher は提供されない (現状の `HostRoomHandheld` は変更外)。緊急時のホスト端末利用のみで現状維持。

### Risks

- view mode が増えすぎると ViewSwitcher が水平スクロールに迫る。現状 5 mode で chrome に収まっているが、9 preset 化と同時に view が増える展開なら switcher の overflow 戦略 (ドロップダウン / 縦タブ) を再検討する。
- `RelayState.history` は monotonically 成長する。30 分 / 30 名 / 2 scan/sec ≈ 100 KB で DO soft 25 MB の 0.4% に収まるが、3 時間級の長時間ルームを始めると線形に膨らむ。inactivity alarm で実用上は問題にならない見込みだが、上限を切る (古い entry を truncate する) 必要が出た場合は `tokenPathChain` の visibleSteps 表示と整合させる必要あり。
- `display: none` でも DOM ノードは生き続けるため、Playwright の `getByText` が hidden node を resolve して `toBeVisible` が fail する罠がある。e2e 側で `getByRole("region", { name: ... })` を使う規律を持つ必要 (新規 tile は全て `<section aria-label="...">` を付与済)。
