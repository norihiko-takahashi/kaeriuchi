import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/** E2E テストで共通に使うもの */

/** WCAG 2.2 AA のチェック（U1-A11Y-1） */
export async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`,
    ),
  ).toEqual([]);
}

export const PARENT_PIN = "482915";

/**
 * CSP の違反を集める（U1-SEC-2）。どのテストでも、違反が1件でもあれば失敗にする。
 * 違反があると、画面が動かなくなるか、守りが効いていないことになるため。
 */
export function failOnCspViolations() {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      const w = window as unknown as { __cspViolations: string[] };
      w.__cspViolations = [];
      document.addEventListener("securitypolicyviolation", (e) => {
        w.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
      });
    });
  });

  test.afterEach(async ({ page }) => {
    if (page.isClosed()) return;
    const violations = await page
      .evaluate(
        () =>
          (window as unknown as { __cspViolations?: string[] })
            .__cspViolations ?? [],
      )
      .catch(() => []);
    expect(violations).toEqual([]);
  });
}

/**
 * 画面が操作できる状態になるまで待つ。
 * 開き直したページで、ボタンが動く前に押してしまわないようにする。
 */
export async function ready(page: Page) {
  await expect(page.locator("html[data-hydrated]")).toBeAttached();
}

export async function typePin(page: Page, label: string | RegExp, pin: string) {
  await page.getByLabel(label).fill(pin);
}

/** ログイン → 同意 → 保護者の PIN → 学年 → 名前の説明 → ニックネーム → ホーム画面への追加の案内 */
export async function onboard(page: Page, nickname = "ほのおのきつね") {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expectNoA11yViolations(page);
  await page.getByLabel("メールアドレス").fill("parent@example.com");
  await page.getByRole("button", { name: "ログイン" }).click();

  await expect(page).toHaveURL(/\/consent$/);
  await expectNoA11yViolations(page);
  const agree = page.getByRole("button", { name: "同意して次へ" });
  await expect(agree).toBeDisabled();
  await page.getByLabel("上の内容を読み、同意します").check();
  await agree.click();

  await expect(page).toHaveURL(/\/parent\/pin-setup$/);
  await expectNoA11yViolations(page);
  await typePin(page, "6桁の PIN", "123456");
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(
    page.getByText("連続した数字は使えません", { exact: true }),
  ).toBeVisible();
  await typePin(page, "6桁の PIN", PARENT_PIN);
  await page.getByRole("button", { name: "次へ" }).click();
  await typePin(page, "確認のため、もう一度入力してください", PARENT_PIN);
  await page.getByRole("button", { name: "設定する" }).click();

  await expect(page).toHaveURL(/\/profiles\/new$/, { timeout: 15_000 });
  await expectNoA11yViolations(page);
  await page.getByText("小学2年").click();
  await page.getByRole("button", { name: "つぎへ" }).click();

  await expect(page).toHaveURL(/nickname-guide$/);
  await expectNoA11yViolations(page);
  await expect(
    page.getByText("なまえは きみの たいせつな ひみつ"),
  ).toBeVisible();
  await page.getByRole("button", { name: "わかった！" }).click();

  await expect(page).toHaveURL(/\/profiles\/new\/nickname$/);
  await expectNoA11yViolations(page);
  await page.getByLabel(/ニックネーム/).fill(nickname);
  await page.getByText("めがね").click();
  await page.getByRole("button", { name: "できた！" }).click();
}
