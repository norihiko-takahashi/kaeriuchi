import { describe, expect, it } from "vitest";
import { mistakeTypeCatalog } from "@/server/ai/catalog";
import { GRADES } from "@/shared/constants";
import { MISTAKE_TYPES } from "./index";
import screen from "./screen.json";

/** 間違いのタイプの一覧の形（足したり直したりしたときに壊れていないか） */
describe("間違いのタイプの一覧", () => {
  const subjects = ["math", "japanese", "english", "science", "social"];

  it("ID は重ならず、「教科.単元.タイプ」の形で、教科と合っている", () => {
    const ids = MISTAKE_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of MISTAKE_TYPES) {
      expect(t.id).toMatch(/^[a-z]+\.[a-z0-9-]+\.[a-z0-9-]+$/);
      expect(subjects).toContain(t.subject);
      expect(t.id.startsWith(`${t.subject}.`)).toBe(true);
    }
  });

  it("学年・名前・例・ミスモンの名前と色がそろっている。ミスモンの名前は重ならない", () => {
    const monsters = MISTAKE_TYPES.map((t) => t.monster);
    expect(new Set(monsters).size).toBe(monsters.length);
    for (const t of MISTAKE_TYPES) {
      expect(t.grades.length).toBeGreaterThan(0);
      for (const g of t.grades) expect(GRADES).toContain(g);
      expect(t.label.length).toBeGreaterThan(4);
      expect(t.label.length).toBeLessThanOrEqual(40);
      expect(
        t.example.question && t.example.wrong && t.example.correct,
      ).toBeTruthy();
      expect(t.example.wrong).not.toBe(t.example.correct);
      expect(t.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(
        ["ai-draft", "curriculum", "usage"].includes(t.source) ||
          /^nier-\d{4}$/.test(t.source),
      ).toBe(true);
    }
  });

  it("前から使っている 9種類の ID は残っている（端末に保存したミスモンが使っている）", () => {
    for (const id of [
      "math.fraction.add-denominators",
      "math.carry.missing",
      "math.sign.error",
      "english.verb.third-person-s",
      "english.verb.past-tense",
      "japanese.kanji.reading",
      "japanese.kanji.okurigana",
      "science.term.confusion",
      "social.term.confusion",
    ])
      expect(MISTAKE_TYPES.some((t) => t.id === id)).toBe(true);
  });

  it("どの教科・学年でも、AI に渡す候補が1つ以上ある（英語は小5から、理科・社会は小3から）", () => {
    for (const s of subjects)
      for (const g of GRADES) {
        const from =
          s === "english" ? 4 : s === "science" || s === "social" ? 2 : 0;
        if (GRADES.indexOf(g) < from) continue;
        expect(
          mistakeTypeCatalog(s as never, g).length,
          `${s} ${g}`,
        ).toBeGreaterThan(0);
      }
  });

  it("画面用の小さい一覧が、元の一覧とずれていない（ずれていたら node scripts/mistake-types-screen.mjs）", () => {
    expect(screen.types).toEqual(
      MISTAKE_TYPES.map((t) => [
        t.id,
        t.subject,
        t.grades.join(" "),
        t.label,
        t.monster,
        t.color,
      ]),
    );
  });

  it("学年で候補を絞る（小5の算数に、中3の因数分解は入らない）", () => {
    const e5 = mistakeTypeCatalog("math", "e5").map((t) => t.id);
    expect(e5).toContain("math.fraction.add-denominators");
    expect(e5).not.toContain("math.factorization.sign");
    expect(mistakeTypeCatalog().length).toBe(MISTAKE_TYPES.length);
  });
});
