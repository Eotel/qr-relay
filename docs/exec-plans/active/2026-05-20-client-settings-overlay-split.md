# Plan: Share icon → Settings icon, overlay 内の順序整理

Owner: miura
Status: Draft
Created: 2026-05-20

## Goal

クライアント画面右下の FAB から開く overlay の "情報構造" を直す。
- アイコンを Share2 → 設定 (gear) に変更する。理由: 開くと **ニックネーム編集**
  が含まれているのに「シェア」だけを意味する Share アイコンは誤解。
- overlay の見出しコピー「ルームをお裾分け」を「ルームをシェア」 (短く・直球) に。
- overlay 内のセクション順を **ニックネーム → ルームをシェア** に並べ替える。
  ニックネームは自分自身の同一性、シェアはそのあとに付随する操作。

## Context

このプランを再開するときに必要なファイル / 既存挙動:

- `apps/client/src/components/client/RoomShareOverlay.tsx:28` — overlay 本体。
  現状: 見出し「ルームをお裾分け」、続いて `<section aria-label="参加 QR">`、
  最後に `<form>` (ニックネーム編集)。
- `apps/client/src/components/client/RoomShareOverlay.tsx:151` — `RoomShareFab`。
  `<Share2>` アイコン + `aria-label="ルームをお裾分け"`。
- `apps/client/src/routes/ClientRoom.tsx:10` — import 名 `RoomShareFab` /
  `RoomShareOverlay`、state 名 `shareOpen`。命名を本来の意味 (settings overlay)
  に寄せるかは Decision Log で判断。
- 関連プラン:
  - `docs/exec-plans/active/2026-05-20-room-share-from-client.md` — 元の導入プラン。
    今回の改修は「導入後の情報設計の見直し」なので、こちらに追記ではなく
    新規プランとして扱う。
  - `docs/exec-plans/active/2026-05-20-client-no-scroll-viewport-lock.md` —
    同時並行で進む viewport ロック。FAB は `position: fixed` なので互いに独立。

ユーザー指摘 (verbatim, 2026-05-20):

> 「ルームをお裾分け」というlabelもいらないのではルームをシェアとかでよくないか.
> あとシェアアイコンから開いたoverlayでニックネーム変えられるの変. 設定アイコンの方がいい.
> ルームしぇあはニックネームの下

## Scope

In scope:

- FAB のアイコンを `Share2` → `Settings` (lucide-react の歯車) に差し替え。
- FAB の `aria-label` を「設定」または「ルーム設定」に変更。
- overlay の見出し文字列を「ルームをお裾分け」→「ルームをシェア」に変更
  …ではなく、overlay 全体は "settings" に名前を寄せるので
  見出しは **「ルーム設定」** あるいは **「設定」**。
  内側のシェアセクションのラベルとして「ルームをシェア」を使う。
- overlay 内のレイアウト順を入れ替え:
  1. ニックネーム編集 (form)
  2. ルームをシェア (QR + 参加コード + URL)
- 既存テスト (`apps/client/src/lib/join-url.test.ts` 等) のラベル assert が
  あれば追従更新。
- (任意) コンポーネント / state 名のリネーム: `RoomShareFab` → `RoomSettingsFab`,
  `RoomShareOverlay` → `RoomSettingsOverlay`, `shareOpen` → `settingsOpen`。
  → 既定案: **リネームする** (情報設計と一致した名前にしないと将来の読者が再度混乱)。

Out of scope:

- ニックネーム編集の挙動そのもの (collision resolution、save 後の挙動) は不変。
- 参加 QR / URL の生成ロジックは不変。
- 別画面 (host, scoreboard, home) のアイコン / コピー。
- 「シェア」と「設定」を別の 2 つのアイコンに分離する案は採用しない
  (ユーザー指示は overlay を 1 つにまとめる方向)。

## Milestones

1. **コピーとアイコンを決める**: 見出し「ルーム設定」/ FAB aria-label「設定」/
   内側 share section ラベル「ルームをシェア」 (要 Decision Log)。
2. **ファイルとシンボルをリネーム** (既定案採用時): `RoomShareOverlay.tsx` →
   `RoomSettingsOverlay.tsx`、export 名・props・import 元 (`ClientRoom.tsx`) を
   一括更新。
