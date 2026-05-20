import { expect, test } from "@playwright/test";

async function gotoFreshHostRoom(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "ホストを立ち上げる" }).click();
  await page.waitForURL(/\/new$/);
  await page.getByRole("button", { name: /このプリセットで作成|作成中/ }).click();
  await page.waitForURL(/\/r\/[A-Z0-9]+\/host$/, { timeout: 15_000 });
}

test("home → 新規ルーム作成 → ホスト画面が描画され pageerror が出ない", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (err) => pageErrors.push(err));

  await page.goto("/");
  await expect(page.getByText("QR Relay", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "ホストを立ち上げる" }).click();
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByText("プリセットを選ぶ", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /このプリセットで作成|作成中/ }).click();
  await page.waitForURL(/\/r\/[A-Z0-9]+\/host$/, { timeout: 15_000 });

  // RoomLayout 固有 — HOST バッジ + dashboard 内蔵 ViewSwitcher が出ていれば
  // outlet context は機能している。RoomLayout 上部の "表示切替" nav は host では
  // 出さない (HostDashboard の ViewSwitcher が代替) ので tablist で検証する。
  await expect(page.getByText("HOST", { exact: true })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "表示の切替" })).toBeVisible();
  // Host 画面の証拠: HeroTile の WAITING ラベルと Join QR
  await expect(page.getByText("WAITING", { exact: true })).toBeVisible();
  await expect(page.getByTestId("join-qr")).toBeVisible();

  expect(pageErrors, `page errors: ${pageErrors.map((e) => e.message).join("\n")}`).toEqual([]);
});

test("ルームレイアウト main は px-3 と max-w/mx-auto を Tailwind から受け取っている", async ({
  page,
}) => {
  // 横方向 1400px の広めビューポートで max-w がきちんと効くことを担保する。
  // (Tailwind v4 で apps/client/src 配下のクラスがスキャンされなくなると max-w が
  //  消えて main が viewport 全幅になる。実バグはこの形で出た。)
  await page.setViewportSize({ width: 1400, height: 900 });
  await gotoFreshHostRoom(page);

  // RoomLayout が完全にマウントされる (Suspense の fallback <main> が消える) のを待つ。
  await expect(page.getByText("HOST", { exact: true })).toBeVisible();
  const main = page.locator("main", { has: page.getByText("HOST", { exact: true }) });
  await expect(main).toBeVisible();

  // Tailwind v4 で apps/client/src/ がスキャンされないと max-width が "none" になり
  // ビューポート全幅まで広がる。実値で守る。computed margin は "auto" のままでなく
  // 解決済みの px 値が返るので、左右オフセットが等しい (= 中央寄せ) ことで mx-auto を担保。
  const dims = await main.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      paddingLeft: Number.parseFloat(cs.paddingLeft) || 0,
      paddingRight: Number.parseFloat(cs.paddingRight) || 0,
      maxWidth: cs.maxWidth,
      width: rect.width,
      leftOffset: rect.left,
      rightOffset: window.innerWidth - rect.right,
      vp: window.innerWidth,
    };
  });
  expect(dims.paddingLeft, "px-3 left padding").toBeGreaterThanOrEqual(8);
  expect(dims.paddingRight, "px-3 right padding").toBeGreaterThanOrEqual(8);
  expect(dims.maxWidth, "max-w-[720px]/md:max-w-[1200px]").not.toBe("none");
  expect(dims.width, "main は viewport より狭くなければならない").toBeLessThan(dims.vp - 20);
  // mx-auto: 左右オフセットが (浮動小数誤差を許して) 等しい
  expect(Math.abs(dims.leftOffset - dims.rightOffset), "mx-auto による中央寄せ").toBeLessThan(2);
});
