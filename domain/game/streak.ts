import rules from "@/content/game/rules.json";
import { addDays, weekday } from "./day";

/** 連続記録（BR-6-5） */
export interface Streak {
  current: number;
  best: number;
  /** いま持っているお休みチケット */
  tickets: number;
  todayDone: boolean;
  /** お休みチケットを使った日 */
  ticketDays: string[];
}

const MONDAY = 1;

/**
 * バトルを最後までやった日の一覧から計算する。
 * - 月曜にお休みチケットを1枚配る（ためておけるのは maxTickets まで）。始めた週は1枚持って始める
 * - できなかった日（今日より前）は、チケットがあれば自動で使ってつなぐ。なければ途切れる
 * - 今日はまだ終わっていないので、今日やっていなくても途切れない
 */
export function streak(activeDays: Iterable<string>, today: string): Streak {
  const days = new Set(activeDays);
  const sorted = [...days].filter((d) => d <= today).sort();
  const max = rules.streak.maxTickets;
  if (sorted.length === 0)
    return {
      current: 0,
      best: 0,
      tickets: max,
      todayDone: false,
      ticketDays: [],
    };

  let tickets = max;
  let current = 0;
  let best = 0;
  const ticketDays: string[] = [];
  for (let d = sorted[0]; d <= today; d = addDays(d, 1)) {
    if (weekday(d) === MONDAY && d !== sorted[0])
      tickets = Math.min(max, tickets + 1);
    if (days.has(d)) {
      current++;
    } else if (d < today) {
      if (current > 0 && tickets > 0) {
        tickets--;
        ticketDays.push(d);
      } else {
        current = 0;
      }
    }
    best = Math.max(best, current);
  }
  return { current, best, tickets, todayDone: days.has(today), ticketDays };
}
