---
name: QR Relay
description: UDK ファミリーの第3 sibling — スマホ同士をかざして QR を交換する汎用ゲームツール
colors:
  cream-paper: "oklch(0.97 0.008 75)"
  warm-ink: "oklch(0.25 0.005 60)"
  card-white: "oklch(1 0 0)"
  popover-cream: "oklch(0.99 0.006 75)"
  terracotta: "oklch(0.55 0.17 35)"
  off-white-warm: "oklch(0.99 0.005 75)"
  teal-deep: "oklch(0.5 0.05 195)"
  sand-muted: "oklch(0.92 0.01 70)"
  warm-grey: "oklch(0.42 0.005 60)"
  sand-border: "oklch(0.88 0.012 70)"
  destructive-red: "oklch(0.62 0.22 27)"
  slate-navy: "oklch(0.26 0.025 260)"
  navy-card: "oklch(0.32 0.025 260)"
  navy-panel: "oklch(0.38 0.022 260)"
  cool-off-white: "oklch(0.97 0.002 280)"
  warm-orange: "oklch(0.58 0.21 35)"
  ios-blue: "oklch(0.62 0.2 255)"
  blue-grey: "oklch(0.78 0.02 250)"
  team-red: "oklch(0.66 0.22 25)"
  team-white: "oklch(0.97 0.002 280)"
  team-blue: "oklch(0.42 0.21 265)"
  team-yellow: "oklch(0.88 0.16 92)"
  team-green: "oklch(0.72 0.18 145)"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "42px"
    fontWeight: 900
    lineHeight: "1"
    letterSpacing: "0.18em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "22px"
    fontWeight: 900
    lineHeight: "1.1"
    letterSpacing: "0.02em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 800
    lineHeight: "1.3"
    letterSpacing: "-0.005em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "1.65"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 800
    lineHeight: "1.2"
    letterSpacing: "0.14em"
  step-pill:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 900
    lineHeight: "1"
    letterSpacing: "0.14em"
  room-code:
    fontFamily: "'SF Mono', Menlo, monospace"
    fontSize: "42px"
    fontWeight: 900
    lineHeight: "1"
    letterSpacing: "0.18em"
rounded:
  sm: "11px"
  md: "13px"
  lg: "14px"
  xl: "16px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "20px"
  xl: "28px"
  tap-min: "44px"
components:
  button-primary:
    backgroundColor: "{colors.terracotta}"
    textColor: "{colors.off-white-warm}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "48px"
  button-host:
    backgroundColor: "{colors.teal-deep}"
    textColor: "{colors.off-white-warm}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "48px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.warm-grey}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  badge-host:
    backgroundColor: "{colors.teal-deep}"
    textColor: "{colors.off-white-warm}"
    rounded: "{rounded.pill}"
    padding: "4px 16px"
  badge-player:
    backgroundColor: "{colors.terracotta}"
    textColor: "{colors.off-white-warm}"
    rounded: "{rounded.pill}"
    padding: "4px 16px"
  badge-leader:
    backgroundColor: "{colors.team-yellow}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  card-role-host:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  card-role-player:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input-roomcode:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 12px"
---

# Design System: QR Relay

## 1. Overview

**Creative North Star: "The 体育館 Pocket Tool"**

QR Relay は UDK ファミリー (Multi Eyes, Shake Counter) の三番目の sibling。先行する 2 つで
確立された **handheld register (cream paper / terracotta)** と **stage register
(slate navy / warm orange)** をそのまま継承し、プレイヤーが片手で握る端末を主役に置く。
SaaS の精密プレビューではなく、体育館のホワイトボードに貼られた手書きルール表と同じ
温度感 — festive but earnest、indie、mobile-real。

palette は **Committed**: 暖色オレンジ族 (terracotta / warm-orange) が CTA・STEP pill・
カード枠で 30〜40% の表面を背負う。これは "warm orange against a neutral, dark or light"
という UDK 共通の signature を踏襲した結果で、Restrained ではない。team palette
(red / white / blue / yellow / green) は gameplay data として別枠で扱い、theme-swap しない。

motion は 80ms / `ease-out` / `scale(0.97)` の press feedback ただ一種。choreography も
keyframe アニメーションも parallax も持たない。「calm chrome、festive product」が前提。

明示的に拒否するもの: SaaS の hero-metric テンプレ、同型カードグリッド、gradient text、
side-stripe colored border、装飾としての glass / blur、bouncy / elastic 系イージング、
モーダル先行、chrome へのマスコット流入、web font 読み込み、本文の em dash、
SaaS-cream / navy の reflex。

