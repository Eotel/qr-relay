# Plan: Engine 簡素化 — status 廃止 / end 撤去 / フェーズ状態機械導入

Owner: miura
Status: Completed
Created: 2026-05-20
Completed: 2026-05-20

## Goal

Relay engine から「ラベル付き status」「内蔵終了条件」を取り除き、ゲームの開始 / 一時停止 /
再開 / リセットを `ready` / `running` / `paused` の 3 フェーズ状態機械に置き換える。
プレイヤー視点では:

- ホスト画面に **加算ストップウォッチ** + `ready` / (`start` ⇄ `pause`) の最小ボタンが出る
- `paused` 中は誰がスキャンしても弾かれる (server 側で gating)
- プリセットは 9 → 5 に削減 (バトン / 感染 / 奪い合い / コレクション / あいさつ)

設計判断は [`docs/adr/0001`](../../adr/0001-drop-status-value-kind.md),
[`0002`](../../adr/0002-move-end-conditions-out-of-engine.md),
[`0003`](../../adr/0003-game-phase-state-machine.md) に分解済み。本プランは実装手順。

## Context

- 現在のコード: `packages/handlers/src/relay-rule.ts`, `relay.ts`, `presets.ts`,
  `apps/server/src/room-domain.ts`, `room.ts`, `apps/client/src/lib/ws-store.ts`,
  `routes/HostRoom.tsx` / `ClientRoom.tsx`
- 完了済みの基盤: hexagonal port 化 (`Clock` / `Rng` 注入)、host / client ロール分離
  (host は scan 不可、host は players[] に入らない)、nonce / ts 検証
- 関連 docs:
  - [`docs/design-docs/scan-handler-contract.md`](../../design-docs/scan-handler-contract.md)
    (改訂が必要)
  - [`docs/design-docs/core-beliefs.md`](../../design-docs/core-beliefs.md) (§1 は補強)
  - [`docs/product-specs/presets.md`](../../product-specs/presets.md) (9 → 5 に書き直し)
  - [`docs/exec-plans/tech-debt-tracker.md`](../tech-debt-tracker.md) (Architecture
    Decision Records 周りの記述を更新)
- 関連プラン:
  - [`docs/exec-plans/completed/2026-05-19-initial-mvp.md`](../completed/2026-05-19-initial-mvp.md)
    (今回触る範囲の元設計)
  - [`docs/exec-plans/active/2026-05-20-room-inactivity-timer.md`](2026-05-20-room-inactivity-timer.md)
    — 並行進行中。本プランで導入する `reset` / `pause` / `resume` WS msg を「活動シグナル」
    として扱う想定が既に書かれているので、後勝ちで衝突しないよう WS schema 変更点を共有する

## Scope

In scope:

- `packages/handlers/src/relay-rule.ts` から `status` / `swap` / `set-status` /
  `sourceStatus` / `sinkStatus` / `end` / `requireSourceHas: string` を削除
- `relay.ts` の `applyChange` / `slotHasStatus` / `isOver` を縮小
- `presets.ts` を 5 プリセットに削減 (`baton` / `infection` / `steal` / `collection` /
  `greeting`)
- `apps/server/src/room-domain.ts` の `RoomMeta` を `phase: Phase` に置換
- `reduceStart` / `reduceEnd` を `reduceStart` / `reducePause` / `reduceResume` /
  `reduceReset` に作り直し
- `reduceScan` 冒頭で `phase.kind !== "running"` を弾く
- WS message に `pause` / `resume` / `reset` を追加 (`packages/core/src/schemas.ts`)
- `apps/client/src/lib/ws-store.ts` で phase を保持、`displayMs` ヘルパ追加
- `HostRoom.tsx` にストップウォッチ + 制御ボタンを追加
- 関連テスト (`relay.test.ts` / `room-domain.test.ts` / `ws-store.test.ts` /
  e2e `host-client-roles.spec.ts`) を更新
- docs: `presets.md` / `scan-handler-contract.md` / `README.md` 更新

Out of scope:

- 複数ホスト対応 (`hostId` 単一の前提を維持)
- 永続化形式の migration (MVP デプロイ前なので既存ルーム state は壊して良い)
- HMAC 署名の追加 / 機能拡張
- 「ラベル付き token」の view 層対応 (将来やる場合は別 ADR)
- 上級者向け ScanRule 編集 UI (tech-debt-tracker 既存タスクのまま据置)

## Milestones

1. **engine + プリセットの縮小** (`packages/handlers` + `packages/core` の関連 schema)
2. **server: phase 状態機械の reducer 化** (`room-domain.ts` + ユニットテスト)
3. **server: WS 配線 + scan gating** (`room.ts`)
4. **client: phase 反映 + ホスト UI** (`ws-store.ts` + `HostRoom.tsx`)
5. **docs 整備** (`adr/` リンク、`product-specs/presets.md` 書き直し、`README.md`)
6. **e2e** で host 操作経路を確認

