import { expect, test } from "@playwright/test";

test("Home: ニックネーム入力欄が表示され、入力が localStorage に保存される", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel("ニックネーム");
  await expect(input).toBeVisible();
  await input.fill("太郎");
  const stored = await page.evaluate(() => localStorage.getItem("qr-relay:player-name"));
  expect(stored).toBe("太郎");
});

test("Home → 新規ルーム作成: 入力した名前がそのままホストとして使われる", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("ニックネーム").fill("ホスト太郎");
  await page.getByRole("button", { name: "ルームを作成" }).click();
  await page.waitForURL(/\/new$/);
  await page.getByRole("button", { name: /このプリセットで作成|作成中/ }).click();
  await page.waitForURL(/\/r\/[A-Z0-9]+$/, { timeout: 15_000 });

  const stored = await page.evaluate(() => localStorage.getItem("qr-relay:player-name"));
  expect(stored).toBe("ホスト太郎");
});

test("同名で別ブラウザから参加すると (2) が付与される", async ({ browser }) => {
  // ホスト
  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  await host.goto("/");
  await host.getByLabel("ニックネーム").fill("太郎");
  await host.getByRole("button", { name: "ルームを作成" }).click();
  await host.waitForURL(/\/new$/);
  await host.getByRole("button", { name: /このプリセットで作成|作成中/ }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]+$/, { timeout: 15_000 });
  const url = host.url();
  const code = url.match(/\/r\/([A-Z0-9]+)/)?.[1];
  if (!code) throw new Error("room code not captured");

  // 別ブラウザコンテキストから同名で参加
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto("/");
  await guest.getByLabel("ニックネーム").fill("太郎");
  await guest.getByLabel("ルームコード").fill(code);
  await guest.getByRole("button", { name: "参加する" }).click();
  await guest.waitForURL(new RegExp(`/r/${code}`), { timeout: 15_000 });

  await expect
    .poll(async () => guest.evaluate(() => localStorage.getItem("qr-relay:player-name")), {
      timeout: 5_000,
    })
    .toBe("太郎(2)");

  await hostCtx.close();
  await guestCtx.close();
});
