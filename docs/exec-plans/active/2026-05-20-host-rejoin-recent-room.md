# Plan: ホスト直近ルームへの復帰

Owner: miura
Status: Draft
Created: 2026-05-20

## Goal

ホストが誤って画面を離脱した (タブを閉じた / 戻るボタンで Home に戻った / PWA を再起動した)
場合に、Home から「直前まで開いていたルームにホストとして再参加」できるようにする。
URL や QR を控えていなくても、同一端末からなら 1 タップで復帰できる状態を作る。

## Context

### サーバ側 — 既に再参加に対応している

`apps/server/src/room-domain.ts:124-129` の `reduceJoin`:

```ts
if (input.role === "host") {
  const hostId = stored.meta.hostId ?? input.playerId;
  const meta: RoomMeta = { ...stored.meta, hostId, lastActivityAt: now };
  return { ...stored, meta };
}
```

最初に `role=host` で join した端末の `playerId` が `hostId` として保存され、以後同じ
`playerId` で `role=host` join しても初回の `hostId` が維持される。`playerId` は
`localStorage` の `qr-relay:player-id` で永続化されているので、同一端末からの復帰は
**サーバ側は無修正で**ホスト権限を取り戻せる。

### クライアント側 — 既にロール永続化はある

`apps/client/src/lib/identity.ts:1-22` で `qr-relay:role:CODE` というキーに per-room
で role を保存している。`RoomLayout` (`apps/client/src/routes/RoomLayout.tsx:51`) は
`getRole(code) ?? acceptInviteRole(code)` で URL ではなく localStorage を権威として
ホスト/クライアントを決める。

→ つまり `/r/CODE` に直接ナビゲートすれば**そのままホストとして再参加できる**。
唯一足りないのは「どのコードに復帰すべきか」を Home が知る手段。

### 何が無い

- Home から「直近の host ルーム」を発見する導線が無い。
- `qr-relay:last-host-code` 相当のキーが無いので、code をユーザに記憶させない限り
  Home → 復帰ができない。

### 関連コード

- `apps/client/src/lib/identity.ts` — localStorage の role/identity 永続化
- `apps/client/src/routes/Home.tsx` — 復帰 CTA を載せる場所
- `apps/client/src/routes/NewRoom.tsx:44-60` — `createRoom` 成功時に host claim を置く場所
- `apps/client/src/routes/RoomLayout.tsx:71-88` — host として join が成功するタイミング
- `apps/client/src/routes/RoomClosed.tsx` — ルーム終了時に「直近 host」記録を破棄すべき場所
- `apps/client/src/lib/api.ts` — `getRoom(code)` で生存確認できる

### 関連プラン

- `docs/exec-plans/active/2026-05-20-room-inactivity-timer.md` 関連: 一定時間操作なしで
  サーバが自動 close するため、復帰前に生存確認が必要。

## Scope

In scope:

- localStorage に「直近で host として開いたルームコード」を 1 件だけ記録する仕組み。
- Home に「前回のホストルームに戻る」CTA を、記録がある時のみ表示。
- CTA タップ時にサーバへ生存確認 (`getRoom`) → 生きていれば `/r/CODE` へ navigate、
  404 なら CTA から消す + localStorage を掃除。
- ルーム終了 (`RoomClosed`) で直近 host 記録を破棄。
- ユニットテスト (identity の新ヘルパ) と Home の動作テスト (CTA 表示・タップ挙動)。

Out of scope:

- 複数ルームの履歴 (直近 1 件のみ。普段の使い方が "ひとつの会場 = ひとつのルーム" なため)。
- client 側の「直近ルームに復帰」(タスク本文で host 限定が明示されている)。
- サーバ側の認証強化 (hostId 引き継ぎの仕組みは現状ベスト・エフォートのままで足りる)。
- 別端末からの host 復帰 (`playerId` が違うので、現状の同等 hostId 保証は得られない)。
- 復帰 CTA に最後にホストした時刻 / プリセット名などのメタ表示。まずは code のみで足りる。

## Milestones

1. localStorage ヘルパ追加: `getRecentHostCode` / `setRecentHostCode` /
   `clearRecentHostCode`。テスト先行。
2. `NewRoom` で `createRoom` 成功直後に `setRecentHostCode(code)` を呼ぶ。
   `RoomClosed` で `clearRecentHostCode(code)` を呼ぶ (誤って別ルームの記録を消さない
   よう code 一致確認付き)。
3. Home に復帰 CTA を追加。
   - 初回マウントで `getRecentHostCode()` を読み、あれば軽量に CTA を表示。
   - タップ時に `getRoom(code)` で生存確認 → 200 なら `setRole(code, "host")` を
     念のため再保証してから `navigate('/r/CODE')`。404 (またはそれ以外の失敗) なら
     `clearRecentHostCode(code)` で記録を消し、CTA を非表示にしてエラー文を一瞬出す。
4. テスト追加: identity のユニット + Home の CTA 表示/挙動。
5. 既存テスト (`apps/client/src/routes.test.tsx`, `identity.test.ts`) が壊れていない
   ことを `pnpm -r typecheck` / `pnpm -r test` で確認。
