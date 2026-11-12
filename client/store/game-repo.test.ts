import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answer, next, rescue } from "@/domain/battle/state";
import type { BattleMode } from "@/domain/game/types";
import type { VerifiedProblem } from "@/shared/problem";
import { createBattle, createMistake, finishBattle } from "./battle-repo";
import { currentDay } from "./clock";
import { KaeriuchiDB, setDBForTesting } from "./db";
import {
  battleOutcome,
  createSheet,
  gameSummary,
  getSheet,
  renameSheet,
  SheetTitleError,
} from "./game-repo";
import { createChild, devSignIn, pendingOutbox } from "./repo";

let db: KaeriuchiDB;
let childId: string;

const problem: VerifiedProblem = {
  role: "same-type",
  prompt: "1/3 + 1/4 = ?",
  format: { kind: "numeric" },
  answer: "7/12",
  hints: ["h1", "h2"],
  explanation: "e",
  verification: {
    method: "arith",
    regenerations: 0,
    promptVersion: "generate@3",
    verifierPromptVersion: "solve@2",
    provider: "mock",
    model: "m",
    verifierModel: "v",
  },
};

function setToday(day: string) {
  vi.setSystemTime(new Date(`${day}T12:00:00`));
}

async function newMistake(
  sheetId: string,
  typeId = "math.fraction.add-denominators",
) {
  return createMistake({
    childId,
    sheetId,
    grade: "e5",
    subject: "math",
    question: "q",
    childAnswer: "a",
    correctAnswer: "b",
    classified: { mistakeTypeId: typeId, unit: "u", explanation: "e" },
    classifiedBy: { provider: "mock", model: "m", promptVersion: "classify@1" },
  });
}

/** 2問のバトルを終える。win なら撃破、そうでなければ1問目を3回間違えて「あと一歩」 */
async function play(
  mistakeId: string,
  mode: BattleMode,
  win = true,
  opts: { hint?: boolean; rescue?: boolean } = {},
) {
  const m = await db.mistakes.get(mistakeId);
  let b = await createBattle(
    m as never,
    [problem, { ...problem, prompt: "p2" }],
    mode,
  );
  let s = b.state;
  if (opts.rescue) s = next(rescue(answer(s, false)));
  else if (!win) s = next(answer(answer(answer(s, false), false), false));
  else if (opts.hint) s = next(answer(answer(s, false), true));
  else s = next(answer(s, true));
  s = next(answer(s, true));
  b = await finishBattle({ ...b, state: s });
  return b;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  setToday("2026-11-10");
  db = new KaeriuchiDB(`test-${crypto.randomUUID()}`);
  setDBForTesting(db);
  await devSignIn("parent@example.com");
  childId = (
    await createChild({
      nickname: "きつね",
      grade: "e5",
      avatar: { face: 0, color: 0, accessory: 0 },
    })
  ).id;
});

afterEach(async () => {
  vi.useRealTimers();
  await db.delete();
  setDBForTesting(undefined);
});

describe("テスト", () => {
  it("名前は教科と日付から付け、1〜30字で変えられる。送信待ちに入る", async () => {
    const s = await createSheet(childId, "math");
    expect(s.title).toBe("さんすう 11/10 の テスト");
    const r = await renameSheet(s.id, " 2学期 分数のテスト ");
    expect(r.title).toBe("2学期 分数のテスト");
    expect((await getSheet(s.id))?.version).toBe(2);
    await expect(renameSheet(s.id, " ")).rejects.toBeInstanceOf(
      SheetTitleError,
    );
    await expect(renameSheet(s.id, "あ".repeat(31))).rejects.toBeInstanceOf(
      SheetTitleError,
    );
    await expect(renameSheet("nope", "x")).rejects.toThrow();
    expect(
      (await pendingOutbox()).filter((i) => i.entity === "sheet"),
    ).toHaveLength(2);
  });

  it("進み具合とクリア。ミスモンのないテストは一覧に出さない", async () => {
    const s = await createSheet(childId, "math");
    await createSheet(childId, "english");
    const a = await newMistake(s.id);
    await newMistake(s.id);
    await play(a.id, "first");
    const g = await gameSummary(childId);
    expect(g.sheets).toHaveLength(1);
    expect(g.sheets[0].progress).toEqual({
      defeated: 1,
      total: 2,
      cleared: false,
    });
  });
});

describe("ゲームの状態（記録から計算する）", () => {
  it("撃破 → 翌日に再来。XP・レベル・図鑑・連続記録が記録から決まる", async () => {
    const s = await createSheet(childId, "math");
    const a = await newMistake(s.id);
    expect((await gameSummary(childId)).open.map((v) => v.mistake.id)).toEqual([
      a.id,
    ]);

    const b1 = await play(a.id, "first");
    let g = await gameSummary(childId);
    expect(g.open).toEqual([]);
    expect(g.revisits.list).toEqual([]);
    expect(g.xp).toBe(80);
    expect(g.dex.get("math.fraction.add-denominators")).toBe("bronze");
    expect(g.streak).toMatchObject({ current: 1, todayDone: true });
    const o1 = await battleOutcome(childId, b1.id);
    expect(o1).toMatchObject({
      xpGained: 80,
      dexBefore: "seen",
      dexAfter: "bronze",
    });

    setToday("2026-11-11");
    g = await gameSummary(childId);
    expect(g.revisits.list.map((v) => v.mistake.id)).toEqual([a.id]);
    const b2 = await play(a.id, "revisit", true, { hint: true });
    const o2 = await battleOutcome(childId, b2.id);
    expect(o2?.xpParts.map((p) => p.kind)).toEqual(["revisitDefeat", "hints"]);
    expect(o2).toMatchObject({
      xpGained: 35,
      dexBefore: "bronze",
      dexAfter: "silver",
    });
    expect(o2?.levelBefore.level).toBe(1);
    expect(o2?.levelAfter.level).toBe(2);
    g = await gameSummary(childId);
    expect(g.level.level).toBe(2);
    expect(g.streak.current).toBe(2);
    expect(g.revisits).toEqual({ list: [], doneForToday: true });
  });

  it("あと一歩と、れんしゅうは日程を進めない。「あってるのに ×」はヒントなしに数えない", async () => {
    const s = await createSheet(childId, "math");
    const a = await newMistake(s.id);
    const lost = await play(a.id, "first", false);
    expect((await battleOutcome(childId, lost.id))?.xpGained).toBe(10);
    const won = await play(a.id, "first", true, { rescue: true });
    // 間違えてから「あってるのに ×」を使ったので、ヒント1つ分とみなし、ヒントなしのボーナスはない
    expect(
      (await battleOutcome(childId, won.id))?.xpParts.map((p) => p.kind),
    ).toEqual(["firstDefeat", "hints"]);
    const practice = await play(a.id, "practice");
    expect((await battleOutcome(childId, practice.id))?.xpGained).toBe(10);
    const g = await gameSummary(childId);
    expect(g.mistakes[0].state).toEqual({ stage: 1, dueDay: "2026-11-11" });
    expect(await battleOutcome(childId, "nope")).toBeUndefined();
  });

  it("時計を戻すと、前に見た日を今日にする（U6-TIME-1）", async () => {
    setToday("2026-11-12");
    await currentDay();
    setToday("2026-11-05");
    const g = await gameSummary(childId);
    expect(g).toMatchObject({ today: "2026-11-12", clockBack: true });
  });
});
