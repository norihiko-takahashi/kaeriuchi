/**
 * 「1日」の区切りは、端末の時刻で午前0時（BR-3.3）。
 * 連続記録、1日に登録できる数、今日の再来ミスモンの計算に使う。
 * 0時をまたいだバトルは、始めた日の分に数える（その日付を渡す）。
 */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
