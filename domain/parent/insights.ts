import { addDays, weekday } from "@/domain/game/day";
import {
  everDefeated,
  groupByMistake,
  isMastered,
  type ReplayStep,
  replay,
} from "@/domain/game/review";
import { streak } from "@/domain/game/streak";
import type { BattleRecord } from "@/domain/game/types";

/**
 * 保護者向けの「学習のようす」の集計（U7、US-7.1）。
 * 端末の記録（ミスモンとバトル）から計算するだけ。評価や診断（「苦手」・目安との比較・順位）はしない（NFR-P10）。
 * どの数字も画面に1回しか出さない前提で、親の問いごとに分けて返す（functional-design.md）。
 */

export interface MistakeFact {
  id: string;
  subject: string;
  mistakeTypeId: string;
  createdDay: string;
  question?: string;
  childAnswer?: string;
  correctAnswer?: string;
}

/** 1問ごとの段階（図鑑の金・銀・銅とは別。親の画面ではこちらを使う） */
export type StageName = "mastered" | "revisited" | "once" | "notYet";

export interface CalendarDay {
  day: string;
  /** 最後までやったバトルの回数（れんしゅうも含む） */
  battles: number;
  registered: number;
  /** お休みチケットで連続記録がつながった日 */
  ticket: boolean;
  today: boolean;
  future: boolean;
}

export interface WeekRow {
  weekStart: string;
  registered: number;
  /** その週に撃破した間違いの数（同じ問題を2回撃破しても1。れんしゅうは数えない） */
  defeated: number;
  revisitBattles: number;
  revisitDefeated: number;
  revisitRate: number | null;
}

export interface Insights {
  today: string;
  /** 最初に登録した日（登録がなければ null） */
  since: string | null;
  total: number;
  thisWeek: {
    start: string;
    end: string;
    battles: number;
    defeated: number;
    revisitBattles: number;
    revisitDefeated: number;
    /** 先週に撃破した数。先週より前に記録がなければ null（比べない） */
    lastWeekDefeated: number | null;
  };
  stages: Record<StageName, number>;
  revisit: { battles: number; defeated: number; rate: number | null };
  streak: { current: number; best: number };
  calendar: {
    /** 月曜から今週の日曜まで。最初の記録の週か、(weeks − 1) 週前の週の、新しいほうから */
    days: CalendarDay[];
    /** バトルをした日の数 */
    activeDays: number;
  };
  recentMastered: { mistake: MistakeFact; day: string } | null;
  bySubject: { subject: string; total: number; defeated: number }[];
  /** 多い順に 5つまで（順位は画面に出さない） */
  topTypes: { mistakeTypeId: string; total: number; defeated: number }[];
  /** 古い週から新しい週へ */
  weekly: WeekRow[];
}

/** その日をふくむ週の月曜 */
export function weekStartOf(day: string): string {
  return addDays(day, -((weekday(day) + 6) % 7));
}

/** 日程どおりの再来（れんしゅうは数えない） */
const isRevisit = (s: ReplayStep) =>
  s.record.mode === "revisit" && s.before.stage >= 1;
/** 日程を進めるバトルで撃破した */
const isScheduledWin = (s: ReplayStep) =>
  s.record.mode !== "practice" && s.record.result === "defeated";
const becameMastered = (s: ReplayStep) =>
  isMastered(s.after) && !isMastered(s.before);

export function stageName(stage: number): StageName {
  if (stage <= 0) return "notYet";
  if (stage === 1) return "once";
  return isMastered({ stage }) ? "mastered" : "revisited";
}

const inWeek = (d: string, start: string) =>
  d >= start && d < addDays(start, 7);

