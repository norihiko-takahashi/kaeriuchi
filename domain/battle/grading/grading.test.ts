import { describe, expect, it } from "vitest";
import type { AnswerFormat } from "@/shared/problem";
import { type ChildAnswer, gradeLocally } from "./index";
import { editDistance, normalizeText } from "./normalize";
import { gradeNumber, parseNumber } from "./numeric";

const text = (value: string): ChildAnswer => ({ kind: "text", value });

describe("parseNumber", () => {
  it.each([
    ["12", "12", "integer"],
    ["１２", "12", "integer"],
    [" -3 ", "-3", "integer"],
    ["−3", "-3", "integer"],
    ["1,000", "1000", "integer"],
    ["0.5", "1/2", "decimal"],
    [".5", "1/2", "decimal"],
    ["3/4", "3/4", "fraction"],
    ["2分の1", "1/2", "fraction"],
    ["1と1/2", "3/2", "mixed"],
    ["1 1/2", "3/2", "mixed"],
    ["1と2分の1", "3/2", "mixed"],
    ["-1と1/2", "-3/2", "mixed"],
  ])("%s は %s（%s）", (raw, value, form) => {
    const p = parseNumber(raw);
    expect(p && `${p.value.n}${p.value.d === 1n ? "" : `/${p.value.d}`}`).toBe(
      value,
    );
    expect(p?.form).toBe(form);
  });

  it("読めないものは null", () => {
    expect(parseNumber("いち")).toBeNull();
    expect(parseNumber("1/0")).toBeNull();
    expect(parseNumber("")).toBeNull();
  });

  it("決まった単位は、付いていてもいなくてもよい", () => {
    expect(parseNumber("12cm", "cm")?.value).toEqual({ n: 12n, d: 1n });
    expect(parseNumber("12", "cm")?.value).toEqual({ n: 12n, d: 1n });
    expect(parseNumber("12m", "cm")).toBeNull();
  });
});

describe("gradeNumber（BR-45-7）", () => {
  it("初期値は値が同じなら正解（1/2 と 0.5、約分していない 2/4）", () => {
    expect(gradeNumber("0.5", "1/2")).toBe(true);
    expect(gradeNumber("2/4", "1/2")).toBe(true);
    expect(gradeNumber("1/3", "1/2")).toBe(false);
    expect(gradeNumber("?", "1/2")).toBe(false);
  });

  it("約分して答える", () => {
    const c = { condition: "reduced" as const };
    expect(gradeNumber("1/2", "1/2", c)).toBe(true);
    expect(gradeNumber("2/4", "1/2", c)).toBe(false);
    expect(gradeNumber("0.5", "1/2", c)).toBe(false);
    expect(gradeNumber("3", "6/2", c)).toBe(true);
  });

  it("小数で答える", () => {
    const c = { condition: "decimal" as const };
    expect(gradeNumber("0.5", "1/2", c)).toBe(true);
    expect(gradeNumber("1/2", "1/2", c)).toBe(false);
  });

  it("帯分数で答える", () => {
    const c = { condition: "mixed" as const };
    expect(gradeNumber("1と1/2", "3/2", c)).toBe(true);
    expect(gradeNumber("3/2", "3/2", c)).toBe(false);
    expect(gradeNumber("1と2/4", "3/2", c)).toBe(false);
    expect(gradeNumber("1/2", "1/2", c)).toBe(true);
    expect(gradeNumber("1.5", "3/2", c)).toBe(false);
    expect(gradeNumber("2", "2", c)).toBe(true);
  });
});

describe("gradeLocally", () => {
  const numeric: AnswerFormat = { kind: "numeric" };
  it("数値", () => {
    expect(
      gradeLocally({ format: numeric, answer: "7/12" }, text("7/12")),
    ).toBe("correct");
    expect(gradeLocally({ format: numeric, answer: "7/12" }, text("2/7"))).toBe(
      "wrong",
    );
    expect(
      gradeLocally(
        { format: numeric, answer: "1" },
        { kind: "self-check", value: true },
      ),
    ).toBe("wrong");
  });

  it("選択式", () => {
    const f: AnswerFormat = { kind: "choice", options: ["5", "6"] };
    expect(gradeLocally({ format: f, answer: "6" }, text("６"))).toBe(
      "correct",
    );
    expect(gradeLocally({ format: f, answer: "6" }, text("5"))).toBe("wrong");
    expect(
      gradeLocally({ format: f, answer: "6" }, { kind: "ordering", value: [] }),
    ).toBe("wrong");
  });

  it("短い文：一覧と一致、似ていれば unsure、違えば wrong", () => {
    const f: AnswerFormat = { kind: "text", acceptable: ["こうごうせい"] };
    const p = { format: f, answer: "光合成" };
    expect(gradeLocally(p, text("コウゴウセイ"))).toBe("correct");
    expect(gradeLocally(p, text("光合成。"))).toBe("correct");
    expect(gradeLocally(p, text("こうごうせいです"))).toBe("unsure");
    expect(gradeLocally(p, text("こうごせい"))).toBe("unsure");
    expect(gradeLocally(p, text("こきゅう"))).toBe("wrong");
    expect(gradeLocally(p, text(" "))).toBe("wrong");
    expect(gradeLocally(p, text("こ"))).toBe("wrong");
    expect(gradeLocally(p, { kind: "self-check", value: true })).toBe("wrong");
  });

  it("並べ替え", () => {
    const f: AnswerFormat = {
      kind: "ordering",
      tokens: ["goes", "He", "school", "to"],
    };
    const p = { format: f, answer: "He goes to school." };
    expect(
      gradeLocally(p, {
        kind: "ordering",
        value: ["He", "goes", "to", "school"],
      }),
    ).toBe("correct");
    expect(
      gradeLocally(p, {
        kind: "ordering",
        value: ["goes", "He", "to", "school"],
      }),
    ).toBe("wrong");
    expect(gradeLocally(p, text("He goes to school"))).toBe("wrong");
  });

  it("自己採点", () => {
    const f: AnswerFormat = { kind: "self-check", model: "植" };
    const p = { format: f, answer: "植" };
    expect(gradeLocally(p, { kind: "self-check", value: true })).toBe(
      "correct",
    );
    expect(gradeLocally(p, { kind: "self-check", value: false })).toBe("wrong");
    expect(gradeLocally(p, text("植"))).toBe("wrong");
  });
});

describe("normalize", () => {
  it("ひらがな・カタカナ・全角・空白をそろえる", () => {
    expect(normalizeText(" ＡＢｃ　カタカナ ")).toBe("abcかたかな");
  });
  it("編集の距離", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("", "abc")).toBe(3);
  });
});
