import { type DexRank, dex } from "@/domain/game/dex";
import {
  type ReplayStep,
  type ReviewState,
  replay,
  reviewState,
  type TodayRevisits,
  todayRevisits,
} from "@/domain/game/review";
import { sheetProgress } from "@/domain/game/sheet";
import { type Streak, streak } from "@/domain/game/streak";
import type { BattleRecord } from "@/domain/game/types";
import {
  type LevelInfo,
  levelFor,
  sumXp,
  type XpPart,
  xpForStep,
} from "@/domain/game/xp";
import { type Mistake, SHEET_TITLE_MAX, type Sheet } from "@/shared/battle";
import type { Subject } from "@/shared/problem";
import type { OutboxItem } from "@/shared/schemas";
import { currentDay } from "./clock";
import { getDB, sheetTitle } from "./db";
import { toRecord } from "./records";
import { requireGuardian } from "./repo";

/**
 * テストと、ゲームの状態（U6）。ゲームの状態は保存せず、バトルの記録から毎回計算する（U6-DATA-1）。
 */

function outboxItem(id: string, payload: unknown): OutboxItem {
  const t = new Date().toISOString();
  return {
    entity: "sheet",
    id,
    op: "upsert",
    payload,
    clientUpdatedAt: t,
    createdAt: t,
  };
}

/* ---------- テスト（BR-6-1） ---------- */

export async function createSheet(
  childId: string,
  subject: Subject,
): Promise<Sheet> {
  const guardian = await requireGuardian();
  const { today } = await currentDay();
  const sheet: Sheet = {
    id: crypto.randomUUID(),
    guardianId: guardian.id,
    childId,
    title: sheetTitle(subject, today),
    subject,
    createdDay: today,
    version: 1,
  };
  const db = getDB();
  await db.transaction("rw", db.sheets, db.outbox, async () => {
    await db.sheets.put(sheet);
    await db.outbox.add(outboxItem(sheet.id, sheet));
  });
  return sheet;
}

export class SheetTitleError extends Error {
  constructor() {
    super(`テストの名前は 1〜${SHEET_TITLE_MAX}字です`);
    this.name = "SheetTitleError";
  }
}

export async function renameSheet(id: string, title: string): Promise<Sheet> {
  const t = title.trim();
  if (!t || [...t].length > SHEET_TITLE_MAX) throw new SheetTitleError();
  const db = getDB();
  const sheet = await db.sheets.get(id);
  if (!sheet) throw new Error("テストが見つかりません");
  const next = { ...sheet, title: t, version: sheet.version + 1 };
  await db.transaction("rw", db.sheets, db.outbox, async () => {
    await db.sheets.put(next);
    await db.outbox.add(outboxItem(next.id, next));
  });
  return next;
}

export async function getSheet(id: string): Promise<Sheet | undefined> {
  return getDB().sheets.get(id);
}

/* ---------- ゲームの状態 ---------- */

export interface MistakeView {
  mistake: Mistake;
  state: ReviewState;
}

export interface SheetView {
  sheet: Sheet;
  mistakes: MistakeView[];
  progress: { defeated: number; total: number; cleared: boolean };
}

export interface GameSummary {
  today: string;
  clockBack: boolean;
  mistakes: MistakeView[];
  /** まだ一度も撃破していないもの（新しい順） */
  open: MistakeView[];
  revisits: TodayRevisits<MistakeView>;
  xp: number;
  level: LevelInfo;
  streak: Streak;
  dex: Map<string, DexRank>;
  sheets: SheetView[];
}

async function load(childId: string) {
  const db = getDB();
  const [mistakes, battles, sheets] = await Promise.all([
    db.mistakes.where("childId").equals(childId).toArray(),
    db.battles.where("childId").equals(childId).toArray(),
    db.sheets.where("childId").equals(childId).toArray(),
  ]);
  const records = battles.flatMap((b) => {
    const r = toRecord(b);
    return r ? [r] : [];
  });
  return { mistakes, records, sheets };
}

