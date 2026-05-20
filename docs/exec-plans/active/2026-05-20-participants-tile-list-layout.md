# Plan: ParticipantListTile を list / table レイアウトに

Owner: miura
Status: Draft
Created: 2026-05-20

## Goal

Host dashboard の「参加者」ビューを、現在の hero-grid (2/3/4 列の巨大行) から **縦並びの list / table** に作り直し、10 人前後でも画面が間延びせず・各参加者の参加順と参加時刻を一目で読み取れるようにする。

## Context

スクリーンショット (`HOST J6QLM5`, 10 人) で確認した通り、現状は `grid-cols-2 md:grid-cols-3 lg:grid-cols-4` + `clamp(18px,2.2vw,30px)` の超大型行で、行間に大量の余白が出ている。stage register 上での視認性を狙った設計だが、ユーザーフィードバック:

> 参加者ビューは普通に list とか table の方がいいのでは

そのとおりで、参加者ビューは hero スケールよりも「誰がいつ入ったかを確認するための密度のあるテーブル」のほうが用途に合う。

関連コード:

- `apps/client/src/components/host/ParticipantListTile.tsx:14-53` — 対象コンポーネント
- `apps/client/src/components/host/ParticipantListTile.test.tsx:1-43` — 既存テスト
- `apps/client/src/lib/ws-store.ts:25` — `PlayerLite = { id; name; joinedAt: number }`
- `apps/client/src/routes/HostDashboard.tsx:128-130` — `Cell area="participants"` に配置

関連プラン: `docs/exec-plans/active/2026-05-20-host-multi-view-dashboard.md` (multi-view dashboard 全体)

## Scope

In scope:

- `ParticipantListTile.tsx` を grid → **table-like list** に書き換え。
  - 行: `#` (順位/連番) / 参加者名 / 参加時刻 (相対秒 or `HH:MM:SS`)。
  - 参加順は現状通り `joinedAt` 昇順を維持。
  - 参加者ゼロ時の empty state ("参加者を待機中") は残す。
  - count chip ("PARTICIPANTS / N 人") のヘッダは残す。
  - 行の高さは comfortable list 程度 (≒ 36–44px)、`text-[14px]`〜`text-[16px]` 程度の通常本文サイズ。
  - 100 人超でもスクロールできるよう `overflow-y-auto` を許容 (タイル内縦スクロール)。
- テスト更新: 既存 3 ケース (empty / sorted / count chip) を維持しつつ、参加時刻表示の検証を 1 ケース追加。
- 表示時刻は **「最初の参加者を 0 とした相対秒」** を採用する (例: `+00:00`, `+00:12`, `+01:34`)。後述 Decision Log 参照。

Out of scope:

- ViewSwitcher・他の view (Rankings / InfectionGrid 等) の見直し。
- 参加者の kick / rename / detail 表示などの新規アクション。
- `PlayerLite` 型の拡張 (status / score 等の追加列)。今回は既存フィールドのみで構成する。
- 国際化 (現状 ja-only に揃える)。

## Milestones

1. 新レイアウトを `ParticipantListTile.tsx` に実装 (RED: テスト先行)。
2. テストを更新 (既存 3 + 時刻表示 1 件)。
3. typecheck / test 緑、`pnpm -F client dev` で 0 人 / 1 人 / 10 人 / 30 人ケースを目視確認。
4. 必要に応じ Decision Log・Surprises を追記し、`completed/` へ移動。

## Plan of Work

1. **テスト追記** — `ParticipantListTile.test.tsx`:
   - 既存 3 件を新 DOM 構造に合わせて最小更新 (`<ol>` 直下 `<li>` という前提は維持できそうなのでアサーションは大きく変えない予定)。
   - 追加 1 件: 「`joinedAt` の差が秒換算で `+00:12` のように表示される」「最初の参加者は `+00:00`」。
2. **実装** — `ParticipantListTile.tsx`:
   - 外殻 (border / padding / ヘッダ) は据え置き。
   - 中身を以下のような構造に置換:
     ```tsx
     <ol role="list" className="m-0 flex min-h-0 flex-1 flex-col divide-y divide-white/5 overflow-y-auto p-0">
       {sorted.map((p, i) => (
         <li key={p.id} className="grid grid-cols-[3ch_minmax(0,1fr)_auto] items-center gap-3 py-2 text-[14px] font-medium">
           <span className="tabular-nums text-right text-muted-foreground">{i + 1}</span>
           <span className="min-w-0 truncate">{p.name}</span>
           <span className="tabular-nums text-[12px] text-muted-foreground">{formatRelative(p.joinedAt, firstJoinedAt)}</span>
         </li>
       ))}
     </ol>
     ```
   - `formatRelative(ts, base)`: `"+MM:SS"` (60分超は `"+HH:MM:SS"`)。同ファイル内 helper、export しない。
   - `firstJoinedAt = sorted[0]?.joinedAt`。
