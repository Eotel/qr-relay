# Plan: Client Debug Bot Console

Owner: miura
Status: Implemented (pending manual dev-server walkthrough)
Created: 2026-05-20
Last updated: 2026-05-20

## Goal

実機ブラウザを何台も立ち上げずに room の挙動を flush できる dev-only コン
ソール。MVP ではなく、ボット自律スキャン / シナリオ実行 / エッジケース注入 /
WS イベントログ / state inspector を全部備える "lab" にする。本番ビルドから
は完全に除外する。

## Context

### Server 側で押さえているスキャン検証
(`apps/server/src/room-domain.ts:301-391` `reduceScan`)

| エラー | 条件 | debug で再現したい |
|---|---|---|
| `game is not running` | phase ≠ running | ✓ |
| `host cannot scan` | scanner == hostId | ✓ |
| `cannot scan host` | payload.pid == hostId | ✓ |
| `timestamp out of window` | `|now - ts| > 60_000ms` | ✓ |
| `duplicate nonce` | nonce が 5min 以内に再利用 | ✓ |
| `cannot scan self` | payload.pid == scannerId | ✓ |
| `unknown player` | scanner / scanned 未参加 | ✓ |
| `invalid payload data` | handler.dataSchema に通らない data | ✓ |

これらを **1 クリックで意図的に発火** できる「エッジケース注入器」を持つ
のがこのプランの肝。

### 現状の path
- 参加: HTTP `POST /api/rooms/:code/join` (`apps/server/src/index.ts:64`)
  body は `{ playerId, name, role }`、Zod `JoinRequest`
  (`packages/core/src/schemas.ts:18`)
- スキャン: WS のみ。`apps/server/src/room.ts:270` (`webSocketMessage`)。
  scanner は WS 接続時の `?pid=` (`state.getTags(ws)[0]`)、scanned は
  `payload.pid`。ScanPayloadV1 (`packages/core/src/schemas.ts:3`):
  `{v:1, rid, pid, ts, nonce, data?}`
- Phase: HTTP `POST /api/rooms/:code/{start,pause,resume,reset}`
  (`apps/server/src/index.ts:97`) または WS だが WS 版は host 必須
  (`apps/server/src/room.ts:328`) → debug 側は HTTP を使う
- Inactivity: room は 10min で warn / 15min で close
  (`apps/server/src/room-domain.ts:9-11`)。debug 用の short-window 環境
  変数 `INACTIVITY_WARN_MS` / `INACTIVITY_CLOSE_MS` あり (`room.ts:45-49`)

### Preset / handler
- `packages/handlers/src/presets.ts` に baton / infection / steal /
  collection / greeting の 5 種。room 作成時に handler は `relay` 固定、
  config は `ScanRule` (preset の `rule` フィールド)。debug は picker で
  preset を選んでルームを作る。
- token holder の判定は `apps/client/src/lib/token-holder.ts` 既存。
  state inspector はこれを再利用する。

### 既存の adapter
- `apps/client/src/lib/api-client.ts:114` `defaultApiClient` — bot N 体の
  join + phase 操作はこれを再利用
- `apps/client/src/lib/ws-store.ts:115` `createWsStore` — observer
  (debug 自身) は通常通り 1 本張る (scan しないので衝突無し)
- bot 個別の WS は `ws-store` の責務外。専用の軽量 wrapper を新規実装する

### 関連 docs
- `AGENTS.md` — port DI と pure domain の testability ルール
- `docs/design-docs/scan-handler-contract.md` — scan 意味論

## Scope

### In scope

#### A. インフラ (bot wrapper / pool)
- `BotConnection` 軽量モジュール
  (`apps/client/src/lib/debug/bot-connection.ts`)
  - `FetchLike` / `socketFactory` / `Clock` / `Rng` を DI で受ける
  - `join(name, role?)` → HTTP `/api/rooms/:code/join`
  - `connect()` → WS open、`?pid=playerId`
  - `sendScan(payload: ScanPayloadV1)` → そのまま送る (validation は
    呼び出し側が責任を持つ、debug 用なのであえて bypass 可能)
  - `sendRaw(text: string)` → garbage 注入用
  - `disconnect()`, `reconnect()`
  - `getStatus()` → `{ readyState, sentCount, errorCount, lastError, lastTargetId }`
  - server からのメッセージは観測用に callback で外に出す (per-bot log
    が欲しい場面用)
