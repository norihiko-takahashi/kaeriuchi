import { describe, expect, it } from "vitest";
import { mistakeType, mistakeTypesFor } from "./catalog";

describe("画面の、間違いのタイプ", () => {
  it("ID から名前とミスモンを引く。知らない ID は「そのほか」", () => {
    expect(mistakeType("math.fraction.add-denominators").monster).toBe(
      "ブンボタッシー",
    );
    expect(mistakeType("nope").id).toBe("other");
  });
  it("選び直しの候補は、教科と前後1学年。いまのタイプは必ず入る。最後は「そのほか」", () => {
    const e5 = mistakeTypesFor("math", "e5").map((t) => t.id);
    expect(e5).toContain("math.fraction.add-denominators");
    expect(e5).not.toContain("math.factorization.sign");
    expect(e5.at(-1)).toBe("other");
    expect(
      mistakeTypesFor("math", "e5", "math.factorization.sign").map((t) => t.id),
    ).toContain("math.factorization.sign");
    expect(mistakeTypesFor("math").length).toBeGreaterThan(e5.length);
  });
});
