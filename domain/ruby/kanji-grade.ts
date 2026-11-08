import data from "@/content/kanji-by-grade.json";
import { elementaryYear } from "@/domain/profile/grade";
import type { DisplayMode, Grade } from "@/shared/schemas";

const gradeOfKanji = new Map<string, number>();
for (const [grade, chars] of Object.entries(data.grades)) {
  for (const ch of chars) gradeOfKanji.set(ch, Number(grade));
}

/** 小学校で習う学年（1〜6）。小学校で習わない字は null */
export function kanjiGrade(ch: string): number | null {
  return gradeOfKanji.get(ch) ?? null;
}

const HAN = /\p{Script=Han}/u;

/**
 * ふりがなを付けるかどうか。
 * - 低学年・高学年：その学年までに習わない漢字が1つでも入っていれば付ける
 * - 中学生：付けない
 */
export function needsRuby(
  text: string,
  grade: Grade,
  mode: DisplayMode,
): boolean {
  if (mode === "junior") return false;
  const year = elementaryYear(grade) ?? 6;
  for (const ch of text) {
    if (!HAN.test(ch)) continue;
    const g = kanjiGrade(ch);
    if (g === null || g > year) return true;
  }
  return false;
}