**Key Characteristics:**

- 暖色オレンジ族の Committed palette (terracotta / warm-orange)
- 2 register の brand: handheld (light cream) / stage (dark slate)
- System font stack only (`-apple-system` → `Hiragino Sans` → fallback)
- 重ねた `font-weight: 800–900` で階層を作る (clamp 系の流体タイポは使わない)
- カード = 14px 角丸 + 1px 暖色 hairline + accent-tinted glow shadow
- press feedback 以外の motion を持たない calm chrome
- ja → en → ko の 3 言語前提

## 2. Colors

暖色オレンジ族が主役、teal が副、neutral は warm-tinted。`#000` / `#fff` は使わない —
全 neutral がブランド hue 方向に微チルトしている。

### Primary

- **Terracotta CTA** (`oklch(0.55 0.17 35)` ≈ `#c25640`): handheld register の
  primary action 全般 (`bg-primary`)。プレイヤーカードの CTA、STEP 2 pill、
  destructive 確認の border accent、focus ring。UDK Shake Counter の `#dc6b4f` を
  暗側に振り、warm-off-white テキストを AA-large bold で読めるよう調整したもの。
- **Warm Orange CTA** (`oklch(0.58 0.21 35)` ≈ `#d6552a`): stage register の primary action
  (`.dark` 配下の `bg-primary`)。同じ hue (h=35) のまま chroma を上げ、navy 背景に対して
  CTA が浮かぶ。UDK Multi Eyes `#ff6b3d` を一段濃く落とした位置。

### Secondary

- **Teal Deep** (`oklch(0.5 0.05 195)` ≈ `#2f6e68`): handheld register の host CTA、
  STEP 1 pill、ホストカードの 2px 枠線。UDK Shake Counter の teal gradient base に対応。
- **iOS Blue** (`oklch(0.62 0.2 255)` ≈ `#007aff`): stage register の host / player CTA、
  入力 focus ring。UDK Multi Eyes の `#007aff` をそのまま継承。

### Neutral

- **Cream Paper** (`oklch(0.97 0.008 75)` ≈ `#faf6f1`): handheld の body 背景。
  warm 寄りの cream で、`#fff` ではなくブランド hue (75) 方向に微チルト。
- **Card White** (`oklch(1 0 0)` ≈ `#ffffff`): カード面のみ純白。warm bg と並べて
  対比を作るためで、地肌として `#fff` を使うわけではない。
- **Warm Ink** (`oklch(0.25 0.005 60)` ≈ `#2c2926`): handheld の本文・見出し。
  純黒 (`#000`) ではなく茶系に寄せたインク。
- **Sand Border** (`oklch(0.88 0.012 70)` ≈ `#e7ddce`): カードの 1px hairline。
- **Warm Grey** (`oklch(0.42 0.005 60)` ≈ `#5b5651`): muted-foreground。
  white カード上で ~7.4:1、tinted muted bg 上で ~6:1 の contrast を確保する。
- **Slate Navy** (`oklch(0.26 0.025 260)` ≈ `#1f253a`): stage register の body 背景。
  OLED void の `#000` ではなく、明確に navy。
- **Navy Card** (`oklch(0.32 0.025 260)` ≈ `#2c3349`): stage カード面。
- **Cool Off-white** (`oklch(0.97 0.002 280)` ≈ `#f5f5f7`): stage 本文。
- **Blue Grey** (`oklch(0.78 0.02 250)` ≈ `#b8c0cc`): stage muted-foreground。
- **Off-white Warm** (`oklch(0.99 0.005 75)`): CTA / badge / leader-on-yellow の前景。
  純白ではなくブランド hue 方向に微チルトした off-white を CTA テキストとして使う。

### Tertiary — Team palette (register-agnostic)

ゲームプレイ用 data。**theme swap しない**。両 register で同じ値を持つ:

- **Team Red** (`oklch(0.66 0.22 25)`), **Team White** (`oklch(0.97 0.002 280)`),
  **Team Blue** (`oklch(0.42 0.21 265)`), **Team Yellow** (`oklch(0.88 0.16 92)`),
  **Team Green** (`oklch(0.72 0.18 145)`)。

### Named Rules

