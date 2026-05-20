# ADR-0009: ready phase 中の handlerConfig 部分更新 (relay 限定)

**Date**: 2026-05-20
**Status**: accepted
**Deciders**: miura

## Context

ホストはルーム作成時 (`POST /api/rooms`) に 1 度だけ `handlerConfig`
(= `ScanRule`) を渡し、以降は手を入れる経路が存在しなかった。

実害は 2 つ:

1. **baton / infection の初期保持者**: `resolveInitialHolders` は
   `initial.holders === "one"` のとき `players[0].id` を返す
   (`packages/handlers/src/relay.ts:17`)。最初に join した player が
   自動でバトン / 患者ゼロ号になる。ホストが特定の人に持たせたくても
   reset → 並び替え → start のような場当たり手順しかない。
2. **steal の初期点数**: preset では 10 固定。「短期戦にしたい」
   「子供向けに 5 から始めたい」など卓上で詰めたい調整が、ルーム作り直しに
   なる。

`ScanRule.initial.holders` の型は元から
`"all" | "one" | "none" | string[]` で **配列を渡せば指定 ID を holder にできる**。
スキーマは既に十分に表現力を持っており、足りないのは「ready 中にこの
config を上書きする経路」だけだった。

## Decision

`POST /api/rooms/:code/config` を新設し、ready phase 中に限り
`handlerConfig` の部分上書きを受け付ける。

- **ルート**: 専用 endpoint。`POST /api/rooms` (作成) を編集兼用にすると
  body の意味が二重化するので分ける。
- **マージ**: `packages/handlers/src/relay-rule.ts` に `mergeScanRule` を
  追加。`ScanRulePatch` は **意図的に `initial.holders` /
  `initial.amount` のみ** に絞り、`.strict()` で未知キーを拒否する。
  `value` / `onScan` / `constraints` は preset 選択時に凍結され、ready
  config patch ではいじれない (game semantics drift を避ける)。マージ
  後は `ScanRule` schema 全体で再 validation。失敗時は zod issues 付きで
  400。
- **host 認可**: body に `playerId` を必須化し、DO 側で
  `stored.meta.hostId` と一致しない場合は 403。host 未参加
  (`hostId === null`) のルームは「主催が居ない」状態なので config も
  触れない。
- **phase guard**: `apps/server/src/room-domain.ts` の
  `reduceUpdateConfig` が `phase.kind !== "ready"` を 409 で弾く。
  state 自体は触らない (実状態は次の `reduceStart` が新しい config から
  生成する)。
- **handler scope**: 現状は relay 限定。他 handler は patch schema が
  定義されていないので 400。
- **broadcast**: 専用 WS メッセージ `{ t: "room"; room: RoomInfo }`。
  既存の `state` メッセージは state/metrics/players/phase を伴うので
  config-only 更新を流すには形が合わない。client 側は `setRoom(...)` で
  meta だけ更新。
- **UI**: `ReadyConfigEditor` コンポーネント
  (`apps/client/src/components/host/`) が `initial.holders === "one"` の
  ときに holder 選択 dropdown、`value.kind === "score"` のときに amount
  input を出す。amount input は **controlled draft** で、broadcast で
  current value が変わった場合は focus 外しの瞬間に同期される (stale な
  defaultValue で上書きしてしまう事故を防ぐ)。host route (HostRoom /
  HostDashboard) と debug route (DebugRoom) の両方から再利用する。
  debug は `room.hostId` を `playerId` として送る。

## Alternatives Considered

### Alternative 1: ルーム作成 API (`POST /api/rooms`) に編集モードを足す
- **Pros**: endpoint を増やさない。
- **Cons**: body shape (作成 vs 更新) を識別するフラグが必要で、HTTP
  動詞のセマンティクスが歪む。
- **Why not**: 1 つの POST に「新規作成」と「部分更新」を共存させると、
  バリデーション分岐や retry セーフティの整理が後から痛い。

