import rules from "@/content/game/rules.json";
import { addDays } from "./day";
import type { BattleMode, BattleRecord } from "./types";

/**
 * 再来の日程（BR-6-2）。バトルの記録を順番どおりに当てはめて、いまの段階を計算する。
 * stage：0 = まだ撃破していない、1 = 初めて撃破した、2〜5 = 再来を (stage − 1) 回撃破した、6 = 完全撃破
 */
export const MASTERED_STAGE = rules.review.intervalsDays.length + 1;

export interface ReviewState {
  stage: number;
  /** 次に再来する日（stage が 1〜5 のとき） */
  dueDay?: string;
}

export interface ReplayStep {
  record: BattleRecord;
  before: ReviewState;
  after: ReviewState;
}

export const everDefeated = (s: ReviewState) => s.stage >= 1;
export const isMastered = (s: ReviewState) => s.stage >= MASTERED_STAGE;

export function applyBattle(s: ReviewState, r: BattleRecord): ReviewState {
  // れんしゅうは日程を進めない（BR-6-1）
  if (r.mode === "practice") return s;
  const intervals = rules.review.intervalsDays;
  if (r.result === "defeated") {
    const stage = Math.min(s.stage + 1, MASTERED_STAGE);
    if (stage >= MASTERED_STAGE) return { stage };
    return { stage, dueDay: addDays(r.day, intervals[stage - 1]) };
  }
  // あと一歩：撃破したことがなければ翌日にまた出る。再来で負けたら、間隔を最初に戻す（FR-7.3）
  return { stage: s.stage === 0 ? 0 : 1, dueDay: addDays(r.day, 1) };
}

/** 1匹のミスモンの記録を、順番どおりに当てはめる */
export function replay(records: BattleRecord[]): ReplayStep[] {
  const steps: ReplayStep[] = [];
  let s: ReviewState = { stage: 0 };
  for (const r of [...records].sort((a, b) => a.order - b.order)) {
    const after = applyBattle(s, r);
    steps.push({ record: r, before: s, after });
    s = after;
  }
  return steps;
}

export function reviewState(records: BattleRecord[]): ReviewState {
  return replay(records).at(-1)?.after ?? { stage: 0 };
}

/** 次のバトルの種類 */
export function nextMode(s: ReviewState, today: string): BattleMode {
  if (s.stage === 0) return "first";
  if (!isMastered(s) && s.dueDay && s.dueDay <= today) return "revisit";
  return "practice";
}

/** 再来の日が来ているか */
export const isDue = (s: ReviewState, today: string) =>
  everDefeated(s) && !isMastered(s) && !!s.dueDay && s.dueDay <= today;

export interface TodayRevisits<T> {
  /** 今日出すもの（予定の日が古い順に、上限まで） */
  list: T[];
  /** 今日の分を全部倒して、残りは次の日（BR-6-2） */
  doneForToday: boolean;
}

/** 今日の再来（1日の上限つき・BR-6-2） */
export function todayRevisits<T extends { state: ReviewState }>(
  items: T[],
  revisitsDoneToday: number,
  today: string,
  cap: number = rules.review.dailyRevisitCap,
): TodayRevisits<T> {
  const due = items
    .filter((i) => isDue(i.state, today))
    .sort((a, b) => (a.state.dueDay ?? "").localeCompare(b.state.dueDay ?? ""));
  const remaining = Math.max(0, cap - revisitsDoneToday);
  return {
    list: due.slice(0, remaining),
    doneForToday: revisitsDoneToday > 0 && remaining === 0,
  };
}
