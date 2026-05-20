# Plan: Ready-phase config editor (initial holder / amount)

Owner: miura
Status: Implementation complete (M1–M7, M9 done; M8 manual walkthrough pending human verification)
Created: 2026-05-20

## Goal

`ready` phase 中に host が `handlerConfig` の **初期保持者** と **初期点数 (token/score 数)** を変更できる。`POST /api/rooms/:code/config` を 1 本足し、reset → 修正 → start のループを回せるようにする。これで baton/infection で「誰から始まるか」をホストが指定でき、steal で「初期点数を 5 に絞って短期戦にする」のような調整が UI から可能になる。

## Context

### 今の挙動

- `packages/handlers/src/relay.ts:17` `resolveInitialHolders` は
  `initial.holders` が `"one"` のとき `players[0]?.id` を返す。最初に join
  した player に決まり打ち。
- `initial.holders` の型 (`packages/handlers/src/relay-rule.ts`) は
  `"all" | "one" | "none" | string[]`。**配列を渡せば指定 ID を holder
  にできる** ので、変更点は主に「ホストが配列を渡せる API/UI 経路を作る」
  だけ。スキーマは既に対応している。
- `initial.amount` (score preset の初期値) も既に optional フィールドとして存在。
- ルーム作成は `POST /api/rooms` で `{handlerId, handlerConfig}` を渡す。
  作成後は `handlerConfig` を変える API が無い。

### 関連ファイル

- `apps/server/src/index.ts` — Hono ルート定義
- `apps/server/src/room.ts` — Durable Object adapter (storage / broadcast / WS)
- `apps/server/src/room-domain.ts` — `reduceInit` / `reduceJoin` / `reduceStart` 等の pure reducer
- `apps/client/src/lib/api-client.ts` / `api.ts` — HTTP wrapper
- `apps/client/src/routes/HostRoom.tsx` — host の ready phase 画面
- `apps/client/src/routes/DebugRoom.tsx` — debug 経路で同じ機能を叩く
- `packages/handlers/src/relay-rule.ts` — `ScanRule` Zod schema
- `packages/handlers/src/relay.ts` — `relayHandler` 実装

### 関連プラン / ADR

- [ADR-0008](../../adr/0008-handler-on-player-join.md) — player ライフサイクル hook。今回の config 変更は ready 限定で state に触らないので衝突しない。
- [active/2026-05-20-client-debug-bot-console.md](2026-05-20-client-debug-bot-console.md) — debug console。実装後の検証経路として活用。

## Scope

### In scope

#### A. サーバ側 reducer + ルート

- `packages/handlers/src/relay-rule.ts` に **partial 用 zod schema** を追加。
  `ScanRulePatch = ScanRule.deepPartial()` 相当 (initial の `holders` /
  `amount` だけ部分更新を受ける形)。
  実装は zod の `.deepPartial()` を使うか、必要なフィールドだけ
  `z.object({ initial: z.object({...}).partial() }).partial()` で個別に書く。
- `apps/server/src/room-domain.ts` に `reduceUpdateConfig`:
  - 入力: `Stored` / `configPatch: unknown` / `now`
  - phase !== ready なら error
  - 現在の `meta.handlerConfig` (handler.configSchema で型は保証されている)
    と patch を deep-merge
  - merged を handler.configSchema で再 parse、失敗で issues 付き error
  - 成功で新しい Stored を返す (`meta.handlerConfig` 更新 + touchActivity)
- `apps/server/src/room.ts`:
  - `/config` ルート (POST) を `handleConfigUpdate` で受ける
  - `reduceUpdateConfig` を呼び、save、broadcast
- broadcast 形:
  - `ws-store.ts` の `WsMessage` に `{ t: "room"; room: RoomInfo }` を追加。
    config が変わっても state は不変なので "room" メッセージで `meta` 更新
    のみ通知する。
- `apps/server/src/index.ts` に `POST /api/rooms/:code/config` を生やして
  DO に proxy。
- handlerConfig は handler ごとに schema が違うので、merge は generic に
  書く (object spread でなく、handler.configSchema.parse({...current,
  ...patch}) では深いネストが上書きされる)。**ScanRule 専用に
  `mergeScanRule(current, patch)` を書いて、それを relay 専用 path で使う**。
  他 handler は当面サポート外で 400 を返す (`if (handlerId !== "relay")`)。

#### B. クライアント側 API + UI

- `apps/client/src/lib/api-client.ts` に `updateRoomConfig(code, patch)` 追加
- `apps/client/src/lib/api.ts` に同名ラッパ追加
- `apps/client/src/lib/ws-store.ts`:
  - `WsMessage` に `{ t: "room"; room: RoomInfo }` を足す
  - 受信時に `setRoom(...)` を呼ぶ
