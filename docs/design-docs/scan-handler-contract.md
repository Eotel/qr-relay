# ScanHandler Contract

Last reviewed: 2026-05-19

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
  payloadFor(args: { state; config; player }): TData;
  onScan(args: { state; config; scanner; scanned; payloadData; now }):
    { nextState: TState; events: GameEvent[] };
  metrics(args: { state; config; players; now }): Metric[];
  isOver?(args: { state; config; now }): boolean;
}
```

### 各メソッドの責任

| メソッド | 何を返す | 副作用 |
|---|---|---|
| `initialState` | ゲーム開始時の TState | なし。`now` は引数で受け取る |
| `payloadFor` | プレイヤーが今 QR に載せるべき TData | なし。state からの投影 |
| `onScan` | 状態遷移後の next state と発生 event | なし。決定的、純粋関数 |
| `metrics` | UI 表示用の Metric (time / count / score) | なし |
| `isOver` | 終了判定 (optional) | なし |

すべて pure function。`Date.now()` / `Math.random()` / `fetch` を直接呼んではいけない。
時刻は `now`、ランダム性が必要なら呼び出し側が引数で渡す。
[core-beliefs.md §2](core-beliefs.md#2-handler-は-server--client-両方で動く-pure-function) 参照。

---

## ScanRule (relay engine の config)

定義場所: [`packages/handlers/src/relay-rule.ts`](../../packages/handlers/src/relay-rule.ts)

`relayHandler` の `TConfig` は `ScanRule`。6 軸の直交した option で 9 プリセット全てを
表現している。

### value: プレイヤーが何を保持するか

| kind | 意味 | 追加フィールド |
|---|---|---|
| `token` | 持つ / 持たない の boolean | — |
| `score` | 数値 | `defaultAmount?` (初期値) |
| `status` | 文字列ラベル (例 `"oni"`, `"infected"`) | `defaultStatus?` |

### initial: 初期配布

| holders | 意味 |
|---|---|
| `"all"` | 全員に配る |
| `"one"` | 1 人 (現状は配列先頭) |
| `"none"` | 誰も持っていない状態で開始 |
| `string[]` | 指定 ID のプレイヤーに配る |

`amount` (score 用初期値) と `status` (status 用初期値) も指定可能。

### onScan: スキャン発生時の変化

`source` は **被スキャナ (=QR を見せた側)**、`sink` は **スキャナ (=カメラで読んだ側)**。
両者を独立に指定する。

| 値 | token に対する効果 | score に対する効果 | status に対する効果 |
|---|---|---|---|
| `"keep"` | 変化なし | 変化なし | 変化なし |
| `"lose"` | `has = false` | `amount -= amount` | `status = "none"` |
| `"gain"` | `has = true` | `amount += amount` | `status = "active"` (or sinkStatus/sourceStatus) |
| `"increment"` | (なし) | `amount += amount` | (なし) |
| `"decrement"` | (なし) | `amount -= amount` | (なし) |
| `"set-status"` | (なし) | (なし) | `status = sinkStatus / sourceStatus` |

`amount?` は数値変化の量 (デフォルト 1)。`sourceStatus` / `sinkStatus` は `set-status`
を使うときの値。`swap: true` なら source と sink の slot を丸ごと入れ替える (鬼交代用)。

### constraints: 適用条件

| フィールド | 意味 |
|---|---|
| `uniquePerPair` | 同じ (scanner, scanned) ペアの 2 回目以降を無視 |
| `requireSourceHas` | `true` / `"oni"` 等。被スキャナがその状態を持っているときだけ作用 |
| `requireSinkLacks` | スキャナがその状態を持っていないときだけ作用 |
| `minValue` / `maxValue` | score の上下クランプ |
| `direction` | (現状は `"either"` のみ実装) |

### end: 終了条件

```ts
{ kind: "target", value: 10 }              // 誰かが target 値に到達
{ kind: "all-have-status", status: "X" }   // 全員が指定 status になる
{ kind: "only-one-left", status: "X" }     // 指定 status を持つ人が 1 人以下
{ kind: "timer-ms", ms: 60_000 }           // 経過時間
{ kind: "manual" }                          // /start で明示的に再開するまで終わらない
```

---

## 新プリセット追加 5 ステップ

例: 「10 秒ごとに鬼が増える」のように構造として既存に近いものを足す場合。

### Step 1: presets.ts に entry を追加

[`packages/handlers/src/presets.ts`](../../packages/handlers/src/presets.ts) の `presets`
配列に entry を 1 つ追加するだけ。

```ts
{
  id: "infection-timed",
  name: "感染 (時限)",
  description: "感染者が近づくほど広がる。30 秒で全員感染なら勝ち。",
  rule: {
    value: { kind: "status", defaultStatus: "healthy" },
    initial: { holders: "one", status: "infected" },
    onScan: { source: "keep", sink: "set-status", sinkStatus: "infected" },
    constraints: { requireSourceHas: "infected" },
    end: { kind: "timer-ms", ms: 30_000 },
  },
},
```

### Step 2: relay.test.ts にテストを追加

[`packages/handlers/src/relay.test.ts`](../../packages/handlers/src/relay.test.ts) に既存の
`describe("relay handler - infection", ...)` ブロックを参考に 2-3 ケース。最低でも
`initialState` と「成立条件 (requireSourceHas) を満たす scan で state が変わる」を
覆う。

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

# 3. 2 人 join + start
curl -s -X POST http://localhost:8787/api/rooms/XXXXXX/join \
  -H 'Content-Type: application/json' -d '{"playerId":"p1","name":"A"}'
curl -s -X POST http://localhost:8787/api/rooms/XXXXXX/join \
  -H 'Content-Type: application/json' -d '{"playerId":"p2","name":"B"}'
curl -s -X POST http://localhost:8787/api/rooms/XXXXXX/start

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
# → {"t":"state",...,"metrics":[{...,"byPlayer":{"p1":1,"p2":1}}]}
```

同じ nonce を 2 回送ったら `{"t":"error","message":"duplicate nonce"}` が返るのが
[core-beliefs.md §4](core-beliefs.md#4-qr-ペイロードの完全性) の証跡。