- `BotPool` (`apps/client/src/lib/debug/bot-pool.ts`)
  - `Map<botId, BotConnection>` を管理
  - `addBot(opts?)` / `addBots(n)` / `removeBot(id)` / `clear()`
  - `disconnectAll()` / `reconnectAll()`
  - `lastSuccessNonce`: replay 注入用に直近成功した nonce を保持
- `useBotPool` hook で React 統合 (subscribe / unsubscribe)

#### B. 画面 (DEV のみマウント)
- `/debug` — room picker
  - 既存 room コード入力
  - 「新規 room 作成」: preset selector (baton / infection / steal /
    collection / greeting)
  - 短命 inactivity の note (`INACTIVITY_WARN_MS=30000` 等を wrangler dev
    に渡す手順) を README へのリンクだけ置く
- `/debug/:code` — メインコンソール、3-column layout (md+):

  **左: Room control**
  - phase chip + start/pause/resume/reset ボタン
  - 観測 WS の接続状態 (debug 自身は observer として 1 本接続)
  - 「observer の WS を切る / 再接続」ボタン
  - 現在 inactivity warning が来ているかの表示

  **中央: Bot roster**
  - 一覧: id (短縮) / name / role / WS readyState / sent / errors /
    last target
  - 行アクション: rename / disconnect / reconnect / 削除
  - 一括: `+1 bot` `+3 bots` `+10 bots` / `全 disconnect` /
    `全 reconnect` / `全削除`
  - bot の name は `bot-{adj}-{noun}` で乱択 (識別しやすく)

  **右: Scan controls + tabs**
  - **Tab 1: Manual scan**
    - scanner dropdown / scanned dropdown / `scan` ボタン
    - 「全 bot からランダムに 1 回」「全ペア (i→j) を順に発火」
      「N msec ごとにランダム scan」 (start/stop)
  - **Tab 2: Autonomy** (per-bot)
    - 各 bot に mode 設定: `idle` / `random` / `round-robin` /
      `target:specificBot` / `tokenChase` (state 上の token holder を
      狙う)
    - 各 bot に interval (ms)、stop after N scans オプション
    - global play / pause / reset bot counters
  - **Tab 3: Scenarios** (1 クリックで合成発火)
    - "round-robin chain": bot[i] → bot[i+1] を順に 1 周
    - "all-to-all burst": 全 (i, j) 組み合わせ
    - "random storm": rate=Hz, duration=sec
    - "token relay": token holder bot → ランダム target を N step
  - **Tab 4: Edge cases** (上の表の 8 項目を 1 クリック発火)
    - replay nonce: 直近成功した nonce を再送
    - stale ts: ts = now - 120_000
    - future ts: ts = now + 120_000
    - wrong rid: rid = "ZZZZZZ"
    - self scan: scanner と payload.pid を同一
    - unknown pid: payload.pid を未参加の乱数 ID に
    - invalid data: payload.data = {garbage:1} で handler.dataSchema を
      壊す
    - malformed json: WS に `"<not json>"` を直送
    - scan while not running: phase=ready/paused のときに発火
    - host scan: host bot を作って scan させる (`role: "host"` で join
      した bot)

  **下部 (full width): Event log + state inspector**
  - **Event log**: observer WS で受けた全メッセージを timeline 表示
    (type, ts, summary)、行を開くと pretty-printed JSON
    - フィルタ: type (state / players / event / error / inactivity-*)
    - per-bot 送信ログも併載 (送信元 bot id, payload, server response)
    - clear / pause / export(JSON copy)
  - **State inspector**:
    - 現在の `state` (relay engine 内部状態) を pretty-print
    - 現在の `metrics`
    - token holder の bot 名を強調 (`isTokenHolder` 再利用)

#### C. 安全装置
- ルートは `import.meta.env.DEV` でのみ `appRouteObjects` に追加 →
  本番 build には include されない
- bot 名は常に `bot-` prefix → 通常プレイヤーと混ざっても識別可能
- observer の playerId も `debug-observer-{rng}` で固定接頭辞、`role:
  "client"` で join (host を奪わない)

#### D. テスト
- `bot-connection.test.ts`
  - fake fetch + fake WebSocket
  - join → connect → sendScan → server レスポンス callback → disconnect
- `bot-pool.test.ts`
  - add / addMany / remove / clear / disconnectAll / reconnectAll
  - lastSuccessNonce が server 応答から更新される
- `scenarios.test.ts`
  - pure な scenario generator: 「round-robin chain」「all-to-all」が
    正しい (scanner, scanned) ペア列を出すか
- `edge-cases.test.ts`
  - 各エッジ payload generator が pure に正しい payload を作る
    (送信は別)
