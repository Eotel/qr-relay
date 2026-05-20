# Core Beliefs

Last reviewed: 2026-05-20

QR Relay の設計判断のうち、再現したい/再侵食したくない 4 つの原則。各原則は
**Why** (背景) / **How to apply** (実務での適用) / **Enforcement** (どこで検証されているか)
の 3 点セットで記述する。Enforcement が無いものは判断ベース (judgment call) であることを
明示する。

---

## 1. 統合エンジン + プリセット (vs 別個 handler)

**原則**: 遊び方の variation は別個の `ScanHandler` 実装ではなく、1 つの `relayHandler` に
`ScanRule` config を渡したプリセットとして表現する。

**Why**: 「スキャンしたとき相手から消えるか / 残るか」「持点を奪うか / 増やすか」のような
直交する option は、別個の handler に分けると指数的に組合せが増え、似たコードが重複する。
1 つのエンジンに集約することで、新しい遊び方の追加コストが「`presets.ts` に entry 1 行 +
テスト 1 ケース」まで下がる。

**How to apply**:
- 新しい遊び方は **まずプリセット追加で試す**。
  [scan-handler-contract.md](scan-handler-contract.md) の「新プリセット追加 5 ステップ」。
- `ScanRule` が表現する 4 軸 (`value` / `initial` / `onScan` / `constraints`) を伸ばす
  方が、新 handler を作るより常に優先。
- relay で表現できない novel ロジック (例: 任意 payload の蓄積、複雑な経路解析) に限り
  別 handler を実装する。

**Enforcement**:
- `packages/handlers/src/relay.test.ts` が 5 プリセット全ての initial / scan / metrics
  を覆っている。新プリセットを足したら必ずテストも足す。
- `pnpm --filter @qr-relay/handlers test` で確認。

---

## 2. handler は server / client 両方で動く pure function

**原則**: `ScanHandler` の `initialState` / `payloadFor` / `onScan` / `metrics`
は副作用なしの pure function として実装する。handler は phase / 終了条件などゲーム
制御層の概念を持たず、server と client は同一の handler を import する。

**Why**:
- server は authoritative な state の保管役、client は state を再評価して UI に
  反映する役。両者が同じ関数を呼ぶことで、UI の見え方と server の判断が必ず一致する。
- pure function なら handler 単体のユニットテストだけで遊び方の正しさを担保できる
  (state 遷移を網羅すれば良い)。

**How to apply**:
- handler 実装で `fetch` / `console` / `Date.now()` などを直接呼ばない。時刻は引数
  `now` で受け取る。
- グローバル変数を作らない。state は引数で受け取り、新しい state を返す
  (immutable パターン)。
- 「ゲームが始まっているか」「終了したか」「経過時間」は handler の責務外。これらは
  `apps/server/src/room-domain.ts` の phase 状態機械が握る
  ([ADR-0003](../adr/0003-game-phase-state-machine.md))。
- server の `RoomDurableObject` は handler を呼んだ結果の state を保存・broadcast
  するだけ。判断ロジックは持たない。

**Enforcement**:
- 型: `ScanHandler.onScan` が `now: number` を引数で受け取る (
  `packages/core/src/handler.ts`)。
- ユニットテストが server を起動せずに pure function として handler を呼べている事実
  (`relay.test.ts`) が証拠。
- 判断ロジックを `apps/server/src/room.ts` 内で実装してはいけない、というのは
  **判断ベース**。コードレビューで弾く。

---

## 3. Durable Object は room の単一権威

**原則**: ルーム単位の state は対応する `RoomDurableObject` インスタンスだけが持ち、
更新する。WebSocket 接続も DO がアクセプトする。

**Why**:
- DO は単一スレッド保証なので、複数同時 scan の race を考えなくて良い。
- DO storage が persist 層なので、外部 DB を持たずに room state を保てる。
- DO の Hibernation API (`state.acceptWebSocket`) を使えば、idle 時間中の接続コストを
  抑えられる。

**How to apply**:
- room ごとの state は `apps/server/src/room.ts` の DO storage に置く。client の
  Zustand store は server からの broadcast を反映するだけのキャッシュ。
- 新しい state 種別を増やしたいときは DO の `saveStored` / `loadStored` 経由で
  permeate する。
- `idFromName(\`room:${code}\`)` で同じ code → 同じ DO に確実にルーティングする。

**Enforcement**:
- wrangler dev (Miniflare) で WS 2 本貼って scan → 両方に state push が来ることの
  手動 smoke (旧プラン実装時に確認済み)。再現スクリプトは
  [scan-handler-contract.md の付録](scan-handler-contract.md#付録-wrangler-dev-での-smoke-test)。

---

## 4. QR ペイロードの完全性

**原則**: QR に載せる ScanPayload は `v / rid / pid / ts / nonce` を必ず含み、server は
nonce 重複と ts ウィンドウで replay を弾く。

**Why**:
- QR は画面録画 / スクショで簡単に複製できる。同じ QR が複数回処理されると「奪い合い」
  での無限稼ぎや「鬼ごっこ」での古い鬼の押し付けが起きる。
- HMAC 署名まで踏み込まなくても、nonce + ts ウィンドウだけで実害のあるリプレイは概ね
  防げる (MVP の現実的なバランス)。

**How to apply**:
- client は QR を表示するたびに新しい `nonce` を生成し、`ts: Date.now()` を入れる。
- server は同じ nonce を 5 分以内に再受信したら拒否、`ts` が server now ± 60s を
  外れたら拒否。
- 将来 HMAC 署名 (`sig`) を入れるときは `packages/core/src/schemas.ts` の
  `ScanPayloadV1` を拡張する。スキーマだけ先に optional で用意済み。

**Enforcement**:
- `apps/server/src/room.ts` の `applyScan` 内の nonce / ts チェック。
- ユニットテストではなく、WS smoke で「同じ nonce を 2 回送ったら `error: duplicate nonce`」
  が返ることを確認 (旧プラン実装時に確認済み)。再現手順は同じく
  [scan-handler-contract.md の付録](scan-handler-contract.md#付録-wrangler-dev-での-smoke-test)。

---

## まとめ表

| 原則 | 主な検証経路 | 経路の所在 |
|---|---|---|
| 統合エンジン + プリセット | vitest 19 ケース | `packages/handlers/src/relay.test.ts` |
| pure function handler | 型 + ユニットテスト + 判断ベース | `packages/core/src/handler.ts`, レビュー |
| DO 単一権威 | wrangler dev WS smoke | `apps/server/src/room.ts`, 手動 |
| QR 完全性 (replay 防止) | wrangler dev WS smoke | `apps/server/src/room.ts`, 手動 |

判断ベースの項目 (pure function を守る、DO 外でロジックを持たない、等) は今のところ
レビューで担保している。将来 ast-grep ルール化するのは
[../exec-plans/tech-debt-tracker.md](../exec-plans/tech-debt-tracker.md) に置く。