3. **overlay の中身を並べ替え**: `<section aria-label="参加 QR">` と `<form>` の
   レンダリング順を入れ替え。`aria-label` も「ルームをシェア」へ揃える。
   `aria-labelledby={labelId}` は新しい見出しに連動するだけなので変更不要。
4. **FAB アイコン差し替え**: `Share2` → `Settings` を import、JSX 差し替え、
   `aria-label="設定"`。タップ領域 / 配色 / shadow は不変。
5. **テスト追加・更新**:
   - overlay の DOM 順序: 最初に input[name=nickname 相当] が現れ、その後に QR が出る。
   - aria-label / heading 文字列の更新を反映。
   - smoke: FAB クリックで overlay が開き、Settings 見出しが見える。
6. **検証**: typecheck / test / 該当 e2e。

## Progress

- [x] M1 コピーとアイコン決定: `Settings` (歯車) / 見出し「ルーム設定」 / 内側 section「ルームをシェア」 / FAB aria-label「ルーム設定」
- [x] M2 ファイル + シンボルリネーム: `RoomShareOverlay.tsx` → `RoomSettingsOverlay.tsx`, `RoomShareFab/Overlay` → `RoomSettingsFab/Overlay`, ClientRoom の state `shareOpen` → `settingsOpen`
- [x] M3 overlay 内の順序入れ替え: form (nickname) → section (room share)
- [x] M4 FAB アイコン差し替え: `Share2` → `Settings`
- [x] M5 テスト追加: ClientRoom.test.tsx に "FAB aria=ルーム設定" と "DOM 順は nickname → join QR" を追加。e2e `room-share-from-client.spec.ts` のラベルを「ルーム設定」に更新。
- [x] M6 typecheck (✅) / test (✅ 116 件) / lint (本 PR 由来のエラーなし)

## Surprises And Discoveries

- (未記入)

## Decision Log

- **アイコン**: lucide-react の `Settings` (歯車) を採用。`SlidersHorizontal` も
  候補だが、Settings の方が一般化された "設定" の記号として読みやすい。
- **見出しコピー**: 「ルーム設定」を採用。「設定」だけだと "アプリ全体設定"
  と誤読されうる。スコープがルーム文脈であることを明示する。
- **シンボルリネーム**: する。`RoomShareFab` のまま中身が settings になると、
  半年後に grep した人が混乱する。grep 一発で追える今のうちに直す。
- **シェアと設定の分離案を不採用**: ユーザー指示は「シェアはニックネームの下」
  =同じ overlay に同居。FAB を 2 つ並べる UI は handheld の縦領域を奪う。
  (viewport ロック plan とも整合。)
- **「ルームをお裾分け」**: PRODUCT.md §"voice / 文体" のトーン (温度感の日本語)
  と合致するコピーではあったが、ユーザーが明示的に「シェアでよくないか」と
  指摘したため採用しない。

## Verification

- コマンド:
  - `pnpm -r typecheck`
  - `pnpm -r test`
  - 該当 e2e (もしあれば): `e2e/room-share-from-client.spec.ts` を更新して再実行。
- 受け入れ挙動:
  - 右下 FAB の見た目が歯車になり、`aria-label="設定"` を持つ。
  - クリックで overlay が開き、見出しが「ルーム設定」。
  - overlay 内、最初にニックネーム編集 form、その下にルームをシェア
    (QR + 参加コード + URL) が並ぶ。
  - キャンセル / 保存 / Esc / 背景タップでの閉じる挙動は不変。
  - 既存の rename 動作 (collision resolve、socket 再接続) は不変。

## Outcomes And Retrospective

- FAB を歯車 (`Settings` from lucide-react) に変更、aria-label を「ルーム設定」に。
  これで「クリックすると nickname も変えられる」という挙動と icon が一致した。
- overlay 内: ニックネーム → ルームをシェア の順。Save/Cancel は rename にだけ
  紐づき、QR section は read-only。
- ファイル / シンボル / state 名を全部 Settings 系に揃えたので、grep 一発で意図が
  追えるようになった (将来の読者の混乱を予防)。
- e2e `room-share-from-client.spec.ts` のラベル assertion も合わせて更新済み。
