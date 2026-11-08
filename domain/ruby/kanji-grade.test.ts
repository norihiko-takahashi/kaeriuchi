import { describe, expect, it } from "vitest";
import { kanjiGrade, needsRuby } from "./kanji-grade";

describe("学年別漢字配当表", () => {
  it("学年が引ける", () => {
    expect(kanjiGrade("一")).toBe(1);
    expect(kanjiGrade("名")).toBe(1);
    expect(kanjiGrade("前")).toBe(2);
    expect(kanjiGrade("岡")).toBe(4); // 2020年度から4年生
    expect(kanjiGrade("誌")).toBe(6);
  });
  it("小学校で習わない字は null", () => {
    expect(kanjiGrade("凛")).toBeNull();
    expect(kanjiGrade("あ")).toBeNull();
  });
});

describe("needsRuby（その学年までに習っていない漢字だけ）", () => {
  it("小1：「名前」は「前」が2年生なので付ける", () => {
    expect(needsRuby("名前", "e1", "lower")).toBe(true);
  });
  it("小2：「名前」は付けない", () => {
    expect(needsRuby("名前", "e2", "lower")).toBe(false);
  });
  it("小6でも、小学校で習わない字には付ける", () => {
    expect(needsRuby("凛", "e6", "upper")).toBe(true);
  });
  it("かなだけなら付けない", () => {
    expect(needsRuby("ひらがな", "e1", "lower")).toBe(false);
  });
  it("中学生モードでは付けない", () => {
    expect(needsRuby("凛", "j1", "junior")).toBe(false);
  });
  it("保護者が中学生を高学年モードにしたら、小6の基準で付ける", () => {
    expect(needsRuby("誌", "j1", "upper")).toBe(false);
    expect(needsRuby("凛", "j1", "upper")).toBe(true);
  });
});
