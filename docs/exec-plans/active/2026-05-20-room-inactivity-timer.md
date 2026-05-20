# Plan: 無操作ルームの終了タイマー

Owner: 自分
Status: In progress (implementation done; manual smoke pending)
Created: 2026-05-20
Updated: 2026-05-20

## Goal

一定時間無操作の room を自動で片付け、画面上は警告モーダルで継続/終了の選択を
提示する。サーバー側は Durable Object Alarm で storage / WS を GC し、クライアント
側は「あと M:SS」のカウントダウンを表示する。

## Context

このプランを再開するときに必要なファイル / 既存挙動。

- 関連コード:
  - `apps/server/src/room.ts` — Durable Object I/O 層 (storage, WS, broadcast)
  - `apps/server/src/room-domain.ts` — pure reducer 群 (Stored → Stored)
  - `apps/server/src/ports.ts` — `Clock` port (`now()` のみ。alarm port を新設予定)
  - `apps/client/src/lib/ws-store.ts` — WS message ハンドリング (`PlayerLite`, `WsMessage`)
  - `apps/client/src/lib/clock.ts` — `Clock` port (`now/setTimeout/clearTimeout`)
  - `apps/client/src/routes/RoomLayout.tsx` — room の共通シェル (バナー描画の差し込み点)
  - `packages/core/src/schemas.ts` — `WsClientMsg` discriminated union
- 関連 docs:
  - `AGENTS.md` テスト可能性ルール (副作用は port 注入)
  - `docs/design-docs/core-beliefs.md` — pure domain 原則
- 参考挙動 (UI):
  - 警告モーダル "ルームが無操作です / あと 3:28 / シェイクやボタン操作でルームを
    維持できます / 継続する"
- 関連プラン: `docs/exec-plans/completed/2026-05-19-initial-mvp.md`

## Scope

In scope:

- Server: room ごとに `lastActivityAt` を持ち、Cloudflare DO Alarm で 2 段階
  (warning → close) のタイマーを管理する
- Server: 活動シグナル = scan / start / reset / join / `keepalive` WS msg
  - QR scan の継続が一次的な延長手段
- Server: close 時に storage を消去し、全 WS にクローズ通知 → 切断
- Client: `inactivity-warning` を受けて警告モーダルをカウントダウン表示
- Client: 「継続する」ボタンで `keepalive` を送信 (scan による暗黙延長は server 側で
  自動)
- Client: `closed { reason: "inactivity" }` を受けて `/r/:code/closed` の終了画面に
  遷移し、Home への動線を提示
- 既存テスト方針 (pure reducer + vitest) を維持し、ドメインロジックを単体テスト可能に
  保つ

Out of scope:

- ホストによる「手動でルームを閉じる」UI (将来別プランで)
- 警告/閉鎖の閾値をルームごとに設定する管理画面 (既定値固定)
- shake / DeviceMotion による延長 (このアプリでは QR scan が延長シグナル)
- e2e (Playwright) — 既知の tech-debt 通り後追い

## Design

### 既定の閾値

`apps/server/src/room.ts` 内に定数として定義する。MVP では固定:

- `WARN_AFTER_MS` = 10 分 (= 600_000)
- `CLOSE_AFTER_MS` = 15 分 (= 900_000) — warning から 5 分の継続猶予

(reference 画像の "3:28" は warning 経過後の残り時間。client は `closeAt - now`
をそのまま表示する。)

### Server: 活動シグナルとタイマー

1. `RoomMeta` に `lastActivityAt: number` を追加 (`createdAt` で初期化)。
   - 既存 `Stored` 永続化キーに lastActivityAt をぶら下げる (meta 拡張)。
2. 純関数 `touchActivity(stored, now): Stored` を `room-domain.ts` に追加。
   - reduceInit / reduceJoin / reduceStart / reduceReset / reduceScan の成功パスで
     呼ぶ (各 reducer の末尾で `meta.lastActivityAt = now` を返す形に統一)。
