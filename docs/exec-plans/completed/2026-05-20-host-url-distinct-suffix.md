# Plan: host 画面の URL を `/r/CODE/host` に揃える

Owner: miura
Status: Done
Created: 2026-05-20
Completed: 2026-05-20

## Goal

ホストとして部屋にいる時は URL バーが `/r/CODE/host` に、参加者として入っている時は
`/r/CODE` のままに、それぞれ視覚的に**別の URL**で表示されるようにする。今は
`/r/CODE/host` のルート定義はあるのに、`NewRoom` / `Home` / `RoomLayout` のどこからも
そこに `navigate` していないので、結果として host も client も URL は `/r/CODE` の同一に見える。

## Context

現状の挙動 (確認済み):

- `apps/client/src/routes.tsx:30-39`
  - `/r/:code` → `RoomRoot` (role を見て `HostRoom` / `ClientRoom`)
  - `/r/:code/host` → `RoomRoot` (同上、装飾用と書いてある)
  - `/r/:code/scoreboard` → `Scoreboard` (client のスコア閲覧)
  - `/r/:code/closed` → `RoomClosed`
- `apps/client/src/routes/NewRoom.tsx:53,58` — `setRole(code, "host")` → `navigate(\`/r/\${code}\`)` で **/host が付かない**。
- `apps/client/src/routes/Home.tsx:45-46` — 「前回のホストに戻る」CTA も `/r/\${code}` に navigate。
- `apps/client/src/routes/HostRoom.test.tsx` / `ClientRoom.test.tsx` — `<Route path="/r/:code" element={…}>` の構造でテスト済。`/host` 配下のルート上で動くかは未テスト。
- `apps/client/src/components/JoinQrDisplay.tsx:11` — 参加 QR は `/r/\${code}` を埋めている (これは参加者向けなので正しい)。
- `apps/client/src/lib/identity.ts:25-50` の方針:
  - **URL = intent / localStorage = authority**。ホストが自分の QR をうっかり踏んでもクライアントに降格しない、というガード。
  - 今回も**この不変条件は崩さない**: `/r/CODE/host` に来ても、localStorage 上 client なら client のまま表示する。

ユーザーの確認結果: ブラウザで `http://localhost:5173/r/2WGFNJ/host` を直打ちすると Host が
開く (= ルート自体は機能している)。Home からの遷移だけが `/host` を付け落としている。

## Scope

In scope:

- Host として navigate する経路すべてを `/r/CODE/host` に揃える。
  - `NewRoom.tsx:58`
  - `Home.tsx:46` (前回ホスト復帰)
  - 他に `setRole(code, "host")` の直後に navigate するコードがあれば併せて修正
- `routes.tsx` の `/r/:code/host` 配下に `scoreboard` 等の子ルートが必要なら追加する。
  必要かどうかは先に確認 (host は自前 dashboard を持ち、`Scoreboard` ルートを使うのは client だけ — 不要のはず)。
- 既存テスト (`routes.test.tsx`, `HostRoom.test.tsx`, etc.) を `/r/CODE/host` 着地で更新。
- `acceptInviteRole` の挙動を明示的にテストで固定する:
  - `/r/CODE` (suffix なし) に着地 → 初回は client に降格 (現状維持)。
  - `/r/CODE/host` に着地 → localStorage に host claim がある時は host、ない時は今まで通り
    `acceptInviteRole` で client にフォールバック (URL = intent / localStorage = authority)。

Out of scope:

- `/r/CODE/host` 直打ちで localStorage に host claim が無い時に「URL を信用して host を名乗らせる」案。
  ホストが自分の QR を踏んだ時の demote 防止という現行不変条件を崩すので、別 plan。
- 参加 QR の URL を変える (`/r/CODE/join` 等)。参加者の URL は `/r/CODE` のまま。
- Host 画面の中身/UI 変更 (今回は URL だけの話)。

## Milestones

1. `routes.test.tsx` に「`/r/CODE/host` で matchRoutes が host ルートに当たる」regression test を追加 (今は host 側の test が無いはず)。RED 期待。
2. `NewRoom.tsx` と `Home.tsx` の navigate を `/r/CODE/host` に変更。1. のテストを GREEN にする。
3. `RoomLayout.tsx` 内の戻り導線 (例: client タブの `/r/${code}` リンク) が host 文脈で破綻していないか確認。
   現状 `RoomLayout.tsx` の `<NavLink to={\`/r/${code}\`}>` 等は **role === "client" の時しか出さない**ので変更不要のはず。
4. `acceptInviteRole` の意図維持 — `/r/CODE/host` に着地した時の挙動を単体テストで固定。
5. README / AGENTS / 該当 design-doc に「host は `/r/CODE/host`、参加者は `/r/CODE`」と一行書き添える。

## Progress

