# Tech Debt Tracker

Last reviewed: 2026-05-19

「いつかやる」レベルの負債を集約。優先度をつけて時々レビューする。

## 既知の負債

### 検証 / 品質

- [ ] **実機 (iOS Safari) でのカメラ起動テストが未実施**
  - 現状: PC ブラウザ + Miniflare で動作確認のみ。`playsinline` / HTTPS 経由の挙動が
    実機で要確認。
  - 対処案: `vite dev --host` + `cloudflared tunnel` で社内検証、または Cloudflare
    Pages にデプロイして検証。

- [ ] **E2E テスト自動化なし**
  - 現状: handler は pure function なので vitest で十分カバーできているが、QR display
    → camera scan → WS scan → broadcast の経路は手動 smoke のみ。
  - 対処案: Playwright で multi-context (2 ブラウザ) を立て、generated QR 画像を直接
    decode する方式。カメラのモックは現実的でないので decode 経路を直接叩く。

### 型 / コード品質

- [ ] **registry 内の `unknown` キャスト**
  - 現状: `packages/core/src/registry.ts` で `ScanHandler<unknown, unknown, unknown>` に
    キャストしている。型推論が handler 取り出し時に消える。
  - 影響: 利用側で as 文が必要になる場合がある。今のところ `relayHandler` を直接 import
    することで回避できているので緊急性は低い。

- [ ] **`qr-scanner` の TypeScript types**
  - 現状: 動作 OK だが、`@types/qr-scanner` を別途用意するかどうかを将来確認。
  - 影響: なし (現状動いている)。

### Architecture / 機能

- [ ] **`/new` で ScanRule の上級者編集 UI が未実装**
  - 現状: プリセット選択のみ。初期点数や `end` を調整したくても UI から触れない。
  - 対処案: `configSchema` を Zod → JSON Schema 化し、`react-jsonschema-form` 的な
    汎用フォームで描画。

- [ ] **carrier handler (画像 / トークン転送) が未実装**
  - 現状: README と旧プランで議論したが MVP には入っていない。
  - 対処案: 別 `ScanHandler` として実装。実体は DO storage、QR には `tokenRef` のみ。
    [../design-docs/scan-handler-contract.md](../design-docs/scan-handler-contract.md) の
    「relay で表現できないとき」セクション参照。

- [ ] **HMAC 署名 (`sig` フィールド)**
  - 現状: `ScanPayloadV1.sig` は optional として用意済み、検証は未実装。
  - 対処案: 必要になったら server 側で room ごとに secret を発行し、client が
    QR 生成時に署名。nonce + ts だけで実害は十分防げているので優先度低。

### 運用

- [ ] **デプロイパイプラインなし**
  - 現状: wrangler dev のみ。`wrangler deploy` と Cloudflare Pages 設定は未着手。
  - 対処案: GitHub Actions + `cloudflare/wrangler-action`。

- [ ] **wrangler v3 → v4 アップグレード**
  - 現状: v3.114.17 を使用 (起動時に v4 推奨の警告が出る)。
  - 対処案: v4 への移行手順を確認、breaking change チェック。

### 判断ベース原則の機械化

- [ ] **handler 内で `Date.now()` / `Math.random()` を直接呼ばないルール**
  - 現状:
    [../design-docs/core-beliefs.md §2](../design-docs/core-beliefs.md#2-handler-は-server--client-両方で動く-pure-function)
    の判断ベース原則。
  - 対処案: ast-grep ルールで `packages/handlers/**/*.ts` 内の `Date.now()` /
    `Math.random()` 呼び出しを検出するルール追加。

---

## 解消したもの

(まだなし)
