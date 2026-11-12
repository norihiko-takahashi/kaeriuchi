import { type BattleState, startBattle } from "@/domain/battle/state";
import { isMastered, reviewState } from "@/domain/game/review";
import type { BattleMode } from "@/domain/game/types";
import type {
  Battle,
  Mistake,
  PendingRegrade,
  ProblemReport,
} from "@/shared/battle";
import { SHEET_MISTAKE_MAX } from "@/shared/battle";
import type { Grade } from "@/shared/constants";
import type {
  ClassifyResult,
  Subject,
  VerifiedProblem,
} from "@/shared/problem";
import type { OutboxItem, SyncEntity } from "@/shared/schemas";
import { currentDay, nextBattleOrder } from "./clock";
import { getDB } from "./db";
import { toRecord } from "./records";
import { getRules, requireGuardian } from "./repo";

/**
 * ミスモンとバトルの保存（U4・U5）。変更は送信待ち（outbox）にも入れ、U8 でクラウドに送る。
 */

const today = async () => (await currentDay()).today;

function outboxItem(
  entity: SyncEntity,
  id: string,
  payload: unknown,
): OutboxItem {
  // 送信待ちの並びのための時刻。学習の記録そのものには時刻を残さない（NFR-P11）
  const t = new Date().toISOString();
  return {
    entity,
    id,
    op: "upsert",
    payload,
    clientUpdatedAt: t,
    createdAt: t,
  };
}

/* ---------- ミスモン ---------- */

export class DailyLimitError extends Error {
  constructor(readonly limit: number) {
    super(`きょう登録できるのは ${limit}問までです`);
    this.name = "DailyLimitError";
  }
}

/** 今日登録した間違いの数と、上限（BR-3.1） */
export async function mistakesToday(
  childId: string,
): Promise<{ used: number; limit: number }> {
  const [used, rules] = await Promise.all([
    getDB()
      .mistakes.where("[childId+createdDay]")
      .equals([childId, await today()])
      .count(),
    getRules(childId),
  ]);
  return { used, limit: rules.dailyMistakeLimit };
}

export class SheetFullError extends Error {
  constructor(readonly max: number) {
    super(`1つのテストに入れられるのは ${max}問までです`);
    this.name = "SheetFullError";
  }
}

export interface NewMistake {
  childId: string;
  sheetId: string;
  grade: Grade;
  subject: Subject;
  question: string;
  childAnswer: string;
  correctAnswer: string;
  classified: ClassifyResult;
  classifiedBy: Mistake["classifiedBy"];
}

async function saveMistake(m: Mistake): Promise<Mistake> {
  const db = getDB();
  const next = { ...m, updatedDay: await today(), version: m.version + 1 };
  await db.transaction("rw", db.mistakes, db.outbox, async () => {
    await db.mistakes.put(next);
    await db.outbox.add(outboxItem("mistake", next.id, next));
  });
  return next;
}

export async function createMistake(input: NewMistake): Promise<Mistake> {
  const guardian = await requireGuardian();
  const { used, limit } = await mistakesToday(input.childId);
  if (used >= limit) throw new DailyLimitError(limit);
  const inSheet = await getDB()
    .mistakes.where("sheetId")
    .equals(input.sheetId)
    .count();
  if (inSheet >= SHEET_MISTAKE_MAX) throw new SheetFullError(SHEET_MISTAKE_MAX);
  const day = await today();
  return saveMistake({
    id: crypto.randomUUID(),
    guardianId: guardian.id,
    childId: input.childId,
    sheetId: input.sheetId,
    subject: input.subject,
    grade: input.grade,
    question: input.question,
    childAnswer: input.childAnswer,
    correctAnswer: input.correctAnswer,
    mistakeTypeId: input.classified.mistakeTypeId,
    unit: input.classified.unit,
    explanation: input.classified.explanation,
    source: "manual",
    status: "new",
    usedPrompts: [],
    classifiedBy: input.classifiedBy,
    createdDay: day,
    updatedDay: day,
    version: 0,
  });
}

export async function getMistake(id: string): Promise<Mistake | undefined> {
  return getDB().mistakes.get(id);
}

/** 判定が違ったとき、子どもがタイプを選び直す（S-21） */
export async function changeMistakeType(
  id: string,
  mistakeTypeId: string,
): Promise<Mistake> {
  const m = await getMistake(id);
  if (!m) throw new Error("ミスモンが見つかりません");
  return saveMistake({ ...m, mistakeTypeId });
}

/** まだ一度も撃破していないミスモン（新しいもの・あと一歩）。新しい順 */
export async function openMistakes(childId: string): Promise<Mistake[]> {
  const rows = await getDB()
    .mistakes.where("childId")
    .equals(childId)
    .toArray();
  return rows
    .filter((m) => m.status === "new" || m.status === "almost")
    .sort((a, b) => b.createdDay.localeCompare(a.createdDay));
}

/* ---------- バトル ---------- */

