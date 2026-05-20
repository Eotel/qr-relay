# Plan: クライアント favicon と シェア時の OG / Twitter カード

Owner: miura
Status: Active
Created: 2026-05-20

## Goal

ブラウザタブ・iOS / Android のホーム追加・Slack / LINE / X 等にリンクを貼ったときに、
QR Relay が「タイトル文字列だけ」「真っ白なデフォルトアイコン」で出ないようにする。
handheld register (cream + terracotta) の brand を踏襲した最小セットを `apps/client/`
に置き、Vite dev / Cloudflare Workers `ASSETS` 配信の両方で 200 で返ることを確認する。

## Context

- 現状の `apps/client/index.html` には favicon も OG / Twitter meta も無く、
  `<title>QR Relay</title>` と `theme-color` のみ。
  - `apps/client/index.html:14` `<meta name="theme-color" content="#faf6f1" />`
  - 注釈に「handheld register は cream、host stage は slate-navy を JS で差し替える」
    旨が既に書かれており、theme-color 方針はそれに従う。
- 配信経路:
  - dev: Vite が `apps/client/public/*` をそのまま `/` 配下に出す (現状 `public/` 未作成)。
  - prod: `apps/server/wrangler.toml` の `[assets] directory = "../client/dist"`,
    `binding = "ASSETS"` 経由で Worker が SPA 配信。`apps/server/src/index.ts:172`
    で `app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));`。
    したがって `/favicon.svg` 等の static path は notFound に落ちて ASSETS が返す。
- ブランド (DESIGN.md):
  - handheld register: `cream-paper oklch(0.97 0.008 75)` + `terracotta` accent
    + `warm-ink oklch(0.25 0.005 60)`
  - stage register: `slate-navy oklch(0.26 0.025 260)` + `warm-orange oklch(0.58 0.21 35)`
  - 1st-citizen は handheld (プレイヤー手元)。favicon / OG はこちらに寄せる。
- 関連プラン: なし (新規)

## Scope

In scope:

- `apps/client/public/` を新設し、以下を配置する:
  - `favicon.svg` (SVG, ライト / ダークどちらでも読める単色 + accent)
  - `favicon.ico` (16/32 multi-resolution, ブラウザ互換のため)
  - `apple-touch-icon.png` (180×180, iOS ホーム画面)
  - `og-image.png` (1200×630, OG / Twitter `summary_large_image`)
  - 必要なら `icon-192.png` / `icon-512.png` (PWA manifest 用)
  - `site.webmanifest` (name / short_name / theme_color / icons)
- `apps/client/index.html` に以下を追加:
  - `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`
  - `<link rel="icon" type="image/x-icon" href="/favicon.ico" sizes="32x32" />`
  - `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`
  - `<link rel="manifest" href="/site.webmanifest" />`
  - `<meta name="description" content="…" />` (日本語、PRODUCT.md の 1 文)
  - `<meta property="og:title" />`, `og:description`, `og:image`, `og:url`,
    `og:type="website"`, `og:locale="ja_JP"`, `og:site_name="QR Relay"`
  - `<meta name="twitter:card" content="summary_large_image" />`,
    `twitter:title`, `twitter:description`, `twitter:image`
- ローカル (`pnpm dev:client`) と `pnpm build && wrangler dev` の両方で
  各 path が 200 を返すこと、Slack / X / Facebook の OG プレビューで
  画像とタイトルが意図どおり出ることを確認する手順を Verification に書く。

Out of scope:

- 完全な PWA 化 (service worker / offline cache)。manifest は最小に留め、
  install 可能性は「あればラッキー」程度で扱う。別プランとする。
- 多言語の OG (en / ko 用に切り替える)。今回は ja の 1 セットのみ。
- ホスト stage register 用の別 favicon バリアント。タブアイコンは
  handheld 寄せで統一する (ホストもブラウザタブとしては同じ)。
- 既存 `theme-color` の差し替えロジック (`RoomLayout` 内) への変更。

## Milestones

1. **設計確定**: シンボル案 (QR + relay arrow / two-tile exchange) を 1〜2 種、
   サイズ別の必要枚数と発注プロンプトを決める。
2. **アセット生成 (codex 委譲)**: Codex の gpt-image tool に raster 一式
   (apple-touch-icon, og-image, icon-192, icon-512) と、できれば favicon.svg の
   下絵を発注する。`.impeccable/` か `apps/client/public/_source/` に source を置く。
