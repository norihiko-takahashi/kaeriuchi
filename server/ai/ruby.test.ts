import { describe, expect, it } from "vitest";
import type { ProblemDraft } from "@/shared/problem";
import { cleanRuby, MAX_RUBY } from "./ruby";

const base: ProblemDraft = {
  role: "focus",
  prompt: "分母をそろえて、通分しよう。",
  format: { kind: "choice", options: ["最小公倍数", "最大公約数"] },
  answer: "最小公倍数",
  hints: ["約数を考えよう"],
  explanation: "分母どうしの最小公倍数にそろえます。",
};

describe("ふりがなの確かめ（BR-6-7）", () => {
  it("文の中にある、漢字の語と、ひらがなの読みだけを残す", () => {
    const p = cleanRuby({
      ...base,
      ruby: [
        { word: "分母", reading: "ぶんぼ" },
        { word: "分母", reading: "ぶんぼ" }, // 重なり
        { word: "通分", reading: "ツウブン" }, // カタカナ
        { word: "公倍数", reading: "こうばいすう" }, // 文の中にある（部分）
        { word: "約数", reading: "やくすう" }, // ヒントの中
        { word: "最大公約数", reading: "さいだいこうやくすう" }, // 選択肢の中
        { word: "円周率", reading: "えんしゅうりつ" }, // 文にない
        { word: "そろえ", reading: "そろえ" }, // 漢字がない
        { word: "長音", reading: "ちょーおん" },
      ],
    });
    expect(p.ruby?.map((r) => r.word)).toEqual([
      "分母",
      "公倍数",
      "約数",
      "最大公約数",
    ]);
  });

  it("答えにしか出てこない語には付けない", () => {
    const p = cleanRuby({
      ...base,
      format: { kind: "numeric" },
      answer: "円周率",
      ruby: [{ word: "円周率", reading: "えんしゅうりつ" }],
    });
    expect(p.ruby).toBeUndefined();
  });

  it("30語まで。なければ ruby を持たない", () => {
    const words = Array.from({ length: 40 }, (_, i) => `漢${i}`);
    const p = cleanRuby({
      ...base,
      prompt: words.join(" "),
      ruby: words.map((w) => ({ word: w, reading: "かん" })),
    });
    expect(p.ruby).toHaveLength(MAX_RUBY);
    expect("ruby" in cleanRuby(base)).toBe(false);
    expect("ruby" in cleanRuby({ ...base, ruby: [] })).toBe(false);
  });

  it("短い文の答え・並べ替えの言葉にも付けられる", () => {
    expect(
      cleanRuby({
        ...base,
        format: { kind: "text", acceptable: ["光合成"] },
        ruby: [{ word: "光合成", reading: "こうごうせい" }],
      }).ruby,
    ).toHaveLength(1);
    expect(
      cleanRuby({
        ...base,
        format: { kind: "ordering", tokens: ["学校"] },
        ruby: [{ word: "学校", reading: "がっこう" }],
      }).ruby,
    ).toHaveLength(1);
  });
});