## Progress

### Milestone 1: engine + プリセットの縮小

- [x] `packages/handlers/src/relay-rule.ts`: `ValueSlot.status` を削除、`value` を
      `token` / `score` の 2 union に縮小、`onScan.source/sink` から `set-status` を削除、
      `onScan.swap` / `sourceStatus` / `sinkStatus` を削除、`constraints.requireSourceHas`
      / `requireSinkLacks` を `boolean` のみに縮小、`end` を削除
- [x] `packages/handlers/src/relay.ts`: `applyChange` の status 分岐 / `swap` 分岐削除、
      `slotHasStatus` の `boolean` 専用化、`isOver` を interface から外し engine から経過
      時間 metric も削除
- [x] `packages/handlers/src/presets.ts`: `tag` / `infection` (旧) / `oni-swap` /
      `hot-potato` / `quota` を削除。`infection` を `token` ベースで再定義。残りは 5 件
      (baton / infection / steal / collection / greeting)
- [x] `packages/handlers/src/relay.test.ts` + `relay-extras.test.ts`: status 系 / end 系
      テストケース削除、`infection` を token 用に書き直し
- [x] `packages/core/src/schemas.ts`: WS message union に `pause` / `resume` / `reset` を
      追加、`end` を削除
- [x] `pnpm --filter @qr-relay/handlers test` / `pnpm --filter @qr-relay/core test` 緑

### Milestone 2: server reducer

- [x] `apps/server/src/room-domain.ts`: `RoomMeta` から `startedAt` / `endedAt` を消し、
      `phase: Phase` フィールドを追加。`Phase` discriminated union は
      `packages/core/src/types.ts` に移して共有
- [x] `reduceInit` で `phase: { kind: "ready" }` を初期化
- [x] `reduceStart`: `ready` → `running` のみ許可、`PhaseResult` で error を返す
- [x] `reducePause`: `running` → `paused`、`accumulatedMs += now - startedAt`
- [x] `reduceResume`: `paused` → `running`、新しい `startedAt = now`、`accumulatedMs` 維持
- [x] `reduceReset`: 任意 phase → `ready`、`state` を `handler.initialState` で作り直し
      (players はそのまま維持)
- [x] `reduceScan`: 冒頭で `phase.kind !== "running"` を弾く
- [x] `apps/server/src/room-domain.test.ts`: phase 遷移と scan gating を 30 ケースで覆う

### Milestone 3: server WS 配線

- [x] `apps/server/src/room.ts`: WS / REST 双方で `start` / `pause` / `resume` / `reset`
      を扱う `applyPhase` を導入。WS 経路は `hostId` チェックで host 以外を弾く
- [x] `phaseReducers` テーブルで 4 アクションを共通化、`state` broadcast に `phase` を含める
- [x] scan エラーは `{ t: "error", message: "game is not running" }`
- [x] `apps/server/src/index.ts`: `/start` / `/pause` / `/resume` / `/reset` REST を for
      ループで一括登録
- [x] `room-domain.test.ts` で reducer をカバー、WS smoke は手動 (e2e で UI 経路は緑)

### Milestone 4: client

- [x] `apps/client/src/lib/ws-store.ts`: state に `phase: Phase` を保持、`displayMs(phase, now)`
      を export。`pause` / `resume` / `reset` は `api.ts` 経由で REST 送信
- [x] `apps/client/src/lib/api-client.ts` / `api.ts`: `pauseRoom` / `resumeRoom` を追加、
      `RoomInfo` を `phase: Phase` に書き換え
- [x] `apps/client/src/routes/HostRoom.tsx`: ストップウォッチ表示 (`setInterval(250ms)`)、
      ready / running / paused に応じて start⇄pause⇄resume を切り替える主ボタン、
      確認付き reset
- [x] `apps/client/src/routes/ClientRoom.tsx`: `phase.kind !== "running"` 中はスキャン
      ペイロードを送らず、カメラの上に「一時停止中」/「開始待ち」オーバーレイを出す
- [x] `MetricsPanel` は handler が time metric を出さなくなった分だけ無変更で対応
- [x] `apps/client/src/lib/ws-store.test.ts` / `routes/HostRoom.test.tsx` 更新

### Milestone 5: docs

- [x] `docs/adr/README.md` + 各 ADR ヘッダを `proposed` → `accepted` に書き換え
- [x] `docs/product-specs/presets.md`: 9 → 5 プリセット、旧プリセットを運用例へ統合
- [x] `docs/design-docs/scan-handler-contract.md`: 4 軸表、phase / 手動 reset の節を追加
- [x] `docs/design-docs/core-beliefs.md`: §1 と §2 を新方針に合わせ書き直し
- [x] `README.md` を 5 プリセット + 軸表 + phase 機械の言及で更新
- [x] `ARCHITECTURE.md`: パッケージ表のプリセット数 / phase に関する補足
- [x] `docs/exec-plans/tech-debt-tracker.md`: 解消済み欄に本プランを記録

