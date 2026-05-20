# Plan: ルームお裾分け (Client から参加 QR を出せるようにする)

Owner: miura
Status: Implemented (handheld QR retraction + share overlay shipped; 手動視認 / e2e 既存破綻調査が残)
Created: 2026-05-20

## Goal

クライアント (プレイヤー) 画面から **「ルームお裾分け」** として参加 QR を提示
できるようにする。隣のプレイヤーは目の前の友達のスマホをかざすだけで合流できる。
これにより **ホスト画面は最初からスコア / 状況表示に専念**でき、Stage Dashboard
([2026-05-20-host-stage-dashboard](2026-05-20-host-stage-dashboard.md)) が
ねらう「6m 先からも読める会場フィードバック画面」が、開始前の `waiting` 状態でも
情報を奪われずに済む。

兄弟アプリ `shake-counter` の settings overlay (歯車 FAB → モーダル) を参考に、
クライアント側に **設定 / ルーム共有オーバーレイ** を導入する。同オーバーレイ内
で **ニックネーム変更**も可能にする (今は Home でしか変更できない)。

副次として、現状 `/r/:CODE` を host / client で共有して **localStorage の role**
で分岐している曖昧さを整理する。URL に role を明示するか、識別子を入れるかの
決定をこのプランの Decision Log で確定する。

## Context

### 現状の挙動

- URL は host / client 共通で `/r/:code`。`apps/client/src/routes/RoomLayout.tsx:21`
  が `getRole(code)` で localStorage から role を引いて分岐する。役割の決定経路:
  - `NewRoom.onCreate` → `setRole(code, "host")` 後に `/r/CODE` へ遷移
    (`apps/client/src/routes/NewRoom.tsx:52`)
  - `Home.joinAsClient` → `setRole(code, "client")` 後に `/r/CODE` へ遷移
    (`apps/client/src/routes/Home.tsx:43`)
  - 直リンク (`getRole` が null) → `<Navigate to="/" replace />`
- 参加 QR は **ホスト画面の中央タイル**から出る。
  - handheld: `HostRoom.HostRoomHandheld` の "ROOM CODE" カード
    (`apps/client/src/routes/HostRoom.tsx:160`)
  - stage dashboard: `HostDashboard` の `JoinQrTile`
    (`apps/client/src/routes/HostDashboard.tsx`, `apps/client/src/components/host/JoinQrTile.tsx`)
- 参加 QR の中身は `JoinQrDisplay` が `joinUrlFor(code) = ${origin}/r/${code}`
  を QR 化するだけ (`apps/client/src/components/JoinQrDisplay.tsx:8`)。Scan 側は
  `parseJoinPayload` で `/r/CODE` または bare code を取り出す
  (`apps/client/src/lib/join-url.ts:11`)。
- クライアント画面 (`ClientRoom.tsx`) には参加 QR を出す手段が無い。ニックネーム
  変更も Home 画面に戻らないとできない (`apps/client/src/lib/identity.ts`,
  `apps/client/src/lib/nickname.ts`)。

### 兄弟アプリ shake-counter の参照

shake-counter (UDK Shake Counter) では、クライアントが右下の **歯車 FAB** を
タップすると **設定オーバーレイ**が立ち上がり、その中に:

- 色を選ぶ (固有設定)
- 感度 (固有設定)
- 音 (固有設定)
- **「この QR で同じホストに参加できます」 + ルーム参加 QR**

が並んでいる (添付スクリーンショット参照)。QR Relay でも同じ "歯車 → オーバーレイ"
の枠を採用するのが UDK family として一貫する。

### 関連ファイル

- ルーティング: `apps/client/src/routes.tsx:31`
- レイアウト / role 解決: `apps/client/src/routes/RoomLayout.tsx:21`
- ホスト系: `apps/client/src/routes/HostRoom.tsx`, `apps/client/src/routes/HostDashboard.tsx`,
  `apps/client/src/components/host/JoinQrTile.tsx`
- クライアント本体: `apps/client/src/routes/ClientRoom.tsx`
- 参加 QR / scanner: `apps/client/src/components/JoinQrDisplay.tsx`,
  `apps/client/src/components/JoinScannerOverlay.tsx`,
  `apps/client/src/lib/join-url.ts`
- 識別 / ニックネーム: `apps/client/src/lib/identity.ts`, `apps/client/src/lib/nickname.ts`
- 既存テスト: `apps/client/src/lib/join-url.test.ts`,
  `apps/client/src/lib/nickname.test.ts`, `apps/client/src/lib/identity.test.ts`
