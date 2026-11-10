import { expect, type Page, test } from "@playwright/test";
import {
  expectNoA11yViolations,
  failOnCspViolations,
  onboard,
  PARENT_PIN,
  ready,
  typePin,
} from "./helpers";

/**
 * U4・U5：手で入れる → ミスモン → かえりうち問題 → 撃破（偽物の AI で動かす）。
 * 偽物の AI は、初回に「1/5 + 1/2」「通分の選択式」「2/3 + 1/6」の3問を返す。
 */

failOnCspViolations();

async function toHome(page: Page) {
  await onboard(page);
  await page.getByRole("button", { name: "あとで" }).click();
  await expect(page).toHaveURL(/\/profiles$/);
  await page.getByRole("button", { name: /ほのおのきつね/ }).click();
  await expect(page).toHaveURL(/\/home$/);
  await ready(page);
}

async function enterMistake(page: Page) {
  await page.getByRole("link", { name: /てで いれる/ }).click();
  await expect(page).toHaveURL(/\/mistakes\/new$/);
  await ready(page);
  await expectNoA11yViolations(page);
  const send = page.getByRole("button", { name: "おくる" });
  await expect(send).toBeDisabled();
  await page.getByText("さんすう・すうがく").click();
  await page.getByLabel("もんだい").fill("1/2 + 1/3 = ?");
  await page.getByLabel("きみの こたえ").fill("2/5");
  await page.getByLabel(/しい こたえ/).fill("5/6");
  await send.click();

  await expect(page).toHaveURL(/\/mistakes\/found#/);
  await expect(
    page.getByRole("heading", { name: "ミスモンが あらわれた！" }),
  ).toBeVisible();
  await expect(page.getByText("ブンボタッシー")).toBeVisible();
  await expectNoA11yViolations(page);
}

async function answerNumber(page: Page, value: string) {
  await page.getByLabel("きみの こたえ").fill(value);
  await page.getByRole("button", { name: "こたえる" }).click();
}

async function reportMarkedWrong(page: Page) {
  await page.getByRole("button", { name: /あれ？おかしいかも/ }).click();
  await page.getByLabel("あってるのに ×に なった").check();
  await page.getByRole("button", { name: "おくる" }).click();
}

test("手で入れた間違いのミスモンを、かえりうち問題で撃破できる。報告は保護者メニューで見られる", async ({
  page,
}) => {
  await toHome(page);
  await enterMistake(page);

  await page.getByRole("link", { name: "⚔️ たたかう" }).click();
  await expect(page).toHaveURL(/\/battle#/);
  await expect(page.getByText("1/5 + 1/2 = ?")).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "ミスモンの HP" }),
  ).toHaveAttribute("aria-valuenow", "300");
  await expectNoA11yViolations(page);

  // 1問目：間違えるとヒント1。「あってるのに ×」で、その場では正解として扱う（BR-45-8）
  await answerNumber(page, "2/7");
  await expect(page.getByText("おしい！ もう一回 やってみよう")).toBeVisible();
  await expect(page.getByText(/ヒント1：/)).toBeVisible();
  await reportMarkedWrong(page);
  await expect(
    page.getByText("せいかいに したよ！ ダメージ 100！"),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "ミスモンの HP" }),
  ).toHaveAttribute("aria-valuenow", "200");
  await page.getByRole("button", { name: "つぎへ" }).click();

  // 2問目：選択式。2回目からは「あってるのに ×」でも正解にならない
  await page.getByRole("button", { name: "5", exact: true }).click();
  await expect(page.getByText("おしい！ もう一回 やってみよう")).toBeVisible();
  await reportMarkedWrong(page);
  await expect(
    page.getByText(/せいかいに できるのは、1かいの バトルで 1もん までだよ/),
  ).toBeVisible();
  await page.getByRole("button", { name: "6", exact: true }).click();
  await expect(page.getByText("せいかい！ ダメージ 70！")).toBeVisible();
  await page.getByRole("button", { name: "つぎへ" }).click();

  // 3問目：約分していない 10/12 も、値が同じなら正解（BR-45-7）
  await expect(page.getByText("2/3 + 1/6 = ?")).toBeVisible();
  await answerNumber(page, "10/12");
  await expect(page.getByText("せいかい！ ダメージ 100！")).toBeVisible();
  await page.getByRole("button", { name: "けっかを みる" }).click();

  await expect(page.getByRole("heading", { name: "げきは！" })).toBeVisible();
  await expect(page.getByText("さいしょの まちがい")).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("link", { name: "ホームに もどる" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("いまは いないよ")).toBeVisible();

  // 保護者メニューで、報告の一覧を見る（画像とニックネームは含まない）
  await page.goto("/parent/reports");
  await expect(page).toHaveURL(/\/parent\/unlock$/);
  await typePin(page, "保護者の PIN（6桁）", PARENT_PIN);
  await page.getByRole("button", { name: "確認" }).click();
  await expect(page).toHaveURL(/\/parent$/);
  await page.getByRole("link", { name: "問題の報告" }).click();
  await expect(page).toHaveURL(/\/parent\/reports$/);
  await expect(page.getByText("（その場で正解として扱いました）")).toHaveCount(
    1,
  );
  await expect(page.getByText("あってるのに ×に なった")).toHaveCount(2);
  await expect(page.getByText("ほのおのきつね")).toHaveCount(0);
  await expectNoA11yViolations(page);
});

test("途中でやめても、つづきから再開できる。3回間違えると答えを見せて「あと一歩」", async ({
  page,
}) => {
  await toHome(page);
  await enterMistake(page);
  await page.getByRole("link", { name: "⚔️ たたかう" }).click();
  await answerNumber(page, "7/10");
  await expect(page.getByText("せいかい！ ダメージ 100！")).toBeVisible();
  await page.getByRole("button", { name: "つぎへ" }).click();
  await expect(page.getByText("2もんめ / 3もん")).toBeVisible();

  await page.getByRole("link", { name: /やめる/ }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page
    .getByRole("listitem")
    .filter({ hasText: "ブンボタッシー" })
    .getByRole("link", { name: "たたかう" })
    .click();
  await expect(page.getByText("2もんめ / 3もん")).toBeVisible();

  // 3回間違えると、答えと解説を見せて次へ（ダメージなし）
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "8", exact: true }).click();
  }
  await expect(page.getByText("こたえは「6」だよ")).toBeVisible();
  await page.getByRole("button", { name: "つぎへ" }).click();
  await answerNumber(page, "5/6");
  await page.getByRole("button", { name: "けっかを みる" }).click();
  await expect(
    page.getByRole("heading", { name: "あと いっぽ！" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "ホームに もどる" }).click();
  await expect(page.getByText("ブンボタッシー（あと いっぽ）")).toBeVisible();
});