- `apps/client/src/routes/HostRoom.tsx`:
  - `phase.kind === "ready"` のとき、配置済みの start ボタンの近くに
    **config editor panel** を出す
  - Panel の構成 (preset の `initial.holders` の値で枝分かれ):
    - `"one"`: 「最初の保持者」セレクト
      - 選択肢: `(自動: 最初の参加者)` + 現在 `players` 全員 (`name (id)` 表示)
      - 選択 → `updateRoomConfig` で `{ initial: { holders: [selectedId] } }` を送る
      - `(自動)` を選ぶと `{ initial: { holders: "one" } }` に戻す
    - `"all"` で `value.kind === "score"`: 「初期点数」数値 input
      - 現在値を表示、変更で `{ initial: { amount: n } }` を送る
    - `"none"` や string[] が既に入っているとき: 後者は「指定済み: [N1, N2]」表示
  - ready 以外では panel を出さない
- `apps/client/src/routes/DebugRoom.tsx`:
  - RoomControl の下に簡易の config 表示 + 編集 UI を追加 (host 側と同じ
    helper を使い回す形が望ましい)
  - 既存の `start` ボタンを押す前に編集できれば十分

#### C. テスト

- `apps/server/src/room-domain.test.ts`:
  - `reduceUpdateConfig`: ready で merge 成功、running / paused で error、
    無効な patch (schema reject) で issues 付き error、reset 後にもう一度
    更新できる
- `packages/handlers/src/relay.test.ts`:
  - `mergeScanRule`: nested partial が正しくマージされる、`initial.holders` が
    配列で上書きできる、`initial.amount` だけ変えられる
- `apps/server/src/index.test.ts`:
  - `POST /api/rooms/:code/config` の 200 / 409 (running 中) / 400 (invalid)
- `apps/client/src/lib/api-client.test.ts`:
  - `updateRoomConfig`: fetch 呼び出し / encode / エラー伝播
- `apps/client/src/routes/HostRoom.test.tsx` (既存):
  - ready phase で holder dropdown が描画され、選択で API が呼ばれる

### Out of scope

- score preset 以外の amount 編集 (現状 score だけ意味がある)
- `initial.holders` を「N 人指定」する複合 UI (今回は 1 人だけ。複数人の指定は配列で API 経由のみ。UI は後回し)
- ルーム作成時の config editor (`/new` での詳細編集) — 既存の tech-debt
- ready 以外 (paused 中 / running 中) の config 変更
- relay 以外の handler への config 編集 (`if (handlerId !== "relay")` で 400)

## Milestones

1. `mergeScanRule` 実装 + relay.test.ts に partial-merge ケース (RED → GREEN)
2. `reduceUpdateConfig` 実装 + room-domain.test.ts (phase guard / merge / 無効 patch)
3. `WsMessage` の "room" 追加 + ws-store の処理 + ws-store.test.ts
4. `room.ts` の `handleConfigUpdate` + broadcast、`index.ts` のルート + index.test.ts
5. client api-client.updateRoomConfig + api.ts + api-client.test.ts
6. HostRoom ready phase の config editor 実装 (+ HostRoom.test.tsx 追加)
7. DebugRoom の RoomControl に簡易 editor 追加
8. **dev server で実機検証**: baton/infection で holder を 2 番目の bot に変更 → start → token holder ハイライトが期待通り遷移する。steal で initial.amount を 5 に変更 → start → metrics の初期点数が 5 になる
9. docs 更新: scan-handler-contract.md の ScanRule 表に「ready 中は POST /api/rooms/:code/config で更新可能」追記、ADR-0009 or extend ADR-0008

## Progress

- [x] M1: `mergeScanRule` + test (`packages/handlers/src/relay-rule.ts` + relay.test.ts)
- [x] M2: `reduceUpdateConfig` + test (`apps/server/src/room-domain.ts` + room-domain.test.ts)
- [x] M3: `WsMessage { t: "room" }` + ws-store (`apps/client/src/lib/ws-store.ts`)
- [x] M4: `handleConfigUpdate` + Hono route + index.test (`apps/server/src/room.ts`, `index.ts`)
- [x] M5: client api + test (`apps/client/src/lib/api-client.ts`, `api.ts`)
- [x] M6: HostRoom ready-phase config editor + test (`ReadyConfigEditor.tsx` + test, wired into HostRoom + HostDashboard)
- [x] M7: DebugRoom config editor (RoomControl 横に同コンポーネントを props 経由で再利用)
- [ ] M8: dev server walkthrough — 人による確認待ち (automated tests cover acceptance behaviors)
- [x] M9: docs + ADR (scan-handler-contract.md 更新 + ADR-0009 追加)

## Surprises And Discoveries

- `DebugRoom` は global `useWs` ではなく自前で `createWsStore` した
  プライベートな store を持っているため、`ReadyConfigEditor` が
  `useWs` から room/phase/players を直接読むと debug 経路では常に空に
  なる。Editor を props (`room`, `phase`, `players`) で override
  できる形にして両経路から再利用した。
- `HostDashboard` の overview-waiting レイアウトは grid template で
  area 名が固定されているため、editor を新 area として追加するのは
  避け、grid の外側 (flex 親) に追記して ready phase のみ表示する
  形に落ち着けた。