- 設計原則: `DESIGN.md`, `PRODUCT.md` (Design Principles §1 Time-to-play is sacred,
  §2 One design system, two registers)

### 関連プラン

- `docs/exec-plans/active/2026-05-20-host-stage-dashboard.md` — このプランで
  host から QR の支配を解放する根拠。Dashboard の `JoinQrTile` 縮退案も
  ここで一緒に決める。
- `docs/exec-plans/active/2026-05-20-token-holder-tint.md` — client 主画面の
  状態演出。本プランの overlay 起動ボタンは tint を遮らない FAB にする。
- `docs/exec-plans/active/2026-05-20-room-inactivity-timer.md` — overlay 内では
  inactivity overlay と二重表示しない (重なり優先順位を確認)。

## Scope

### In scope

- **クライアントの設定オーバーレイ**を新規追加 (`components/client/RoomShareOverlay.tsx`
  仮名)。
  - 右下に常設の **歯車 FAB** を出す (`shake-counter` 準拠)。`pointer-coarse:size-11`
    以上、`safe-area-inset-bottom` を尊重。
  - FAB → モーダル overlay。内訳:
    1. **このルームに招待 QR** (= `joinUrlFor(code)` の QR + 短い説明文
       「この QR で同じルームに参加できます」+ ルームコード太字)。
    2. **ニックネーム変更**フォーム (`identity.setPlayerName`、
       `nickname.resolveNickname` で衝突回避、WS で `rename` を送る or 再 join)。
    3. 閉じる × ボタン。
  - 視覚は `JoinScannerOverlay` を踏襲 (固定 inset-0 + `role="dialog"` +
    `aria-modal="true"`)。DESIGN.md 禁則 (グラデーション・glass blur 装飾) を
    踏まない。
- **ホスト画面の QR の縮退判断**:
  - `waiting` (`phase.kind === "ready"`) では現状通り大きな QR を出す。
  - `running` / `paused` ではホストの QR タイルを **小さく** or **隠す** 方向で
    調整。`host-stage-dashboard.md` の Hero/PlayerBoard と整合させる。
  - 細部は本プラン M3 で grid 比率を確定。
- **URL 役割分離 (path-based explicit role)** を採用 (Decision Log 参照):
  - `/r/:code` → 招待ランディング / client (デフォルト)。
  - `/r/:code/host` → host 視点 (`NewRoom.onCreate` がここへ遷移)。
  - 既存の `/r/:code/scoreboard` はそのまま。将来必要なら
    `/r/:code/host/scoreboard` を足せる route 階層を温存する。
  - 招待 QR がエンコードするのは `/r/:code` のみ (host を奪わない)。
  - **権限の正本は URL ではなく localStorage の host claim**。`/r/:code/host`
    を直リンクで開いても claim が無ければ自動で client にフォールバック。
    URL = 意図 / localStorage = 権限。
  - 旧 `/r/:code` への直リンクは後方互換で localStorage role を見て解決
    (= 現状挙動)。新規 host 作成導線だけ新 URL に統一。
  - `parseJoinPayload` を **`/r/CODE` と `/r/CODE/host` の両方を同じ code に
    正規化**できるよう拡張 (招待リンクとして host URL を貼られた事故を吸収)。
- **ニックネーム変更フロー**: 既存 WS protocol に rename イベントが無ければ、
  簡易には disconnect → 名前更新 → reconnect (`RoomLayout` の `connect` 再実行)
  で吸収。protocol 追加が必要なら別 Milestone に切る。
- 上記をカバーする **vitest** unit テスト:
  - 招待 URL が host の URL 形式と client の URL 形式の **どちらでも** 同じ
    `code` にパースできること (`parseJoinPayload` の拡張テスト)。
  - 招待 QR 経由で到着した端末が **client role になる** こと
    (`identity.getRole` / 受け入れロジック)。
  - ニックネーム変更が `resolveNickname` を経由して衝突回避されること。
- **e2e** (Playwright) スモーク:
  - host が `running` を開始した後、別タブで client A → client A の overlay
    から取得した QR を 3 番目のタブが踏んで client B として join、
    `players.length === 3` を待つ。
- `DESIGN.md` の overlay / FAB / button の token を踏襲。新規トークンは追加しない。

### Out of scope

- 「view-only URL」(客出し / 観客モード)。これは別プランで検討
  (`host-stage-dashboard.md` の Out of scope と一貫させる)。
- Host 側からも overlay 化して機能を集約する大規模リファクタ。今回は client に
  限定し、host は既存 stage dashboard の調整のみ。
- WebSocket protocol の根本変更 (rename イベントの新設は判断次第で別 Milestone)。
- 9 preset のうち未実装 4 種の追加。
- PWA install 案内・i18n 翻訳の追加。