**The Pill-Button Pair Rule.** STEP pill の色は同じカードの CTA と必ず同じトークン。
ホストカードなら pill も CTA も `teal-deep`、プレイヤーカードなら pill も CTA も
`terracotta`。これが守られないと「どのアクションがそのカードの主役か」が一目で読めない。

**The No-Pure-Black-Or-White Rule.** `oklch(0 0 0)` / `oklch(1 0 0)` は カード面
(`card-white`) を除いて使わない。全 neutral はブランド hue (h≈35〜75) 方向に
chroma 0.005〜0.012 でチルトする。

**The Two-Registers-Only Rule.** Light は handheld (cream)、dark は stage (slate)。
第三の register を発明しない。`<html class="dark">` の切り替えがそのまま register 切替。

## 3. Typography

**Display Font:** system stack (`-apple-system, BlinkMacSystemFont, "Hiragino Sans",
"Helvetica Neue", Arial, sans-serif`)
**Body Font:** 同じ system stack (1 family のみ)
**Label/Mono Font:** `"SF Mono", Menlo, monospace` (ルームコード入力・表示専用)

**Character:** Web フォントを読み込まず、各 OS の本気フォントを借りる。日本語環境では
Hiragino Sans (macOS / iOS) または Yu Gothic / Noto Sans CJK (Windows / Android) が拾われ、
英数は SF / Segoe UI / Roboto が並ぶ。重い weight (800–900) と letter-spacing で
階層を作るので、display font を導入しなくても十分に強い。

### Hierarchy

- **Display** (900, `42–56px` / 1.0 lh / `0.18em` tracking): ホスト画面のルームコード表示
  (`HostRoom.tsx` の `.text-[42px] sm:text-[56px]`)。
- **Headline** (900, `22px` / 1.1 lh / `0.02em`): アプリ名 / 主見出し (`AppTitle` main)。
- **Title** (800, `16px` / 1.3 lh): カード見出し (`<h3>` / RoleCard title)。
- **Body** (500, `14px` / 1.65 lh): 説明文。65–75ch を超えないよう `max-w-[720px]` で制約。
- **Label** (800, `11px` / 1.2 lh / `0.14em` upper): セクション見出し
  (`text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground`)、
  "ROOM CODE" 見出し、"または" divider。
- **STEP pill** (900, `16px` / 1.0 lh / `0.14em` upper): STEP 1 / STEP 2 ラベル。
  ページ内で title 以外で最も letterspaced な要素。
- **Room code mono** (800, `17px` 入力 / `42–56px` 表示 / `0.18–0.4em` tracking,
  `tabular-nums`): 4 文字英大文字のみ。glyph 間に空気を入れて 4 つで一塊に見せる。

### Named Rules

**The Weight-Hierarchy Rule.** 階層は **font-weight + letter-spacing** で作り、
font-size の階差は控えめにとどめる (1.125〜1.2 ratio)。display フォントを足したり
clamp で流体スケールにしたりしない — 屋外片手・小型端末でも階段が安定する。

**The Tracking-By-Role Rule.** Tracking は意味別に固定:
`0.14em uppercase` = STEP pill / Label、`0.18–0.4em` = room code、
`0.02em` = headline、`-0.005em` = title、それ以外は無指定。役割と tracking が一対一。

## 4. Elevation

**Hybrid: register 別**。handheld は accent-tinted な soft drop shadow + 1px hairline、
stage は shadow 無し + translucent panel + 1px hairline。どちらも depth を盛らず、
"floating polished card" ではなく "paper on a surface" の質感を目指す。

### Shadow Vocabulary

- **shadow-card (handheld)** (`box-shadow: 0 12px 28px rgb(15 23 42 / 0.08)`):
  全カードの ambient elevation。cream paper 上で角を浮かせる。
- **shadow-cta-primary** (`box-shadow: 0 6px 18px color-mix(in oklch, var(--primary) 25%, transparent)`):
  Primary CTA 専用の **accent-tinted glow**。neutral drop shadow ではなく、
  CTA 色をブレンドした暖色グロー。
- **shadow-cta-secondary** (`box-shadow: 0 6px 16px color-mix(in oklch, var(--secondary) 22%, transparent)`):
  Host CTA 専用の同等 glow (teal)。
- **shadow-card (stage)** (`box-shadow: 0 0 0 1px oklch(1 0 0 / 0.06), 0 12px 28px rgb(0 0 0 / 0.3)`):
  stage register では薄い outer ring + soft drop で深さを出す。

### Named Rules

