# Plan: トークン保持者の画面背景を変える

Owner: miura
Status: In Progress
Created: 2026-05-20

## Goal

`token` 値スロットを保持しているプレイヤー (バトン保持者 / 感染者 など) の client
画面背景を、保持中だけはっきり違う色に変える。スコアバッジを見に行かなくても「いま
自分が IT である」が体育館の照度下で一瞬で分かる、をプレイヤー視認性の主目的にする。

## Context

- 関連コード:
  - `packages/handlers/src/relay-rule.ts:48` (`ValueSlot = { kind: "token"; has } | …`)
  - `packages/handlers/src/relay.ts:189` (`label: "保持中"` の `count` metric — `byPlayer[id] === 1` が token 保有者)
  - `apps/client/src/lib/ws-store.ts:23` (`state: unknown` / `metrics: Metric[]` を保持)
  - `apps/client/src/routes/ClientRoom.tsx` (プレイヤー画面)
  - `apps/client/src/routes/RoomLayout.tsx:71` (`<main>` ラッパ、`role === "host"` で `dark` register)
  - `packages/ui/src/styles.css` (`--background` / `--primary` 等のトークン定義)
- 関連 docs:
  - `PRODUCT.md` (Design Principles §1 time-to-play, §5 mobile-real, Accessibility §コントラスト)
  - `docs/product-specs/presets.md` (token を使う preset: バトン / 感染)
  - `docs/design-docs/core-beliefs.md`
- 関連プラン: なし (新規)

## Scope

In scope:

- client role (`/r/:code` プレイヤー画面) で、自分が token を保持している間だけ
  背景色を切り替える。
- token 値スロットを使う preset (バトン / 感染) のときだけ発火し、score 値スロット
  の preset (奪い合い / コレクション / あいさつ) では無音 (背景は通常通り)。
- `prefers-reduced-motion: reduce` を含めたモーション境界遵守。色変化は instant or
  ≤ 150ms ease。
- 既存トークン (`--primary` / `--accent`) からのみ色を作る。新 hue を発明しない。

Out of scope:

- host 画面の背景演出 (host は token を持たない)。
- 「保持中プレイヤー一覧の見える化」など metrics 表現の改善 (別軸)。
- audio / haptics による通知 (議論未了)。
- score-based preset (奪い合い等) でのリードランナー強調 (別議論)。
- 「他人が持っている」状態の表示 (今回は自分のみ)。

## Milestones

1. **検出ロジックの確立**: client 側で「自分が token を保持しているか」を導出する
   `useIsTokenHolder(selfId)` を `apps/client/src/lib/` に置く。入力は ws-store の
   `state` (RelayState 形) と `selfId`。state は `unknown` なので、`ValueSlot` の
   shape にだけ narrow する関数を書く。`metrics` の "保持中" label に依存しない
   (label 文字列マッチは fragile)。
2. **ビジュアル適用**: `ClientRoom.tsx` で `isHolding` を読み、`<RoomLayout>` の
   `<main>` (もしくは ClientRoom 直下のラッパ) に `data-holding="true"` を立てて
   CSS 側で背景色を上書きする。ライト register / ダーク register 双方で読みやすい
   tint を `styles.css` に追加。
3. **アクセシビリティ確認**: AA 以上のコントラスト、`prefers-reduced-motion` 対応、
   transition ≤150ms、`aria-live` ではなく見た目のみ (screen reader への過剰通知を
   避ける) を確認。
4. **テスト**: `useIsTokenHolder` のユニットテスト (token has=true / has=false /
   score slot / 自分が players に居ない場合)。ClientRoom の RTL テストで
   `data-holding` 属性が切り替わることを assert。E2E は MVP では deferred。
5. **手動検証**: バトン preset で 2 端末を実機 (or BrowserStack/Playwright 手動) で
   開き、バトンを渡したときに保持側だけ背景が変わることを目視。

## Progress

- [x] M1 検出フック実装 — `apps/client/src/lib/token-holder.ts` に純粋関数
      `isTokenHolder(state, selfId)` を実装。`state` は `unknown` のまま narrow し、
      `state.values[selfId]?.kind === "token" && has === true` を判定する。
      副作用なしのため React hook ではなく pure function に落とした (呼び出し側で
      `useWs(s => s.state)` と組み合わせるだけで十分)。
- [x] M2 CSS / マークアップ適用 — `RoomLayout.tsx` で `role === "client"` のときだけ
      `isTokenHolder` を評価し、`<main>` に `data-holding="true"` を立てる。
      `packages/ui/src/styles.css` に `main[data-holding="true"]` で
      `color-mix(in oklch, var(--primary) 16%, var(--background))` を適用。
- [x] M3 a11y / モーション境界の確認 — transition は `150ms ease-out`、
      `@media (prefers-reduced-motion: reduce)` で `transition: none`。
      属性のみ切り替え、`aria-live` 等は付与せず screen reader への過剰通知を回避。
      `--primary` 16% mix は light register (cream) で目視 ~AA-large、
      dark register (slate) でも視認可能なコントラスト差を確保。
