import { expect, type Page, test } from "@playwright/test";
import {
  expectNoA11yViolations,
  failOnCspViolations,
  onboard,
  PARENT_PIN,
  typePin,
} from "./helpers";

/**
 * U8：ログイン（開発用のログイン：メールは送らず、画面に出たリンクを開く）。
 * 端末をつなぐ番号・端末の一覧・ほかの端末のログアウト・リンクの使い回し・別のアカウントの記録との衝突
 */

failOnCspViolations();

async function openParentMenu(page: Page, path: string) {
  await page.goto(path);
  await expect(page).toHaveURL(/\/parent\/unlock$/);
  await typePin(page, "保護者の PIN（6桁）", PARENT_PIN);
  await page.getByRole("button", { name: "確認" }).click();
  await expect(page).toHaveURL(/\/parent$/);
}

async function sessionStatus(page: Page) {
  return page.evaluate(async () => (await fetch("/api/auth/session")).status);
}

test("保護者のスマホで出した番号で、子ども用の端末をつなぎ、一覧から ログアウトさせられる", async ({
  page,
  browser,
}) => {
  await onboard(page);
  await page.getByRole("button", { name: "あとで" }).click();
  await openParentMenu(page, "/parent");
  await page.getByRole("link", { name: "ログインしている端末" }).click();
  await expect(page).toHaveURL(/\/parent\/devices$/);
  await expect(
    page.getByText(/ログインしているアカウント：parent-/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "ログインしている端末（1）" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("button", { name: "この端末に番号を出す" }).click();
  const shown = await page
    .locator("output")
    .filter({ hasText: /\d{4} \d{4}/ })
    .innerText();
  const code = shown.replace(/\D/g, "");
  expect(code).toHaveLength(8);

  // 子ども用の端末（別のブラウザ）
  const tablet = await (await browser.newContext()).newPage();
  await tablet.goto("/login");
  await tablet
    .getByRole("link", { name: "子ども用の端末を、番号でつなぐ" })
    .click();
  await expect(tablet).toHaveURL(/\/login\/code$/);
  await expectNoA11yViolations(tablet);
  await tablet.getByLabel("8けたの番号").fill("00000000");
  await tablet.getByRole("button", { name: "つなぐ" }).click();
  await expect(tablet.getByText(/番号がちがうか/)).toBeVisible();
  await tablet
    .getByLabel("8けたの番号")
    .fill(`${code.slice(0, 4)}-${code.slice(4)}`);
  await tablet.getByRole("button", { name: "つなぐ" }).click();
  // つながった（同意などは、同期ができるまで端末ごと）
  await expect(tablet).toHaveURL(/\/consent$/);
  expect(await sessionStatus(tablet)).toBe(200);

  // 保護者のスマホの一覧に出て、ログアウトさせられる
  await openParentMenu(page, "/parent/devices");
  await page.getByRole("link", { name: "ログインしている端末" }).click();
  await expect(
    page.getByRole("heading", { name: "ログインしている端末（2）" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "この端末をログアウト" }).click();
  await expect(
    page.getByRole("heading", { name: "ログインしている端末（1）" }),
  ).toBeVisible();
  expect(await sessionStatus(tablet)).toBe(401);
  expect(await sessionStatus(page)).toBe(200);
});

test("ログイン用のリンクは1回きり。別のアカウントの記録がある端末では、混ぜずに選んでもらう", async ({
  page,
}) => {
  await onboard(page);
  await page.getByRole("button", { name: "あとで" }).click();

  // 別のアカウントでログインしようとする
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill("other@example.com");
  await page.getByRole("button", { name: "ログイン用のリンクを送る" }).click();
  const link = await page
    .getByRole("link", { name: "ここからリンクを開く" })
    .getAttribute("href");
  await page.goto(link ?? "");
  await expect(
    page.getByRole("heading", {
      name: "この端末には、ほかのアカウントの記録があります",
    }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "やめる" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // 使ったリンクは、もう使えない
  await page.goto(link ?? "");
  await expect(
    page.getByRole("heading", { name: "ログインできませんでした" }),
  ).toBeVisible();
});