3. **配置 & meta 追加**: `apps/client/public/` に最終ファイルを置き、
   `index.html` に link / meta tag を追加。site.webmanifest 作成。
4. **検証**: dev / wrangler dev 両経路で 200 を確認、
   `cards-dev.twitter.com` / `developers.facebook.com/tools/debug/` で
   OG プレビュー (要 public URL — `cloudflared tunnel` 等が必要なら最後にまとめて)。

## Progress

- [x] M1: シンボル案を確定 (Decision Log 参照)。
      favicon は **terracotta 角丸正方形 + 中央 cream QR finder pattern**。
      OG は **2 タイル (terracotta + teal) のリレー** で「QR を交換する」を表現。
- [x] M2: `apps/client/brand-assets/build.sh` (ImageMagick) で raster 一式を生成、
      `apps/client/public/` に配置 (favicon.svg / favicon.ico / apple-touch-icon.png
      180px / icon-192.png / icon-512.png / og-image.png 1200×630)。
- [x] M2.5: `favicon.svg` は手書き SVG。ブランドカラーを `#c25640` (terracotta) と
      `#faf6f1` (cream-paper) に固定し、`oklch()` 由来の hex を直接書き込む
      (favicon の static SVG は `oklch` を信用できない browser を考慮して hex 固定)。
- [x] M3: `apps/client/index.html` に description / favicon link / apple-touch-icon /
      og:* / twitter:* を追加。`<meta name="theme-color">` は据え置き。
      `site.webmanifest` の代わりに VitePWA の `manifest.webmanifest` を拡張
      (description / lang / scope / icons の `purpose: any+maskable`)。
- [x] M4: `pnpm -r typecheck` / `pnpm --filter @qr-relay/client build` で
      `dist/` に各アセットがコピーされ、生成された `dist/index.html` と
      `dist/manifest.webmanifest` に意図どおり meta / icons が含まれることを確認。
- [ ] M4.5: 公開 URL での OG プレビューは別途。`pnpm dev:client` /
      `pnpm dev:server` で実行時 curl 検証は run-time の宿題として残す。

## Surprises And Discoveries

実装中に気づいたこと、想定外の挙動、変更した方針を都度追記する。

- **VitePWA は既に組み込まれていた** (`apps/client/vite.config.ts`)。
  `manifest.webmanifest` と `sw.js` は自動生成され、`<link rel="manifest">`
  も build 時に `index.html` に注入される。
  プラン中の "site.webmanifest を作成" は VitePWA の manifest 設定を
  拡張する形に置き換える。`icon-192.png` / `icon-512.png` は既に参照済みで、
  ファイル本体が無いだけ。
- **ラスタ生成は ImageMagick (`magick`) でローカル実行**。
  プランでは Codex + gpt-image に委譲としていたが、SVG をブランドカラーで
  自分で設計したほうが decisive、再現性が高い、外部 API コストが無い、
  という 3 点で勝つので方針変更。`apps/client/brand-assets/` に SVG ソースと
  ビルドスクリプトを置き、`public/` にラスタを生成する。
- **PWA 用 `purpose: "maskable"` を追加**。Android のホーム追加で
  「白い余白枠」が出ないように、icon-192 / icon-512 を `any` + `maskable`
  両方で登録する。SVG 設計で 80% safe zone を確保している。

## Decision Log

判断点と採用理由。後から「なぜ X を選んだか」を読み返せるように。

- **画像生成は Codex + gpt-image に委譲** → **ローカル ImageMagick + 手書き SVG に変更**:
  当初は Codex の gpt-image に raster を発注予定だったが、(a) brand color を
  正確に再現するには SVG ソースを自分で持つほうが速い、(b) 再生成のために
  外部 API に依存しないほうが long-term の保守が楽、(c) favicon と OG の
  symbol を統一する制御がしやすい、の 3 点でローカル生成に切替。
  `apps/client/brand-assets/{favicon,og-image}.svg` がソース、
  `build.sh` がラスタライザ。
- **favicon symbol = QR finder pattern (3 入れ子角丸正方形)**:
  16px でも形が崩れず、QR を即座に想起させる universally recognizable な
  glyph。"Relay" のニュアンスは OG image の 2 タイル構成で表現し、
  favicon 単体では足し算しない (「会場の体育館で 16px のタブを判別できる」
  ことを最優先)。
