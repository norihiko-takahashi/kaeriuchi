import { expect, type Page, test } from "@playwright/test";
import {
  expectNoA11yViolations,
  failOnCspViolations,
  onboard,
  PARENT_PIN,
  ready,
  typePin,
} from "./helpers";

failOnCspViolations();

test("初めて使うときの流れで、ホームまで進める", async ({ page }) => {
  await onboard(page);

  await expect(page).toHaveURL(/\/install$/);
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "あとで" }).click();

  await expect(page).toHaveURL(/\/profiles$/);
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: /ほのおのきつね/ }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expectNoA11yViolations(page);
  await expect(
    page.getByRole("heading", { name: /ほのおのきつね/ }),
  ).toBeVisible();
  // 低学年モード：小2は「今日」の「今」を習っているので、ふりがなは付かない
  await expect(page.locator("html")).toHaveAttribute("data-mode", "lower");
});

test("本名らしいニックネームは、やさしく確認する（保存は止めない）", async ({
  page,
}) => {
  await onboard(page, "山田太郎");
  await expect(
    page.getByText("これって ほんとうの なまえ かな？"),
  ).toBeVisible();
  await page.getByRole("button", { name: "このままに する" }).click();
  await expect(page).toHaveURL(/\/install$/);
});

test("保護者メニューは PIN がないと開けない。間違えると入れない", async ({
  page,
}) => {
  await onboard(page);
  await page.getByRole("button", { name: "あとで" }).click();
  await expect(page).toHaveURL(/\/profiles$/);
  await page.goto("/parent");
  await expect(page).toHaveURL(/\/parent\/unlock$/);
  await typePin(page, "保護者の PIN（6桁）", "000001");
  await page.getByRole("button", { name: "確認" }).click();
  await expect(page.getByText("PIN が違います", { exact: true })).toBeVisible();

  await typePin(page, "保護者の PIN（6桁）", PARENT_PIN);
  await page.getByRole("button", { name: "確認" }).click();
  await expect(page).toHaveURL(/\/parent$/);
  await expectNoA11yViolations(page);
  await expect(
    page.getByRole("heading", { name: "保護者メニュー" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "使い方のルール" }).click();
  await expect(page).toHaveURL(/\/parent\/rules$/);
  await expectNoA11yViolations(page);
});

/** Service Worker が画面をキャッシュし終わるのを待つ */
async function waitForPrecache(page: Page, pathname: string) {
  await expect
    .poll(
      () =>
        page.evaluate(async (path) => {
          await navigator.serviceWorker.ready;
          for (const name of await caches.keys()) {
            const keys = await (await caches.open(name)).keys();
            if (keys.some((r) => new URL(r.url).pathname === path)) return true;
          }
          return false;
        }, pathname),
      { timeout: 30_000 },
    )
    .toBe(true);
}

test("オフライン用に、アプリの画面をキャッシュする（U1-PWA-2）", async ({
  page,
}) => {
  await page.goto("/login");
  for (const path of ["/", "/profiles", "/home", "/parent"]) {
    await waitForPrecache(page, path);
  }
});

test("一度開いたあとは、オフラインでもホームまで進める（U1-PWA-2）", async ({
  page,
  context,
  browserName,
}) => {
  // Playwright の WebKit では、オフラインにすると（setOffline でも、リクエストを失敗させる方法でも）
  // Service Worker が返すはずのページの読み込みまで止まってしまう
  // （"WebKit encountered an internal error" / "Blocked by Web Inspector"）。
  // WebKit では、上のテストでキャッシュされることまでを確かめ、オフラインでの移動は
  // iPhone・iPad の実機で確かめる（code-summary.md §2）
  test.skip(
    browserName === "webkit",
    "Playwright の WebKit ではオフラインで Service Worker のページを開けないため",
  );

  await onboard(page);
  await page.getByRole("button", { name: "あとで" }).click();
  await expect(page).toHaveURL(/\/profiles$/);
  await waitForPrecache(page, "/home");

  await context.setOffline(true);
  await page.goto("/");
  await expect(page).toHaveURL(/\/profiles$/);
  await ready(page);
  await page.getByRole("button", { name: /ほのおのきつね/ }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(
    page.getByRole("heading", { name: /ほのおのきつね/ }),
  ).toBeVisible();
});

test("セキュリティのヘッダーが付き、ページの中のスクリプトは nonce が付いたものだけ（U1-SEC）", async ({
  request,
}) => {
  const first = await request.get("/login");
  const csp = first.headers()["content-security-policy"];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toMatch(
    /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/,
  );
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(csp).not.toMatch(/https?:\/\//);
  expect(first.headers()["permissions-policy"]).toContain("camera=(self)");
  expect(first.headers()["x-powered-by"]).toBeUndefined();

  // nonce はリクエストごとに変わる
  const second = await request.get("/login");
  expect(second.headers()["content-security-policy"]).not.toBe(csp);

  const html = await first.text();
  // タイトルは、後から送られず、最初の HTML の <head> に入っている（アクセシビリティ）
  const head = html.slice(0, html.indexOf("</head>"));
  expect(head).toContain("<title>かえりうち</title>");

  // ページの中のスクリプトには、すべて nonce が付いている
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]);
  expect(scripts.length).toBeGreaterThan(0);
  for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);
});

test("ヘルスチェック", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ status: "ok" });
});
