# Product

## Register

product

## Users

会場で集まった人たちが、それぞれのスマホでその場で遊ぶための短時間ツール。

- **ホスト** (1 名): 学校・会社・コミュニティの運動会 / イベント運営者。手持ちの
  PC・iPad・スマホのいずれかでルームを立ち上げ、参加用 QR を表示する。
- **プレイヤー** (2〜数十名): 自分のスマホを片手で操作する参加者。屋内 (体育館)
  または屋外、ネットワークは会場 Wi-Fi または LTE、明るい場所での画面視認性が前提。

利用シーンの中心は「数十秒で全員が遊び始める」こと。事前アカウント・チュートリアル・
個別インストールの余地はない。プレイヤーは URL を踏むかカメラで QR を読むだけで参加し、
ホストが「スタート」した瞬間からゲームが回る。

## Product Purpose

スマホ同士をかざして QR を交換する汎用ゲームツール。1 つの統合 `relay` エンジンと
`ScanRule` config で 9 種のプリセット (バトン / ホットポテト / 奪い合い / コレクション /
あいさつ / ノルマ / 鬼ごっこ / 感染 / 鬼交代) を表現し、新しい遊び方は data だけで足せる。

UDK ファミリーの 3 番目の sibling app として位置づける。先行する 2 つは:

- **UDK Multi Eyes** — 大画面・stage register・4 端末コラボカメラ
- **UDK Shake Counter** — 手元・handheld register・シェイクカウント

QR Relay の主役は handheld register (プレイヤー画面)、ホスト画面は stage register
(`<html class="dark">`) を任意で選べる。「one design system, two registers」を継承する。

成功の指標は「会場で全員のスマホが鳴り出すまでの時間」と「次回も使う気になる軽さ」。
機能数を増やすことではない。

## Brand Personality

3 words: **festive, earnest, indie**

- **Festive but earnest** — 運動会の空気。マーケティングサイトではなく、
  体育館のホワイトボードに貼られた手書きルール表のニュアンス。
- **Indie / cultural** — Undokai Association と YCAM × SONY CSL の art lineage を
  著者として明示する。「単一の作者がつくった honest なもの」が見える。
- **Mobile-real** — 屋外で日光を浴びながら片手で触る前提。エンタープライズの
  ピクセル完璧主義ではなく、現場で使い倒せる頑丈さ。
- **Voice / 文体** — 教師 / キャンプカウンセラーのような温度感の日本語。
  「ぜひオリジナルの運動会競技を作ってみてください」が地のトーン。
  日本語が一次、英語・韓国語は補助 (ja → en → ko の 3 言語前提)。

## Anti-references

UDK Design Language §11 の禁則をそのまま継承する:

- SaaS の hero-metric テンプレ (大きな数字 + 小ラベル + 補助 stat)
- 同型カードのグリッド (icon + heading + text の繰り返し)
- グラデーションテキスト (`background-clip: text`)
- 左 / 右の side-stripe colored border
- 装飾としての glass / blur
- bouncy / elastic / spring 系のイージング、スクロール連動演出
- 「とりあえずモーダル」: readable なものは `<details>` 等のインライン開示で出す
- chrome へのマスコット流入
- Web font 読み込み (system stack only)
- 本文中の em dash (`—`)
- SaaS 系のクリーム or ネイビーへの reflex — ニュートラルは warm cream か
  navy-slate のみ。`#fff` / `#000` / `#f8fafc` は使わない

加えて、auto-memory の継続ルール:

- **タグライン / マーケコピー禁止**。カードの説明は短い 1 文まで。
- **`*.test.*` / e2e / config ファイルに対する dev-server HMR は走らせない**
  (`apps/client/vite.config.ts` の `server.watch.ignored` を維持)。

## Design Principles

1. **Time-to-play is sacred** — 端末を手にした人が数十秒以内に遊び始められる動線を
   最優先する。説明・チュートリアル・機能展示は時間予算を奪うので入れない。
2. **One design system, two registers** — handheld (light cream / プレイヤー手元) と
   stage (dark slate / ホスト大画面) の 2 つだけ。3 つ目を発明しない。共通骨格を共有し、
   register は `<html class="dark">` の有無で切り替える。
3. **Indie authorship over enterprise polish** — Undokai Association と原案者を
   フッターに明示し、SaaS 的洗練を演じない。「単一の作者がつくった」honesty を残す。
4. **Inline disclosure over modals** — `<details>` / inline confirm を default にする。
   モーダルはカメラ等のパーミッション、終了オーバーレイなど retire し難い state のみ。
5. **Mobile-real, not mobile-mimicked** — `viewport-fit=cover` + `env(safe-area-inset-*)`、
   `--tap-min: 44px`、片手操作、屋外光下の可読性を前提に置く。デスクトッププレビューで
   良く見えることは指標にしない。
6. **Reuse the family** — 新コンポーネントを起こす前に UDK Multi Eyes / Shake Counter
   に同じものが無いか確認する。STEP カード、language switcher、Buy-Me-a-Coffee ブロック、
   ja/en/ko の 3 言語切替などは verbatim に近い形で持ち込む。

## Accessibility & Inclusion

- **コントラスト**: 既存トークン (`styles.css`) は warm-tinted neutrals でも AA 以上を
  確保する方針 (例: light の `--muted-foreground: oklch(0.42 0.005 60)` で
  white カード上 ~7.4:1、tinted muted 上 ~6:1)。新しいトークンを足す時もこの水準を守る。
- **タップ領域**: 44×44 px 以上を維持。`--tap-min` を超える size がデフォルト。
- **動き**: 全体で 80ms / scale(0.97) の press feedback のみ。`prefers-reduced-motion`
  に対して常に safe。新規の transition を入れる際はこの境界を超えない。
- **多言語**: 日本語が primary。英語・韓国語は同等に並ぶ auxiliary であって "翻訳" 扱い
  ではない。アイコンのみのボタンには `aria-label` を必ず付ける。
- **環境前提**: 屋外日光下、片手操作、安価な Android 端末を含む。Camera / Sensor API
  の権限取得は失敗時のフォールバックを用意する (ルームコード手入力など)。
- **PWA / cold start**: Cloudflare Workers の cold start を考慮し、`>3s` で待機 UI を
  出す等、broken first-tap を起こさない。
