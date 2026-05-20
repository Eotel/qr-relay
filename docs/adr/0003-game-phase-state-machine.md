# ADR-0003: ready / running / paused のゲームフェーズ状態機械を導入

**Date**: 2026-05-20
**Status**: accepted
**Deciders**: miura (owner), Claude

## Context

ADR-0002 で終了条件を engine から外す決定をした結果、ゲームの開始 / 一時停止 / 再開 /
リセットを誰がどう制御するかを設計し直す必要がある。現状は:

- WS `{ t: "start" }` で `meta.startedAt` を set するのみ
- pause / resume / reset の概念が無い
- scan は `startedAt` が null でも受理される (= 開始前でも scan できる)

これを以下の要件で再設計する:

1. ホスト画面に **加算ストップウォッチ** を常時表示
2. ボタンは `ready` と (`start`/`resume` ⇄ `pause`/`stop`) の **排他切替** だけ
3. `ready` で全リセット (state を `handler.initialState` 直後に戻す、ストップウォッチも 0)
4. `pause`/`stop` 中は **server 側で scan を no-op** する (クライアント側のカメラも止めると
   なお良いが、本質は server の gating)
5. 加算ストップウォッチの **tick 同期は不要**。ホスト画面で 1 秒ごとに進めばよく、他端末
   全員に同期して表示する必要はない (前回の議論で「ローカル制御」を選択)

要するに server は **フェーズ遷移と累積時間の起点だけ** を持ち、tick はホスト画面が
自前で進める。

関連:
- ADR-0002 (終了条件を外す決定)
- `apps/server/src/room-domain.ts` (現在の `reduceStart` / `reduceEnd`)
- `apps/server/src/room.ts` の WS message ハンドラ
- `apps/client/src/lib/ws-store.ts` (state 受信)

## Decision

サーバ側 state に **フェーズ** を導入し、host 由来の WS message でフェーズ遷移する。

### Phase 型

```ts
type Phase =
  | { kind: "ready" }                                       // 開始前 / リセット直後
  | { kind: "running"; startedAt: number; accumulatedMs: number }
  | { kind: "paused"; pausedAt: number; accumulatedMs: number };
```

- `running.startedAt`: 現在の running 区間が始まった unix ms
- `running.accumulatedMs`: 過去の running 区間の合計 (pause → resume を跨いだ累積)
- 表示時の経過 = `accumulatedMs + (now - startedAt)` (`running`) / `accumulatedMs`
  (`paused`) / `0` (`ready`)

`RoomMeta` から `startedAt` / `endedAt` を消し、`phase: Phase` に置き換える。

### 状態遷移

```
                  ready ─[start]→ running
                    ↑               │ ↑
                    │               │ │
       [reset]──────┤               │ │[resume]
                    │               ↓ │
                    └─────── paused ──┘
                       [reset]
```

| from \ to | ready | running | paused |
|---|---|---|---|
| ready | — | `start` (host) | — |
| running | `reset` (host) | — | `pause` (host) |
| paused | `reset` (host) | `resume` (host) | — |

### WS messages (追加 / 変更)

```ts
// host → server
| { t: "start" }     // ready → running  (既存だが意味を厳密化)
| { t: "pause" }     // running → paused
| { t: "resume" }    // paused → running
| { t: "reset" }     // running|paused → ready (state も initialState に戻す)
```

`{ t: "end" }` は削除 (終了は `reset` で表現)。

### scan gating

`reduceScan` の冒頭で `stored.meta.phase.kind !== "running"` なら no-op エラー
(`{ ok: false, code: "not-running", message: "game is not running" }`) を返す。
WS error として client に通知。

### ホストのストップウォッチ表示

クライアントは server から `phase` を受け取り、ローカルで:

```ts
function displayMs(phase: Phase, now: number): number {
  switch (phase.kind) {
    case "ready":   return 0;
    case "paused":  return phase.accumulatedMs;
    case "running": return phase.accumulatedMs + (now - phase.startedAt);
  }
}
```

ホスト画面では `requestAnimationFrame` か `setInterval(100ms)` で再描画。
clients (非ホスト) には同じ phase が broadcast されるが、UI 上はストップウォッチを出さない
(出しても OK、責務は表示の有無を切り替えるだけ)。

## Alternatives Considered

### Alternative 1: サーバが ticking して 1 秒ごと broadcast
- **Pros**: 全クライアントで完全に同じ秒数が見える
- **Cons**: Cloudflare Workers DO で 1 秒間隔の `alarm` を持つのは可能だが、`alarm` 1 個
  は 1 ルームにつき 1 個まで。さらに hibernation との相性も悪化する。コスト / 複雑度の
  上昇に対し、ストップウォッチが 0.5 秒ずれて見える程度の価値しかない
- **Why not**: ユーザーが明示的に「ローカル制御で十分」と選択 (前のターン)

### Alternative 2: phase を持たず `startedAt` / `pausedAt` を nullable で並べる
- **Pros**: 既存 `meta` 構造を最小変更
- **Cons**: 「running なのに pausedAt が non-null」のような不正な組み合わせが型で防げない。
  reducer 側で defensive code が増える
- **Why not**: 状態機械を discriminated union で表現できるなら、最初からそうした方が
  reducer が読みやすい

### Alternative 3: scan gating を client 側だけで行う
- **Pros**: server を変更しなくて済む
- **Cons**: client がフェーズを誤認 (古い state を握っている / 自作 client) すると
  scan が通ってしまう。authoritative であるべき server に gating を持たないのは脆い
- **Why not**: ADR-0002 で engine を簡素化した代わりにゲーム制御層が authoritative である
  必要性が増した。server gating が正解

### Alternative 4: ready を別 phase にせず「running の 0 秒状態」として扱う
- **Pros**: phase が 2 種類で済む
- **Cons**: 「開始前は scan 不可、開始後は scan 可」の境界が「accumulatedMs === 0 &&
  startedAt === createdAt」のような暗黙条件になる。reset 後に再 ready 状態に戻す意味も
  曖昧
- **Why not**: 「開始前 / 進行中 / 中断」は人間の認知でも別物。3 phase が素直

## Consequences

### Positive
- `RoomMeta` の型が `phase: Phase` のひとつで状態を完全に表現できる (`startedAt` /
  `endedAt` の 2 nullable の組合せより安全)
- scan の有効性 = `phase.kind === "running"` で 1 行で判定できる
- ストップウォッチ表示は **state の派生** にすぎないので、サーバ tick を持たずに済む
- host 操作 (`start` / `pause` / `resume` / `reset`) の意味が明確化し、UI のボタン構成と
  1 : 1 対応する
- engine 側に時間概念が無くなる (`handler.onScan` が `now` を受けるのはイベント発生時刻を
  記録するためのみ、判定には使わない)

### Negative
- 既存の `meta.startedAt` / `endedAt` を読んでいる箇所 (`relay.ts` の `RelayState` 含む、
  client の表示) を全部書き直し
- WS message の追加で client / server / E2E テストすべてに変更が入る

### Risks
- **host 切断時の挙動**: host が WebSocket を落としたまま running が続く場合、誰も
  pause / reset できなくなる。対処は本 ADR の範囲外だが、`hostId` の再 attach に対応する
  既存ロジック (`reduceJoin` の re-host 動作) で実用上問題ない見込み
- **time drift**: client の `Date.now()` がサーバとずれている場合、ストップウォッチ表示が
  数 ms ずれる。100ms オーダーで気にならないため許容
- **複数ホスト**: 現状 `hostId` は 1 名固定。複数ホストが pause を競合させる懸念は無い