export function computeInsights(
  mistakes: MistakeFact[],
  records: BattleRecord[],
  today: string,
  weeks = 8,
): Insights {
  const known = new Set(mistakes.map((m) => m.id));
  const mine = records.filter((r) => known.has(r.mistakeId) && r.day <= today);
  const grouped = groupByMistake(mine);
  const stepsOf = new Map(
    mistakes.map((m) => [m.id, replay(grouped.get(m.id) ?? [])]),
  );
  const steps = [...stepsOf.values()].flat();
  const stageOf = (id: string) => stepsOf.get(id)?.at(-1)?.after.stage ?? 0;

  const stages: Record<StageName, number> = {
    mastered: 0,
    revisited: 0,
    once: 0,
    notYet: 0,
  };
  for (const m of mistakes) stages[stageName(stageOf(m.id))]++;

  const revisits = steps.filter(isRevisit);
  const revisitWins = revisits.filter(
    (s) => s.record.result === "defeated",
  ).length;

  const weekRow = (weekStart: string): WeekRow => {
    const rs = revisits.filter((s) => inWeek(s.record.day, weekStart));
    const wins = rs.filter((s) => s.record.result === "defeated").length;
    return {
      weekStart,
      registered: mistakes.filter((m) => inWeek(m.createdDay, weekStart))
        .length,
      defeated: new Set(
        steps
          .filter((s) => isScheduledWin(s) && inWeek(s.record.day, weekStart))
          .map((s) => s.record.mistakeId),
      ).size,
      revisitBattles: rs.length,
      revisitDefeated: wins,
      revisitRate: rs.length ? wins / rs.length : null,
    };
  };

  const thisWeek = weekStartOf(today);
  const current = weekRow(thisWeek);
  const createdDays = mistakes.map((m) => m.createdDay).sort();
  const firstDay = [...createdDays, ...mine.map((r) => r.day)].sort()[0];

  // 連続記録と、チケットでつながった日（カレンダーのマスと数を合わせる）
  const s = streak(
    mine.map((r) => r.day),
    today,
  );
  const tickets = new Set(s.ticketDays);

  const earliest = addDays(thisWeek, -7 * (weeks - 1));
  const firstWeek = firstDay ? weekStartOf(firstDay) : thisWeek;
  const calStart = firstWeek > earliest ? firstWeek : earliest;
  const battlesOn = new Map<string, number>();
  for (const r of mine) battlesOn.set(r.day, (battlesOn.get(r.day) ?? 0) + 1);
  const registeredOn = new Map<string, number>();
  for (const d of createdDays)
    registeredOn.set(d, (registeredOn.get(d) ?? 0) + 1);
  const days: CalendarDay[] = [];
  for (let d = calStart; d < addDays(thisWeek, 7); d = addDays(d, 1)) {
    const past = d <= today;
    days.push({
      day: d,
      battles: past ? (battlesOn.get(d) ?? 0) : 0,
      registered: past ? (registeredOn.get(d) ?? 0) : 0,
      ticket: tickets.has(d),
      today: d === today,
      future: !past,
    });
  }

  // いちばん新しく「覚えた」になった間違い
  const latest = steps
    .filter(becameMastered)
    .sort(
      (a, b) =>
        b.record.day.localeCompare(a.record.day) ||
        b.record.order - a.record.order,
    )[0];
  const recentMistake = latest
    ? mistakes.find((m) => m.id === latest.record.mistakeId)
    : undefined;

  const count = (key: (m: MistakeFact) => string) => {
    const out = new Map<string, { total: number; defeated: number }>();
    for (const m of mistakes) {
      const k = key(m);
      const v = out.get(k) ?? { total: 0, defeated: 0 };
      v.total++;
      if (everDefeated({ stage: stageOf(m.id) })) v.defeated++;
      out.set(k, v);
    }
    return [...out.entries()];
  };

  return {
    today,
    since: createdDays[0] ?? null,
    total: mistakes.length,
    thisWeek: {
      start: thisWeek,
      end: addDays(thisWeek, 6),
      battles: mine.filter((r) => inWeek(r.day, thisWeek)).length,
      defeated: current.defeated,
      revisitBattles: current.revisitBattles,
      revisitDefeated: current.revisitDefeated,
      lastWeekDefeated:
        firstDay && firstDay < thisWeek
          ? weekRow(addDays(thisWeek, -7)).defeated
          : null,
    },
    stages,
    revisit: {
      battles: revisits.length,
      defeated: revisitWins,
      rate: revisits.length ? revisitWins / revisits.length : null,
    },
    streak: { current: s.current, best: s.best },
    calendar: {
      days,
      activeDays: days.filter((d) => d.battles > 0).length,
    },
    recentMastered:
      latest && recentMistake
        ? { mistake: recentMistake, day: latest.record.day }
        : null,
    bySubject: count((m) => m.subject)
      .map(([subject, v]) => ({ subject, ...v }))
      .sort((a, b) => b.total - a.total || a.subject.localeCompare(b.subject)),
    topTypes: count((m) => m.mistakeTypeId)
      .map(([mistakeTypeId, v]) => ({ mistakeTypeId, ...v }))
      .sort(
        (a, b) =>
          b.total - a.total || a.mistakeTypeId.localeCompare(b.mistakeTypeId),
      )
      .slice(0, 5),
    weekly: Array.from({ length: weeks }, (_, i) =>
      weekRow(addDays(thisWeek, -7 * (weeks - 1 - i))),
    ),
  };
}

