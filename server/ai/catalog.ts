import { MISTAKE_TYPES } from "@/content/mistake-types";
import { GRADES, type Grade } from "@/shared/constants";
import type { MistakeTypeSummary, Subject } from "./schemas";

/**
 * AI に渡す、間違いのタイプの候補。
 * 教科がわかっていればその教科のものだけ、学年がわかっていれば、その学年と前後1学年のものだけにする
 * （候補を絞ると、AI への指示が短くなり、判定もぶれにくい）。
 */
export function mistakeTypeCatalog(
  subject?: Subject,
  grade?: Grade,
): MistakeTypeSummary[] {
  const near = grade ? nearGrades(grade) : null;
  return MISTAKE_TYPES.filter(
    (t) =>
      (!subject || t.subject === subject) &&
      (!near || t.grades.some((g) => near.has(g))),
  ).map(({ id, label }) => ({ id, label }));
}

function nearGrades(grade: Grade): Set<string> {
  const i = GRADES.indexOf(grade);
  return new Set(GRADES.slice(Math.max(0, i - 1), i + 2));
}

export function isKnownMistakeType(id: string): boolean {
  return MISTAKE_TYPES.some((t) => t.id === id);
}