### Alternative 2: WS メッセージで update を送る
- **Pros**: 既存の WS チャネル (`{t:"start"}` 等) と一貫する。
- **Cons**: ready 中のホスト操作は phase 操作 (start) と同じ場面で
  使う想定で、REST のほうがリトライ / 失敗ハンドリングが書きやすい。
  patch の zod validation は server 側で行うので、ack を待つ
  クライアント実装も REST のほうがシンプル。
- **Why not**: 「config 編集 = リクエスト/レスポンスの一往復」という
  自然な形に対し、WS 双方向化は overkill。

### Alternative 3: ready / paused / running 全 phase で許可
- **Pros**: ゲーム途中で初期点数を変えたい、のような実験運用が
  すぐできる。
- **Cons**: running 中に config を書き換えると `initialState` から
  生成された `state` との整合が崩れる (holder set が変わる、score
  クランプ境界が動く)。state の再計算ルールを decide する設計コストが
  跳ね上がる。
- **Why not**: 現状は reset → 修正 → start のループで実用上困らない。
  必要になったら paused 中だけ拡張する余地は残す。

### Alternative 4: handler 全種に汎用化する (`ScanHandler.mergeConfig` を生やす)
- **Pros**: 将来 carrier など他 handler を追加したとき統一インタフェース。
- **Cons**: 現状 handler は relay 1 つ。汎用化する具象例が足りない。
- **Why not**: YAGNI。`if (handlerId !== "relay")` で 400 を返し、
  2 つ目の handler を作るタイミングで `mergeConfig?(current, patch)` を
  ScanHandler interface に足すか再考する。

## Consequences

### Positive
- baton / infection で「誰から始めるか」をホストが UI から指定できる。
  ボードゲームっぽい「じゃあ次は A さんから」が成立する。
- steal で「初期点数 5 で短期戦」のような卓上調整が、ルーム作り直し
  なしで反復できる。
- relay-rule schema を変更せずに済んだ (元から `holders: string[]` を
  受けられた)。

### Negative
- relay 以外の handler が追加されたとき、config 編集 UI も handler
  ごとに書くか、interface を generalize するかの判断が必要になる。
  今は 1 件しかないので延期。
- `{ t: "room" }` という新しい WS メッセージ種別を増やした。今後
  meta 系の更新が他にも必要になったら同じ枠で流す。

### Risks
- running 中に config を書き換えたいユースケースが出てきたとき、
  「state を再計算する」ロジックを決める必要がある。Alternative 3 で
  決めた通り、当面は reset を強制することで回避。
- 複数 holder 指定 (`string[]` で 2 人以上) は UI を作っていない。
  API では既にサポートされているので curl からは打てる。複数指定の
  ニーズが出たら multiselect UI を足す。

## Adversarial review fixes (2026-05-20)

Codex adversarial review (verdict: needs-attention) で指摘された 3 件を
ship 前に取り込んだ:

1. **Host authority**: 初版は `POST /config` を room code 1 つで誰でも
   叩けた。`playerId` を body 必須にし、DO で `stored.meta.hostId` と
   一致しない / hostId 未設定の場合は 403 を返すよう変更。client API も
   `updateRoomConfig(code, playerId, patch)` に signature 変更。
2. **Patch schema を初期 holders/amount に narrow**: 初版の
   `ScanRulePatch` は `value` / `onScan` / `constraints` も受けていた
   ため、preset 選択後に game semantics が書き換えられる窓が空いていた。
   `initial.holders` / `initial.amount` のみ受け付ける `.strict()`
   schema に絞った。広範な編集が必要になったら別 endpoint + 別認可。
3. **Controlled amount input**: 初版は `defaultValue` の uncontrolled
   input で、別タブ / debug console から broadcast が来ても DOM の値が
   stale なまま残り、blur 時に古い値で上書きする race があった。
   `value` + 内部 draft state + focus 検知 で、focus 外しの瞬間に
   current value を反映する controlled input に置換。