function byMistake(records: BattleRecord[]): Map<string, BattleRecord[]> {
  const out = new Map<string, BattleRecord[]>();
  for (const r of records)
    out.set(r.mistakeId, [...(out.get(r.mistakeId) ?? []), r]);
  return out;
}

export async function gameSummary(childId: string): Promise<GameSummary> {
  const { today, clockBack } = await currentDay();
  const { mistakes, records, sheets } = await load(childId);
  const grouped = byMistake(records);
  const views: MistakeView[] = mistakes.map((m) => ({
    mistake: m,
    state: reviewState(grouped.get(m.id) ?? []),
  }));
  const steps = [...grouped.values()].flatMap(replay);
  const xp = steps.reduce((n, s) => n + sumXp(xpForStep(s)), 0);
  const revisitsToday = records.filter(
    (r) => r.mode === "revisit" && r.day === today,
  ).length;
  const sheetViews: SheetView[] = sheets
    .map((sheet) => {
      const ms = views.filter((v) => v.mistake.sheetId === sheet.id);
      return {
        sheet,
        mistakes: ms,
        progress: sheetProgress(ms.map((v) => v.state)),
      };
    })
    .filter((s) => s.mistakes.length > 0)
    .sort((a, b) => b.sheet.createdDay.localeCompare(a.sheet.createdDay));
  return {
    today,
    clockBack,
    mistakes: views,
    open: views
      .filter((v) => v.state.stage === 0)
      .sort((a, b) => b.mistake.createdDay.localeCompare(a.mistake.createdDay)),
    revisits: todayRevisits(views, revisitsToday, today),
    xp,
    level: levelFor(xp),
    // 時計を戻していたら、連続記録を進めない（U6-TIME-1）
    streak: streak(
      records.map((r) => r.day),
      today,
    ),
    dex: dex(
      views.map((v) => ({
        mistakeTypeId: v.mistake.mistakeTypeId,
        state: v.state,
      })),
    ),
    sheets: sheetViews,
  };
}

/** 結果の画面で見せる、このバトルでもらったもの（BR-6-3・6-4・6-5） */
export interface BattleOutcome {
  xpParts: XpPart[];
  xpGained: number;
  levelBefore: LevelInfo;
  levelAfter: LevelInfo;
  dexBefore: DexRank | undefined;
  dexAfter: DexRank;
  streak: Streak;
  step: ReplayStep;
}

export async function battleOutcome(
  childId: string,
  battleId: string,
): Promise<BattleOutcome | undefined> {
  const { today } = await currentDay();
  const { mistakes, records } = await load(childId);
  const target = records.find((r) => r.battleId === battleId);
  if (!target) return undefined;
  const mistake = mistakes.find((m) => m.id === target.mistakeId);
  if (!mistake) return undefined;
  const without = records.filter(
    (r) => r.battleId !== battleId && r.order < target.order,
  );
  const upTo = [...without, target];

  const xpOf = (rs: BattleRecord[]) =>
    [...byMistake(rs).values()]
      .flatMap(replay)
      .reduce((n, s) => n + sumXp(xpForStep(s)), 0);
  const step = replay(upTo.filter((r) => r.mistakeId === mistake.id)).at(-1);
  if (!step) return undefined;
  const parts = xpForStep(step);

  const dexOf = (rs: BattleRecord[]) => {
    const grouped = byMistake(rs);
    return dex(
      mistakes.map((m) => ({
        mistakeTypeId: m.mistakeTypeId,
        state: reviewState(grouped.get(m.id) ?? []),
      })),
    ).get(mistake.mistakeTypeId);
  };
  return {
    xpParts: parts,
    xpGained: sumXp(parts),
    levelBefore: levelFor(xpOf(without)),
    levelAfter: levelFor(xpOf(upTo)),
    dexBefore: dexOf(without),
    dexAfter: dexOf(upTo) ?? "seen",
    streak: streak(
      records.map((r) => r.day),
      today,
    ),
    step,
  };
}
