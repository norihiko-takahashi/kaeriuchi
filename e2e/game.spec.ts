import { expect, type Page, test } from "@playwright/test";
import {
  answerNumber,
  enterMistake,
  expectNoA11yViolations,
  failOnCspViolations,
  PARENT_PIN,
  ready,
  toHome,
  typePin,
} from "./helpers";

/**
 * U6：撃破 → 翌日に再来 → 図鑑が銀に。テストの一覧と、まとめての復習（れんしゅう）。
 * 端末の日付は Playwright の時計で進める。
 */

failOnCspViolations();

const DAY1 = new Date("2026-11-10T10:00:00");
const DAY2 = new Date("2026-11-11T10:00:00");

async function winFirstBattle(page: Page) {
  await page.getByRole("link", { name: "⚔️ たたかう" }).click();
  await answerNumber(page, "7/10");
  await page.getByRole("button", { name: "つぎへ" }).click();
  await page.getByRole("button", { name: "6", exact: true }).click();
  await page.getByRole("button", { name: "つぎへ" }).click();
  await answerNumber(page, "5/6");
  await page.getByRole("button", { name: "けっかを みる" }).click();
  await expect(page.getByRole("heading", { name: "げきは！" })).toBeVisible();
}

test("撃破すると XP と図鑑の銅。翌日に再来して倒すと銀になり、連続記録がのびる", async ({
  page,
}) => {
  await page.clock.setFixedTime(DAY1);
  await toHome(page);
  await enterMistake(page);
  await winFirstBattle(page);

  // ヒントなしで全問正解：50 + 30
  await expect(
    page.getByRole("heading", { name: "もらった XP：80" }),
  ).toBeVisible();
  await expect(page.getByText(/カードが「どう」に なった/)).toBeVisible();
  await expect(page.getByText(/れんぞく 1にち/)).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("link", { name: "ホームに もどる" }).click();
  await expect(page.getByText("レベル 1")).toBeVisible();
  await expect(
    page
      .locator("section")
      .filter({ hasText: "きょうの さいらい" })
      .getByText("いまは いないよ"),
  ).toBeVisible();

  // 翌日：今日の再来に出てくる
  await page.clock.setFixedTime(DAY2);
  await page.reload();
  await ready(page);
  const revisits = page
    .locator("section")
    .filter({ hasText: "きょうの さいらい ミスモン" });
  await expect(revisits.getByText("ブンボタッシー")).toBeVisible();
  await expectNoA11yViolations(page);
  await revisits.getByRole("link", { name: "たたかう" }).click();

  // 再来は2問で、前とは違う問題
  await expect(page.getByText("（さいらい）")).toBeVisible();
  await expect(page.getByText("1/3 + 1/4 = ?")).toBeVisible();
  await answerNumber(page, "7/12");
  await page.getByRole("button", { name: "つぎへ" }).click();
  await expect(page.getByText("2もんめ / 2もん")).toBeVisible();
  await answerNumber(page, "5/12");
  await page.getByRole("button", { name: "けっかを みる" }).click();
  // 再来 40 + ヒントなし 30 → 合計 150 でレベル 2
  await expect(
    page.getByRole("heading", { name: "もらった XP：70" }),
  ).toBeVisible();
  await expect(page.getByText(/レベル 2 に あがった/)).toBeVisible();
  await expect(page.getByText(/カードが「ぎん」に なった/)).toBeVisible();
  await expect(page.getByText(/れんぞく 2にち/)).toBeVisible();

  await page.getByRole("link", { name: "ホームに もどる" }).click();
  await expect(
    page.getByText("きょうの さいらいは ぜんぶ たおした！"),
  ).toBeVisible();

  // 図鑑
  await page.getByRole("link", { name: /ずかん/ }).click();
  await expect(page).toHaveURL(/\/dex$/);
  await expect(page.getByText(/ぎん（さいらいも げきは）/)).toBeVisible();
  await expectNoA11yViolations(page);

  // 保護者メニューの「学習のようす」（U7）
  await page.goto("/parent/insights");
  await expect(page).toHaveURL(/\/parent\/unlock$/);
  await typePin(page, "保護者の PIN（6桁）", PARENT_PIN);
  await page.getByRole("button", { name: "確認" }).click();
  await expect(page).toHaveURL(/\/parent$/);
  await page.getByRole("link", { name: "学習のようす" }).click();
  await expect(page).toHaveURL(/\/parent\/insights$/);
  // 今週・これまで・足あと（同じ数字は1回だけ。目安の線は出さない）
  const week = page.getByRole("region", { name: "今週" });
  await expect(
    week.getByText("2回バトルして、1問を撃破しました。"),
  ).toBeVisible();
  await expect(week.getByText("（先週は")).toHaveCount(0); // 最初の週は比べない
  await expect(
    week.getByText("再来は 1回のうち 1回、もう一度撃破しました。"),
  ).toBeVisible();
  const sofar = page.getByRole("region", { name: /これまで/ });
  await expect(sofar.getByText("登録した間違い")).toBeVisible();
  await expect(
    sofar.getByRole("img", {
      name: "1問のうち、覚えた 0問、再来も撃破 1問、1回撃破 0問、まだ 0問",
    }),
  ).toBeVisible();
  await expect(sofar.getByText("（1回のうち 1回）")).toBeVisible();
  await expect(page.getByText(/目安/)).toHaveCount(0);
  await expect(page.getByText(/今日まで\s*2日\s*つづけて/)).toBeVisible();
  await expectNoA11yViolations(page);

  // くわしく見る：登録の多い間違い（順位は付けない）と、週ごとの表
  await page.getByText("登録の多い間違い", { exact: true }).click();
  await expect(
    page.getByText("分数のたし算で、分母どうしも足してしまう"),
  ).toBeVisible();
  await page.getByText("週ごとの推移", { exact: true }).click();
  await expect(page.getByRole("cell", { name: "1/1（100%）" })).toBeVisible();

  // カレンダーの今日のマス → 日の詳細。前の日へ戻ると、登録と初めての撃破
  await page
    .getByRole("link", { name: /11月11日（水）（今日）\s*バトル 1回/ })
    .click();
  await expect(page).toHaveURL(/\/parent\/insights\/day#.+\/2026-11-11$/);
  await expect(page.getByText("ブンボタッシー")).toBeVisible();
  await expect(page.getByText("再来 1回目・撃破")).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole("link", { name: /前の記録の日/ }).click();
  await expect(
    page.getByRole("heading", { name: "11月10日（火）" }),
  ).toBeVisible();
  await expect(page.getByText("初めて撃破")).toBeVisible();
  await expect(page.getByText("この日に登録した間違い（1問）")).toBeVisible();
  await expectNoA11yViolations(page);
});

test("テストの一覧でクリアが見え、名前を変えられる。まとめての復習は「れんしゅう」", async ({
  page,
}) => {
  await page.clock.setFixedTime(DAY1);
  await toHome(page);
  await enterMistake(page);
  await winFirstBattle(page);
  await page.getByRole("link", { name: "ホームに もどる" }).click();

  await page.getByRole("link", { name: /テスト/ }).click();
  await expect(page).toHaveURL(/\/sheets$/);
  await expect(page.getByText(/さんすう 11\/10 の テスト/)).toBeVisible();
  await expect(page.getByText(/1\/1 げきは・クリア！/)).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("link", { name: /さんすう 11\/10 の テスト/ }).click();
  await expect(page).toHaveURL(/\/sheets\/detail#/);
  await page.getByRole("button", { name: "なまえを かえる" }).click();
  await page.getByLabel("テストの なまえ").fill("2学期 分数のテスト");
  await page.getByRole("button", { name: "きめる" }).click();
  await expect(
    page.getByRole("heading", { name: /2学期 分数のテスト/ }),
  ).toBeVisible();
  await expectNoA11yViolations(page);

  // 再来の日ではないので、れんしゅう（日程は進まない、XP +10）
  await page.getByRole("button", { name: /まとめて たたかう/ }).click();
  await expect(page.getByText("（れんしゅう）")).toBeVisible();
  await answerNumber(page, "7/12");
  await page.getByRole("button", { name: "つぎへ" }).click();
  await answerNumber(page, "5/12");
  await page.getByRole("button", { name: "けっかを みる" }).click();
  await expect(
    page.getByRole("heading", { name: "もらった XP：10" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "テストに もどる" }).click();
  await expect(page).toHaveURL(/\/sheets\/detail#/);
});
