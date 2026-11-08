import { type DisplayMode, GRADES, type Grade } from "@/shared/constants";

export const GRADE_LABELS: Record<Grade, string> = {
  e1: "小学1年",
  e2: "小学2年",
  e3: "小学3年",
  e4: "小学4年",
  e5: "小学5年",
  e6: "小学6年",
  j1: "中学1年",
  j2: "中学2年",
  j3: "中学3年",
};

/** 学年から表示モードを決める（小1〜2／小3〜6／中学） */
export function defaultDisplayMode(grade: Grade): DisplayMode {
  if (grade === "e1" || grade === "e2") return "lower";
  if (grade.startsWith("e")) return "upper";
  return "junior";
}

/** 小学校の学年の数字（1〜6）。中学生は null */
export function elementaryYear(grade: Grade): number | null {
  return grade.startsWith("e") ? Number(grade.slice(1)) : null;
}

/**
 * 日本の年度（4月1日に切り替わる）。
 * 日付は日本時間で判定する。
 */
export function schoolYearOf(date: Date): number {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth() + 1;
  return month >= 4 ? year : year - 1;
}

export interface GradeState {
  grade: Grade;
  gradeSchoolYear: number;
}

export interface PromotionResult extends GradeState {
  /** 中3を終えた（MVP では学年は中3のまま） */
  graduated: boolean;
}

/**
 * 年度の切り替えで学年を進める（BR-1.5）。
 * MVP では中3より上には進めず、「卒業」として扱う。
 */
export function promoteGrade(state: GradeState, now: Date): PromotionResult {
  const currentYear = schoolYearOf(now);
  const years = currentYear - state.gradeSchoolYear;
  if (years <= 0) {
    return { ...state, graduated: isGraduated(state, now) };
  }
  const index = GRADES.indexOf(state.grade);
  const next = Math.min(index + years, GRADES.length - 1);
  const overflow = index + years > GRADES.length - 1;
  return {
    grade: GRADES[next],
    gradeSchoolYear: currentYear,
    graduated: overflow,
  };
}

/** 中3のまま年度を越えていれば「卒業」 */
export function isGraduated(state: GradeState, now: Date): boolean {
  return state.grade === "j3" && schoolYearOf(now) > state.gradeSchoolYear;
}