3. `room.ts` (DO 層) で alarm port を導入:
   - `apps/server/src/ports.ts` に `AlarmScheduler` 型を追加 (now/setAlarm/getAlarm)。
   - production は `state.storage.setAlarm` を使う `DurableObjectAlarmScheduler`。
   - テストは fake で 1 つ書く。
4. activity が発生したら `setAlarm(lastActivityAt + WARN_AFTER_MS)` を立てる。
5. `alarm()` ハンドラ:
   - `idle = now - lastActivityAt` を計算。
   - `idle < WARN_AFTER_MS`: ノーオペ + 次の alarm を `lastActivityAt + WARN_AFTER_MS` に。
   - `WARN_AFTER_MS ≤ idle < CLOSE_AFTER_MS`:
     - broadcast `{ t: "inactivity-warning", closeAt: lastActivityAt + CLOSE_AFTER_MS }`
     - 次の alarm を `lastActivityAt + CLOSE_AFTER_MS` に。
   - `idle ≥ CLOSE_AFTER_MS`:
     - broadcast `{ t: "closed", reason: "inactivity" }`
     - すべての WS を close
     - storage を全削除 (`deleteAll`)、alarm 解除。
6. WS `keepalive` メッセージを `WsClientMsg` に追加 → touchActivity 経由で
   `lastActivityAt` 更新 + warning が出ていれば broadcast で取り消し
   (`{ t: "inactivity-cleared" }`)。

### Client: 警告モーダルとカウントダウン

1. `WsMessage` 型に `inactivity-warning` / `inactivity-cleared` / `closed` を追加。
2. `WsStoreState` に `inactivity: { closeAt: number } | null` を追加。
3. `RoomLayout.tsx` 配下に `InactivityOverlay` コンポーネントを新設:
   - `closeAt - clock.now()` を 1s ごとに再計算 (clock port 経由、`setTimeout` ループで
     testable に保つ)。
   - "あと M:SS" を表示 (reference 画像準拠の文言)。
   - 「継続する」ボタンで `useWs.send({ t: "keepalive" })` を呼ぶ。
   - QR scan が成功するたびに server 側で lastActivityAt が更新され、`inactivity-cleared`
     が両端末に届く → モーダルは自動で閉じる (ユーザーは scan を続ければ意識せずに
     延長される)。
4. `closed { reason: "inactivity" }` 受信時:
   - WS 切断後、`/r/:code/closed` ルートへ `navigate`。
   - 終了画面 `RoomClosed.tsx` を新設し、見出し「ルームを終了しました」+ 理由文 +
     「ホームへ戻る」CTA を提示。
   - 終了画面は room 状態に依存しないスタンドアロン (RoomLayout の外 / 認証不要)。

### 永続化と互換性

- 既存ルームのストレージには `lastActivityAt` が無い。load 時に欠落していれば
  `createdAt` で埋める (defensive default in `room.ts`)。
- 既存 e2e/開発体験を壊さないよう、`WARN_AFTER_MS` は dev で短縮可能にしたい。
  → wrangler の `vars` で `INACTIVITY_WARN_MS` / `INACTIVITY_CLOSE_MS` を任意上書きできる
    ようにする (未定義なら既定値)。

## Milestones

1. **M1 (domain)**: `touchActivity` / `lastActivityAt` を `room-domain.ts` に導入、既存
   reducer を全部成功時に lastActivityAt 更新するよう変更し、純関数テストを追加。
2. **M2 (alarm port)**: `AlarmScheduler` port を `ports.ts` に追加、`room.ts` に組み込み、
   alarm() ハンドラで warning/close ロジックを実装。fake alarm + fake clock で
   単体テスト。
3. **M3 (WS protocol)**: `WsClientMsg` に `keepalive` 追加、`WsMessage` に
   `inactivity-warning` / `inactivity-cleared` / `closed` 追加。両側の型同期。
4. **M4 (client UI)**: ws-store の inactivity ステート → `RoomLayout` に
   `InactivityOverlay` 表示 → 「継続する」で keepalive 送信。
5. **M5 (closed screen)**: `/r/:code/closed` ルートと `RoomClosed.tsx` を新設、
   `closed { reason: "inactivity" }` 受信時の遷移と「ホームへ戻る」動線を実装。
