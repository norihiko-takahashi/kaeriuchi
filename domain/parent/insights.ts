import { addDays, weekday } from "@/domain/game/day";
import { everDefeated, replay, reviewState } from "@/domain/game/review";
import { streak } from "@/domain/game/streak";
import type { BattleRecord } from "@/domain/game/types";

/**
 * 保護者向けの「学習のようす」の集計（U7、US-7.1）。
 * 端末の記録（ミスモンとバトル）から計算するだけ。言葉の評価（「苦手」など）はしない（NFR-P10）。
 */

export interface MistakeFact {
  id: string;
  subject: string;
  mistakeTypeId: string;
  createdDay: string;
}

export interface Insights {
  totals: {
    mistakes: number;
    defeated: number;
    /** 再来で撃破した割合（再来のバトルがなければ null） */
    revisitRate: number | null;
    revisitBattles: number;
    streak: number;
    bestStreak: number;
  };
  bySubject: { subject: string; total: number; defeated: number }[];
  /** 多い順に 5つまで */
  topTypes: { mistakeTypeId: string; total: number; defeated: number }[];
  /** 古い週から新しい週へ。週は月曜から日曜 */
  weekly: {
    weekStart: string;
    registered: number;
    revisitBattles: number;
    revisitDefeated: number;
    revisitRate: number | null;
  }[];
}

/** その日をふくむ週の月曜 */
export function weekStartOf(day: string): string {
  return addDays(day, -((weekday(day) + 6) % 7));
}

export function computeInsights(
  mistakes: MistakeFact[],
  records: BattleRecord[],
  today: string,
  weeks = 8,
): Insights {
  const byMistake = new Map<string, BattleRecord[]>();
  for (const r of records)
    byMistake.set(r.mistakeId, [...(byMistake.get(r.mistakeId) ?? []), r]);
  const defeated = new Set(
    mistakes
      .filter((m) => everDefeated(reviewState(byMistake.get(m.id) ?? [])))
      .map((m) => m.id),
  );

  // 再来のバトル（日程どおりの再来だけ。れんしゅうは数えない）
  const revisits = [...byMistake.values()]
    .flatMap(replay)
    .filter((s) => s.record.mode === "revisit" && s.before.stage >= 1)
    .map((s) => s.record);
  const revisitWins = revisits.filter((r) => r.result === "defeated").length;

  const count = <K extends string>(key: (m: MistakeFact) => K) => {
    const out = new Map<K, { total: number; defeated: number }>();
    for (const m of mistakes) {
      const k = key(m);
      const v = out.get(k) ?? { total: 0, defeated: 0 };
      v.total++;
      if (defeated.has(m.id)) v.defeated++;
      out.set(k, v);
    }
    return out;
  };

  const thisWeek = weekStartOf(today);
  const weekly = Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(thisWeek, -7 * (weeks - 1 - i));
    const end = addDays(weekStart, 7);
    const inWeek = (d: string) => d >= weekStart && d < end;
    const rs = revisits.filter((r) => inWeek(r.day));
    const wins = rs.filter((r) => r.result === "defeated").length;
    return {
      weekStart,
      registered: mistakes.filter((m) => inWeek(m.createdDay)).length,
      revisitBattles: rs.length,
      revisitDefeated: wins,
      revisitRate: rs.length ? wins / rs.length : null,
    };
  });

  const s = streak(
    records.map((r) => r.day),
    today,
  );
  return {
    totals: {
      mistakes: mistakes.length,
      defeated: defeated.size,
      revisitRate: revisits.length ? revisitWins / revisits.length : null,
      revisitBattles: revisits.length,
      streak: s.current,
      bestStreak: s.best,
    },
    bySubject: [...count((m) => m.subject).entries()]
      .map(([subject, v]) => ({ subject, ...v }))
      .sort((a, b) => b.total - a.total || a.subject.localeCompare(b.subject)),
    topTypes: [...count((m) => m.mistakeTypeId).entries()]
      .map(([mistakeTypeId, v]) => ({ mistakeTypeId, ...v }))
      .sort(
        (a, b) =>
          b.total - a.total || a.mistakeTypeId.localeCompare(b.mistakeTypeId),
      )
      .slice(0, 5),
    weekly,
  };
}