/* ---------- 日の詳細 ---------- */

export type DayBattleKind = "first" | "revisit" | "practice";

export interface DayBattle {
  battleId: string;
  mistake: MistakeFact;
  kind: DayBattleKind;
  /** 再来の何回目か（kind が revisit のとき） */
  revisitNo?: number;
  won: boolean;
  /** このバトルで「覚えた」になった */
  masteredNow: boolean;
}

export interface DayDetail {
  day: string;
  today: boolean;
  battles: DayBattle[];
  registered: MistakeFact[];
  /** 記録のある前の日・次の日（なければ null） */
  prev: string | null;
  next: string | null;
}

/** 記録（バトルか登録）のある日。古い順 */
export function recordedDays(
  mistakes: MistakeFact[],
  records: BattleRecord[],
  today: string,
): string[] {
  const known = new Set(mistakes.map((m) => m.id));
  return [
    ...new Set([
      ...mistakes.map((m) => m.createdDay),
      ...records.filter((r) => known.has(r.mistakeId)).map((r) => r.day),
    ]),
  ]
    .filter((d) => d <= today)
    .sort();
}

export function dayDetail(
  mistakes: MistakeFact[],
  records: BattleRecord[],
  day: string,
  today: string,
): DayDetail {
  const byId = new Map(mistakes.map((m) => [m.id, m]));
  const battles: (DayBattle & { order: number })[] = [];
  const grouped = groupByMistake(
    records.filter((r) => byId.has(r.mistakeId) && r.day <= today),
  );
  for (const [id, rs] of grouped) {
    const mistake = byId.get(id) as MistakeFact;
    let revisitNo = 0;
    for (const st of replay(rs)) {
      const revisit = isRevisit(st);
      if (revisit) revisitNo++;
      if (st.record.day !== day) continue;
      const kind: DayBattleKind =
        st.record.mode === "practice"
          ? "practice"
          : revisit
            ? "revisit"
            : "first";
      battles.push({
        battleId: st.record.battleId,
        order: st.record.order,
        mistake,
        kind,
        revisitNo: revisit ? revisitNo : undefined,
        won: st.record.result === "defeated",
        masteredNow: becameMastered(st),
      });
    }
  }
  const all = recordedDays(mistakes, records, today);
  return {
    day,
    today: day === today,
    battles: battles
      .sort((a, b) => a.order - b.order)
      .map(({ order: _, ...b }) => b),
    registered: mistakes.filter((m) => m.createdDay === day),
    prev: all.filter((d) => d < day).at(-1) ?? null,
    next: all.find((d) => d > day) ?? null,
  };
}
