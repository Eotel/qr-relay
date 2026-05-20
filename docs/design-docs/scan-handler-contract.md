# ScanHandler Contract

Last reviewed: 2026-05-20 (ready-phase config 部分更新 / ADR-0009 追加)

新しい遊び方を追加するときに参照するハンドラー仕様。多くの場合は
**プリセット追加 (data 変更のみ)** で完結する。relay で表現できない novel ロジックが必要な
ときだけ新 `ScanHandler` を実装する。

---

## ScanHandler interface

定義場所: [`packages/core/src/handler.ts`](../../packages/core/src/handler.ts)

```ts
interface ScanHandler<TConfig, TState, TData> {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly configSchema: ZodType<TConfig, ZodTypeDef, unknown>;
  readonly dataSchema: ZodType<TData, ZodTypeDef, unknown>;

  initialState(args: { config; players; now }): TState;
  onPlayerJoin?(args: { state; config; player; now }): TState;
  onPlayerLeave?(args: { state; config; player; now }): TState;
  payloadFor(args: { state; config; player }): TData;
  onScan(args: { state; config; scanner; scanned; payloadData; now }):
    { nextState: TState; events: GameEvent[] };
  metrics(args: { state; config; players; now }): Metric[];
}
```

### 各メソッドの責任

| メソッド | 何を返す | 副作用 |
|---|---|---|
| `initialState` | ゲーム開始時の TState | なし。`now` は引数で受け取る |
| `onPlayerJoin` (任意) | 途中参加プレイヤーぶんを足した次の state | なし。`reduceJoin` が state 初期化済みかつ新規プレイヤーのときだけ呼ぶ |
| `onPlayerLeave` (任意) | 退出プレイヤーぶんを取り除いた次の state | なし。`reduceLeave` が state 初期化済みのときに呼ぶ |
| `payloadFor` | プレイヤーが今 QR に載せるべき TData | なし。state からの投影 |
| `onScan` | 状態遷移後の next state と発生 event | なし。決定的、純粋関数 |
| `metrics` | UI 表示用の Metric (count / score) | なし |

`onPlayerJoin` を実装しない handler は、ゲーム開始後に join したプレイヤーが
`state` 上では「居ないもの」として扱われる。relay の `onScan` は値スロットが
無いペアを silent no-op で落とすので、scan が成立しないまま気付かない、
という silent failure に繋がる。新 handler を作るときは原則として
`onPlayerJoin` / `onPlayerLeave` を対で実装するか、もしくは「途中参加を許さない」
運用前提を明文化する。relay の `onPlayerLeave` は `scanCounts` /
`pairCounts` / `history` を維持し、`state.values[id]` だけを落とす
(退出後も「すれ違った人数」は履歴として残す)。詳細は
[ADR-0008](../adr/0008-handler-on-player-join.md)。