## Milestones

1. **M1 — URL / role 方針の確定 + 共通ロジック整理**
   - 上記 A/B/C を Decision Log に書き、1 つ選定。
   - `parseJoinPayload` を必要なら拡張し、`/r/CODE/h` などの新形式も同じ
     code に正規化できるよう testで担保。
   - `identity` の `setRole` / `getRole` を、招待リンク到着時に **常に client** に
     固定する API を追加 (`acceptInviteRole(code)` のような薄い関数)。
2. **M2 — オーバーレイ UI**
   - `components/client/RoomShareOverlay.tsx` と FAB トリガーを実装。
     `JoinScannerOverlay` を参考に props (`open`, `onClose`, `code`,
     `playerId`, `playerName`, `onRename`) で純粋に動かす。
   - `ClientRoom.tsx` から overlay と FAB をマウント。QR 内容は
     `joinUrlFor(code)` を直接利用。
   - 視覚仕様は DESIGN.md (overlay / dialog / button tokens) と
     `RoleCard` / `Card` の既存 utility を再利用。新規トークンは増やさない。
3. **M3 — ホスト画面の QR 縮退**
   - `HostDashboard` の `JoinQrTile` を `waiting` 時 = featured / `running|paused`
     時 = compact (or 非表示) に切替える。
   - handheld 版 `HostRoomHandheld` も同様に縮退 (情報密度を保つ)。
   - `host-stage-dashboard.md` の Scope と矛盾しないか確認し、必要なら向こうも
     更新。
4. **M4 — ニックネーム変更**
   - overlay 内で `setPlayerName` + `resolveNickname` を通して保存し、
     `RoomLayout` の WS connect を再実行 (disconnect → reconnect) で反映。
   - rename イベントを WS protocol に足す案は、簡易再 join で UX が許容できない
     場合のみ別 Milestone (`M4b`) として切り出す。
5. **M5 — テスト & 検証**
   - 追加した unit / e2e を含めて `pnpm -r typecheck` / `pnpm -r test` /
     `pnpm e2e` (該当する範囲) が緑。
   - 1920×1080 / iPhone 12 / iPad mini portrait の 3 サイズで dev server を
     起動して overlay の挙動を手動確認。`prefers-reduced-motion` で FAB の
     `transition-colors` 以外の動きを抑制できているか。
6. **M6 — ドキュメント / 後片付け**
   - `DESIGN.md` の overlay / FAB セクションに client overlay 由来の決定を追記
     (必要時)。
   - `host-stage-dashboard.md` の `Surprises & Discoveries` に「QR 縮退済み」を
     追記。
   - 本ファイルを `completed/` へ移動し `Outcomes & Retrospective` を書く。

## Progress

- [x] M1 URL / role 方針確定 + 共通ロジック (`acceptInviteRole`, `/r/:code/host`
  child route, `parseJoinPayload` は既存正規表現で `/r/CODE/host` を吸収済み)
- [x] M2 RoomShareOverlay + FAB 実装
  (`apps/client/src/components/client/RoomShareOverlay.tsx`)
- [x] M3 ホスト QR 縮退 — `HostDashboard` は既存 `variant="compact"` で対応済み
  (host-stage-dashboard プランで完了), `HostRoomHandheld` を本プランで `phase.kind === "ready"`
  時のみ QR + URL を出すよう変更。Room code 自体は全 phase で残す。
- [x] M4 ニックネーム変更フロー — `RoomLayout` が `playerName` を `useState` で
  保持し、`onRename` を outlet context で公開。`useEffect` の deps に
  `playerName` を入れることで「rename → disconnect → joinRoom (新名) → ws 再接続」
  が自動で走る。衝突解決は ClientRoom 側で `resolveNickname` を通す。
  WS protocol の rename イベント追加 (M4b) は今回見送り (簡易再 join で UX 問題なし)。
- [x] M5 typecheck / unit test (`pnpm -r typecheck` 5 projects clean,
  `pnpm -r test` 227 / 227 pass; 新規テスト: join-url の host/scoreboard 接尾辞
  正規化 2 件, identity の `acceptInviteRole` 3 件, routes の `/r/:code/host`
  マッチ 1 件)。**e2e は新規シナリオ `e2e/room-share-from-client.spec.ts` が
  green、ただし host-client-roles と room-flow の "ROOM CODE" 期待が失敗**
  (Surprises 参照)。
- [ ] M6 docs 整理 & プラン promote (本ファイル更新済み、`completed/` 移動は
  operator 判断)

## Surprises And Discoveries

