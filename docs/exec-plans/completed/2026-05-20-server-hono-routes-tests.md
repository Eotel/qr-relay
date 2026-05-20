# Plan: Hono Routes Test for apps/server

Owner: miura
Status: Completed
Created: 2026-05-20
Completed: 2026-05-20

## Goal

`apps/server/src/index.ts` の Hono アプリ層に単体テストを入れ、`/api/*` の
バリデーション・エラー envelope・ステータスコード・Durable Object への
ディスパッチを Node 上の vitest で再現可能にする。現状この層はテストが
ゼロ（`vitest run --passWithNoTests` でスキップされている）。

## Context

- 対象コード: `apps/server/src/index.ts:1-126`
  - `GET /api/health`
  - `GET /api/handlers`
  - `POST /api/rooms`（`handlerId` 必須・未知 handler は 400・コード衝突
    リトライ 5 回・DO から 400 が返ったら再試行しない）
  - `POST /api/rooms/:code/join`（`playerId`/`name` 必須、`role` 正規化）
  - `GET /api/rooms/:code`
  - `POST /api/rooms/:code/{start,pause,resume,reset}`
  - `GET /ws/:code`（`Upgrade: websocket` 必須、`pid` 必須）
- 既存テスト: `apps/server/src/code.test.ts`, `apps/server/src/room-domain.test.ts`
- 隣接情報:
  - `apps/server/vitest.config.ts:1-9`（node 環境、`src/**/*.{test,spec}.ts`）
  - `apps/server/package.json:14`（`"test": "vitest run --passWithNoTests"`）
  - `apps/server/wrangler.toml:1-11`（`ROOM` DO binding）
  - `packages/handlers/src/index.ts`（`presets`, 各 handler の登録）
- 関連 docs: `docs/exec-plans/completed/2026-05-19-initial-mvp.md`
- Hono の薄い request util（`app.request(path, init)` / `hono/testing`
  の `testClient`）は依存追加なしで使える。`hono` は既に `^4.6.14`。

## Scope

In scope:

- `apps/server/src/index.test.ts` を追加し、`app` を直接 import して
  `app.request()` で HTTP セマンティクス（status / JSON body / header）を
  検証する。
- `Env.ROOM`（`DurableObjectNamespace`）のフェイクを用意し、
  `idFromName` → `get(id).fetch(req)` のシーケンスをハンドラごとに差し
  替えられる形にする（reusable な `makeFakeRoomNamespace()` ヘルパ）。
- 主要パスのテスト:
  - `/api/health` 200 + `{ ok: true }`
  - `/api/handlers` 200 + `{ handlers: [...], presets }`（最低 1 件と
    `presets` 構造が含まれること）
  - `POST /api/rooms`:
    - 200 + `{ code }`（DO が `ok` を返した場合に 1 回目で成功）
    - 400「handlerId required」
    - 400「unknown handler: ...」
    - DO から 400 + JSON が返った場合の透過（リトライしない）
    - 5 回全部 collision で 500「could not allocate room code」
  - `POST /api/rooms/:code/join`:
    - 400「bad request」（payload 欠落）
    - 200 透過（DO レスポンスの body/status をそのまま返すこと）
    - `role` が `"host"` 以外なら `"client"` に正規化されることを DO に
      渡る body から検証
  - `GET /api/rooms/:code`: 透過
  - `POST /api/rooms/:code/{start,pause,resume,reset}`: 4 アクション全部、
    DO の `fetch(/${action})` が呼ばれることと status/body 透過
  - `GET /ws/:code`: `Upgrade` ヘッダなしで 426、`pid` なしで 400
- 既存 `package.json` の `test` スクリプトはそのまま vitest で動くこと
  を確認。`--passWithNoTests` は残してよいが、テストが入った時点で
  「ノーオプ」ではなくなる。

Out of scope:

- `RoomDurableObject` 本体（`apps/server/src/room.ts`）の DO 統合テスト。
  既に domain 層は `room-domain.test.ts` でカバー済み。WebSocket の
  実通信テストは `@cloudflare/vitest-pool-workers` 導入が必要なので
  別プラン化する（"Phase B" として candidate のみ記録）。
- `e2e/*.spec.ts` の Playwright 側の更新。
- handlers / core パッケージ側のテスト追加。

## Milestones

1. ヘルパ整備: `apps/server/src/test-helpers/fake-room-namespace.ts`
   （`DurableObjectNamespace`-like なオブジェクトを `fetch` を差し替え
   可能な形で組み立てる util）。
2. `apps/server/src/index.test.ts` を新規追加。最初に `/api/health`,
   `/api/handlers` の green test を 1 件ずつ書いて、`app.request()` が
   通る配線を確認する（RED → GREEN の最小サイクル）。
3. `/api/rooms` 系（成功・各 400 パターン・collision retry）。
4. `/api/rooms/:code/join` と phase actions。
5. `/ws/:code` のネガティブパス（426 / 400）。
6. `pnpm --filter @qr-relay/server test` と `pnpm -r typecheck` をパス
   させて、最後にプランを `completed/` へ移送。

## Progress

- [x] M1: fake namespace helper (`apps/server/src/test-helpers/fake-room-namespace.ts`)
- [x] M2: 最初の 2 routes のテスト (`/api/health`, `/api/handlers`)
- [x] M3: `/api/rooms` テスト群 (success / 各 400 / DO 400 passthrough / 5x retry → 500)
- [x] M4: join / phase actions テスト群 (`role` 正規化込み)
- [x] M5: `/ws/:code` ネガティブテスト (426 / 400)
- [x] M6: typecheck + test green、プランを `completed/` へ移送