- [x] M1: コンポーネント単位の RED テスト追加 (`NewRoom.test.tsx`, `Home.test.tsx`) — navigate target を `/r/CODE/host` で assert。当初予定だった routes.test.tsx の matchRoutes test は既に存在 (lines 32-39) していたため対象を切り替え。
- [x] M2: `NewRoom.tsx:61` と `Home.tsx:48` の navigate を `/r/${code}/host` に変更。同時に host 作成 flow の e2e spec 群 (`room-flow` / `nickname` / `client-no-scroll` / `room-share-from-client` / `host-view-switcher` / `host-client-roles`) の `waitForURL(/\/r\/[A-Z0-9]+$/)` を `/\/r\/[A-Z0-9]+\/host$/` に置換。
- [x] M3: `RoomLayout.tsx` 内の `<NavLink to={\`/r/${code}\`}>` / `<NavLink to={\`/r/${code}/scoreboard\`}>` は `role === "client" && (...)` ガード内のみ。host context では描画されないので変更不要であることを確認。
- [x] M4: `identity.test.ts` に「URL は装飾、localStorage が authority」契約を明示する regression test を追加。`identity.ts` の `acceptInviteRole` JSDoc も URL = intent / localStorage = authority を明示。
- [x] M5: `AGENTS.md` の「よく使う作業の入口」表にルーム URL 規約 (`host = /r/CODE/host` / 参加者 = `/r/CODE`) の 1 行を追記。`pnpm -r typecheck` / `pnpm -r test` / 該当ファイルの biome check すべて green。

## Surprises And Discoveries

- `apps/client/src/routes.test.tsx:32-39` に既に「`/r/CODE/host` で host ルートに matchRoutes が当たる」テストがある (構造的にはルート定義は OK)。
  - 従って M1 の RED は **navigate 先のコンポーネント側で取る**ことに改める:
    `NewRoom` / `Home` の navigate target が `/r/CODE/host` であることを assert。
- e2e spec 群 (`room-flow`, `nickname`, `client-no-scroll`, `room-share-from-client`,
  `host-view-switcher`, `host-client-roles`) で
  `waitForURL(/\/r\/[A-Z0-9]+$/)` の **末尾 `$` アンカー**を host 作成直後に使っている。
  navigate を `/host` 付きに変えると軒並み RED になるため、合わせて
  `/\/r\/[A-Z0-9]+\/host$/` に置換する必要あり。client 参加経由 (`waitForURL(new RegExp(\`/r/\${code}\`))`)
  はアンカー無しなので影響なし。

## Decision Log

- **採用**: URL に `/host` を明示するのは intent decoration の継続強化。
  - 理由: 既に `routes.tsx` に該当ルートがあるので、振る舞いを変える話ではなく
    「想定通り使うようにする」だけ。差分が小さく安全。
- **却下 (現時点)**: URL を authority に格上げする (`/r/CODE/host` なら必ず host を再要求)。
  - 理由: ホストが自分の QR を踏む事故時の demote 防止という現状不変条件を維持したい。
    必要なら別 plan で取り扱う。
- **保留**: 参加者用に `/r/CODE/join` を明示する案。
  - 今回は host だけ別 URL にすれば「同じ URL に見える」体験不便は解消できる。

## Verification

- コマンド:
  - `pnpm -r typecheck`
  - `pnpm -r test`
  - `pnpm e2e`
- 受け入れ挙動:
  - ホームから「ルームを作る」→ ブラウザの URL バーが `…/r/CODE/host` で停まる。
  - スマホで参加 QR を読む → `…/r/CODE` のまま (host 文字なし)。
  - ホストが自分の参加 QR をうっかり踏んでも、localStorage 上 host のまま (URL は `…/r/CODE` だが
    画面は HostRoom)。逆方向 (`…/r/CODE/host` を client が直打ち) も今まで通り client 画面で着地。

## Outcomes And Retrospective

**What shipped:**

- Host が部屋に居る間の URL は `/r/CODE/host`、参加者の URL は `/r/CODE` に分離。
  ホストが自分の QR を踏んだ場合の demote 防止 (`acceptInviteRole`) は不変。
- `NewRoom` (新規作成 flow) と `Home` (「前回のホストルームに戻る」CTA) の 2 経路の
  navigate を統一。client 参加経路 (`joinAsClient`) は意図的に `/r/CODE` のまま。
- 新規 unit test 4 件 (`NewRoom.test.tsx` x2 + `Home.test.tsx` x2 +
  `identity.test.ts` URL 契約 1 件)、e2e の anchored regex 11 箇所を `/host$` 付きに更新。

**Verified:**

- `pnpm -r typecheck` ✓
- `pnpm -r test` — 全 359 件 pass (client 224 + server 74 + handlers 29 + core 22 + ui 10)
- 触ったファイル群の `biome check` ✓ (`identity.ts:52` の既存 lint 警告は本 plan の
  diff 範囲外なので touch せず)
- e2e は (sandbox 制約のため) ローカル実行未確認。CI で確定する想定。

**Convention captured:**

- `AGENTS.md` に「ルームの URL 規約」を 1 行追加。
- `identity.ts` の `acceptInviteRole` JSDoc に「URL = intent / localStorage = authority」を明文化。

**Follow-ups (新規 plan の種):**

- `/r/CODE/host` を URL authority に格上げ (= localStorage に host claim が無くても
  URL を信用する) する案は明確に out of scope のまま据え置き。必要になれば別 plan。
- 参加者用 `/r/CODE/join` の明示は今回不要と判断。両者の URL が視覚的に違えば目的達成。

**Retro lesson:**

- 「matchRoutes の structural test を RED で書く」とプランしたが、実はその test は
  routes.test.tsx に既に存在していた。実装の bug は navigate target 側だったので、
  RED テストは component-level (NewRoom / Home の onClick → location) に取り直した。
  → 既存テスト網を先に grep してから「何が抜けてるか」を割り出すべし。