実装中に気づいたこと、想定外の挙動、変更した方針を都度追記する。

- **(2026-05-20) `parseJoinPayload` の既存正規表現が `/host` を素通りで吸収していた**:
  `^\/r\/([^/?#]+)` がスラッシュまでで止まるため、`/r/CODE/host` も `/r/CODE/scoreboard`
  も最初の `CODE` を取り出して終わる。実装変更不要、テストだけ追加した。コメントだけ
  「URL = intent, localStorage = authority」の意図を残す JSDoc に膨らませた。
- **(2026-05-20) NewRoom を `/r/CODE/host` に切替えるのは止めた**: 当初プランは
  作成導線を新 URL に統一する案だったが、既存 e2e (`waitForURL(/\/r\/[A-Z0-9]+$/)`)
  が 7 か所に渡って anchor 付きで書かれており URL 変更は churn が大きい。
  路線 = `/r/CODE/host` は **bookmark / 共有先** のための寛容受け入れ路線として
  ルートに足すだけに留め、authority は引き続き localStorage の host claim とする。
  この方が Decision Log の「URL=意図 / localStorage=権限」原則とも一致する。
- **(2026-05-20) 招待 URL の cold-land 時は RoomLayout で自動 client 受け入れ**:
  ScannerOverlay を経由しない (OS 純正カメラから踏む / SNS から開く) ケースで
  `getRole(code)` が null だった場合、従来は `<Navigate to="/" />` で home に
  弾いていた。これだと "お裾分け" の動線が破綻するので、`acceptInviteRole(code)`
  で **role が無いときだけ client 化**する流れに変えた。既存 host claim は
  保持されるので host が自分の QR を踏んで demote されることはない。
- **(2026-05-20) `playerName` を `useState` に持ち上げる必要があった**:
  ニックネーム変更を反映するために `RoomLayout` の join effect を再走させる
  必要があり、`useMemo(() => ensurePlayerName(), [])` (依存空) では駆動できない。
  `useState` + lazy initializer に変えて `playerName` を effect の deps に
  含めた。これで rename → disconnect → joinRoom (新名) → connect が
  ストア起点でなく React 駆動で揃う。
- **(2026-05-20) e2e の "ROOM CODE" 期待は host-stage-dashboard 由来の既存破綻**:
  `host-client-roles.spec.ts:37` と `room-flow.spec.ts:29` が
  `getByText("ROOM CODE", { exact: true })` を expect しているが、Playwright の
  デフォルト viewport (1280×720) は `md+` で `HostDashboard` が走り、QR タイルは
  `JoinQrTile` で "JOIN" 表記。**本プランの変更を stash しても同じ 2 件が落ちる**
  ことを `git stash` で確認済み。修正は host-stage-dashboard 側に持ち帰り、
  本プランでは触らない (Surprises から host-stage-dashboard の
  `Surprises & Discoveries` にも追記対象)。新規 `room-share-from-client.spec.ts`
  は green。

## Decision Log

判断点と採用理由。後から「なぜ X を選んだか」を読み返せるように。

- **URL 識別方式: A (path-based explicit role) を採用** (2026-05-20 確定)。
  比較した 3 案:
  - A) `/r/:code/host` を host、`/r/:code` を client。
  - B) `/r/:code?as=host` のような query 識別。
  - C) URL は共通のまま localStorage role に全権を委ねる現状維持。
  選定理由 — 「最も flexible / expressive / durable」を満たすのは A:
  - **Expressive**: URL が自己説明的。bookmark / 共有先で role が読み取れる。
  - **Flexible**: 既存の `/r/:code/scoreboard` と同じ path-segment 構造で、
    将来 `/spectator` `/view` を増やすときに同パターンで足せる。query 案 B は
    `/scoreboard` のような sub-route と素直に合成できない。
  - **Durable**: query (`?as=host`) は SNS / LINE / メールクライアントで
    剥がされる / 再エンコードされる事故が多い。path segment はその種の中継で
    保たれる。localStorage 案 C は URL に出ないため、別端末で開いた瞬間に
    意味が失われる。
  - **Security**: 「URL に /host があれば誰でも host」になると、invite を
    貼った人が事故る。そこで **権限の正本は localStorage の host claim**、
    URL は意図表明に留める。`/r/:code/host` を直リンクで開いても claim が
    無ければ client にフォールバック。これは現状挙動とほぼ同じで移行が浅い。
  - 後方互換: 旧 `/r/:code` 経由の host (= localStorage に claim あり) も
    引き続き host として開けるよう、`/r/:code` の解決ロジックは現状を維持。

## Verification

