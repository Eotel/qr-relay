# Architecture

QR Relay は pnpm workspaces の monorepo。サーバーとクライアントの両方が同じ
`ScanHandler` 実装を import して、handler の pure function を共有する。

## パッケージ境界

| パッケージ | 役割 | 主要ファイル |
|---|---|---|
| `packages/core` | 共通型 / Zod schema / `ScanHandler` interface / レジストリ | `src/types.ts`, `src/schemas.ts`, `src/handler.ts`, `src/registry.ts` |
| `packages/handlers` | 統合 relay エンジン + 5 プリセット (data) | `src/relay-rule.ts`, `src/relay.ts`, `src/presets.ts` |
| `apps/server` | Hono + Cloudflare Workers + Room Durable Object + WebSocket | `src/index.ts`, `src/room.ts` (I/O adapter), `src/room-domain.ts` (pure reducer), `src/ports.ts` (`Clock`) |
| `apps/client` | Vite + React PWA, qrcode 表示 / qr-scanner 読取 | `src/main.tsx`, `src/routes/*.tsx`, `src/components/*.tsx`, `src/lib/*.ts` (`api-client.ts`, `ws-store.ts`, `clock.ts`, `rng.ts`), `src/hooks/*.ts` |

依存方向:

```
apps/server ─┐         ┌─ packages/handlers ─┐
             ├──────── ┤                     ├── packages/core
apps/client ─┘         └─ packages/handlers ─┘
```

`apps/*` は `packages/handlers` 経由で `packages/core` を間接利用。
循環は無い。

## データフロー (scan 1 回)

```
[Player A 画面]                              [Player B 画面]
  QrDisplay (自分の payload)                  QrScanner (camera)
      │                                          │
      │ B のカメラに映る                          │
      └──────────────────────────────────────────┘
                          ▼
                   QR decode → JSON
                          ▼
                   ScanPayloadV1 (Zod 検証)
                          ▼
                   WS send { t: "scan", payload }
                          ▼
            ┌─────────────────────────────────┐
            │      Room Durable Object        │
            │  1. nonce / ts 検証              │
            │  2. requireHandler("relay")     │
            │  3. handler.onScan(...)         │
            │  4. storage に persist          │
            │  5. broadcast state + metrics   │
            └─────────────────────────────────┘
                          ▼
            両端末の useWs store が state を更新
                          ▼
            Host: HostDashboard (md+) が現在の view mode に応じて
                  tile を再描画 (Hero / Rankings / TokenPath /
                  Infection / Participants)。view 切替は CSS のみ。
            Client: handheld スコア tab (/scoreboard) の
                    MetricsPanel が再レンダリング、QrDisplay の
                    payload も refresh
```

## ScanHandler 抽象

中核は `packages/core/src/handler.ts` の `ScanHandler<TConfig, TState, TData>` interface。

- **同じ実装を server と client が import** する。server は authoritative、client は
  受け取った state を再評価するだけ。
- 現状 `relayHandler` (`packages/handlers/src/relay.ts`) ひとつのみ登録済。5 プリセットは
  `ScanRule` config (data) として表現される (`token` / `score` の 2 軸、`status` は廃止)。
- 時間軸 (開始 / 一時停止 / リセット) は handler の責務ではなく、Durable Object の
  phase 状態機械が握る ([docs/adr/0003](docs/adr/0003-game-phase-state-machine.md))。
- 新しい遊び方を足したいときの第一選択は **プリセット追加**、relay で表現できない場合に
  限り別 handler を実装する。詳細:
  [docs/design-docs/scan-handler-contract.md](docs/design-docs/scan-handler-contract.md)

## テスト境界 (hexagonal)

副作用を port 経由で注入することで、ドメイン層を単体テストできる。

```
                ┌─────────────── adapters (I/O) ──────────────┐
                │                                              │
  HTTP req ──▶  apps/server/src/index.ts (Hono routes)         │
                │      │                                       │
                │      ▼                                       │
                │  apps/server/src/room.ts                     │
                │  (DurableObject: storage I/O, broadcast,     │
                │   WS pair, getTags)                          │
                │      │ Clock.now() / 入力                    │
                │      ▼                                       │
                │  apps/server/src/room-domain.ts              │  ◀── pure domain
                │  reduceInit / reduceJoin / reduceStart /     │      (vitest で
                │  reduceScan / gcNonces / computeMetrics      │       直接呼べる)
                │                                              │
                └──────────────────────────────────────────────┘

  Client side:
    routes/*.tsx (view) ──▶ lib/api-client.ts (FetchLike DI)
                       ──▶ lib/ws-store.ts   (socketFactory + Clock DI)
                       ──▶ hooks/useQrCode.ts  (QrGenerator DI)
                       ──▶ hooks/useQrScanner.ts (ScannerFactory DI)
```

- `Date.now()` の直呼びは `apps/server/src/ports.ts` と
  `apps/client/src/lib/clock.ts` の `systemClock` 内側だけに閉じている。
- `room-domain.ts` の reducer は全て immutable な `Stored → Stored`。
  recentNonces も `Map → Map` を返し、呼び出し側が差し替える。

## ランタイム前提

- **Server**: Cloudflare Workers + Durable Objects (SQLite migration `v1` で
  `RoomDurableObject` を新規 class として登録)。WebSocket は DO の Hibernation API
  (`state.acceptWebSocket`) を利用。
- **Client**: PWA (`vite-plugin-pwa`)。実機テストは HTTPS 必須 (カメラ API のため)。
- **共通**: TypeScript strict、Zod による境界検証、vitest。

## Architecture Decision Records

長期原則は [docs/design-docs/core-beliefs.md](docs/design-docs/core-beliefs.md)、
個別の判断証跡は [docs/adr/](docs/adr/README.md) (Michael Nygard 流)。MVP 構築時の
判断は [docs/exec-plans/completed/2026-05-19-initial-mvp.md](docs/exec-plans/completed/2026-05-19-initial-mvp.md)
も併せて参照。

## 生成物 / 外部リファレンス

- `docs/generated/` — 今は不要 (OpenAPI 等の生成物が無い)
- `docs/references/` — 今は不要 (外部ドキュメントは Context7 MCP で都度引く)