6. **M6 (smoke + docs)**: wrangler dev + 2 ブラウザで warning → keepalive → cleared、
   warning → 放置 → closed → 終了画面 → Home の一連を手動確認。`docs/index.md` /
   `tech-debt-tracker.md` 更新。

## Progress

- [x] M1: lastActivityAt + touchActivity (reducer)
  - `RoomMeta.lastActivityAt` 追加、`touchActivity(stored, now)` を `room-domain.ts` に追加。
  - 成功パスで lastActivityAt を更新するのは init / join / start / reset / scan。
    pause / resume は plan 決定通り更新しない (room 維持シグナルではない)。
  - 既存 reducer の不変条件を保ったまま `room-domain.test.ts` に 10 ケース追加。
- [x] M2: AlarmScheduler port + alarm() ハンドラ
  - `apps/server/src/ports.ts` に `AlarmScheduler` 型と
    `createDurableObjectAlarmScheduler` を追加。
  - 純粋な決定関数 `decideAlarmAction(lastActivityAt, now, warn, close)` を
    `room-domain.ts` に追加 (`reschedule` / `warn` / `close` を返す)。
  - `RoomDurableObject.alarm()` で broadcast / setAlarm / deleteAll を分岐。
  - `INACTIVITY_WARN_MS` / `INACTIVITY_CLOSE_MS` env を読む (空なら 10min / 15min)。
  - 既存ルームの `lastActivityAt` 欠落は `loadStored` で `createdAt` にフォールバック。
- [x] M3: WS protocol 拡張 (`keepalive` / `inactivity-*` / `closed`)
  - `packages/core/src/schemas.ts` の `WsClientMsg` に `keepalive` 追加。
  - `apps/client/src/lib/ws-store.ts` の `WsMessage` に `inactivity-warning` /
    `inactivity-cleared` / `closed` 追加。
- [x] M4: InactivityOverlay + WS store 統合
  - `WsStoreState` に `inactivity` / `closed` を追加。`closed` 受信時は
    `disconnect()` を即時呼び自動再接続ループを止める。
  - `apps/client/src/components/InactivityOverlay.tsx` を新設し
    `RoomLayout` から `inactivity.closeAt` を渡して描画。継続するボタンで
    `{ t: "keepalive" }` を送る。
- [x] M5: `/r/:code/closed` ルート + RoomClosed 画面
  - `apps/client/src/routes/RoomClosed.tsx` を新設 (RoomLayout の外、認証不要)。
  - `appRouteObjects` の `/r/:code/closed` は `RoomLayout` の子ではなくトップレベル
    ルートとして登録 (RoomLayout が即 join を試みるため)。
  - `RoomLayout` で `closed` を監視して `navigate(/r/:code/closed, { replace: true })`。
- [ ] M6: smoke + docs 更新 (実装と単体テストは終了、wrangler dev の手動 smoke が残)

## Surprises And Discoveries

実装中に気づいたこと、想定外の挙動、変更した方針を都度追記する。

- **`RoomClosed` は RoomLayout の子ルートにできない**: 当初 `/r/:code/closed` を
  RoomLayout の子に置こうとしたが、RoomLayout の useEffect が無条件に `joinRoom` を
  呼ぶため、閉じた直後の room へ即 join → 404 で落ちるか、最悪は新規 room を
  生成しかねない。トップレベルルートに分離して RoomLayout を経由させない設計に変更
  (routes.test.tsx でこの構造を hard-couple)。
- **`closed` 受信時の自動再接続ループ抑止**: ws-store の close リスナは reconnect
  タイマーを必ず仕掛けるが、room が消えた後にこれが回ると無限再接続になる。
  `closed` を立てたら同期で `disconnect()` を呼び、close リスナ側でも `closed` フラグ
  が立っていれば reconnect をスキップするよう二重に防いだ。
- **`reduceJoin(host, 二度目)` でも lastActivityAt は進める**: 元のコードは
  host が既に存在すれば stored をそのまま返していたが、host が再接続したことは
  「人が動いている」シグナルなので、idempotent 路でも lastActivityAt を更新する形に
  揃えた (副作用なし)。
