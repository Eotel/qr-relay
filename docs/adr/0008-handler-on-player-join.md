# ADR-0008: ScanHandler に Player ライフサイクル hook (onPlayerJoin / onPlayerLeave) を追加

**Date**: 2026-05-20
**Status**: accepted
**Deciders**: miura

## Context

`relayHandler.initialState` は `reduceStart` が走る瞬間の `stored.players`
配列から `state.values[playerId]` を全員ぶん埋める。`reduceJoin` は
`stored.players` には新しいプレイヤーを足すが、**`stored.state` には何もしない**。

結果、ゲームが running になったあとから join したプレイヤーは
`state.values[playerId]` が undefined のまま放置される。relay の `onScan` は
`scannerSlot` または `scannedSlot` が undefined だと **エラーも返さずに
silent no-op で復帰** する (`relay.ts:122-126`)。

実害として、debug bot console (`/debug`) で room 作成 → observer 参加 →
`start` → bots 追加 → scan の順で操作すると、bot の WS send は届くのに
metric が一切動かず、host dashboard 上は全員 `未参加 / 0` のままになる。
ストップウォッチも進む、`state` ブロードキャストも走る、にもかかわらず
scan が成立しない状態は debug の難易度を跳ね上げる silent failure。

リアル運用でも「途中で切断して戻ってきた」「あとから加わった」プレイヤーは
普通に出るので、これは debug 専用の問題ではなく本物のゲームプレイ不具合。

## Decision

`ScanHandler` interface に optional な **ライフサイクル hook 2 つ** を
追加する:

- `onPlayerJoin(args: { state, config, player, now }) → state`
- `onPlayerLeave(args: { state, config, player, now }) → state`

呼び出し側:

- `reduceJoin` は `stored.state !== undefined && stored.state !== null`
  かつ join 入力が **新規プレイヤー** のとき (既存 id の再 join / rename
  ではないとき) に限り、`handler.onPlayerJoin` を呼んで state を更新する。
- `reduceLeave` (新規追加した reducer) は `stored.state` 初期化済みなら
  `handler.onPlayerLeave` を呼んで state を更新する。leave 対象が host なら
  `meta.hostId = null` も同時にクリア、未知 player なら no-op (idempotent)。

`relayHandler` の実装:

- `onPlayerJoin`: 既存スロットがあれば no-op、無ければ
  `rule.initial.holders === "all"` のときだけ holder 扱いで `makeSlot` を
  呼んでスロットを 1 個追加する (preset ごとの初期 amount を維持)。
- `onPlayerLeave`: 該当プレイヤーの `state.values[id]` を削除した新しい
  state を返す。`scanCounts` / `pairCounts` / `history` は触らない (退出後も
  「ここまで何人とすれ違ったか」は保持したい)。

`reduceJoin` は **新規 / 再 join 関係なく** state 初期化済みなら
`handler.onPlayerJoin` を呼ぶ。handler 側が idempotent (既存スロットなら
no-op) を保証する。これにより、`onPlayerJoin` が出る前に persist された
ルームでも、本人がもう一度 join 経路を通れば slot が補修される。

それでも踏める漏れ (古い DO storage のまま、本人が rejoin しない、しかし
scan は走る) に備えて、**`reduceScan` 側でも防御的 self-heal を入れる**:
`handler.onScan` を呼ぶ直前に、scanner / scanned それぞれを
`handler.onPlayerJoin` に通す。slot がある場合は no-op で抜けるので
通常の scan のコストは変わらない。slot が無い場合だけ slot が materialize
されてから onScan に入る。これでハンドラ側に「missing slot は silent
no-op で返す」というコードがあっても、scan は確実に成立する。

途中参加と退出はゲーム制御層 (Durable Object の reducer) の責務で、
handler は自分の state の整合性を維持する責任だけ持つ。

## Alternatives Considered

### Alternative 1: relay.onScan で lazy にスロットを生成

