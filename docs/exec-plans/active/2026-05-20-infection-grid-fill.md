# Plan: INFECTION board grid fills the available space

Owner: Eotel
Status: In progress
Created: 2026-05-20

## Goal

ホスト画面の `INFECTION` ビューで、参加者数が少ないとき (例: 2 名) でも各セルが空きスペースを使い切るレイアウトに直す。今は `grid-cols-2 … lg:grid-cols-5` のブレークポイント固定で、人数が少ないと左寄せの細長いカードになる。

## Context

`保持` タブの InfectionGridTile が、現在は viewport 幅でのみカラム数を決めている。プレイヤーが少人数のとき左寄せのまま空白が広く残るのが、ホスト視点で「観客に見せる盤面」として弱い。期待挙動は、プレイヤー数 (= セル数) に応じてカラム/行数を選び、コンテナを埋めるグリッドにすること。

- 関連コード:
  - `apps/client/src/components/host/InfectionGridTile.tsx:51` — 現在のグリッド定義 (`grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5`)
  - `apps/client/src/components/host/InfectionGridTile.tsx:46-77` — 空状態 / セルレンダリング
  - `apps/client/src/components/host/InfectionGridTile.test.tsx` — 既存テスト (renders / litted 状態 / sort 順)
  - `apps/client/src/routes/HostDashboard.tsx:127-129` — `area="infection"` のセル配置
- 関連 docs:
  - `docs/exec-plans/active/2026-05-20-host-multi-view-dashboard.md` — multi-view 全体の経緯
- スクリーンショット: 2 名参加で `lg:grid-cols-5` のうち 2 列だけが使われ、右側に大きな余白が出ている (本 issue のトリガ)。

## Scope

In scope:

- `InfectionGridTile` のグリッド列数を、参加者数とコンテナのアスペクト比から動的に決める。
- セルが正方形〜横長になるよう、`auto-rows-fr` と組み合わせて高さを均等に分配する (現状維持で OK)。
- 既存テストを壊さない / 必要に応じてレイアウト前提のテストを追加。

Out of scope:

- 文字サイズ・アイコン・色などのビジュアルチューニング (既存の `clamp()` 設計に乗る)。
- 他のタイル (Rankings, TokenPath, Participants) のレイアウト変更。
- 参加者多数 (>50 名) のスクロール挙動。今は `overflow-hidden` のままで OK、後続プランで扱う。

## Approach

選択肢:

1. **CSS のみ**: `grid-template-columns: repeat(auto-fit, minmax(N, 1fr))` で MinCellWidth を決める。
   - 利点: JS 不要、再レンダリングなし。
   - 欠点: `minmax` は「行が埋まる最小幅」を保証するだけで、行数を制御できない。少人数 (2-3 人) で 1 行に並ぶ条件と、多人数で 5 列に揃う条件を両立しにくい。アスペクト比に反応できない。
2. **JS で列数計算** (推奨): プレイヤー数 `n` と コンテナのアスペクト比 `aspect = width / height` から、セルが正方形に近くなる列数 `cols = clamp(round(sqrt(n * aspect)), 1, n)`、`rows = ceil(n / cols)` を求める。
   - 利点: 任意の `n` でグリッドが綺麗に埋まる。アスペクト変化 (ホスト画面のリサイズ) にも追従できる。
   - 欠点: `ResizeObserver` 1 個と useState の追加。SSR 配慮は不要 (Vite SPA)。

選定: **2 (JS 計算)**。ホスト画面は横長 16:9 前提で、`auto-fit` ではアスペクト比を扱えず期待した「埋まる」挙動にならない。`ResizeObserver` は標準 API。

擬似コード:

```ts
const cols = computeCols(n, aspect); // aspect = box.width / box.height
const rows = Math.ceil(n / cols);
style = {
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gridTemplateRows:    `repeat(${rows}, minmax(0, 1fr))`,
};
```

`computeCols`:

```ts
function computeCols(n: number, aspect: number): number {
  if (n <= 1) return 1;
  const ideal = Math.sqrt(n * Math.max(aspect, 0.1));
  // セルが極端に縦長/横長にならないよう clamp
  return Math.min(n, Math.max(1, Math.round(ideal)));
}
```

(エッジケース: コンテナ未測定時のフォールバックは `aspect = 16/9` で初期描画。)

## Milestones

