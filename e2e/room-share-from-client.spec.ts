import { expect, test } from "@playwright/test";

test("client が share overlay から取った QR で別の client が join できる", async ({ browser }) => {
  // Host: ルーム作成 → スタート (running 状態にする)
  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  await host.goto("/");
  await host.getByLabel("ニックネーム").fill("ホスト");
  await host.getByRole("button", { name: "ホストを立ち上げる" }).click();
  await host.waitForURL(/\/new$/);
  await host.getByRole("button", { name: /このプリセットで作成|作成中/ }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]+$/, { timeout: 15_000 });
  const code = host.url().match(/\/r\/([A-Z0-9]+)/)?.[1];
  if (!code) throw new Error("room code not captured");
  await host.getByRole("button", { name: /^スタート$/ }).click();
  await expect(host.getByText("進行中", { exact: true })).toBeVisible({ timeout: 5_000 });

  // Client A: コード入力で参加
  const aCtx = await browser.newContext();
  const a = await aCtx.newPage();
  await a.goto("/");
  await a.getByLabel("ニックネーム").fill("クライアントA");
  await a.getByPlaceholder("ルームコード").fill(code);
  await a.getByRole("button", { name: "参加", exact: true }).click();
  await a.waitForURL(new RegExp(`/r/${code}`), { timeout: 15_000 });

  // Client A: 設定 FAB → overlay を開く → 招待 QR の URL を回収する
  await a.getByRole("button", { name: "ルーム設定" }).click();
  const inviteQr = a.getByRole("dialog", { name: "ルーム設定" }).getByTestId("join-qr");
  await expect(inviteQr).toBeVisible();
  const inviteUrl = await inviteQr.getAttribute("data-join-url");
  if (!inviteUrl) throw new Error("invite url not captured from share overlay");

  // Client B: A が共有した URL を直接踏んで join (host を奪わず client になる)
  const bCtx = await browser.newContext();
  const b = await bCtx.newPage();
  await b.goto(inviteUrl);
  await b.waitForURL(new RegExp(`/r/${code}`), { timeout: 15_000 });
  await expect(b.getByText("PLAYER", { exact: true })).toBeVisible();
  const bRole = await b.evaluate((c) => localStorage.getItem(`qr-relay:role:${c}`), code);
  expect(bRole).toBe("client");

  // host 画面に A の名前が現れる (handheld と stage-dashboard どちらでも textContent に出る)。
  // ws snapshot は数百 ms 遅れるので poll で待つ。
  await expect
    .poll(async () => (await host.locator("main").textContent()) ?? "", { timeout: 8_000 })
    .toContain("クライアントA");

  await hostCtx.close();
  await aCtx.close();
  await bCtx.close();
});