- **Pros**: 変更が relay 1 ファイルで完結、interface を増やさない。
- **Cons**: `state.values` がいつでも `players` を包含する不変条件が
  壊れる。`metrics` の集計や `StateInspector` の表示で
  "scan に絡んだことのある参加者のみ" という暗黙の歪みが入る。
- **Why not**: 不変条件を保つほうが debug 観察も rankings 表示も一貫する。
  スロット生成タイミングは「参加時」が意味的に正しい (scan して初めて
  「居る」ことになるのは奇妙)。

### Alternative 2: reduceStart 時に handler を再呼び出し可能にし、ホストに
"再初期化" UI を提供

- **Pros**: handler interface を増やさず、ホスト操作の枠で扱える。
- **Cons**: ホストが手動で押す必要があり、押し忘れたら今と同じ症状に戻る。
  ストップウォッチもリセットされてしまう (進行中のゲームを止めずに
  late joiner を含めたい要件と相反する)。
- **Why not**: 「途中参加したら自動で組み込まれる」のが期待動作なので、
  ホストの介在を要求するのは UX 後退。

### Alternative 3: reduceJoin の中で `handler.initialState` を再呼び出し、
state 全体を再構築

- **Pros**: 既存メソッドだけで完結。
- **Cons**: scanCounts / pairCounts / history / 各 token holder の現状が
  全部リセットされてしまい、ゲーム進行中の途中参加では使えない。
- **Why not**: 不可逆な情報損失。

## Consequences

### Positive

- 途中参加したプレイヤーがその場で scan / scanned 両方向で動くようになる。
- silent failure (scan が届くのにエラーも metrics 変化もない) の出口が
  1 つ閉じる。
- handler は「自分の state の整合性は自分で保つ」契約に近づく。
  ([core-beliefs.md §2](../design-docs/core-beliefs.md#2-handler-は-server--client-両方で動く-pure-function)
  の pure function 原則と整合)

### Negative

- `ScanHandler` interface に optional method が 1 つ増える。新 handler の
  実装者は「途中参加に対応する/しない」を意思決定する必要がある。
- `reduceJoin` が handler を参照するようになり、純粋な reducer から
  registry 依存が 1 段増えた (もともと `reduceStart` で同じ依存があるので
  新しい結合では無いが、join という比較的軽量な reducer まで広がった)。

### Risks

- handler 側の `onPlayerJoin` 実装が state 全体を雑に上書きすると、
  進行中の値が破壊される。relay の実装は `state.values[player.id]` の
  追加 1 箇所のみに限定して防いでいるが、新 handler を書く人は
  「既存スロットを触らない」原則を踏まないとリグレッションを起こせる。
- 「全員 join し終えてから start する」運用が当たり前だった世界観から
  「途中参加で勝手にスロットが生える」世界観に変わるため、preset 設計者は
  `initial.holders === "all"` を選んだときに「late joiner も holder 扱いで
  良いか」を意識する必要がある (steal の場合は OK、新規 preset で
  特殊な初期化が必要な場合は要 review)。

## 関連

- 実装:
  - `packages/core/src/handler.ts` — `onPlayerJoin?` / `onPlayerLeave?`
  - `packages/handlers/src/relay.ts` — relay 用の両 hook 実装
  - `apps/server/src/room-domain.ts` — `reduceJoin` / `reduceLeave`
  - `apps/server/src/room.ts` + `apps/server/src/index.ts` — `/leave` ルート
- テスト: `packages/handlers/src/relay.test.ts`, `apps/server/src/room-domain.test.ts`
- 発見経緯: [exec-plans/active/2026-05-20-client-debug-bot-console.md](../exec-plans/active/2026-05-20-client-debug-bot-console.md)
  の Surprises & Discoveries (join 側)。leave 側は join hook 追加と同時期に
  parallel 作業で同じ設計原則で導入された。
