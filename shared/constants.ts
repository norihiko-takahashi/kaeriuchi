/**
 * 画面（ブラウザ）でも使う定数。
 * Zod を画面のプログラムに含めないよう、schemas.ts とは分けている（U1-PERF-2）。
 */

/** 学年。Phase 2 で "h1" | "h2" | "h3" を足す（BR-1.5） */
export const GRADES = [
  "e1",
  "e2",
  "e3",
  "e4",
  "e5",
  "e6",
  "j1",
  "j2",
  "j3",
] as const;
export type Grade = (typeof GRADES)[number];

/** 表示モード：低学年・高学年・中学生 */
export const DISPLAY_MODES = ["lower", "upper", "junior"] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];

export function isDisplayMode(value: string): value is DisplayMode {
  return (DISPLAY_MODES as readonly string[]).includes(value);
}