- **OG image = 2 タイルが向き合う構図 + Japanese descriptor**:
  terracotta タイル × teal-deep タイルで "handheld ↔ host" の対比を
  暗示しつつ、headline を「QR Relay」だけにして descriptor は
  「スマホ同士をかざして QR を交換する。」の 1 文に絞る (auto-memory:
  タグライン / マーケコピー禁止)。`UDK FAMILY · 3` を upper-label として
  足し、UDK lineage を `Inspired by Undokai Association · YCAM × SONY CSL` で
  記名する。
- **brand は handheld register に寄せる**: 主役は player 手元。
  ホストブラウザのタブも同じアイコンで困らない。OG image だけ teal を
  「対向タイル」として登場させ、stage register への目配せを残す。
- **PWA manifest は VitePWA で拡張、別 `site.webmanifest` は作らない**:
  既に VitePWA が `manifest.webmanifest` を生成し、`<link rel="manifest">` も
  build 時に自動注入していたので、設定を上書きする方が SoT が 1 つに収まる。
- **`purpose: "any"` + `purpose: "maskable"` を両方登録**: Android の
  ホーム追加で circular / squircle / rounded-square のいずれにマスクされても、
  QR finder シンボルが safe zone に収まるようにする。SVG 設計時点で
  中心の content (`x=11,y=11,w=42,h=42`) を viewport 64x64 の 80% safe zone
  (`x=6.4,y=6.4,w=51.2,h=51.2`) に収めている。

## Verification

- コマンド:
  - `pnpm -r typecheck`
  - `pnpm --filter @qr-relay/client build`
  - `pnpm dev:client` → `curl -I http://localhost:5173/favicon.svg`
    (および .ico / apple-touch-icon.png / og-image.png / site.webmanifest)
  - `pnpm --filter @qr-relay/server dev` →
    `curl -I http://localhost:8787/favicon.svg` 等 (Worker `ASSETS` 経由)
- 受け入れ挙動:
  - ブラウザタブに favicon が出る (Chrome / Safari / Firefox)
  - iOS Safari の「ホーム画面に追加」で apple-touch-icon が当たる
  - Slack / X / Facebook で URL を貼ったときに OG 画像 + タイトル +
    説明が出る (公開 URL があれば実機確認、なければ
    `https://www.opengraph.xyz/` 等にローカルの index.html を渡して確認)
  - `<meta name="theme-color">` の既存ロジック (host stage で
    slate-navy に差し替え) が壊れていないこと

## Outcomes And Retrospective

### 変わったもの

- `apps/client/index.html`: description / favicon links / apple-touch-icon /
  og:* / twitter:* meta を追加。`theme-color` は据え置き。
- `apps/client/vite.config.ts`: VitePWA manifest を description / lang / scope /
  icons (purpose: any + maskable) で拡張。
- `apps/client/public/`: 新設。favicon.svg / favicon.ico / apple-touch-icon.png /
  icon-192.png / icon-512.png / og-image.png を配置。
- `apps/client/brand-assets/`: 新設。`favicon.svg` (handheld register, QR finder)、
  `og-image.svg` (1200×630, 2 タイル構成 + Japanese descriptor)、`build.sh`
  (ImageMagick rasterizer) を置く。再生成は `bash apps/client/brand-assets/build.sh`。

### 残った宿題

- 公開 URL での OG プレビュー実機確認 (Slack / X / Facebook debug tool)。
  Cloudflare Workers にデプロイ後の冒煙確認時にまとめてやる。
- favicon の dark-mode 対応 (`<svg>` 内 `prefers-color-scheme` で
  cream / terracotta を反転) は今回入れず。OS タブの dark chrome に対しても
  terracotta は十分に立つので、必要になったら別 PR。

### 次の人への申し送り

- ブランド色は `DESIGN.md` の oklch 定義が SoT。SVG 内の hex
  (`#c25640` / `#faf6f1` / `#2c2926` / `#5b5651` / `#2f6e68` / `#e7ddce`) は
  oklch からの近似で、DESIGN.md が変わったら brand-assets/*.svg も同期する。
- ラスタを再生成したら必ず `pnpm --filter @qr-relay/client build` を実行して
  `dist/` 側の copy が更新されていることを確認する。
  (Vite は public/ をそのままコピーする。生成スクリプトを CI に組み込む形は
  今回入れていない — ImageMagick の rsvg delegate が CI で揃わない懸念のため。)