- 既存テスト・既存 UI に regression が無いこと

### Out of scope

- ~~サーバ側に debug-only エンドポイントを足すこと — API 表面を増やさない~~
  ※ 実装中に「全削除しても dashboard から消えない」問題が見つかり、汎用
  (= debug 専用ではない) `POST /api/rooms/:code/leave` を追加した。詳細は
  下記 Surprises And Discoveries / [ADR-0008](../../adr/0008-handler-on-player-join.md)。
- e2e テスト (playwright) — 今回は unit までで止める。手動検証で代替
- bot を「自分の QR を表示する側」として演じるシミュレーション (scan
  message の `payload.pid` だけで scanned は一意に決まるので不要)
- bot の永続化 (リロード後の復元) — 1 session 限定
- 認証 / production gating 以上の保護
- replay 録音 → JSON 保存 → 後から再生 (stretch、今回は live コントロール
  のみ)
- 複数 room の同時操作 (1 タブ 1 room)

## Milestones

1. `BotConnection` + `BotPool` 実装と unit test (RED → GREEN)
2. `/debug` picker (preset selector + 新規 room 作成 / 既存 code 入力)
3. `/debug/:code` shell + Room control 区画 (phase / observer 接続)
4. Bot roster 区画 (add/remove/rename/reconnect)
5. Tab 1: Manual scan (dropdown + 単発)
6. Tab 2: Autonomy modes (per-bot interval, mode, stop after N)
7. Tab 3: Scenarios (round-robin / all-to-all / random storm / token relay)
8. Tab 4: Edge case 注入器 (8 種)
9. Event log + state inspector
10. DEV-only routing 確認 (本番 build から /debug が消えていること)
11. 手動検証 シナリオ (下記 Verification)

## Progress

- [x] M1: `apps/client/src/lib/debug/bot-connection.ts` + test (11)
- [x] M1: `apps/client/src/lib/debug/bot-pool.ts` + test (9)
- [x] M2: `apps/client/src/routes/Debug.tsx` (picker)
- [x] M3-9: `apps/client/src/routes/DebugRoom.tsx` 本体 +
  `components/debug/RoomControl.tsx` / `BotRoster.tsx` / `ScanControls.tsx` /
  `EventLog.tsx` / `StateInspector.tsx` / `types.ts` に分割
- [x] `apps/client/src/lib/debug/scenarios.ts` + test (11)
- [x] `apps/client/src/lib/debug/edge-cases.ts` + test (19)
- [x] `apps/client/src/routes.tsx` に `import.meta.env.DEV` 分岐で追加
- [x] `pnpm -r typecheck` グリーン
- [x] `pnpm -r test` グリーン (client 224、server 74、ui 10、handlers 29)
- [x] `pnpm --filter @qr-relay/client build` グリーン、dist に
  `DebugRoom/bot-pool/bot-connection/debug-observer/EDGE_CASES` の文字列が
  含まれないことを grep で確認
- [ ] 手動検証 (Verification の (a)〜(j) を dev server で実施)

## Surprises And Discoveries

- **途中参加プレイヤーのスキャンが silent no-op で落ちる本物の不具合を発掘**
  (debug tool 投入の最初の成果):
  - 症状: dashboard 上で全員が `未参加 / 0` 表示。bot の SENT カウンタは
    増えるが scan が成立しない。
  - 原因: `relay.onScan` が `state.values[scanner.id]` または
    `[scanned.id]` を欠くと **エラーも返さず no-op 復帰** していた
    (`relay.ts:122-126`)。`state.values` は `reduceStart` 時点の players
    でしか埋まらないので、start 後に join した player は永久に
    スロット無しのまま放置されていた。
  - 修正:
    1. `ScanHandler` に optional `onPlayerJoin(state, config, player, now)
       → state` を追加 (`packages/core/src/handler.ts`)
    2. `relay` で実装: 既存スロットがあれば no-op、無ければ
       `rule.initial.holders === "all"` のときだけ holder 扱いで `makeSlot`
       して values を伸ばす (preset ごとの初期 amount を保つ)。
    3. `reduceJoin` (`apps/server/src/room-domain.ts`) で
       `stored.state !== null` のとき handler.onPlayerJoin を呼ぶ。
       既存プレイヤー (rename / 再join) は触らない。
  - テスト追加: handlers 側 +5 件 (baton/steal/collection の途中参加と
    idempotent / scan 後の挙動)、server 側 +3 件 (mid-game / ready 時 /
    再 join)。全 ` -r test` グリーン。
  - 設計判断: lazy creation in `onScan` ではなく `reduceJoin` で
    state 拡張するアプローチを選んだ。`state.values` がいつでも
    `players` を包含する不変条件を保つほうが、metrics 計算や inspector
    での観察が一貫する。
