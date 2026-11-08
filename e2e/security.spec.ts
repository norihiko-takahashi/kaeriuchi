import { expect, test } from "@playwright/test";

/**
 * CSP が、ページに紛れ込んだスクリプトを止めることを確かめる（U1-SEC-2）。
 * XSS で多い「HTML に紛れ込んだイベントのスクリプト（onerror など）」を、わざと入れてみる。
 * 'unsafe-inline' を許可していると、このスクリプトは動いてしまう。
 */
test("ページに紛れ込んだスクリプトは動かず、違反として記録される", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] };
    w.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      w.__cspViolations.push(e.violatedDirective);
    });
  });
  await page.goto("/login");
  await expect(page.locator("html[data-hydrated]")).toBeAttached();

  await page.evaluate(() => {
    const div = document.createElement("div");
    div.innerHTML = '<img src="/not-found.png" onerror="window.__evil = 1">';
    document.body.appendChild(div);
  });

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __cspViolations: string[] }).__cspViolations,
      ),
    )
    .toContainEqual(expect.stringMatching(/^script-src/));
  expect(
    await page.evaluate(
      () => (window as unknown as { __evil?: number }).__evil,
    ),
  ).toBeUndefined();
});