**The Accent-Glow Rule.** CTA の elevation は **neutral drop shadow ではなく
accent-tinted glow** で表現する。SaaS の "gray shadow under primary button" を踏まない。
glow の色は CTA の bg を 22–25% blend した color-mix。

**The Border-Then-Shadow Rule.** handheld のカードは「1px 暖色 hairline + soft shadow」
の二段重ね。border 単独だと sticker のように貼り付き、shadow 単独だと cream 紙の上で
輪郭が消える。両方が揃って初めてカードに見える。

## 5. Components

### Buttons

- **Shape:** Medium 角丸 (`rounded-[var(--radius-md)]` = 13px)。 pill サイズのみ
  full-round (999px)。
- **Stroke weight in glyphs:** lucide icons は `stroke-width: 2.5` を global で適用
  (`styles.css` `@layer base` の `svg[stroke="currentColor"]`)。font-extrabold (800) の
  文字と並べたとき icon が細く見えないように、stroke を 1 段太らせる。
- **Primary:** `bg-primary` (terracotta) + `text-primary-foreground` (warm off-white)
  + accent-tinted glow shadow + `transition-transform 80ms ease-out active:scale-[0.97]`。
  最重要 CTA (QR スキャン、参加、スタート)。
- **Host:** `bg-secondary` (teal-deep) + `text-secondary-foreground` (warm off-white)
  + teal accent glow。ホスト側の lead action (ホスト立ち上げ)。
- **Outline:** `border-2 border-border` + 透明 bg + `text-foreground`、hover 時に
  `bg-muted/30`。リセット等の destructive 確認の前段。
- **Ghost:** 透明 bg + `text-muted-foreground`、hover で `bg-muted/40`。chip 行や
  目立たないアクション。
- **States:** disabled = `opacity-50 cursor-not-allowed`、focus-visible = `ring-2 ring-ring
  ring-offset-2 ring-offset-background`、active = `scale-[0.97]`。hover は touch-first の
  ためあえて誇張しない (`shadow` を深める程度)。

### Chips (small status / player tag)

- **Style:** `bg-secondary/15` (handheld) / `bg-secondary/25` (stage) + `text-foreground`、
  `rounded-full`、`px-2.5 py-0.5 text-[12px] font-bold`。
- **Use:** プレイヤー一覧、対戦ペア、軽量 status。色は控えめで、CTA と被らない。

### Cards / Containers

- **Corner Style:** 14px (`var(--radius-lg)`)。
- **Background:** handheld = `card-white` (`#ffffff` 純白)、stage = `oklch(0.32 0.025 260)`
  translucent (`bg-white/[0.04]`)。
- **Shadow Strategy:** handheld = `shadow-[var(--shadow-card)]`、stage = shadow なし。
- **Border:** handheld = 1px `border-border` (warm sand) baseline。stage = 1px
  `border-white/10`。
- **Internal Padding:** 20px (`p-5`)。
- **Role variant:** RoleCard は baseline border を `border-2 border-secondary/45` (host) /
  `border-2 border-primary/50` (player) で上書き。STEP pill / CTA / カード枠が
  同じ色で揃う。

### Role Card (signature component)

UDK ファミリーの load-bearing component。1 つのカードに `STEP n` pill + アイコン +
タイトル + 説明 + 主 CTA + (任意で副入力) を縦に積む。

- **STEP pill:** `Badge variant="host"` (teal) or `variant="player"` (terracotta)、
  `size="step"` (`px-4 py-1 text-base tracking-[0.14em] rounded-full font-black uppercase`)。
- **Card edge:** 2px 同色 border (`/45 〜/55` opacity)。カードを「役割の色で囲まれた紙」と
  読ませる。
- **CTA:** 同色 (host=teal / player=terracotta) の filled button、`size="cta"`
  (`w-full h-12 text-base`)。
- **Icon disc:** `size-9 rounded-full bg-muted/40` + 18px lucide icon (stroke 2.5)。
- **副入力 (player のみ):** `または` divider + `room-code` 入力 + 小 "参加" button。
  Disclosure 風に積むのではなく、同じカード内で inline に積み上げる
  (`Inline disclosure over modals` 原則)。

### Inputs / Fields

- **Style:** `h-11` (= 44px tap floor) + `border-2 border-border` + `bg-card`
  + `rounded-[var(--radius-md)]` (13px) + `px-3 text-base font-bold`。
- **Focus:** `focus-visible:border-ring` で border 色を terracotta (handheld) /
  iOS blue (stage) に切り替える。`outline-none` で chrome のデフォルト枠は消す。