- **`Metric` には `time | count | score` の 3 種類しかない**: 当初の
  StateInspector では `kind: "ranking"` を扱う前提だったが、core の型を
  確認したらそんな variant は無かった。`relay` handler は ranking 表現を
  `score` メトリクスで吐く実装になっている。Inspector の formatMetric を
  3 variant に絞った。
- **server は `wrong-rid` 単独では `unknown player` を返さない**: rid は
  WS 接続時の `?pid=` で決まるため、Edge case の `wrong-rid` は payload
  内の `rid` を改ざんしただけでは server 側のエラー分岐に届かない。
  `pid` も合わせて未参加 ID にすることで初めて `unknown player` が
  発火する。Edge case 実装は両方をいじる挙動にした。
- **per-bot disconnect/reconnect は BotPool に追加が必要だった**:
  当初は `disconnectAll`/`reconnectAll` のみで個別操作を提供していなかった
  が、UI で「この bot だけ切断」を表現できないので `disconnectBot` /
  `reconnectBot` を追加した。BotConnection 側の `connect()` は CLOSED
  以外なら no-op、CLOSED なら新規 WebSocket を張り直す挙動なので、
  re-join 無しで再接続が成立する。
- **「全削除」がサーバ側 participants を実際には消さない問題**
  (2 度目の本物の不具合発掘):
  - 症状: debug tool で `+10 bots` 追加 → 「全削除」を押すとローカル
    BotPool は空になるが、ホスト dashboard の参加者 chip と参加者タイル
    には bot が残り続ける。別タブで debug を開いた場合、その bots は
    そもそも roster に見えない (BotPool は完全にローカル状態のため)。
  - 原因: サーバには「player を room から外す」API が存在せず、`reduceJoin`
    で足したものを取り除く対称操作が無かった。WS 切断は接続状態の変化
    でしかなく、`stored.players` からは何も消えない。
  - 修正:
    1. pure な `reduceLeave(stored, {playerId}, now) → stored` を
       `apps/server/src/room-domain.ts` に追加。`handler.onPlayerLeave` を
       呼んで state.values のスロットも落とす。host が抜けたら
       `meta.hostId = null` も同時にクリア。未知 player は no-op
       (idempotent)。
    2. `apps/server/src/room.ts` に `handleLeave` を追加し、該当 pid を
       タグに持つ WS を `1000 "left"` で close、state/players を broadcast。
    3. `apps/server/src/index.ts` に `POST /api/rooms/:code/leave` を追加。
    4. `apps/client/src/lib/api-client.ts` / `api.ts` に `leaveRoom`。
    5. `DebugRoom.tsx`:
       - 「全削除」がローカル + サーバ側で見える `bot-` 接頭辞 player
         全部に対して leave API を呼ぶ。
       - 行ごとの 削除 ボタンも leave API → pool.removeBot の順で叩く。
       - サーバから見える `bot-` 接頭辞 player のうちローカル pool に
         無いものを **remote bots** として BotRoster に別行で表示
         (rename / disconnect は無し、削除ボタンのみ)。これで「他タブが
         作った bot を見つけて消す」フローが debug tool 内で完結する。
  - テスト追加: `room-domain.test.ts` に reduceLeave の 4 ケース
    (既知 / 未知 / host / ready phase)。`pnpm -r test` グリーン
    (client 219, server 81, ui 10, handlers 34, core 22 = 366)。
  - 設計判断: 当初プランの「Out of scope: サーバに debug-only エンド
    ポイントを足さない」を破ったが、`/leave` は debug 専用ではない
    (本物の途中退出にも将来使える) のと、`/join` の対称操作が無い
    ことが silent failure を生んでいたので汎用 API として正当化される。
    ADR-0008 を join/leave 両対応に拡張した。

## Decision Log

- **サーバ debug API を増やさない**: 既存 join + WS で要件を満たせる。
  サーバ表面を debug 用に膨らませない方が後の保守が楽。
- **bot ごとに独立した WS**: `useWs` は単一接続前提の zustand なので、
  bot は別実装の軽量 wrapper にする。observer は通常の `useWs` を流用。
- **DEV-only マウント**: `import.meta.env.DEV` でルート定義自体を分岐。
  `?debug=1` のような runtime gate にしない (本番にコードが残らない
  方が安全)。
