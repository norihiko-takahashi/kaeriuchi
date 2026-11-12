import { dayKey } from "@/domain/time/day";

/**
 * 「今日」を決める（U6-TIME-1）。端末の時計を信じるが、前に見た日より戻っていたら
 * （時計を戻した）、前に見た日を「今日」として扱い、連続記録と再来を進めない。
 */
export function effectiveToday(
  now: Date,
  lastSeenDay?: string,
): { today: string; clockBack: boolean } {
  const today = dayKey(now);
  if (lastSeenDay && today < lastSeenDay)
    return { today: lastSeenDay, clockBack: true };
  return { today, clockBack: false };
}
