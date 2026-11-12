/** "YYYY-MM-DD" の日付の計算（時刻とタイムゾーンを持ち込まない） */

function parse(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function format(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return format(parse(day) + n * 86_400_000);
}

/** 日付の差（b − a）。日数 */
export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b) - parse(a)) / 86_400_000);
}

/** 曜日（0 = 日曜、1 = 月曜…） */
export function weekday(day: string): number {
  return new Date(parse(day)).getUTCDay();
}