/** 終わっていないバトル（つづきから再開する・BR-45-6） */
export async function activeBattle(
  mistakeId: string,
): Promise<Battle | undefined> {
  const rows = await getDB()
    .battles.where("mistakeId")
    .equals(mistakeId)
    .toArray();
  return rows.find((b) => b.state.phase !== "finished");
}

/** そのミスモンの、終えたバトルの一覧 */
export async function finishedBattles(mistakeId: string): Promise<Battle[]> {
  const rows = await getDB()
    .battles.where("mistakeId")
    .equals(mistakeId)
    .toArray();
  return rows.filter((b) => b.state.phase === "finished");
}

export async function createBattle(
  mistake: Mistake,
  problems: VerifiedProblem[],
  mode: BattleMode,
): Promise<Battle> {
  // 検証の記録がない問題は出さない（U45-Q-1 の二重の守り）
  const verified = problems.filter((p) => p.verification?.promptVersion);
  const battle: Battle = {
    id: crypto.randomUUID(),
    guardianId: mistake.guardianId,
    childId: mistake.childId,
    mistakeId: mistake.id,
    mode,
    problems: verified,
    lastAnswers: verified.map(() => null),
    state: startBattle(verified.length),
    startedDay: await today(),
    version: 0,
  };
  return saveBattle(battle);
}

/** 問題が後から届いたとき（作りながら届ける）に足す */
export async function appendProblem(
  battle: Battle,
  problem: VerifiedProblem,
): Promise<Battle> {
  if (!problem.verification?.promptVersion) return battle;
  const state: BattleState = {
    ...battle.state,
    problems: [...battle.state.problems, startBattle(1).problems[0]],
  };
  return saveBattle({
    ...battle,
    problems: [...battle.problems, problem],
    lastAnswers: [...battle.lastAnswers, null],
    state,
  });
}

export async function saveBattle(battle: Battle): Promise<Battle> {
  const db = getDB();
  const next = { ...battle, version: battle.version + 1 };
  await db.transaction("rw", db.battles, db.outbox, async () => {
    await db.battles.put(next);
    await db.outbox.add(outboxItem("battle", next.id, next));
  });
  return next;
}

/**
 * 作りかけで終わったバトルを捨てる（問題が2問そろわなかったとき・BR-45-2）。
 * まだ送っていない変更も送らない。ミスモンは残す（あとで戦える）
 */
export async function abandonBattle(battleId: string): Promise<void> {
  const db = getDB();
  await db.transaction("rw", db.battles, db.outbox, async () => {
    await db.battles.delete(battleId);
    await db.outbox
      .filter((i) => i.entity === "battle" && i.id === battleId)
      .delete();
  });
}

/**
 * バトルを終える。終えた日と順番を付け、ミスモンの状態（表示の目安）を記録から計算し直す。
 * XP・図鑑・連続記録・再来の日程は、保存せずに記録から計算する（U6-DATA-1）
 */
export async function finishBattle(battle: Battle): Promise<Battle> {
  const day = await today();
  const saved = await saveBattle({
    ...battle,
    finishedDay: day,
    order: battle.order ?? (await nextBattleOrder()),
  });
  const m = await getMistake(battle.mistakeId);
  if (m && battle.state.result) {
    const records = (await finishedBattles(m.id)).flatMap((b) => {
      const r = toRecord(b);
      return r ? [r] : [];
    });
    const s = reviewState(records);
    await saveMistake({
      ...m,
      status: isMastered(s) ? "mastered" : s.stage >= 1 ? "defeated" : "almost",
      lastBattleDay: day,
      usedPrompts: [
        ...new Set([...m.usedPrompts, ...battle.problems.map((p) => p.prompt)]),
      ],
    });
  }
  return saved;
}

/* ---------- 報告（BR-45-8） ---------- */

export type NewReport = Omit<ProblemReport, "id" | "createdDay">;

export async function addReport(input: NewReport): Promise<ProblemReport> {
  const report: ProblemReport = {
    ...input,
    id: crypto.randomUUID(),
    createdDay: await today(),
  };
  await getDB().outbox.add(outboxItem("report", report.id, report));
  return report;
}

/** 送信待ちの報告（保護者メニューで一覧を見る） */
export async function listReports(): Promise<ProblemReport[]> {
  const items = await getDB().outbox.where("entity").equals("report").toArray();
  return items.map((i) => i.payload as ProblemReport).reverse();
}

/* ---------- あとで採点し直す答え（U45-OFF-2） ---------- */

export async function addRegrade(
  input: Omit<PendingRegrade, "id" | "createdDay">,
): Promise<void> {
  await getDB().regrades.add({
    ...input,
    id: crypto.randomUUID(),
    createdDay: await today(),
  });
}

export async function pendingRegrades(): Promise<PendingRegrade[]> {
  return getDB().regrades.toArray();
}

/** AI の採点の結果を記録する。子どもの結果は変えない */
export async function completeRegrade(
  r: PendingRegrade,
  aiCorrect: boolean,
): Promise<void> {
  const db = getDB();
  await db.transaction("rw", db.regrades, db.outbox, async () => {
    await db.regrades.delete(r.id);
    await db.outbox.add(outboxItem("regrade", r.id, { ...r, aiCorrect }));
  });
}
