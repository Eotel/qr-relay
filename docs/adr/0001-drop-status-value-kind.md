# ADR-0001: `status` value kind を廃止し `token` に統合

**Date**: 2026-05-20
**Status**: accepted
**Deciders**: miura (owner), Claude

## Context

`packages/handlers/src/relay-rule.ts` の `value` 軸は `token` / `score` / `status` の 3 種類
だが、`status` は実質「ラベル付きの `token`」でしかない。具体的には:

- 「鬼ごっこ」「鬼交代」「感染」の 3 プリセットが `status` を使うが、いずれも「1 人 (または
  複数) が特別な状態を持ち、scan で伝播する」だけのモデルで、`token` で同形に書ける。
- engine 内で `set-status` / `swap` / `sourceStatus` / `sinkStatus` /
  `requireSourceHas: string` の分岐があるが、`status` を消すとこれらは全て不要になる。
- `metrics` で `status` のときだけ「safe: N-1, oni: 1」のように **非保持者まで人数表示** する
  が、UX として「N-1 人が safe」という情報に意味がない (誰が鬼かさえ分かれば良い)。

このまま放置するとプリセット追加時に `token` か `status` か迷う/間違える原因になり、
engine 側のテスト分岐 (`relay.test.ts` 19 ケースの約 8 ケース) も無駄に重い。

関連: [../design-docs/core-beliefs.md §1](../design-docs/core-beliefs.md#1-統合エンジン--プリセット-vs-別個-handler)
(直交軸で表現する原則を守る → 同じ意味の軸が 2 本ある状態を解消)

## Decision

`ValueSlot.status` および関連する `onScan` / `constraints` のすべての status 系オプションを
削除する。`status` で表していたプリセットは `token` モデルで書き直す。

具体的には:

- `value.kind` を `token` / `score` の 2 union に縮小
- `onScan.source` / `onScan.sink` から `"set-status"` を削除
- `onScan.swap` / `onScan.sourceStatus` / `onScan.sinkStatus` を削除
- `constraints.requireSourceHas` / `requireSinkLacks` を `boolean` のみに縮小
- 「鬼ごっこ」「鬼交代」プリセットは **「バトン」と等価**として削除 (運用上の言い換えにすぎない)
- 「感染」プリセットは `token, holders: one, onScan: { source: keep, sink: gain }` で再定義
  (保持者が増えていく挙動)

## Alternatives Considered

### Alternative 1: 現状維持
- **Pros**: 移行コスト 0
- **Cons**: プリセット名と挙動の関係が分かりにくいまま (「バトン」「鬼交代」「鬼ごっこ」が
  engine 上は同一)、テスト/型分岐が無駄に多い
- **Why not**: 設計の歪みが利用者と将来の自分にコストを払い続けさせる

### Alternative 2: `status` だけ残し `token` を削る
- **Pros**: status の方が表現力が高い (任意ラベル)
- **Cons**: バトン系で「持っていない状態」を `"none"` などの sentinel ラベルで表現する必要が
  あり、保持者だけを見たい場面でも全員 slot を作る必要がある。`metrics` も人数集計に
  寄ってしまい、「誰が持っているか」を UI で示すのが面倒
- **Why not**: 削減後に残したい挙動 (バトン / 感染) は本質的に boolean なので、`token` の
  方が直球で安い

### Alternative 3: `status` を残しつつ「ラベル付き token」として再定義
- **Pros**: 表現力を維持しながら整理できる
- **Cons**: 結局「ラベル付き token」は token + 表示ラベル = view 層の話で、engine の
  軸として持つ意味が薄い
- **Why not**: engine の責任を増やす方向。ラベルは UI 層で `tokenLabel: string` 程度を
  config に足せば済む

## Consequences

### Positive
- `relay-rule.ts` の `ValueSlot` / `onScan` 列挙が縮小し、`relay.ts` の `applyChange` /
  `slotHasStatus` の分岐がほぼ半分になる
- プリセットが 9 → 5 に減り、「同じ動きを別名で売る」を回避できる
- `relay.test.ts` の status 系テストが消え、テスト本数と読みづらさが減る
- 新プリセット追加時に `value` 軸の選択肢が `token` / `score` の 2 択になり迷いがない

### Negative
- 「鬼ごっこ」「鬼交代」プリセットを期待しているプレイヤー (主に MVP 想定読者) は、UI 上で
  これらが消えていることに気付く。`docs/product-specs/presets.md` で「鬼ごっこ = バトンの
  別名」と説明する必要がある
- 将来「3 つ以上の状態を持つゲーム」 (例: 鬼 / 感染中 / 治癒済み) を入れたくなったら、
  `status` を再導入するか新 handler を作る必要がある

### Risks
- **WS state 互換性**: 既にプレイ中のルームは `RoomDurableObject` の storage に
  `ValueSlot.status` を含む state を持っている可能性がある。MVP 段階でホットデプロイ中の
  ルームは無視 (壊れて良い) する。本番デプロイ後に行う場合は ADR を accept する前に
  migration 戦略を別 ADR に切り出す
- **混乱**: 「鬼ごっこ」「鬼交代」が消えたことに気付かないとプリセット名でぐぐっても
  出ないので、README / presets.md / Home FAQ で言及する