## Surprises And Discoveries

実装中に気づいたこと、想定外の挙動、変更した方針を都度追記する。

- `app.request(path, init, env)` の第 3 引数で `Env`（Bindings）を注入できる
  ので、Hono 単体テストに workerd / `@cloudflare/vitest-pool-workers` は
  不要だった。プラン Decision Log の方針通り。
- `DurableObjectNamespace` 全メソッドのフェイクは `as unknown as
  DurableObjectNamespace` の単一キャストで十分。`get(id).fetch(...)` だけ
  使われていて、ID 同値性などは route 側で参照されていない。
- `/api/rooms` の collision retry は「200 でも 400 でもない status」が
  返ったときに繰り返す。テストでは `Response("...", { status: 409 })` を
  返し続けて 5 回ループ → 500 を再現した。
- アンビギュアス回避のため、`code` の許容集合は `[A-HJ-NP-Z2-9]` (32 文字
  アルファベット、`I`/`L`/`O` と `0`/`1` を除く)。テストの正規表現は
  この集合に合わせている。`code.ts` の ALPHABET が真の source of truth。

## Decision Log

- **Hono の `app.request()` を採用、`@cloudflare/vitest-pool-workers` は
  入れない**: 目的は Hono ルート層（validation / status / dispatch）の
  検証。DO の実挙動は domain 層のテストでカバー済みで、ここで workerd を
  起動するコストに見合わない。pool-workers 導入は WebSocket / DO 統合
  テストを書く別プランで検討する。
- **`Env.ROOM` をフェイクで差し替える**: `app.request(path, init, env)` の
  第 3 引数で Hono の `Bindings` を注入できる。production の wrangler
  config には触らない。
- **テストは route ごとに 1 ファイルではなく `index.test.ts` 1 本に
  集約**: 対象が単一の `app` インスタンスで、ヘルパも共有するため。

## Verification

- コマンド:
  - `pnpm --filter @qr-relay/server test`
  - `pnpm --filter @qr-relay/server typecheck`
  - `pnpm -r test`
- 受け入れ挙動:
  - 上記コマンドが全て green。
  - 新規テストが少なくとも 12 ケース以上含まれ、全ハンドラの代表
    パスが 1 つ以上テストされていること。
  - DO への `fetch` 引数（method / URL / body）がフェイクで検証
    されており、`role` 正規化のような暗黙ロジックが落ちないこと。

## Outcomes And Retrospective

### 変更点

- `apps/server/src/test-helpers/fake-room-namespace.ts` を新規追加。
  `idFromName(name).get(id).fetch(input, init)` を全部捕捉し、
  - `calls[]` に `{ name, url, method, bodyText, headers }` を順序通り蓄積
  - `setFetch(handler)` でフォールバック差し替え
  - `queueFetch(...handlers)` で FIFO に応答を仕込み
  ができる。`as unknown as DurableObjectNamespace` で `Env.ROOM` に注入可能。
- `apps/server/src/index.test.ts` を新規追加。Hono の `app.request(path,
  init, env)` を使い、21 ケースで `/api/*` を網羅:
  - `/api/health`: 1 ケース
  - `/api/handlers`: 1 ケース (`relay` の存在 + `presets` 構造)
  - `/api/rooms` POST: 6 ケース (success / non-JSON / handlerId 欠落 /
    unknown / DO 400 passthrough / 5x retry → 500)
  - `/api/rooms/:code/join`: 5 ケース (playerId 欠落 / name 欠落 /
    `role` 正規化 / `role=host` 保持 / DO エラー passthrough)
  - `/api/rooms/:code`: 1 ケース (state passthrough + code 正規化)
  - phase actions (start/pause/resume/reset): 4 ケース + 1 エラー
    passthrough
  - `/ws/:code`: 2 ケース (426 / 400)
- `Env.ROOM` の DO への引数（method / URL / body）を一貫してフェイクで検証
  しており、`role` 正規化や `normalizeRoomCode` での upper-case 化のような
  暗黙ロジックが落ちないことを保証。

### 検証結果

- `pnpm --filter @qr-relay/server test` → 3 files / 74 tests passed
  (うち 21 が新規 `index.test.ts`)。
- `pnpm --filter @qr-relay/server typecheck` → クリーン。
- `pnpm -r test` → 19 files / 216 tests passed (server 74 + client 142)。
- `pnpm -r typecheck` → 全 workspace クリーン。

### 残ったこと / 次の注意点

- `apps/server/package.json` の `test` スクリプトは依然
  `vitest run --passWithNoTests` のまま。今回 21 ケース入ったので
  `--passWithNoTests` はもう実質ノーオプ。次に他テストを移動する PR で
  外しても良い (現状そのままでも害はない)。
- DO 本体 (`RoomDurableObject` の `fetch` 経路) と WebSocket の実通信は
  まだ Node 上の単体テストでは検証していない。`@cloudflare/vitest-pool-workers`
  を入れて WebSocket / DO 統合テストを書く別プラン (Phase B) を検討する
  価値あり。ただし優先度は低 (`room-domain.test.ts` が domain 層を
  純関数として 46 ケースでカバー済み)。
- `MEMORY.md` 級の確定的なルールは生まれていない (`docs/PLANS.md` 上の
  ふるまいから外れたものなし)。