- **Room code (signature):** monospace (`SF Mono, Menlo`)、`uppercase`、
  `tracking-[0.18em〜0.4em]`、`tabular-nums`、4 文字制限、`autocapitalize="characters"`。

### Disclosure (`<details>`)

- **Style:** カードと同じ角丸 + 影。 summary 行は `text-base font-extrabold tracking-tight
  flex justify-between`、右端に `Plus` アイコン (`group-open:rotate-45` で 45 度回転)。
- **Use:** FAQ / インストール手順 / ボタン凡例。**modal の代わり**。

### Top App Title (UDK identity)

- **Layout:** 2 行縦積み (`AppTitle main` + `AppTitle sub`)。main = 22px / 900、
  sub = 11px / 600 / italic / 0.06em。`Inspired by …` 表記はこのスロットに置く。
- **Use:** Home + RoomLayout のヘッダ。全画面で同じ vertical rhythm を作る。

### Buy-Me-a-Coffee block (UDK shared identity)

UDK 共通の brand-mark moment。warm yellow gradient + gold border + dark gold text。
**theme swap しない** (handheld でも stage でも同じ値)。`packages/ui/src/coffee-block.tsx`
を verbatim に再利用する。

### Host Stage Dashboard (md+, 6m 視認前提)

ホスト画面の `md+` は **会場全員のゲーム経過パネル** として組み直す
(`ADR-0004`)。プレイヤーは自端末を外向きに掲げているため、自分の手元画面を
読めない / 読まない。よってホスト画面は運営盤ではなく、**6m 先の聴衆が読む
dashboard** が前提。

- **2 register** の延長線上にあり、stage register (dark slate) を専有する。
  第三の register は作らない。
- **タイル構成は ViewSwitcher で切替**: `overview` モードは Hero /
  LastScanTicker / Stopwatch / JoinQR / ScanCount の 5 tile。focus モード
  (`rankings` / `token-path` / `infection` / `participants`) は対応する
  1 tile が canvas を占有し、底に Stopwatch を残す。PlayerBoard は
  廃止 ([ADR-0005](docs/adr/0005-drop-player-board-from-host-stage.md))。
- **grid 切替 = preset 表現**: `pickHostHeroView` が返す view kind
  (`waiting` / `token-single` / `token-many` / `score-leader`) は overview
  モード内の Hero タイル中身選択に残存し、focus モードは ViewSwitcher で
  ホスト自身が選ぶ ([ADR-0006](docs/adr/0006-host-multi-view-dashboard.md))。
- **タイポ最小サイズ**: 名前 ≥ 20–24px、値 ≥ 28–56px、Hero の主役グリフは
  `clamp(48px, 11vw, 160px)` 規模。`clamp()` で流体化するのは
  「ホスト画面の dashboard 内部だけ」で、handheld register には持ち込まない
  (`The Weight-Hierarchy Rule` に従い、本文 / カードは clamp しない)。
- **タイル境界で内容は逃げない**: 各 tile セクションは `overflow-hidden` を
  必須にする。focus モードの細い行に詰め込まれた Stopwatch のような流体
  サイズ要素は `clamp(28px, min(4vw, 10vh), 88px)` のように viewport の幅
  と高さの **小さい方** で縮ませる。
- **モーション**: 値変化時に `.hero-pulse` クラスで 240ms / `scale(1.05)` を
  1 回だけ。React の `key` 変化で再マウントしてキーフレームを再発火させる
  (`data-pulse-key` 属性では発火しない)。`prefers-reduced-motion` で全停止
  (`styles.css` の global rule で自動)。これは DESIGN.md の motion 規約
  (80ms / `ease-out` / press feedback のみ) を破らない最小拡張で、
  「会場が "今" 起きたことに気付く」ためのキューに用途を限定する。
- **100dvh 縛り**: `<main>` に `md:h-dvh md:overflow-hidden` を付け、
  Hero / Ticker / focus tile は **内部スクロールを持たない**。タイル境界で
  scroll を許すと dashboard が dashboard でなくなる。
- **JoinQR の表示ポリシー**: `waiting` view では JoinQR が中央 8/12 cols を
  占有する hero に昇格する。プレイ中 (`token-*` / `score-leader`) は compact
  サイズに退き、サイドのクロックと並ぶ。プレイ中も完全に隠さないのは、後発
  joiner が会場の片隅から QR を読めるようにするため。