- **`pause`/`resume` は activity に含めない**: plan 決定通り。ホストが意図的に
  止めている時間も無操作扱いとし、放置されたままなら閉鎖する方が「片付け」目的に
  合う。Decision Log に追記済み。

## Decision Log

判断点と採用理由。後から「なぜ X を選んだか」を読み返せるように。

- **2 段階 alarm (warn → close)**: 利用者に "あと N 分" の猶予を見せたい。1 段階だと
  突然 disconnect になり「何が起きたか分からない」UX に。
- **lastActivityAt は meta に同居**: 別キー化すると load/save パスが増える。
  既存の `meta` 永続化に乗せれば変更点が局所化する。
- **shake は採用しない**: QR 中心の app なので、自然な延長手段は scan そのもの。
  shake は誤発火 / permission gate の負荷が見合わない。
- **既定値 10/15 分**: scan ベースの遊びは数分単位で動くので 30 分は長すぎる。10 分
  無操作で警告、5 分カウントダウン後に閉鎖が現実的。dev デバッグ用に env var override
  は許す。
- **終了画面を別ルートに**: トースト一瞬では理由が伝わらず、Home に戻った後の
  「何が起きた?」状態を避けたい。`/r/:code/closed` で完結したメッセージ + 動線を出す。

## Verification

- コマンド:
  - `pnpm -r typecheck`
  - `pnpm -r test`
  - `pnpm -w lint`
- 受け入れ挙動:
  - 何も操作しない room: 10 分後に warning が両 WS に届き、モーダルが表示される。
  - warning 中に scan 成立: `inactivity-cleared` でモーダルが閉じ、タイマーが再起算。
  - warning 中に「継続する」: 同上 (keepalive 経路)。
  - warning 後 5 分間放置: storage が消え、WS が切断され、両端末が
    `/r/:code/closed` に遷移し、「ホームへ戻る」CTA が表示される。
  - dev では `INACTIVITY_WARN_MS=30000` / `INACTIVITY_CLOSE_MS=60000` 等で短縮確認。

## Outcomes And Retrospective

`completed/` に移す直前に書く。最終的に何が変わったか / 残ったこと / 次に注意点。

実装した内容:

- Server: `RoomMeta.lastActivityAt`, `touchActivity`, `decideAlarmAction` を
  純関数として `room-domain.ts` に追加。DO 層 (`room.ts`) で
  `AlarmScheduler` port 経由で 2 段階 alarm (warn → close) を駆動。`keepalive` /
  `inactivity-warning` / `inactivity-cleared` / `closed` の WS protocol を実装。
- Client: `ws-store` に `inactivity` / `closed` を追加。`InactivityOverlay`
  コンポーネントが残り時間 (`M:SS`) をカウントダウン、「継続する」で keepalive
  を送る。`closed` 受信時は `/r/:code/closed` の独立ページへ navigate し、
  「ホームへ戻る」CTA を表示。
- 単体テスト: server 53 件 / client 92 件 / core 22 件すべてグリーン。
  `decideAlarmAction` と `lastActivityAt` 更新のクロスチェックを追加。
- 設定: `INACTIVITY_WARN_MS` / `INACTIVITY_CLOSE_MS` env で dev 時に閾値を短縮可。
  既存ルームに `lastActivityAt` が無い場合は `createdAt` でフォールバック。

残タスク:

- **M6 smoke**: `wrangler dev` + 2 ブラウザで warning → keepalive → cleared
  → 放置 → closed → 終了画面 → Home の経路を手動確認すること。
- **e2e**: tech-debt-tracker の Playwright multi-context 化と合流させて
  warning / closed の経路をカバーする。
- **ホストによる手動「ルームを閉じる」UI**: 別プランで。

次に触る人へ:

- alarm() の broadcast 順序は「警告 → setAlarm」「close 通知 → ws.close →
  deleteAll → deleteAlarm」の順で実装してある。順番を変えると client が
  reconnect ループに入る可能性があるので注意。
- `inactivityWarned` は storage の `inactivityWarned` キーに永続化されている。
  DO がエビクトされても警告状態を復元できる。
