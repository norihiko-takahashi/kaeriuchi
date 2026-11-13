import { describe, expect, expectTypeOf, it } from "vitest";
import type { MistakeAnalysis as SharedAnalysis } from "@/shared/capture";
import { NEGATIVE, POSITIVE } from "@/spikes/r1/pii-samples";
import { findPii, MASK, redactAnalysis, redactPii } from "./pii";
import type { MistakeAnalysis as ServerAnalysis } from "./schemas";

describe("名前などの伏せ字（US-3.3）", () => {
  it("見本の止めるべき文は、全部見つけて伏せる", () => {
    for (const s of POSITIVE) {
      const r = redactPii(s);
      expect(r.found.length, s).toBeGreaterThan(0);
      expect(r.text, s).toContain(MASK);
    }
  });

  it("問題文の登場人物などは止めない。文字もそのまま", () => {
    for (const s of NEGATIVE) {
      expect(findPii(s), s).toEqual([]);
      expect(redactPii(s).text).toBe(s);
    }
  });

  it("目印の言葉は残し、固有の部分だけ伏せる。伏せる前の文字は残らない", () => {
    expect(redactPii("なまえ 山田たろう").text).toBe(`なまえ ${MASK}`);
    expect(redactPii("ひかり小学校 3年2組").text).toBe(`${MASK}小学校 ${MASK}`);
    expect(redactPii("担任 高橋先生").text).toBe(`担任 ${MASK}先生`);
    const r = redactPii("連絡先 03-1234-5678");
    expect(r).toEqual({ text: `連絡先 ${MASK}`, found: ["contact"] });
    expect(redactPii("問題 1/2 + 1/3 = ? なまえ さくら").text).not.toContain(
      "さくら",
    );
  });

  it("解析の結果の、問題・答え・説明に当てる", () => {
    const base = {
      subject: "math" as const,
      unit: "分数",
      question: "なまえ 山田 1/2 + 1/3",
      childAnswer: "2/5",
      correctAnswer: "5/6",
      mistakeTypeId: "math.fraction.add-denominators",
      explanation: "通分します",
      confidence: { question: 1, childAnswer: 1, correctAnswer: 1 },
      piiDetected: false,
      gradingMarksFound: false,
    };
    const r = redactAnalysis(base);
    expect(r.kinds).toBe(1);
    expect(r.value.piiDetected).toBe(true);
    expect(r.value.question).not.toContain("山田");
    expect(redactAnalysis({ ...base, question: "1/2 + 1/3" })).toEqual({
      value: { ...base, question: "1/2 + 1/3" },
      kinds: 0,
    });
  });
});

describe("画面の型とサーバーの形がそろっている", () => {
  it("MistakeAnalysis", () => {
    expectTypeOf<ServerAnalysis>().toEqualTypeOf<SharedAnalysis>();
  });
});