3. **目視確認** — Dev server で:
   - 0 人 (empty state)
   - 1 人 (`+00:00` 表示)
   - 10 人 (スクリーンショットと同条件)
   - 30 人〜 (スクロール挙動)
4. **テスト & タイプチェック** — `pnpm -F client typecheck && pnpm -F client test --run ParticipantListTile`.

## Progress

- [x] テスト更新 / 追加 (`+00:00` / `+00:12` / `+01:34` / `+01:02:05` の 4 ケース)
- [x] 実装書き換え (grid → divide-y な縦並びリスト + `formatRelative` helper)
- [x] typecheck + 単体テスト (`pnpm -F client typecheck` / `pnpm -F client test --run ParticipantListTile` 緑、全 245 件パス)
- [ ] dev server 目視確認 (ユーザー側で確認)
- [ ] Decision Log / Outcomes 追記し completed/ へ移動

## Verification

- コマンド:
  - `pnpm -F client typecheck`
  - `pnpm -F client test --run ParticipantListTile`
- 受け入れ挙動:
  - 10 人の参加者ビューが画面の上部から密に並び、行間に過剰な余白が出ない。
  - 1 行に `#` / 名前 / 経過時刻 が並ぶ。
  - 名前が長い場合は中央列で truncate される (右端の時刻列は潰れない)。
  - 参加者 0 のとき "参加者を待機中" empty state が出る。
  - 既存の `aria-label="参加者一覧"` と count chip ("N 人") は保持されている。

## Decision Log

- **List vs Table (`<table>`)**: セマンティックには `<table>` も候補だが、(a) ヘッダ行を「`#` / 名前 / 経過」と書くほど情報量が多くない、(b) 既存テストは `<ol>` を前提にしている、(c) Tailwind grid のほうがレスポンシブで扱いやすい、ため **`<ol>` + `grid-cols-[3ch_1fr_auto]` の list 形式** を採用する。後で列が増えるなら `<table>` への移行を再検討。
- **参加時刻の表記**: 絶対時刻 (`HH:MM:SS`) より **相対 (最初の参加者 = 0)** のほうが、ホストが「ゲーム開始までに何分かかったか」を読み取りやすい。`joinedAt` は epoch ms なので差分計算は容易。stage の壁時計と混同しないよう先頭に `+` を付ける。

## Surprises And Discoveries

- 既存テストは `<ol>` + `<li>` を前提にしていたため、grid → flex divide-y への移行でも DOM 構造側のアサーション (`getAllByRole("listitem")`) はそのまま流用できた。`textContent` のインデックスベースのチェックに `+MM:SS` を足すだけで十分だった。
- `formatRelative` は最初 `+MM:SS` だけだったが、テストで 1 時間超 (`+01:02:05`) も検証することで分岐を漏らさず実装できた。
- `firstJoinedAt = sorted[0]?.joinedAt` は `sorted.length === 0` の時に分岐へ入る前に評価されるが、その場合 ol 自体が描画されないため `?? 0` のフォールバックは無害 (実値が使われない)。

## Outcomes And Retrospective

- 変更ファイル:
  - `apps/client/src/components/host/ParticipantListTile.tsx` — grid → flex divide-y 縦並びリスト。`#` / 名前 / `+MM:SS` 経過の 3 列 grid 行に置き換え、`formatRelative` helper を追加。
  - `apps/client/src/components/host/ParticipantListTile.test.tsx` — 既存 3 件は維持、`+00:00` / `+00:12` / `+01:34` / `+01:02:05` の 4 行ケースを 1 件追加。
- 検証: `pnpm -F client typecheck` クリーン、`pnpm -F client test --run` で 26 ファイル / 245 件パス。
- 残: ユーザー側で `pnpm -F client dev` を起動し、0 / 1 / 10 / 30 人ケースの目視確認 → 問題なければ本プランは `completed/` へ移動。