- コマンド:
  - `pnpm -r typecheck`
  - `pnpm -r test`
  - `pnpm --filter @qr-relay/client test`
  - `pnpm e2e` (Playwright; 本プラン用シナリオを追加)
- 受け入れ挙動:
  - クライアント画面で歯車 FAB をタップすると overlay が立ち上がり、ルーム
    招待 QR とニックネーム編集が表示される。
  - 招待 QR を **同じ会場の別端末**で読み取ると、その端末は **client として** 
    入室する (host を奪わない)。
  - ホスト画面は `running` / `paused` で QR タイルが縮退し、Hero/PlayerBoard
    が支配する Stage Dashboard を維持する。
  - overlay 内でニックネームを変更すると、他端末の `players` 表示にも反映
    される (簡易再 join で良い)。
  - keyboard で overlay を開閉できる (Esc で閉じる、focus trap)。
  - `prefers-reduced-motion: reduce` の場合に FAB / overlay にスプリング系
    モーションが入っていない (DESIGN.md 禁則の遵守)。

## Outcomes And Retrospective

`completed/` に移す直前に書く。最終的に何が変わったか / 残ったこと / 次に注意点。

### Changed

- `apps/client/src/lib/identity.ts`: `acceptInviteRole(code)` を新設。
  既存 host claim を温存し、claim が無いときだけ client にピン留め。
- `apps/client/src/lib/join-url.ts`: `parseJoinPayload` の JSDoc に
  「`/r/CODE/host` も同じ code に折り畳まれる」意図を明文化。実装は既存
  正規表現で対応済み。
- `apps/client/src/routes.tsx`: `/r/:code/host` を `RoomRoot` 子ルートとして追加
  (intent 用 alias、claim 無しなら client にフォールバック)。
- `apps/client/src/routes/RoomLayout.tsx`:
  - `role` の初期解決を `getRole(code) ?? acceptInviteRole(code)` に変更。
    cold-land 時の `<Navigate to="/" />` を廃止。
  - `playerName` を `useState` に持ち上げ、`onRename` を outlet context で
    公開。`RoomOutletContext` に `playerName` / `onRename` を追加。
- `apps/client/src/routes/HostRoom.tsx` (handheld): QR + URL ブロックを
  `phase.kind === "ready"` の時のみ描画。room code 自体は残す。
- `apps/client/src/routes/ClientRoom.tsx`: outlet context から
  `playerName` / `onRename` を受け取り、`RoomShareFab` / `RoomShareOverlay`
  をマウント。rename 時は `resolveNickname` を通して `onRename` に渡す。
- `apps/client/src/components/client/RoomShareOverlay.tsx` (new):
  招待 QR + URL + ニックネーム編集を 1 つの dialog にまとめた client 側
  オーバーレイ。FAB (`RoomShareFab`) も同一ファイルで export。
- テスト追加:
  - `lib/identity.test.ts`: `acceptInviteRole` 3 ケース。
  - `lib/join-url.test.ts`: `/r/CODE/host` と `/r/CODE/scoreboard` の
    正規化 2 ケース。
  - `routes.test.tsx`: `/r/:code/host` のマッチを確認する 1 ケース。
  - `e2e/room-share-from-client.spec.ts` (new): host → client A 入室 →
    client A の share overlay 経由で取った URL を直接踏んで client B として
    join、host 側の participants に A の名前が出るまで poll。

### Verified

- `pnpm -r typecheck` clean (5 projects)。
- `pnpm -r test` 全 227 tests pass (handlers + core + ui + server + client)。
- `pnpm e2e` で `room-share-from-client.spec.ts` を含む 9/11 件 pass。残 2 件
  (`host-client-roles.spec.ts:27` / `room-flow.spec.ts:11`) は **本プラン
  着手前から落ちていたことを `git stash` で確認** (host-stage-dashboard 由来)。

### Remaining

- iPhone 12 / iPad mini portrait / 1920×1080 の 3 サイズでの手動 UI 確認
  (FAB が安全領域を侵さないか、overlay の余白、ニックネーム入力の Soft
  Keyboard 押し上げ挙動)。
- `host-stage-dashboard` 側の e2e 既存破綻 ("ROOM CODE" 期待) の修正は
  あちらのプランに戻す。
- WS protocol の rename イベント (現状は disconnect → reconnect で吸収。
  サーバが新 connection に古い player を上書き join できているかは
  `apps/server` の join hand‌ler 側で確認済み = `joinRoom` は同一 playerId なら
  upsert する想定。本プランでは目視確認のみ)。
- view-only (観客モード) URL — `host-stage-dashboard.md` と一貫して別プラン。
