# ADR-0002: 終了条件を engine から外し manual + 外部ストップウォッチに移行

**Date**: 2026-05-20
**Status**: accepted
**Deciders**: miura (owner), Claude

## Context

現在の `ScanRule.end` は 5 種類の終了条件 (`target` / `all-have-status` / `only-one-left` /
`timer-ms` / `manual`) を engine 内に持つ。これにより `relayHandler.isOver` で「達成 /
タイムオーバー」を判定し、`RoomDurableObject` が自動で `endedAt` を埋めるフローになっている。

しかし運用してみると:

- `timer-ms` のためだけに engine が「経過時間」と「now」を持ち回る必要がある (pure function
  に `now` を渡し続けるノイズ源)
- `all-have-status` / `only-one-left` は ADR-0001 で `status` を削るので不要になる
- `target` (10 人達成など) はプレイヤーが見て判断できるので、engine が自動終了する必然性が低い。
  むしろ「目標到達」を画面表示し、運用が「ハイ終了」と言える方が場の流れに合う
- 「ホットポテト」「ノルマ」のように engine の終了条件に頼っていた 2 プリセットは、運用で
  「全員見える加算ストップウォッチ＋手動 stop」に置き換えれば、ゲーム種類を増やさず多様な
  運用が可能になる

要するに **engine は「1 scan でスロット 2 個をどう変えるか」だけに責任を絞り、ゲームの
始まり / 一時停止 / 終わりはゲーム制御層に切り出す** のが筋。

関連: [../design-docs/core-beliefs.md §2](../design-docs/core-beliefs.md#2-handler-は-server--client-両方で動く-pure-function)
(handler の pure 性を強める)、ADR-0003 (フェーズ状態機械)

## Decision

`ScanRule.end` を **完全に削除** する。終了は常に host による明示操作 (`reset` / フェーズ
状態機械の `ready` 遷移、ADR-0003 参照) で行う。

代わりに、ゲーム制御層 (Durable Object + client UI) で:

- 加算ストップウォッチをホスト画面に常時表示
- `ready` / `start` ⇄ `pause` / `resume` の状態機械を導入 (ADR-0003)
- `paused` 中は server 側で scan を no-op として弾く

`relayHandler.isOver` 自体は interface に残すが、デフォルト実装は「`endedAt !== null` を
返すだけ」になる。

## Alternatives Considered

### Alternative 1: 現状維持
- **Pros**: 既存ロジックを変えなくて良い
- **Cons**: pure function に `now` を流し続ける必要があり、テストも `now` を渡す noise が
  続く。プリセットが「ホットポテト = バトン + 60s タイマー」のためだけに 1 行 entry を持つ
- **Why not**: 終了判定はゲームの**外**の文脈 (時計、判定者) の責任である方が自然

### Alternative 2: `timer-ms` だけ残す
- **Pros**: ホットポテトのような時限ゲームは内蔵タイマーが直感的
- **Cons**: 「タイマー切れた瞬間に持っていた人が負け」を演出するなら、server が ms
  単位で判定できる必要がある (host 端末が止めたタイミングではなく)。それを真面目に
  やると server tick が要る
- **Why not**: 60 秒タイマーを engine が握る価値より、外側のストップウォッチで運用判断
  する自由度の方が高い (例: 「あと 10 秒で止めるね」と司会が言える)

### Alternative 3: 終了条件を engine 外の独立 module (`game-control`) に出す
- **Pros**: 自動終了を残しつつ engine の純度を上げる
- **Cons**: 結局「終了条件 evaluator」を別ファイルに置くだけで複雑さは移動しただけ
- **Why not**: そもそも自動終了を捨てれば移動先の module も不要

## Consequences

### Positive
- `relay.ts` の `isOver` 大部分が削除でき、`relay-rule.ts` の `end` union 5 種類が
  なくなる
- handler テストから時間依存が消える (`now` を渡す必要はあるが、固定値で十分)
- 「ホットポテト」「ノルマ」プリセットを削除でき、プリセットが 7 → 5 に。説明書きで「バトン
  + ストップウォッチで遊ぶ」「コレクション + 目標到達したら手動 stop」と運用案内する
- 司会者の裁量が増える (途中で延長 / 短縮しやすい)

### Negative
- 「タイマー切れで自動終了」というドラマ的な演出は engine ではなく運用に依存する。司会が
  止め忘れると延々続く
- `docs/product-specs/presets.md` を書き直す必要がある (「ホットポテト」「ノルマ」記述を
  「バトン」「コレクション」の運用例に統合)

### Risks
- **運用負担**: ホストが stop を押し忘れたまま「終わった」と勘違いするケース。これは
  ADR-0003 の「常時見える stop ボタン + 加算カウンタ」の UI で軽減
- **タイマー精度の期待**: 「60 秒ぴったり」を期待されると、ストップウォッチを目視で
  止める方式とのギャップが出る。説明書きで「司会が止めるタイミングで終了」と明示