1. **M1 — pure logic**: `computeCols(n, aspect)` を `lib/host-view.ts` 隣接に切り出し、unit test を先に書く (RED → GREEN)。
2. **M2 — wiring**: `InfectionGridTile` を `useRef + ResizeObserver` でコンテナサイズを監視し、`gridTemplate{Columns,Rows}` をインラインスタイルで設定。既存の Tailwind grid クラスは消す。
3. **M3 — tests**: 既存テスト (`renders empty`, `lights up`, `score preset`, `sort`) を壊していないこと。`ResizeObserver` のテスト環境スタブで `cols / rows` が反映されるケースを 1 つ追加。
4. **M4 — visual check**: dev server で 2 名 / 5 名 / 11 名 / 20 名のシナリオで `保持` ビューを開き、グリッドが画面を埋めることを確認。
5. **M5 — promote**: `completed/` 移動 + `Outcomes` 記入。

## Progress

- [x] M1 — `computeGridShape(n, aspect)` を `host-view.ts` に追加 + 6 ケースの unit test
- [x] M2 — `InfectionGridTile` を `useRef + ResizeObserver` ベースに差し替え。固定 Tailwind ブレークポイント (`grid-cols-2 sm:… lg:grid-cols-5`) は撤去、`gridTemplate{Columns,Rows}` をインラインスタイルで動的設定
- [x] M3 — vitest 全 152 件 green、`pnpm -r typecheck` も成功
- [ ] M4 — dev server / 実ブラウザでの目視 (本セッションでは未実施: jsdom テストで `data-cols`/`data-rows` と inline style まで確認済みだが、CSS Grid 実描画は要ユーザ確認)
- [ ] M5 — M4 確認後に `completed/` 移動 + Outcomes 追記

## Surprises And Discoveries

- 当初プランは `computeCols(n, aspect)` 単一関数だったが、利用側 (`InfectionGridTile`) は `rows` も常に欲しいので `computeGridShape(n, aspect): { cols, rows }` に統合した。`rows = ceil(n / cols)` を 1 か所で計算する方が、コンポーネント側のロジックが薄くなる。
- jsdom には `ResizeObserver` が無いので、コンポーネントテストは初期値の 16:9 で `gridTemplate*` を検証するに留め、`beforeAll` で no-op スタブを入れて `useEffect` のサブスクリプション分岐を通している。本物の resize 反映までは検証していない (Playwright e2e で拾うべき範囲)。

## Decision Log

- ブレークポイント固定 (`grid-cols-N`) を捨て、JS 計算に倒す判断。理由: ホスト画面は固定された横長で、`auto-fit` ではアスペクト比を扱えないため「埋まる」要件を満たせない。

## Verification

- コマンド:
  - `pnpm --filter @qr-relay/client test -- InfectionGridTile`
  - `pnpm -r typecheck`
- 受け入れ挙動:
  - 2 名: 2 列 × 1 行 ではなく、コンテナのアスペクト比に応じて 2 列 (横長) で横いっぱい。
  - 5 名: 3 列 × 2 行 か 5 列 × 1 行 (横長コンテナなら後者)。
  - 12 名: 4 列 × 3 行 程度。
  - リサイズ時、列数が滑らかに追従する。
  - 0 名のときは従来通り「参加者を待機中」。

## Outcomes And Retrospective

- 変更ファイル:
  - `apps/client/src/lib/host-view.ts` — `computeGridShape(n, aspect): {cols, rows}` 追加
  - `apps/client/src/lib/host-view.test.ts` — 6 ケース追加 (0/1 セル、ワイド/正方形のアスペクト比、n=12、`cols ≤ n` ガード、非正アスペクトのフォールバック)
  - `apps/client/src/components/host/InfectionGridTile.tsx` — Tailwind `grid-cols-*` ブレークポイントを撤去し、`useRef + ResizeObserver` + インライン `gridTemplate{Columns,Rows}` に置換。初期値は 16:9 推定でファーストペイントから埋まる。
  - `apps/client/src/components/host/InfectionGridTile.test.tsx` — `ResizeObserver` no-op スタブ + `data-cols`/`data-rows`/`gridTemplate*` 検証 1 ケース追加。
- 残タスク: M4 (実ブラウザでの 2/5/11/20 名シナリオ確認)、確認できたら M5 (`completed/` 移動)。