すべて pure function。`Date.now()` / `Math.random()` / `fetch` を直接呼んではいけない。
時刻は `now`、ランダム性が必要なら呼び出し側が引数で渡す。
[core-beliefs.md §2](core-beliefs.md#2-handler-は-server--client-両方で動く-pure-function) 参照。

**Phase / 終了条件は handler の責務ではない**: 「ゲームが開始しているか / 一時停止中か /
終了したか」はゲーム制御層 (Durable Object の phase 状態機械) が握る。handler は
「scan 1 回で値スロット 2 個をどう書き換えるか」だけに責任を絞っている
([ADR-0002](../adr/0002-move-end-conditions-out-of-engine.md) /
[ADR-0003](../adr/0003-game-phase-state-machine.md))。

---

## ScanRule (relay engine の config)

定義場所: [`packages/handlers/src/relay-rule.ts`](../../packages/handlers/src/relay-rule.ts)

`relayHandler` の `TConfig` は `ScanRule`。4 軸の直交した option で 5 プリセットを表現
している。

### value: プレイヤーが何を保持するか

| kind | 意味 | 追加フィールド |
|---|---|---|
| `token` | 持つ / 持たない の boolean | — |
| `score` | 数値 | `defaultAmount?` (初期値) |

`status` (ラベル付き token) 軸は廃止 ([ADR-0001](../adr/0001-drop-status-value-kind.md))。
鬼ごっこ / 鬼交代は `token` で同形に書ける。

### initial: 初期配布

| holders | 意味 |
|---|---|
| `"all"` | 全員に配る |
| `"one"` | 1 人 (現状は配列先頭) |
| `"none"` | 誰も持っていない状態で開始 |
| `string[]` | 指定 ID のプレイヤーに配る |

`amount` (score 用初期値) も指定可能。

**ready 中の部分更新**: ホストはルーム作成後 `start` 前に
`POST /api/rooms/:code/config` (relay 限定) で `initial.holders` /
`initial.amount` などの部分上書きができる。サーバは `mergeScanRule`
(`packages/handlers/src/relay-rule.ts`) で current config に patch をマージし、
`ScanRule` schema で再 parse する。`ready` 以外の phase では 409 を返す。
ホスト UI の対応は `ReadyConfigEditor` (`apps/client/src/components/host/`)。
詳細は [ADR-0009](../adr/0009-ready-phase-config-editor.md)。

### onScan: スキャン発生時の変化

`source` は **被スキャナ (=QR を見せた側)**、`sink` は **スキャナ (=カメラで読んだ側)**。
両者を独立に指定する。

| 値 | token に対する効果 | score に対する効果 |
|---|---|---|
| `"keep"` | 変化なし | 変化なし |
| `"lose"` | `has = false` | `amount -= amount` |
| `"gain"` | `has = true` | `amount += amount` |
| `"increment"` | (なし) | `amount += amount` |
| `"decrement"` | (なし) | `amount -= amount` |

`amount?` は数値変化の量 (デフォルト 1)。

### constraints: 適用条件

| フィールド | 意味 |
|---|---|
| `uniquePerPair` | 同じ (scanner, scanned) ペアの 2 回目以降を無視 |
| `requireSourceHas` | `true` のとき: 被スキャナが値を持っている (token=has / score>0) ときだけ作用 |
| `requireSinkLacks` | `true` のとき: スキャナが値を持っていないときだけ作用 |
| `minValue` / `maxValue` | score の上下クランプ |
| `direction` | (現状は `"either"` のみ実装) |

---

## 新プリセット追加 5 ステップ

例: 「相手の点数を奪うが、自分も 1 失う」のように構造として既存に近いものを足す場合。

### Step 1: presets.ts に entry を追加

[`packages/handlers/src/presets.ts`](../../packages/handlers/src/presets.ts) の `presets`
配列に entry を 1 つ追加するだけ。

```ts
{
  id: "trade",
  name: "交換",
  description: "スキャンすると相手から 1 点もらい、自分も 1 点失う。",
  rule: {
    value: { kind: "score", defaultAmount: 5 },
    initial: { holders: "all", amount: 5 },
    onScan: { source: "decrement", sink: "decrement", amount: 1 },
    constraints: { minValue: 0 },
  },
},
```

### Step 2: relay.test.ts にテストを追加

[`packages/handlers/src/relay.test.ts`](../../packages/handlers/src/relay.test.ts) の
既存プリセット (`baton` / `infection` / `steal` 等) を参考に 2-3 ケース。最低でも
`initialState` と「constraints を満たす scan で state が変わる」を覆う。

### Step 3: テスト実行

```bash
pnpm --filter @qr-relay/handlers test
```

### Step 4: クライアントは触らない (自動表示)

`apps/client/src/routes/NewRoom.tsx` は `/api/handlers` の preset 配列をそのまま
表示するため、preset を増やすだけで `/new` 画面に出る。コンポーネント変更は不要。

### Step 5: wrangler dev で smoke

```bash
pnpm dev:server   # 別ターミナルで pnpm dev:client
```

ブラウザで `/new` → 新プリセットが選択肢に出ているか、作成後 `/r/:code` で動くかを確認。

---

## ゲーム制御層 (engine の外)

phase 状態機械 (`ready` / `running` / `paused`) と scan gating は
`apps/server/src/room-domain.ts` の `reduceStart` / `reducePause` / `reduceResume` /
`reduceReset` が担当する。詳細は
[ADR-0003](../adr/0003-game-phase-state-machine.md)。

ホスト操作 WS メッセージ:

```ts
| { t: "start" }     // ready → running
| { t: "pause" }     // running → paused
| { t: "resume" }    // paused → running
| { t: "reset" }     // any → ready
```

scan は `reduceScan` 冒頭で `phase.kind !== "running"` を弾くので、handler は phase
概念を一切持たなくて良い。

---

## relay で表現できないとき: 新 handler を作る

例: 「QR を介してプレイヤー間で画像を渡す」(carrier) など、relay の値スロットでは
表現できない構造の遊び方が必要なとき。

### 大まかな手順

1. `packages/handlers/src/<name>.ts` を作る。`ScanHandler<TConfig, TState, TData>` を
   実装する。
2. `packages/handlers/src/index.ts` で `registerHandler(...)` する。
3. `packages/handlers/src/<name>.test.ts` を追加し、`initialState → onScan → metrics`
   をユニットテスト。
4. server / client は handler を id 文字列で参照しているので、handler を register
   するだけで `/api/handlers` 経由でクライアントに出る。新 handler 固有の UI が
   必要なら `apps/client/src/routes/NewRoom.tsx` で id 分岐。

### 注意

- 既存の `relayHandler` を上書きしない (`id` を必ず別名にする)。
- pure function 原則を守る ([core-beliefs.md §2](core-beliefs.md#2-handler-は-server--client-両方で動く-pure-function))。
- 途中参加 / 退出に対応するなら `onPlayerJoin` / `onPlayerLeave` を実装する。
  新規プレイヤーぶんを 1 箇所追加 / 退出プレイヤーぶんを 1 箇所削除する
  だけで済むことが多い。実装しない場合、ゲーム開始後 join したプレイヤーは
  scan / scanned 双方向で silent に落ち、退出プレイヤーは metric から消えない
  ([ADR-0008](../adr/0008-handler-on-player-join.md))。
- 画像本体など大容量データは QR に直接乗せない。`tokenRef = { id, sha256 }` を QR に
  乗せ、実体は DO storage / R2 に置く方針 (まだ実装していない。
  [../exec-plans/tech-debt-tracker.md](../exec-plans/tech-debt-tracker.md))。

---

## 付録: wrangler dev での smoke test

`@qr-relay/handlers` の登録が server から見えていること、scan → broadcast 経路が
動いていることを手で確認するスニペット。

```bash
# 1. server を起動 (別ターミナル)
pnpm dev:server

# 2. ルーム作成
curl -s -X POST http://localhost:8787/api/rooms \
  -H 'Content-Type: application/json' \
  -d '{"handlerId":"relay","handlerConfig":{
        "value":{"kind":"score","defaultAmount":0},
        "initial":{"holders":"none"},
        "onScan":{"source":"increment","sink":"increment","amount":1}
      }}'
# → {"code":"XXXXXX"}

# 3. host + 2 client が join、host が start
curl -s -X POST http://localhost:8787/api/rooms/XXXXXX/join \
  -H 'Content-Type: application/json' \
  -d '{"playerId":"h1","name":"Host","role":"host"}'
curl -s -X POST http://localhost:8787/api/rooms/XXXXXX/join \
  -H 'Content-Type: application/json' \
  -d '{"playerId":"p1","name":"A","role":"client"}'
curl -s -X POST http://localhost:8787/api/rooms/XXXXXX/join \
  -H 'Content-Type: application/json' \
  -d '{"playerId":"p2","name":"B","role":"client"}'
curl -s -X POST http://localhost:8787/api/rooms/XXXXXX/start
# → {"ok":true,"room":{...,"phase":{"kind":"running",...}}}

# 4. WS で scan (Node 21+ なら built-in WebSocket で書ける)
node <<'EOF'
const code = "XXXXXX";
const wsA = new WebSocket(`ws://localhost:8787/ws/${code}?pid=p1`);
wsA.addEventListener("message", (e) => console.log("A:", e.data));
await new Promise(r => wsA.addEventListener("open", r));
wsA.send(JSON.stringify({
  t: "scan",
  payload: { v: 1, rid: code, pid: "p2", ts: Date.now(), nonce: "n1" },
}));
EOF
# → {"t":"state",...,"phase":{"kind":"running",...},"metrics":[...]}

# 5. pause / reset の確認
curl -s -X POST http://localhost:8787/api/rooms/XXXXXX/pause
# 以降の scan は {"t":"error","message":"game is not running"}
curl -s -X POST http://localhost:8787/api/rooms/XXXXXX/reset
# → state が initialState に戻る
```

同じ nonce を 2 回送ったら `{"t":"error","message":"duplicate nonce"}` が返るのが
[core-beliefs.md §4](core-beliefs.md#4-qr-ペイロードの完全性) の証跡。
