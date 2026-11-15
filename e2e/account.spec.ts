import { expect, type Page, test } from "@playwright/test";
import {
  expectNoA11yViolations,
  failOnCspViolations,
  onboard,
  PARENT_PIN,
  typePin,
} from "./helpers";

/**
 * U8 §5：子どもの削除と取り消し・アカウントの削除と取り消し・同期の状態（保護者メニューだけ）
 */

failOnCspViolations();

async function openParent(page: Page, path: string) {
  await page.goto(path);
  await expect(page).toHaveURL(/\/parent\/unlock$/);
  await typePin(page, "保護者の PIN（6桁）", PARENT_PIN);
  await page.getByRole("button", { name: "確認" }).click();
  await expect(page).toHaveURL(/\/parent$/);
}

async function afterOnboard(page: Page) {
  const email = await onboard(page);
  await page.getByRole("button", { name: "あとで" }).click();
  await expect(page).toHaveURL(/\/profiles$/);
  return email;
}

test("子どもを消すと、7日のうちは「消したデータ」から戻せる。同期の状態は保護者メニューに出る", async ({
  page,
}) => {
  await afterOnboard(page);
  await openParent(page, "/parent");
  const sync = page.getByRole("region", { name: "クラウドとの同期" });
  await sync.getByRole("button", { name: "いま同期する" }).click();
  await expect(sync.getByText("送っていない変更：0件")).toBeVisible();
  await expect(sync.getByText(/最後に同期した日：\d+月\d+日/)).toBeVisible();

  await page.getByRole("link", { name: "データの管理" }).click();
  await page
    .getByLabel(/ニックネーム「ほのおのきつね」を入力/)
    .fill("ほのおのきつね");
  await page
    .getByRole("button", { name: "ほのおのきつね のデータを削除" })
    .click();
  const deleted = page.getByRole("region", { name: "消したデータ" });
  await expect(
    deleted.getByText(/ほのおのきつね（\d+月\d+日 に完全に消えます）/),
  ).toBeVisible();
  await expectNoA11yViolations(page);
  await deleted
    .getByRole("button", { name: "ほのおのきつね の削除を取り消す" })
    .click();
  await expect(deleted).toBeHidden();
  await expect(
    page.getByRole("button", { name: "ほのおのきつね のデータを削除" }),
  ).toBeVisible();
});

test("アカウントを消すとログアウトし、7日のうちは同じメールでログインして取り消せる", async ({
  page,
}) => {
  const email = await afterOnboard(page);
  await openParent(page, "/parent/data");
  await page.getByRole("link", { name: "データの管理" }).click();
  await page.getByLabel("「すべて削除」と入力してください").fill("すべて削除");
  await page.getByRole("button", { name: "アカウントを削除する" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("メールアドレス").fill(email);
  await page.getByRole("button", { name: "ログイン用のリンクを送る" }).click();
  await page.getByRole("link", { name: "ここからリンクを開く" }).click();
  await expect(
    page.getByRole("heading", { name: "このアカウントは、削除の手続き中です" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "削除を取り消して続ける" }).click();

  // 同意とプロフィールはクラウドから戻る。PIN は端末ごとに決め直す
  await expect(page).toHaveURL(/\/parent\/pin-setup$/);
  await typePin(page, "6桁の PIN", PARENT_PIN);
  await page.getByRole("button", { name: "次へ" }).click();
  await typePin(page, "確認のため、もう一度入力してください", PARENT_PIN);
  await page.getByRole("button", { name: "設定する" }).click();
  await expect(page).toHaveURL(/\/profiles$/);
  await expect(
    page.getByRole("button", { name: /ほのおのきつね/ }),
  ).toBeVisible();
});
