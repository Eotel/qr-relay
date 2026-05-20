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
  await page.getByRole("button", { name: "ホストを立ち上げる" }).click();
  await page.waitForURL(/\/new$/);
  await page.getByRole("button", { name: /このプリセットで作成|作成中/ }).click();
  await page.waitForURL(/\/r\/[A-Z0-9]+\/host$/, { timeout: 15_000 });

  const stored = await page.evaluate(() => localStorage.getItem("qr-relay:player-name"));
  expect(stored).toBe("ホスト太郎");
});

test("同名で別ブラウザから参加すると (2) が付与される", async ({ browser }) => {
  // ホスト: ルーム作成 → そのまま Host 画面へ
  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  await host.goto("/");
  await host.getByLabel("ニックネーム").fill("太郎");
  await host.getByRole("button", { name: "ホストを立ち上げる" }).click();
  await host.waitForURL(/\/new$/);
  await host.getByRole("button", { name: /このプリセットで作成|作成中/ }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]+\/host$/, { timeout: 15_000 });
  const url = host.url();
  const code = url.match(/\/r\/([A-Z0-9]+)/)?.[1];
  if (!code) throw new Error("room code not captured");

  // クライアント A (同名): 同じ部屋に参加して別の人として登録される
  // 衝突解決は client 同士に限定 (host は players[] に居ないため衝突相手にならない)。
  const aCtx = await browser.newContext();
  const a = await aCtx.newPage();
  await a.goto("/");
  await a.getByLabel("ニックネーム").fill("太郎");
  await a.getByPlaceholder("ルームコード").fill(code);
  await a.getByRole("button", { name: "参加", exact: true }).click();
  await a.waitForURL(new RegExp(`/r/${code}`), { timeout: 15_000 });

  // クライアント B (同名): 既に A が "太郎" を取っているので (2) が付与される
  const bCtx = await browser.newContext();
  const b = await bCtx.newPage();
  await b.goto("/");
  await b.getByLabel("ニックネーム").fill("太郎");
  await b.getByPlaceholder("ルームコード").fill(code);
  await b.getByRole("button", { name: "参加", exact: true }).click();
  await b.waitForURL(new RegExp(`/r/${code}`), { timeout: 15_000 });

  await expect
    .poll(async () => b.evaluate(() => localStorage.getItem("qr-relay:player-name")), {
      timeout: 5_000,
    })
    .toBe("太郎(2)");

  await hostCtx.close();
  await aCtx.close();
  await bCtx.close();
});