## Decision Log

- **POST /api/rooms/:code/config を新ルートとして追加**: 既存
  `POST /api/rooms` (作成) を編集兼用にすると body の意味が二重化するので、
  別 endpoint にする。
- **relay 限定の merge**: 当面は `mergeScanRule(current, patch)` で relay
  だけ対応。他 handler に拡張するときは handler interface に
  `mergeConfig?(current, patch): unknown` を追加するかどうかを再考。
- **ready phase 限定**: running/paused 中の config 変更は state との整合を
  考えると複雑度が跳ね上がる。reset を強制すれば実用上困らない。
- **broadcast に `t: "room"` を新設**: 既存の `state` メッセージは
  state/metrics/players/phase を伴うので、config-only 更新を流すには形が
  合わない。RoomInfo (= meta) は元から `WsStore` の `room` フィールドを
  持っているので、ここを更新する専用メッセージにする。

## Verification

### コマンド

- `pnpm -r typecheck`
- `pnpm -r test`
- `pnpm --filter @qr-relay/client build`
- `pnpm --filter @qr-relay/client preview` か `pnpm dev:server` +
  `pnpm dev:client` で手動検証

### 受け入れ挙動 (dev server で手動)

- (a) baton で room 作成 → ready のまま host 画面に「最初の保持者」
  dropdown が出ている。client 1-3 を join、dropdown に 3 人 + "(自動)" が
  出る
- (b) (a) で player 3 を選んで `start` → host dashboard で token holder
  ハイライトが player 3 にある
- (c) (b) のあと reset → ready に戻る → "(自動)" に戻して `start` →
  player 1 (最初の join) が holder になる
- (d) steal で room 作成 → ready で「初期点数」input が出る (default 10)
- (e) (d) で 5 に変更して `start` → metrics の初期 score が 5
- (f) running / paused 中は config editor が表示されない (もしくは disabled)
- (g) `POST /api/rooms/:code/config` を running 中に curl で叩くと 409
- (h) handler が relay 以外なら 400 (現状は relay しかいないので artificial
  テストでカバー)
- (i) 無効な patch (例: `initial: { amount: "abc" }`) は 400 + issues

## Outcomes And Retrospective

### 変更点

- **handlers package**:
  - `ScanRulePatch` (zod schema) と `mergeScanRule(current, patch)` を追加
    (`relay-rule.ts`)。current は known-valid `ScanRule`、patch は
    section 単位の deep-partial。マージ後に `ScanRule` 全体で再 validate。
  - `index.ts` から `ScanRulePatch` / `mergeScanRule` を export。
- **server**:
  - `reduceUpdateConfig(stored, patch, now)`: phase=ready 限定、relay 限定。
    409 (phase) / 400 (handler / invalid patch) / ok。
  - `RoomDurableObject.handleConfigUpdate` + `POST /config` を DO に
    生やし、`broadcast({t:"room", room: meta})` で WS 通知。
  - Hono に `POST /api/rooms/:code/config` を追加。body が object でない
    場合は DO に届ける前に 400。
- **client**:
  - `WsMessage` に `{ t: "room"; room: RoomInfo }` を追加。受信時に
    `setRoom(...)` を呼ぶ。
  - `ApiClient.updateRoomConfig(code, patch)` と `api.ts` ラッパ追加。
  - `ReadyConfigEditor` を新設。`initial.holders === "one"` (または
    `string[]`) で holder dropdown、`value.kind === "score"` で
    amount input。`updateRoomConfig` をデバウンスなしで blur 時に送る。
  - HostRoomHandheld / HostDashboard (ready phase 時のみ) / DebugRoom の
    3 箇所に editor を配置。
- **docs**:
  - `scan-handler-contract.md` の `initial` 表に「ready 中は POST
    /api/rooms/:code/config で更新可能」を追記。
  - `ADR-0009` を新規作成し、ready 限定 / relay 限定 / `{t:"room"}` の
    broadcast 設計を含む 4 つの alternatives を記録。

### 検証済み

- `pnpm -r typecheck` → 全パッケージ通過。
- `pnpm -r test` → 410 tests 全パス
  (`packages/handlers` 41 / `apps/server` 98 / `apps/client` 239 等)。
- `pnpm --filter @qr-relay/client build` → 通過。
- 自動テストは acceptance criteria (a)-(i) を unit/integration で
  カバー (mergeScanRule の partial merge、reduceUpdateConfig の phase
  guard、route の 200/409/400、editor が正しい patch を送る等)。

### 残り

- **M8 manual walkthrough**: dev server を立てて baton holder 指定 →
  start → token holder ハイライトが指定先に出るか、steal amount 変更
  → start → metrics 初期値が変わるか、を browser で目視確認するのは
  人間の手で。自動テストは observable な server レイヤの挙動を網羅
  しているが、broadcast 受信時の React 再レンダリング体感は未検証。

### `completed/` 移動の判断

M8 の manual walkthrough が完了したら `docs/exec-plans/completed/` へ
移す。
