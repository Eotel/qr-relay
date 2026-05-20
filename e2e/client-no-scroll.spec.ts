import { expect, test } from "@playwright/test";

/**
 * Client room must NOT trigger document-level scroll on a phone-sized
 * viewport. QR + camera are the gameplay surface; if either drops below
 * the fold (= the player has to scroll) the relay loop breaks at the
 * exact moment the player tries to use it. This guards the contract on
 * portrait and landscape phone sizes.
 *
 * Strategy: spin up host → start the room → spin up client → assert
 * scrollHeight === innerHeight on <html> *and* <main>.
 */

const PORTRAIT = { width: 393, height: 852 } as const; // iPhone 14 Pro-ish
const LANDSCAPE = { width: 852, height: 393 } as const;

async function bootClientAtSize(
  browser: import("@playwright/test").Browser,
  size: { width: number; height: number },
) {
  // Host: create room, start it.
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
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

  // Client at the requested phone viewport.
  const clientCtx = await browser.newContext({ viewport: size });
  const client = await clientCtx.newPage();
  await client.goto("/");
  await client.getByLabel("ニックネーム").fill("プレイヤー");
  await client.getByPlaceholder("ルームコード").fill(code);
  await client.getByRole("button", { name: "参加", exact: true }).click();
  await client.waitForURL(new RegExp(`/r/${code}`), { timeout: 15_000 });
  // Wait until the QR tile or camera fallback is on screen — the page is
  // settled then. The settings FAB is the cheapest stable signal: it lives
  // in ClientRoom's render tree and only mounts after the layout commits.
  await expect(client.getByRole("button", { name: "ルーム設定" })).toBeVisible();
  return { hostCtx, clientCtx, client };
}

test("portrait phone: client room has no document or main scroll", async ({ browser }) => {
  const { hostCtx, clientCtx, client } = await bootClientAtSize(browser, PORTRAIT);
  const sizes = await client.evaluate(() => {
    const main = document.querySelector("main");
    return {
      docHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      mainScroll: main?.scrollHeight ?? 0,
      mainClient: main?.clientHeight ?? 0,
    };
  });
  // Document never overflows the viewport.
  expect(sizes.docHeight).toBeLessThanOrEqual(sizes.innerHeight);
  // The <main> itself is height-locked: its scrollHeight cannot exceed its
  // clientHeight, otherwise the play tiles would be cropped behind a scroll.
  expect(sizes.mainScroll).toBeLessThanOrEqual(sizes.mainClient);
  await hostCtx.close();
  await clientCtx.close();
});

test("landscape phone: client room has no document or main scroll", async ({ browser }) => {
  const { hostCtx, clientCtx, client } = await bootClientAtSize(browser, LANDSCAPE);
  const sizes = await client.evaluate(() => {
    const main = document.querySelector("main");
    return {
      docHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      mainScroll: main?.scrollHeight ?? 0,
      mainClient: main?.clientHeight ?? 0,
    };
  });
  expect(sizes.docHeight).toBeLessThanOrEqual(sizes.innerHeight);
  expect(sizes.mainScroll).toBeLessThanOrEqual(sizes.mainClient);
  await hostCtx.close();
  await clientCtx.close();
});