- **操作 UI は header に格納**: start / pause / resume / reset の操作と
  アクションエラーは `RoomLayout` ヘッダ右端の pill button + 下のアラート
  Card に集約する ([ADR-0007](docs/adr/0007-host-operator-strip-to-header.md))。
  stage register での主役は **ゲーム状態** であって操作ボタンではない、
  という階層は維持しつつ、dashboard の垂直予算をタイルに譲る。

## 6. Do's and Don'ts

### Do:

- **Do** CTA テキストを `--primary-foreground` (`oklch(0.99 0.005 75)` warm off-white)
  で塗り、`bg-primary` (terracotta) / `bg-secondary` (teal) に対して AA-large bold で
  読めるようにする。
- **Do** STEP pill (`Badge variant="host"` / `"player"`) とそのカードの CTA を
  **同じトークン**に揃える (`The Pill-Button Pair Rule`)。
- **Do** カードに **1px 暖色 hairline + soft shadow** を二段重ねる。border 単独
  でも shadow 単独でもダメ (`The Border-Then-Shadow Rule`)。
- **Do** RoleCard では baseline border を 2px 同色 (`border-secondary/45` or
  `border-primary/50`) に置き換えてカード自体を役割色で囲む。
- **Do** lucide icons を `stroke-width: 2.5` 以上で描画する (`styles.css` の global
  rule に依存)。font-extrabold の文字と並べたとき stroke を 1 段太らせて視覚 weight を
  合わせる。
- **Do** すべての CTA / pill / chip / coffee block に `active:scale-[0.97]` + 80ms
  ease-out の press feedback を付ける。これ以外の motion を足さない。
- **Do** focus-visible で `ring-2 ring-ring ring-offset-2 ring-offset-background` を
  出す。`outline-none` を単独で書くな。
- **Do** ルームコード入力には `SF Mono` + `tracking-[0.18em]` + `tabular-nums` +
  `uppercase` + `autocapitalize="characters"` を必ず揃える。
- **Do** Disclosure (`<details>`) で FAQ / 手順 / 任意セクションを inline に出す。
  モーダルはカメラ / センサーの permission と終了 overlay だけに限定する。
- **Do** ja / en / ko の 3 言語スイッチャーをセグメントピル (`.lang-btn`) で出す。
  `<select>` で代用しない。日本語が primary、他は auxiliary。

### Don't:

- **Don't** `#fff` / `#000` / `#f8fafc` を直接書く。`--card`、`--background`、
  `oklch(...)` 経由でブランド hue に向けた warm-tinted neutral を使う
  (`The No-Pure-Black-Or-White Rule`)。
- **Don't** SaaS の hero-metric テンプレを作る (大きな数字 + 小ラベル + 補助 stat)。
- **Don't** icon + heading + text の **同型カードグリッド**を量産する。
- **Don't** `background-clip: text` + gradient を組み合わせる **gradient text**
  を一切使わない。色強調は weight / size で行う。
- **Don't** `border-left` / `border-right` を 1px 超のカラーバーとして使う
  (**side-stripe border** 禁止)。役割色はフル border か STEP pill で表す。
- **Don't** glass / blur を装飾として使う。CTA の固定バーで `backdrop-blur` は
  許容するが、それ以外はダメ。
- **Don't** bouncy / elastic / spring 系のイージング、scroll-driven 演出、parallax、
  Lottie を入れる。motion は press feedback のみ。
- **Don't** モーダルを「とりあえず」で起こす。readable なものは `<details>` で。
- **Don't** マスコット / ヒーローイラストを chrome に流し込む。 PWA icon は OK、
  UI に持ち込むな。
- **Don't** Web font (`<link rel="stylesheet">` で Google Fonts 等) を読む。
  system stack のみ。
- **Don't** 本文 / コピーで em dash (`—`) や `--` を使う。`,` `:` `;` `.` `()` で
  代替する。
- **Don't** 第三の register (例: "ultra-bright outdoor mode") を発明する。
  handheld / stage の 2 つに収めきる (`The Two-Registers-Only Rule`)。
- **Don't** CTA の shadow を neutral gray drop で描く。**accent-tinted glow** で
  描く (`The Accent-Glow Rule`)。
- **Don't** lucide icon を default の `stroke-width: 2` のまま描画する。
  global rule で 2.5 にする (font weight との視覚整合)。
- **Don't** タグライン / マーケコピーをカード内に置く。card desc は 1 文まで
  (auto-memory 継続ルール)。
