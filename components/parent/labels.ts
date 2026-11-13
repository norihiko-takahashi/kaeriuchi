import type { DayBattle, StageName } from "@/domain/parent/insights";

/** 保護者向けの言葉（U7）。評価や診断に聞こえる言葉は使わない（NFR-P10） */

/** 保護者向けの教科の名前（子どもの画面はひらがな） */
export const SUBJECTS: Record<string, string> = {
  math: "算数・数学",
  japanese: "国語",
  english: "英語",
  science: "理科",
  social: "社会",
};

/** 1問ごとの段階。色は「覚えた」がいちばん濃い。まだは白（枠だけ） */
export const STAGES: { key: StageName; label: string; fill: string }[] = [
  { key: "mastered", label: "覚えた", fill: "#1e3a8a" },
  { key: "revisited", label: "再来も撃破", fill: "#3b6fd8" },
  { key: "once", label: "1回撃破", fill: "#93b4ee" },
  { key: "notYet", label: "まだ", fill: "#ffffff" },
];

export const MASTERED_COLOR = "#1e3a8a";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const parts = (day: string) => day.split("-").map(Number);

/** 11月12日（木） */
export function dayLabel(day: string): string {
  const [y, m, d] = parts(day);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}月${d}日（${WEEKDAYS[w]}）`;
}

/** 11月12日 */
export const monthDay = (day: string) => {
  const [, m, d] = parts(day);
  return `${m}月${d}日`;
};

/** 11/12（グラフの目盛り） */
export const shortDay = (day: string) => {
  const [, m, d] = parts(day);
  return `${m}/${d}`;
};

/** 2026年11月9日〜15日（月をまたぐときは 〜12月6日） */
export function weekRange(start: string, end: string): string {
  const [y, m1, d1] = parts(start);
  const [, m2, d2] = parts(end);
  return `${y}年${m1}月${d1}日〜${m1 === m2 ? "" : `${m2}月`}${d2}日`;
}

export const yearOf = (day: string) => parts(day)[0];
export const monthOf = (day: string) => parts(day)[1];

export const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 日の詳細の結果（事実だけで書く） */
export function battleResult(b: DayBattle): string {
  const again = "もう一度（次の日にまた出る）";
  if (b.kind === "practice")
    return b.won ? "れんしゅう・撃破" : "れんしゅう・もう一度";
  if (b.kind === "revisit")
    return `再来 ${b.revisitNo}回目・${b.won ? "撃破" : again}`;
  return b.won ? "初めて撃破" : again;
}

/** 日の詳細への行き先。# のあとに「子どもの ID/日付」を入れる（オフラインでも開ける） */
export const dayHref = (childId: string, day: string) =>
  `/parent/insights/day#${encodeURIComponent(childId)}/${day}`;