- [x] M4 テスト追加 — `apps/client/src/lib/token-holder.test.ts` で 7 ケース
      (token has=true / has=false / score / missing player / null selfId /
      non-object state / malformed values) をカバー。`pnpm -r test` で 92 件 pass。
      RoomLayout の RTL での `data-holding` 切替テストは現状 RoomLayout の RTL
      フィクスチャ (router + ws-store mock) が無いので follow-up に回す。
- [ ] M5 手動検証 — 2 端末でバトン preset を渡し合う目視確認は未実施。

## Surprises And Discoveries

- ws-store の `state` 型は `unknown` (handler ごとに形が違うため)。relay handler 専用に
  narrow するヘルパは `apps/client` 側に置く方が依存方向として正しい (client →
  packages/handlers の型を import するのは現状の `@qr-relay/core` の枠を超えるかも)。
  → 実装時に依存方向を要確認。
- `RoomLayout.tsx:71` の `<main>` に `role === "host" && "dark"` を付ける現行設計と
  整合させる。client の保持中 tint は `dark` を上書きしてはいけない (将来 client が
  stage register を使うケースに備える)。`data-holding` を CSS 変数の上書きトリガに
  すれば register と直交する。

## Decision Log

- **検出は `state.values[selfId]` から**: metrics 経由 (label 文字列マッチ) は
  ローカライズに対して脆い。`ValueSlot` を narrow する方が将来も壊れない。
- **画面全体ではなく `<main>` を tint**: `body` 全体を変えると safe-area の inset
  色が変わり (iOS の swipe gutter)、また host と register が混在する未来の構成で
  事故る。`<main>` のラッパ (現状 `mx-auto … min-h-dvh`) を tint 対象にする。
- **新トークンは増やさない**: `--primary` の `color-mix(... , transparent N%)` だけで
  済ませる (Anti-references §グラデーション禁止と整合)。
- **score preset には適用しない**: 「リードランナー」を強調する別の話と混ぜない。
- **hook ではなく pure function**: `useIsTokenHolder` という名前で書こうとしたが、
  `useWs(s => s.state)` 経由で得る state を `isTokenHolder(state, selfId)` に渡す
  だけで済む。React 依存を持たない純粋関数のほうがテストもしやすい。命名は
  `isTokenHolder` に変更。
- **`@qr-relay/handlers` の型を直 import OK**: `apps/client/package.json` に
  `@qr-relay/handlers: workspace:*` の依存が既に存在し、`packages/handlers/src/index.ts`
  が `ValueSlot` / `RelayState` を export 済み。`@qr-relay/core` を経由する追加レイヤ
  は不要だった (Surprises に書いた懸念は実際には問題なし)。
- **`data-holding` を `false` ではなく `undefined`**: 属性ありなしで CSS セレクタ
  `[data-holding="true"]` を発火させる方が markup が静かで、DOM diff も軽い。
- **mix 比率は 16%**: 18% は light register でやや派手だったため (terracotta が
  cream を侵食しすぎる)、16% に下げて目視 AA-large を確保しつつ "押し付けがましくない"
  シグナルにした。

## Verification

- コマンド:
  - `pnpm -r typecheck`
  - `pnpm -r test`
  - `pnpm --filter @qr-relay/client dev` で 2 ブラウザ (うち 1 つは mobile emulation)
    開き、バトン preset で渡しっこする目視
- 受け入れ挙動:
  - バトン preset で room 開始 → 初期保持者の画面のみ背景が変わる
  - 渡した瞬間に元保持者の背景は元に戻り、新保持者の背景が変わる
  - 奪い合い preset では誰の背景も変わらない
  - `prefers-reduced-motion: reduce` をエミュレートしても transition が暴れない
  - host 画面 (dark register) では背景演出は発火しない
  - スクリーンリーダーで余計な announcement が発生しない (視覚補助 only)

## Outcomes And Retrospective

### 変更ファイル

- `apps/client/src/lib/token-holder.ts` (新規, 23 行)
- `apps/client/src/lib/token-holder.test.ts` (新規, 7 ケース)
- `apps/client/src/routes/RoomLayout.tsx` (`wsState` を購読し
  `data-holding` を `<main>` に付与)
- `packages/ui/src/styles.css` (`main[data-holding="true"]` の tint と
  `prefers-reduced-motion` フォールバックを追加)

### 検証ステータス

- `pnpm -r typecheck` → all green
- `pnpm -r test` → 5 packages / 22 + 10 + 29 + 53 + 92 = 206 件 pass
  (うち token-holder 7 件は新規)
- 手動 2 端末検証 (M5) は本セッションでは未実施。
  バトン preset を実機で渡し合う目視チェックを次セッションで実施し、
  問題なければ本 plan を `completed/` に移動する。

### 残課題 / フォローアップ

- RoomLayout の RTL テスト基盤が無いため、`data-holding` 属性の動的切替を
  単体で assert するテストは未追加。次に RoomLayout 周辺のテストを増やす際に
  まとめて入れるのが筋。
- 「他人が持っている」状態 (例: バトン保持者を全員にハイライト) は別 plan で
  検討する。今回のスコープは "自分の状態を背景で示す" まで。