### Milestone 6: e2e

- [x] `e2e/host-client-roles.spec.ts` に「Host のスタート→一時停止→再開→リセットで
      フェーズ表示が切り替わる」テストを追加。実カメラを介した scan reject は QR デコード
      経路の e2e 化 (tech-debt-tracker の既知負債) と合わせて後追い
- [x] `pnpm -r typecheck` / `pnpm -r test` (177 件) / `pnpm -w lint` / `pnpm e2e`
      (10 件) すべて緑

## Surprises And Discoveries

- engine から time metric を完全に削るのが筋だったので、`metrics({state, config, players})`
  から `now` 依存を引き剥がし、`relay-extras.test.ts` の time 系ケースは削除した。
  `Metric` 型自体は `time` バリアントを残してあるので、将来別 handler が時間 metric を
  出したくなったときに復活できる。
- `RoomInfo` (client) と `RoomMeta` (server) で別々に持っていたフィールド集合が、`Phase`
  追加で食い違いやすくなる。両方が `Phase` を import できるよう `packages/core/src/types.ts`
  に `Phase` を置いた。
- `.impeccable/` ディレクトリ (frontend-design skill のローカル成果物) が biome の lint
  対象に入ってしまっていた。`biome.json` の `files.ignore` に追加して切り離した。

## Decision Log

- 2026-05-20: status / end / timer を engine から削る方針を採用 (ADR-0001 / ADR-0002)
- 2026-05-20: tick 同期は host-local とし、server tick は導入しない (ADR-0003,
  Alternative 1 却下)
- 2026-05-20: 終了条件はすべて host 操作 (`reset`) に集約、`{ t: "end" }` は削除

## Verification

コマンド:

```bash
pnpm -r typecheck
pnpm -r test
pnpm -w lint
pnpm test:e2e          # Playwright (E2E)
pnpm dev:server        # 別ターミナルで起動
pnpm dev:client        # WS smoke 手動 (host start / pause / resume / reset)
```

受け入れ挙動:

- 5 プリセット (`baton` / `infection` / `steal` / `collection` / `greeting`) が `/new` から
  選べる
- ホスト画面に加算ストップウォッチが出る (`ready` で 0 表示、`start` で進む、`pause` で
  止まる、`resume` で続きから進む、`reset` で 0 に戻る)
- `paused` 中はクライアントが scan しても WS error が返り state が動かない
- `reset` 後はプレイヤー一覧は維持され、各プレイヤーのスコア / 保持フラグは初期値に戻る
- DO storage が phase を含む新形式で永続化される (デプロイ前なので migration 無視)

## Outcomes And Retrospective

### 変わったもの

- engine (`packages/handlers`) は `value: token | score` の 4 軸構成になり、phase / 時間 /
  終了条件を一切持たない。`ScanRule` の `end` フィールドと `swap` / `set-status` /
  status まわりは型ごと消えた。`isOver` も `ScanHandler` interface から外した。
- phase 状態機械は `apps/server/src/room-domain.ts` に `reduceStart` / `reducePause` /
  `reduceResume` / `reduceReset` として実装。WS / REST 双方が `applyPhase` を経由する。
- `Phase` を `packages/core/src/types.ts` に置いて server と client が共有。client は
  `displayMs(phase, now)` で stopwatch をローカル描画する (server tick なし)。
- HostRoom はストップウォッチを常時表示し、主ボタンが ready/running/paused で
  start⇄pause⇄resume に切り替わる。ClientRoom はカメラ枠に「開始待ち」/「一時停止中」
  オーバーレイを出し、スキャン送信もブロックする。
- プリセットは 9 → 5 (`baton` / `infection` / `steal` / `collection` / `greeting`)。

### 残り / フォローアップ

- e2e で「実 QR のスキャンが paused 中に reject される」までは詰めていない (カメラ
  経由でなく WS を直接叩く decode-path テストが必要。tech-debt-tracker の既知負債)。
- room-inactivity-timer プラン ([2026-05-20-room-inactivity-timer.md](2026-05-20-room-inactivity-timer.md))
  が WS の `keepalive` 追加と `lastActivityAt` 永続化を計画している。本プランで導入した
  `pause` / `resume` / `reset` は「活動シグナル」として touchActivity に合流させる前提。
- `RoomMeta` の永続化形式が変わったので、既存ルームの DO storage は壊して良い (デプロイ前)。
  本番デプロイ後にこの種の変更を入れる場合は migration ADR を別途切る。

### 検証

- `pnpm -r typecheck`: pass
- `pnpm -r test`: 177 件 pass (core 22, ui 10, handlers 29, server 37, client 79)
- `pnpm -w lint`: clean
- `pnpm e2e`: 10/10 pass (新規追加のフェーズ遷移テストを含む)