- **Edge case を pure な generator にする**: payload を作る関数と WS に
  送る処理を分離。generator は unit test で網羅、送信は手動 / 自動 mode
  共通の 1 経路。
- **3-column + 下部ログ レイアウト**: 操作 (左) / 対象 (中) / 動作 (右)
  /観測 (下) を分離して、開発者が「何を操作したら何が起きたか」を 1
  画面で見れるようにする。テストを「眺める」前提のレイアウト。

## Verification

### コマンド
- `pnpm -r typecheck`
- `pnpm -r test`
- `pnpm --filter @qr-relay/client build` (DEV 専用ルートがバンドルから
  落ちることの確認)
- 上記 build 後の `dist/` に `Debug` 系ファイルが含まれないこと
  (`grep -ri "DebugRoom" apps/client/dist || echo "ok"`)

### 受け入れ挙動 (dev server で手動確認)
- (a) `/debug` → preset=baton で新規 room 作成 → `/debug/CODE` に遷移
- (b) `+3 bots` で 3 体が join、別タブの `/r/CODE` の人数 chip が +3
- (c) Room control の `start` を押すと observer の phase が running に
- (d) Manual scan: bot1 → bot2 で scan、metrics が更新
- (e) Autonomy: bot1 を `random@500ms` に → 1 秒で 1-2 件の scan が
  Event log に流れる、stop after 5 を入れたら 5 件で止まる
- (f) Scenario: round-robin chain で 3 bot 全員が 1 回ずつ scan する
- (g) Scenario: random storm rate=10Hz duration=2s → ~20 件の event
- (h) Edge cases: 8 種全てで対応する server error が Event log に出る
  - replay nonce → "duplicate nonce"
  - stale ts → "timestamp out of window"
  - self scan → "cannot scan self"
  - unknown pid → "unknown player"
  - invalid data → "invalid payload data"
  - malformed json → "invalid json" もしくは "invalid message"
  - scan while ready → "game is not running"
  - host scan → "host cannot scan"
- (i) State inspector: baton preset で scan するたび token holder の bot
  名がハイライト遷移する
- (j) 全 bot 削除で `/r/CODE` 側の人数 chip が元に戻る (`/leave` が
  サーバ側 `stored.players` から bot を除去するため)
- (j2) 別タブの debug で作った bot がこのタブの BotRoster に
  **remote** 行として現れ、その × を押すと leave API が叩かれて
  サーバから消える
- (k) 本番 build に `Debug` 系ファイルが含まれない (上記 grep)

## Outcomes And Retrospective

### 何が入ったか

- `apps/client/src/lib/debug/` 4 ファイル + tests (50 件):
  - `bot-connection.ts` — fetch/WS の薄い DI ラッパー
  - `bot-pool.ts` — bot 群 + 確定 nonce 追跡 + subscribe/onMessage/onSend
  - `scenarios.ts` — round-robin / all-to-all / random-storm / token-relay
    の pure generator
  - `edge-cases.ts` — 10 種の payload generator + 期待エラー対応表
- `apps/client/src/routes/Debug.tsx` — `/debug` picker
- `apps/client/src/routes/DebugRoom.tsx` — `/debug/:code` メイン console
- `apps/client/src/components/debug/` 5 ファイル — RoomControl / BotRoster /
  ScanControls (4 タブ) / EventLog / StateInspector + 共有 types
- `apps/client/src/routes.tsx` — `import.meta.env.DEV` 分岐で
  debug ルートを追加 (prod build からは tree-shake で除外)

### 検証済み

- `pnpm -r typecheck` グリーン
- `pnpm -r test` 全 366 件グリーン (初期 debug 関連 50 件 + leave 系 +4)
- `pnpm --filter @qr-relay/client build` 成功、dist の grep で
  `DebugRoom / bot-pool / bot-connection / debug-observer / EDGE_CASES`
  どれも 0 件 → prod bundle に debug コードが落ちていない

### 残タスク

- dev server を起動して Verification の (a)〜(j) を手動で踏む。特に
  preset baton で token holder が遷移する挙動 (i) は State inspector
  のハイライトで眺める前提のテスト。
- 確認後、このプランを `docs/exec-plans/completed/` に移す。
- 将来、scan の手動繰り返しに edge-cases の `host-scan` を一発で当てる
  ためのショートカット (host bot を 1 体自動で立てるトグル) を Bot
  roster のヘッダに足す案。今は `+host bot` ボタンで明示的に立てる
  運用とした。
