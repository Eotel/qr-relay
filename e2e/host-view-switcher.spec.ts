import { expect, test } from "@playwright/test";

test("Host stage dashboard: ViewSwitcher で 5 mode を行き来できる", async ({ page }) => {
  // md+ viewport で host を立ち上げ — HostDashboard が描画される
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "ホストを立ち上げる" }).click();
  await page.waitForURL(/\/new$/);
  await page.getByRole("button", { name: /このプリセットで作成|作成中/ }).click();
  await page.waitForURL(/\/r\/[A-Z0-9]+\/host$/, { timeout: 15_000 });

  // ViewSwitcher は 5 つの tab を持つ
  const switcher = page.getByRole("tablist", { name: "表示の切替" });
  await expect(switcher).toBeVisible();
  await expect(switcher.getByRole("tab")).toHaveCount(5);

  // 初期は overview。HeroTile の WAITING ラベルが見える
  await expect(switcher.getByRole("tab", { name: /概要/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("WAITING", { exact: true })).toBeVisible();

  // ランキング: RankingsTile セクションが visible になる
  await switcher.getByRole("tab", { name: /ランキング/ }).click();
  await expect(page.getByRole("region", { name: "スキャンランキング" })).toBeVisible();

  // 経路: TokenPathTile セクションが visible になる
  await switcher.getByRole("tab", { name: /経路/ }).click();
  await expect(page.getByRole("region", { name: "スキャン経路" })).toBeVisible();

  // 保持: InfectionGridTile セクションが visible になる
  await switcher.getByRole("tab", { name: /保持/ }).click();
  await expect(page.getByRole("region", { name: "保持状況グリッド" })).toBeVisible();

  // 参加者: ParticipantListTile セクションが visible になる
  await switcher.getByRole("tab", { name: /参加者/ }).click();
  await expect(page.getByRole("region", { name: "参加者一覧" })).toBeVisible();

  // 操作 UI (RoomLayout ヘッダの HostHeaderOperator, ADR-0007) は mode に
  // 依存せず常時可視 — リセット / スタートのいずれかが見えていること
  await expect(page.getByRole("button", { name: /^スタート$/ })).toBeVisible();
});

test("Client: RoomLayout 上部の 2-tab は残っており scoreboard へ遷移できる", async ({
  browser,
}) => {
  // Host を立ち上げ code を取る
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const host = await hostCtx.newPage();
  await host.goto("/");
  await host.getByRole("button", { name: "ホストを立ち上げる" }).click();
  await host.waitForURL(/\/new$/);
  await host.getByRole("button", { name: /このプリセットで作成|作成中/ }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]+\/host$/, { timeout: 15_000 });
  const code = host.url().match(/\/r\/([A-Z0-9]+)/)?.[1];
  if (!code) throw new Error("room code not captured");

  // Client (handheld viewport) で join
  const clientCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const client = await clientCtx.newPage();
  await client.goto("/");
  await client.getByLabel("ニックネーム").fill("プレイヤー1");
  await client.getByPlaceholder("ルームコード").fill(code);
  await client.getByRole("button", { name: "参加", exact: true }).click();
  await client.waitForURL(new RegExp(`/r/${code}`), { timeout: 15_000 });

  // Client では 2-tab が見える
  const tabs = client.getByRole("navigation", { name: "表示切替" });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole("link", { name: /ルーム/ })).toBeVisible();
  await expect(tabs.getByRole("link", { name: /スコア/ })).toBeVisible();

  // /scoreboard 遷移できる
  await tabs.getByRole("link", { name: /スコア/ }).click();
  await client.waitForURL(new RegExp(`/r/${code}/scoreboard`));

  await hostCtx.close();
  await clientCtx.close();
});
