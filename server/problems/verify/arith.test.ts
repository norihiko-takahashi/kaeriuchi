import { describe, expect, it } from "vitest";
import { ratToString } from "@/domain/math/rational";
import { evaluateProblem } from "./arith";

const ev = (s: string) => {
  const r = evaluateProblem(s);
  return r ? ratToString(r) : null;
};

describe("検算の計算器（U45-Q-3）", () => {
  it.each([
    ["1/3 + 1/4 = ?", "7/12"],
    ["１/３＋１/４＝？", "7/12"],
    ["2/3 + 1/6 =", "5/6"],
    ["3 × (4 + 5) = □", "27"],
    ["10 ÷ 4 = ( )", "5/2"],
    ["0.1 + 0.2 = ?", "3/10"],
    [".5 * 2 = ?", "1"],
    ["-3 + 5 = ?", "2"],
    ["2 - -3 = ?", "5"],
    ["8 − 3 = ?", "5"],
    ["12 / 4 / 3 = ?", "1"],
  ])("%s は %s", (prompt, answer) => {
    expect(ev(prompt)).toBe(answer);
  });

  it.each([
    "1/2 と 1/3 を通分すると、分母はいくつになりますか。",
    "りんごが 3こ あります。2こ 食べると のこりは？",
    "x + 3 = 5",
    "1 / 0 = ?",
    "(1 + 2 = ?",
    "1 + = ?",
    "1 2 = ?",
    "= ?",
    `${"1+".repeat(80)}1 = ?`,
    "1..2 + 1 = ?",
  ])("式でないもの・計算できないものは null：%s", (prompt) => {
    expect(evaluateProblem(prompt)).toBeNull();
  });
});
