import { effectiveToday } from "@/domain/game/clock";
import { getDB } from "./db";

const KEY = "last-seen-day";

/**
 * 「今日」（U6-TIME-1）。端末の時計が前に見た日より戻っていたら、前に見た日を返す。
 * 学習の記録の日付は、すべてこれで決める。
 */
export async function currentDay(
  now = new Date(),
): Promise<{ today: string; clockBack: boolean }> {
  const db = getDB();
  const row = await db.meta.get(KEY);
  const last = typeof row?.value === "string" ? row.value : undefined;
  const r = effectiveToday(now, last);
  if (!last || r.today > last) await db.meta.put({ key: KEY, value: r.today });
  return r;
}

/** バトルを終えた順番の番号（時刻の代わり） */
export async function nextBattleOrder(): Promise<number> {
  const db = getDB();
  return db.transaction("rw", db.meta, async () => {
    const row = await db.meta.get("battle-order");
    const n = (typeof row?.value === "number" ? row.value : 0) + 1;
    await db.meta.put({ key: "battle-order", value: n });
    return n;
  });
}
