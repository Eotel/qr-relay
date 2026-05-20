import { expect, test } from "@playwright/test";

test("Home: STEP 1 ホスト / STEP 2 プレイヤー / FAQ がレンダリングされる", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("QR Relay", { exact: true })).toBeVisible();
  await expect(page.getByText(/使い方: 1台でホストを立ち上げ/)).toBeVisible();

  // STEP 1 — ホスト
  await expect(page.getByText(/STEP\s*1/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "ホストとして開催" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ホストを立ち上げる" })).toBeVisible();

  // STEP 2 — プレイヤー
  await expect(page.getByText(/STEP\s*2/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "プレイヤーとして参加" })).toBeVisible();
  await expect(page.getByRole("button", { name: "QR コードをスキャン" })).toBeVisible();
  // 「または」divider + コード入力 fallback
  await expect(page.getByText("または", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("ルームコード")).toBeVisible();

  // FAQ 3 セクション
  await expect(page.getByText("このアプリについて", { exact: true })).toBeVisible();
  await expect(page.getByText("使い方とボタンの説明", { exact: true })).toBeVisible();
  await expect(page.getByText("ホーム画面に追加する", { exact: true })).toBeVisible();
});

test("Host 画面には Join QR / ストップウォッチ / スコアボードがあり、in-game scanner は無い", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ホストを立ち上げる" }).click();
  await page.waitForURL(/\/new$/);
  await page.getByRole("button", { name: /このプリセットで作成|作成中/ }).click();
  await page.waitForURL(/\/r\/[A-Z0-9]+\/host$/, { timeout: 15_000 });

  await expect(page.getByText("HOST", { exact: true })).toBeVisible();
  await expect(page.getByText("ROOM CODE", { exact: true })).toBeVisible();
  await expect(page.getByText("STOPWATCH", { exact: true })).toBeVisible();
  // ready 状態のラベル
  await expect(page.getByText("待機中", { exact: true })).toBeVisible();
  await expect(page.getByTestId("join-qr")).toBeVisible();
  await expect(page.getByText("スコアボード", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /スタート/ })).toBeVisible();

  // Host は in-game の QR/カメラ画面を持たない
  expect(await page.locator('section[aria-label="QR と撮影"]').count()).toBe(0);

  const code = page.url().match(/\/r\/([A-Z0-9]+)/)?.[1];
  if (!code) throw new Error("room code not captured");
  const role = await page.evaluate((c) => localStorage.getItem(`qr-relay:role:${c}`), code);
  expect(role).toBe("host");
});

test("Host のスタート→一時停止→再開→リセットでフェーズ表示が切り替わる", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ホストを立ち上げる" }).click();
  await page.waitForURL(/\/new$/);
  await page.getByRole("button", { name: /このプリセットで作成|作成中/ }).click();
  await page.waitForURL(/\/r\/[A-Z0-9]+\/host$/, { timeout: 15_000 });

  await expect(page.getByText("待機中", { exact: true })).toBeVisible();

  // ready → running
  await page.getByRole("button", { name: /^スタート$/ }).click();
  await expect(page.getByText("進行中", { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: /^一時停止$/ })).toBeVisible();

  // running → paused
  await page.getByRole("button", { name: /^一時停止$/ }).click();
  await expect(page.getByText("一時停止中", { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: /^再開$/ })).toBeVisible();

  // paused → running
  await page.getByRole("button", { name: /^再開$/ }).click();
  await expect(page.getByText("進行中", { exact: true })).toBeVisible({ timeout: 5_000 });

  // running → ready via 2-step reset confirm
  await page.getByRole("button", { name: /^リセット$/ }).click();
  await page.getByRole("button", { name: /もう一度押して初期化/ }).click();
  await expect(page.getByText("待機中", { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: /^スタート$/ })).toBeVisible();
});

test("ルーム画面のヘッダにホーム導線があり、押すと / に戻る", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ホストを立ち上げる" }).click();
  await page.waitForURL(/\/new$/);
  await page.getByRole("button", { name: /このプリセットで作成|作成中/ }).click();
  await page.waitForURL(/\/r\/[A-Z0-9]+\/host$/, { timeout: 15_000 });

  const homeLink = page.getByRole("link", { name: "ホームに戻る" });
  await expect(homeLink).toBeVisible();
  await homeLink.click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 5_000 });
  await expect(page.getByText("QR Relay", { exact: true })).toBeVisible();
});

test("Client 画面には in-game QR とカメラがあり、HOST バッジは出ない", async ({ browser }) => {
  // Host を起動して code を取得
  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  await host.goto("/");
  await host.getByRole("button", { name: "ホストを立ち上げる" }).click();
  await host.waitForURL(/\/new$/);
  await host.getByRole("button", { name: /このプリセットで作成|作成中/ }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]+\/host$/, { timeout: 15_000 });
  const code = host.url().match(/\/r\/([A-Z0-9]+)/)?.[1];
  if (!code) throw new Error("room code not captured");

  // Client はコード入力で参加(QR スキャンの fallback パス)
  const clientCtx = await browser.newContext();
  const client = await clientCtx.newPage();
  await client.goto("/");
  await client.getByLabel("ニックネーム").fill("プレイヤー1");
  await client.getByPlaceholder("ルームコード").fill(code);
  await client.getByRole("button", { name: "参加", exact: true }).click();
  await client.waitForURL(new RegExp(`/r/${code}`), { timeout: 15_000 });

  await expect(client.getByText("PLAYER", { exact: true })).toBeVisible();
  // Client は in-game QR + camera セクションを持つ
  await expect(client.locator('section[aria-label="QR と撮影"]')).toBeVisible();
  // Client 画面に HOST バッジは出ない
  expect(await client.getByText("HOST", { exact: true }).count()).toBe(0);
  // role=client が localStorage に記録されている
  const role = await client.evaluate((c) => localStorage.getItem(`qr-relay:role:${c}`), code);
  expect(role).toBe("client");

  await hostCtx.close();
  await clientCtx.close();
});