6. 動作確認: dev server で host → タブを閉じる → Home → 復帰 CTA → ルーム復帰、
   inactivity timer で close 後の復帰失敗 (CTA が消える) も確認。

## Progress

- [x] M1: identity ヘルパ + テスト (`getRecentHostCode` / `setRecentHostCode` /
      `clearRecentHostCode` を `apps/client/src/lib/identity.ts` に追加。
      `qr-relay:last-host-code` キーで永続化。6 ケース追加で 22 tests pass)
- [x] M2: NewRoom / RoomClosed 連携 (NewRoom `onCreate` で `setRecentHostCode`、
      RoomClosed の useEffect で `clearRecentHostCode(code)` を呼ぶ — code 一致確認は
      ヘルパ側で実施するので呼び出し側はシンプル)
- [x] M3: Home の CTA (`AppTitle` 直下に "前回のホストルーム" Card を出し、
      タップで `getRoom` 生存確認 → `setRole` 念押し → `navigate`/r/CODE`。
      404 系は `clearRecentHostCode` + CTA 消去 + 一行エラー)
- [~] M4: Home 動作テスト (追加せず — 既存 Home テストは無く、`AskUser` 系 UI を
      jsdom で組むコストに見合う複雑さでもない。`identity` 側で挙動を担保)
- [x] M5: typecheck + test 全グリーン (`pnpm -r typecheck` / `pnpm -r test` 完走)
- [ ] M6: 手動動作確認 (dev server で golden / closed パスを確認)

## Surprises And Discoveries

- `clearRecentHostCode(code?)` を「code 一致時のみ消す」セマンティクスにすると、
  RoomClosed 側のコードが分岐レスで済む (`code 一致を確認してから clear` ロジックを
  ヘルパに閉じ込められた)。プランでは呼び出し側に責任を持たせる案だったが、
  ヘルパ側の方が抽象化として綺麗。
- Home の rejoin CTA を `AppTitle` 直下に置くと、新規訪問の "ホストを立ち上げる"
  CTA より目立つ位置になるが、目に入る情報量はむしろ少ない (1 行 + コード + ボタン)
  ので、初訪問の動線を阻害しないと判断。
- Home のユニットテストは敢えて追加しなかった。`identity` の単体テストが薄く
  ない (6 ケース) ことと、`getRoom` をモックして CTA フローを通すコストが、
  得られる回帰検知の価値に見合わない判断。手動動作確認 (M6) で代替。

## Decision Log

- **直近 host コードを 1 件だけ保持する**:
  ひとつの会場 = ひとつのルーム という使い方が中心 (PRODUCT.md §Users)。履歴 UI を
  作ると Home のミニマル感が崩れ、time-to-play を阻害する。リストではなく単一エント
  リで割り切る。
- **`qr-relay:last-host-code` のような単純文字列キーで保存する**:
  既存 (`qr-relay:role:CODE`, `qr-relay:player-id`, `qr-relay:player-name`) の命名
  慣習に合わせる。JSON や timestamp 付きにする必要性は今のところ無い。
- **生存確認は `getRoom` を使う**:
  Worker cold start (>3s) を許容する PRODUCT 既定 (§Accessibility) と整合。短い
  loading でいい。`HEAD /api/rooms/CODE` のような新エンドポイントは要らない。
- **CTA をタップした後にだけ生存確認する**:
  Home マウント時に毎回 GET を投げると、ホストでない端末でも無駄な通信が走る上、
  オフライン時の UX が悪化する。タップしたタイミングだけで十分。
- **`RoomClosed` で `clearRecentHostCode(code)` を呼ぶときは code 一致を確認**:
  ホストが復帰失敗で `/closed` を見た瞬間に、別ルームを始めた直後に開きっぱなしの
  古いタブが走ると古い code を消してしまう、というレース回避。

## Verification

- コマンド:
  - `pnpm -r typecheck`
  - `pnpm -r test`
  - `pnpm --filter @qr-relay/client test -- identity Home`
- 受け入れ挙動:
  - ホストが `/new` から部屋を作る → `qr-relay:last-host-code` に code が保存される。
  - そのタブを閉じ、再度 Home を開くと「前回のホストルームに戻る (CODE)」CTA が表示。
  - CTA タップ → `/r/CODE` に遷移し、`HostRoom` (ホスト UI) が描画される。
  - サーバ側のルームが (inactivity timer などで) 既に閉じている場合、CTA タップで
    一瞬「ルームは既に終了しています」を表示し、CTA が以後消える。
  - 同じ端末で新しい部屋を立てると、CTA の code が新しい方に更新される。
  - 別の端末 / 別の `playerId` で CTA を踏んでも `host` として復帰できる前提は
    無い (この場合はサーバ側で `hostId` が一致せず、client 扱いの可能性) — これは
    Out of scope として明示。

## Outcomes And Retrospective

(`completed/` に移す直前に書く)
