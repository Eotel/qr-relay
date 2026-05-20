# ADR-0007: OperatorStrip をヘッダへ統合し、dashboard tick を tile に閉じ込める

**Date**: 2026-05-20
**Status**: accepted
**Supersedes**: [ADR-0006](0006-host-multi-view-dashboard.md) §Decision 5 (bottom band 固定) と §Decision 6 のうち「OperatorStrip を `display: none` 切替対象に含める」部分
**Related**: [ADR-0004](0004-host-stage-dashboard.md) §Decision 5, [ADR-0006](0006-host-multi-view-dashboard.md)
**Deciders**: miura

## Context

ADR-0004 §Decision 5 と ADR-0006 §Decision 5 で「start / pause / reset の OperatorStrip は dashboard の下端 1 行に常時可視」と決めた。実装後の運用で次の問題が見えた:

- OperatorStrip は `h-12` の Button 群を flex 行に固定していたため、tall viewport (1440p / 4K プロジェクター) では下端に縦方向の slack が残り、short viewport (laptop md+ 13") では上の tile を圧迫する。`grid-template-areas` の `op` を `auto` / `1fr` どちらに設定しても両極に同居できなかった。
- focus mode (rankings / token-path / infection / participants) で main area を `repeat(8, 1fr)` + `op auto` に詰めても、StopwatchTile がさらに `1fr` を分け合うため digits が clip された (ADR-0006 §Decision 6 の `op` 帯と stopwatch の取り合い)。
- ホストが想定する端末は PC / iPad で、操作 UI は **header の右端に並んだ pill** で十分に届く。会場視線 (= 6 m 先) の主役はゲーム状態であって button 群ではない、という ADR-0006 §Decision 1 の原則を強化する方向。

同時に、performance audit (`/impeccable audit`) で次の浪費が明らかになった:

- `HostDashboard.tsx` が `setInterval(setTick, 250)` で `tick` state を更新し、`running` 中は dashboard 全 tile が 4 Hz で再レンダーされていた。`Date.now()` を実際に必要としているのは `StopwatchTile` だけ。
- `rankings()` / `encounterCounts()` / `tokenPathChain()` は `useMemo([state, players])` で gate されていたため、scan が 1 件届くだけで隠れている focus tile の重計算 (`pairCounts` の O(n²) walk 含む) も発生していた。
- `HeroTile` の `ProgressBar` が `transition-[width]` で `width: x%` を駆動しており、token-many の毎スキャンで layout pipeline が走っていた。

関連:
- `apps/client/src/components/host/OperatorStrip.tsx` (削除対象)
- `apps/client/src/routes/RoomLayout.tsx` (ヘッダ右端に `HostHeaderOperator` を追加する側)
- `apps/client/src/routes/HostDashboard.tsx` (`op` area + tick driver を撤去する側)
- `apps/client/src/components/host/StopwatchTile.tsx` (新規 `StopwatchTileLive` ラッパで自前 tick)
- `apps/client/src/components/host/{Rankings,TokenPath,InfectionGrid}Tile.tsx` (`React.memo` 化)
- `apps/client/src/components/host/HeroTile.tsx` (`ProgressBar` 内の width → transform)
- `apps/client/src/components/host/ScanCountTile.tsx` (新規。`overview-play` の slot に追加)

## Decision

OperatorStrip の物理タイル化を撤回し、dashboard 内の周辺パフォーマンス箇所も合わせて整理する。

1. **`OperatorStrip.tsx` を削除**。start / pause / resume / reset の状態機械は `RoomLayout.tsx` 内の `HostHeaderOperator` に移し、`role === "host"` の md+ ヘッダ右端に **pill サイズの Button 2 つ** (reset + primary) で表示する。`<md` (handheld) は従来通り `HostRoomHandheld` 側の sticky footer を維持。
2. **`HostDashboard.tsx` の `gridTemplateAreas` から `op` を削除**。focus mode の行定義 `auto repeat(8, 1fr) auto` は維持し、末尾の `auto` 行は **stopwatch 専用** に格上げする (以前は `op` と clock が auto 行を取り合っていた)。overview の下段 2 行は `ticker / scans / clock / qr` に再分配し、`scans` slot に新設の `ScanCountTile` (server-pushed `総スキャン数` metric の単純表示) を当てる。
3. **dashboard の 250 ms tick driver を `StopwatchTileLive` に閉じ込める**。`HostDashboard` から `setInterval` / `tick` state / `Date.now()` 計算を除去し、純粋な `StopwatchTile` (test contract: `elapsedMs={...}`) を自前 tick の `StopwatchTileLive` でラップする。これで `running` 中の 4 Hz 再レンダーは clock cell に限定される。
4. **focus mode の重 memo を `mode` で gate する**。`rankings` / `encounterCounts` / `tokenPathChain` は active mode のときだけ計算し、それ以外はモジュールレベル空参照 (`EMPTY_RANKINGS` / `EMPTY_ENCOUNTERS` / `EMPTY_CHAIN`) を返す。
5. **focus tile を `React.memo` で包む**。`RankingsTile` / `TokenPathTile` / `InfectionGridTile` は (4) の空参照が安定なので、hidden 状態では再レンダー自体が skip される。
6. **`HeroTile` の `ProgressBar` は `transform: scaleX()` 駆動に切替**。`transition-[width]` は layout property animation で audit の禁則に該当するため、`origin-left` + `transition-transform` に置き換える。outer の `overflow-hidden rounded-full` が右端の角丸 cap を維持する。
7. **ADR-0006 §Decision 6 の「全 tile を常時 mount + `display: none` 切替」は維持**。`LastScanTicker` pulse / `JoinQrTile` canvas / `StopwatchTileLive` tick の連続性は保たれる。OperatorStrip だけが削除対象。

## Alternatives Considered

### Alternative 1: OperatorStrip を残し、`op` area の高さ計算を直す

`op` を `min-content` にし、内部 button を `h-10` に下げる等で slack を吸収する。

- **Pros**: ADR-0006 の構造を温存できる。
- **Cons**: short viewport (13" laptop) では依然 1 行ぶんの垂直予算を要求し、focus mode の main area を圧迫する。tall viewport では button 上の余白が空いて見える。両極の両立は cell ベースの grid では難しい。
- **Why not**: そもそも button を「stage の周縁」に置く必要は、ホスト端末が PC / iPad であれば header の右端で達成できる。物理 cell として 1 行確保する必然性が薄い。

### Alternative 2: OperatorStrip を全 mode 共通の overlay (floating) に格上げ

dashboard cell を抜けて position: fixed + 半透明背景で右上 / 右下に浮かせる。

- **Pros**: layout の取り合いから完全に解放される。
- **Cons**: backdrop-blur / glass を装飾として使うのは DESIGN.md の禁則 (`Don't ... glass / blur を装飾として使う`)。透過 chrome は stage 6 m 視認の妨げにもなる。
- **Why not**: 視覚的 noise を増やす方向。header の pill 群で機能要件を満たせるなら chrome を増やさない方が良い。

### Alternative 3: dashboard tick を `useSyncExternalStore` で zustand 直結に置き換える

zustand store に `now` field を入れ、別 worker / timer が 250 ms で更新する。

- **Pros**: 「時計の刻みは grobal な事実」を 1 箇所に集約できる。
- **Cons**: 時計を必要としない場面 (handheld client、settings overlay 等) もすべて store に subscribe するか selector で gate する手間が増える。 stopwatch 1 tile の都合に store を歪めるのは over-engineering。
- **Why not**: 効果が 1 tile に閉じる問題には、解も 1 tile に閉じる方が良い (`StopwatchTileLive` ラッパで足りる)。

### Alternative 4: focus tile の `useMemo` gate ではなく、tile 側で `visible` prop を見て早期 return

`mode` を tile に伝え、hidden 時は `null` を返す or `useMemo` を自身で gate する。

- **Pros**: tile のローカル責務として閉じる。
- **Cons**: `display: none` で chrome を hide する ADR-0006 §Decision 6 の方針と二重に gate することになる。dashboard 側が memo を計算しなければ tile に空参照を渡すだけで済むので、責務は dashboard に寄せた方が読み戻しが速い。
- **Why not**: gate を一箇所に集約する方が「scan が来たときに何が走るか」が dashboard の useMemo 群を見ればわかる。

## Consequences

### Positive

- ホスト dashboard の `running` 中 4 Hz 再レンダーが clock cell に限定された。LastScanTicker / Hero / Rankings 等は store delta が来たときだけ再レンダーする。
- focus tile が hidden な間、`pairCounts` walk / player sort / chain build が完全に skip される。store push のコストが減る。
- ProgressBar の更新が GPU composite だけになり、token-many preset で 1 sec 1 scan が連続しても dashboard 領域に layout pipeline が走らない。
- header に reset + primary の 2 pill が並ぶことで、ホストは tile に視線を奪われず操作を完結できる。stage 視聴主体 (= 会場) は button 群を視野に入れずに済む。
- ADR-0006 §Decision 6 (全 tile 常時 mount) の利点 (pulse 継続 / canvas 維持) は維持される — OperatorStrip だけが mount/unmount 対象から外れた。

### Negative

- ADR-0006 §Negative の「tile 数 10」のうち `Op` が消え、代わりに `ScanCountTile` が overview-play に追加された。実数は変わらないが、構成図 (ADR-0006 §Decision 3 のタイル列挙) は更新を要する。
- ホスト操作 UI の発見性が header の右端に寄ったため、初見で「どこから start するか」が tile 上にない。`HostHeaderOperator` の primary button が `bg-primary` + accent-tinted glow で目立つことで補うが、文化的に「主役 button は大画面の中央」を期待する人には違和感を残す。
- handheld (`< md`) の挙動は変更外。ホストが緊急用に handheld を握る場合は `HostRoomHandheld` の sticky footer のまま動く。

### Risks

- `StopwatchTileLive` が `state` を読まないため、throughput (60 s 窓の scan 数) を再度表示したい要望が出たときに props 設計を再検討する必要がある (一度入っていたが今は無し)。再導入時は `StopwatchTileLive` 内で `recentThroughput(state, now, 60_000)` を呼び、pause/ready の freeze 戦略は元の `lastThroughputRef` を踏襲する。
- `React.memo` 化した focus tile は props 同一性に依存する。今後 dashboard 側から inline-object / inline-arrow を渡し始めると memo が空振りになるので、`encounters?: Record<string, number>` のような map prop は引き続き `useMemo` を経由させる規律が要る。
- ADR-0006 §Decision 3 の「常時 mount」原則の上で OperatorStrip だけが例外的に header に移った形になり、後発の "全 mode 共通 chrome" が出てきたら header に置くのか dashboard cell に置くのかの判断軸を残しておく必要がある (header = ホスト個人のコントロール、cell = 会場が読む情報、で当面分ける)。
