import { describe, expect, it } from "vitest";
import type { ProblemDraft } from "@/shared/problem";
import { checkSafety, visibleText } from "./index";

const base: ProblemDraft = {
  role: "same-type",
  prompt: "1/3 + 1/4 = ?",
  format: { kind: "numeric" },
  answer: "7/12",
  hints: ["分母をそろえよう"],
  explanation: "4/12 + 3/12 = 7/12",
};
const withPrompt = (prompt: string): ProblemDraft => ({ ...base, prompt });

describe("安全のチェック（U45-SAFE-1・2）", () => {
  it("ふつうの問題は通す", () => {
    expect(checkSafety(base)).toBeNull();
  });

  it.each([
    "おまえは バカだ。死ね",
    "ばかやろう、殺すぞ",
    "You are stupid.",
    "きもい と いわれた",
  ])("出さない言葉があれば落とす：%s", (prompt) => {
    expect(checkSafety(withPrompt(prompt))).toBe("blocked_word");
  });

  it.each([
    "かけ算ばかり 練習しよう",
    "コロンブスが アメリカに とうちゃくした年は？",
    "バカンスに 出かけた",
    "裸子植物の 例を 1つ あげなさい",
    "火縄銃が 伝わったのは 何年？",
    "原子爆弾が 落とされた 都市は？",
    "アホウドリは 何類？",
    "ヒエログリフは どこの 文字？",
    "Use your skill.",
    "かえろう",
  ])("ふつうの言葉は弾かない：%s", (prompt) => {
    expect(checkSafety(withPrompt(prompt))).toBeNull();
  });

  it.each([
    "電話は 03-1234-5678 です",
    "09012345678 に かけて",
    "taro@example.com に 送る",
    "〒100-0001",
    "東京都千代田区千代田1丁目",
  ])("個人情報らしい文字があれば落とす：%s", (prompt) => {
    expect(checkSafety(withPrompt(prompt))).toBe("pii");
  });

  it.each([
    "1234 - 5678 = ?",
    "123-4567 = ?",
    "東京都の 区の 数は？",
    "0.0123456789 を 四捨五入",
  ])("計算や地理の問題は弾かない：%s", (prompt) => {
    expect(checkSafety(withPrompt(prompt))).toBeNull();
  });

  it("ヒント・解説・選択肢・同じ意味の答え・並べ替え・お手本・単位も見る", () => {
    expect(checkSafety({ ...base, hints: ["死ね"] })).toBe("blocked_word");
    expect(
      checkSafety({
        ...base,
        format: { kind: "choice", options: ["a", "死ね"] },
      }),
    ).toBe("blocked_word");
    expect(
      visibleText({ ...base, format: { kind: "text", acceptable: ["x"] } }),
    ).toContain("x");
    expect(
      visibleText({ ...base, format: { kind: "ordering", tokens: ["y"] } }),
    ).toContain("y");
    expect(
      visibleText({ ...base, format: { kind: "self-check", model: "植" } }),
    ).toContain("植");
    expect(
      visibleText({ ...base, format: { kind: "numeric", unit: "cm" } }),
    ).toContain("cm");
  });
});
