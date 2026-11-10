import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { answer, next } from "@/domain/battle/state";
import type { VerifiedProblem } from "@/shared/problem";
import {
  activeBattle,
  addRegrade,
  addReport,
  appendProblem,
  changeMistakeType,
  completeRegrade,
  createBattle,
  createMistake,
  DailyLimitError,
  finishBattle,
  getMistake,
  listReports,
  mistakesToday,
  type NewMistake,
  openMistakes,
  pendingRegrades,
  saveBattle,
} from "./battle-repo";
import { KaeriuchiDB, setDBForTesting } from "./db";
import {
  createChild,
  deleteAllLocalData,
  deleteChild,
  devSignIn,
  exportData,
  pendingOutbox,
  setRules,
} from "./repo";

let db: KaeriuchiDB;
let childId: string;

const problem = (prompt: string): VerifiedProblem => ({
  role: "same-type",
  prompt,
  format: { kind: "numeric" },
  answer: "7/12",
  hints: ["h1", "h2"],
  explanation: "e",
  verification: {
    method: "arith",
    regenerations: 0,
    promptVersion: "generate@2",
    verifierPromptVersion: "solve@2",
    provider: "mock",
    model: "m",
    verifierModel: "v",
  },
});

const input = (): NewMistake => ({
  childId,
  grade: "e5",
  subject: "math",
  question: "1/2 + 1/3 = ?",
  childAnswer: "2/5",
  correctAnswer: "5/6",
  classified: {
    mistakeTypeId: "math.fraction.add-denominators",
    unit: "分数のたし算",
    explanation: "分母も足している",
  },
  classifiedBy: { provider: "mock", model: "m", promptVersion: "classify@1" },
});

beforeEach(async () => {
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
  await db.delete();
  setDBForTesting(undefined);
});

describe("ミスモン", () => {
  it("登録すると、時刻なしの日付だけを残し、送信待ちに入る", async () => {
    const m = await createMistake(input());
    expect(m.status).toBe("new");
    expect(m.createdDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(JSON.stringify(m)).not.toMatch(/T\d{2}:\d{2}/);
    const items = await pendingOutbox();
    expect(items.some((i) => i.entity === "mistake" && i.id === m.id)).toBe(
      true,
    );
  });

  it("1日に登録できる数を超えたら、登録しない（BR-3.1）", async () => {
    await setRules(childId, { dailyMistakeLimit: 1, notifications: false });
    await createMistake(input());
    await expect(createMistake(input())).rejects.toBeInstanceOf(
      DailyLimitError,
    );
    expect(await mistakesToday(childId)).toEqual({ used: 1, limit: 1 });
  });

  it("タイプを選び直せる。倒していないものだけを一覧に出す", async () => {
    const a = await createMistake(input());
    const changed = await changeMistakeType(a.id, "math.carry.missing");
    expect(changed.mistakeTypeId).toBe("math.carry.missing");
    expect(changed.version).toBe(2);
    await expect(changeMistakeType("nope", "x")).rejects.toThrow();
    expect((await openMistakes(childId)).map((m) => m.id)).toEqual([a.id]);
  });
});

describe("バトル", () => {
  it("検証の記録がない問題は入れない。途中から再開できる。撃破でミスモンを倒す", async () => {
    const m = await createMistake(input());
    const unverified = { ...problem("x"), verification: undefined } as never;
    let b = await createBattle(m, [problem("1/3 + 1/4 = ?"), unverified]);
    expect(b.problems).toHaveLength(1);
    expect(b.mode).toBe("first");
    b = await appendProblem(b, problem("2/3 + 1/6 = ?"));
    b = await appendProblem(b, unverified);
    expect(b.problems).toHaveLength(2);
    expect(b.state.problems).toHaveLength(2);

    b = await saveBattle({ ...b, state: next(answer(b.state, true)) });
    expect((await activeBattle(m.id))?.state.index).toBe(1);

    b = await saveBattle({ ...b, state: next(answer(b.state, true)) });
    expect(b.state.result).toBe("defeated");
    await finishBattle(b);
    expect(await activeBattle(m.id)).toBeUndefined();
    const after = await getMistake(m.id);
    expect(after?.status).toBe("defeated");
    expect(after?.usedPrompts).toEqual(["1/3 + 1/4 = ?", "2/3 + 1/6 = ?"]);
    expect(await openMistakes(childId)).toEqual([]);
  });

  it("あと一歩なら、ミスモンは残り、次は再来のバトルになる", async () => {
    const m = await createMistake(input());
    let b = await createBattle(m, [problem("q")]);
    let s = answer(answer(answer(b.state, false), false), false);
    s = next(s);
    b = await finishBattle({ ...b, state: s });
    const after = await getMistake(m.id);
    expect(after?.status).toBe("almost");
    expect((await createBattle(after as never, [problem("q2")])).mode).toBe(
      "revisit",
    );
    expect(b.finishedDay).toBeTruthy();
  });
});

describe("報告と、あとで採点し直す答え", () => {
  it("報告は送信待ちに入り、一覧で見られる。ニックネームと子どもの ID は入らない", async () => {
    const { verification, ...p } = problem("q");
    await addReport({
      reason: "marked-wrong",
      problem: p,
      childAnswer: "7/12",
      mistake: {
        subject: "math",
        grade: "e5",
        question: "q",
        childAnswer: "a",
        correctAnswer: "b",
        mistakeTypeId: "t",
      },
      rescued: true,
      ...verification,
    });
    const reports = await listReports();
    expect(reports).toHaveLength(1);
    const text = JSON.stringify(reports);
    expect(text).not.toContain("きつね");
    expect(text).not.toContain(childId);
  });

  it("採点し直した結果は送信待ちに移る", async () => {
    const { verification: _v, ...p } = problem("q");
    await addRegrade({
      problem: p,
      answer: "x",
      grade: "e5",
      childSaidSame: true,
    });
    const [r] = await pendingRegrades();
    await completeRegrade(r, false);
    expect(await pendingRegrades()).toEqual([]);
    const item = (await pendingOutbox()).find((i) => i.entity === "regrade");
    expect(item?.payload).toMatchObject({
      aiCorrect: false,
      childSaidSame: true,
    });
  });
});

describe("削除と書き出し", () => {
  it("子どもを消すと、その子のミスモンとバトルと、まだ送っていない変更も消える", async () => {
    const m = await createMistake(input());
    await createBattle(m, [problem("q")]);
    await deleteChild(childId);
    expect(await db.mistakes.count()).toBe(0);
    expect(await db.battles.count()).toBe(0);
    const entities = (await pendingOutbox()).map((i) => i.entity);
    expect(entities).not.toContain("mistake");
    expect(entities).not.toContain("battle");
  });

  it("書き出しにミスモンとバトルが入る。全部消すと残らない", async () => {
    const m = await createMistake(input());
    await createBattle(m, [problem("q")]);
    await addRegrade({
      problem: problem("q"),
      answer: "x",
      grade: "e5",
      childSaidSame: true,
    });
    const data = await exportData(childId);
    expect(data.mistakes).toHaveLength(1);
    expect(data.battles).toHaveLength(1);
    await deleteAllLocalData();
    expect(await db.mistakes.count()).toBe(0);
    expect(await db.battles.count()).toBe(0);
    expect(await db.regrades.count()).toBe(0);
  });
});

describe("スキーマの移行（v1 → v2）", () => {
  it("v1 のデータを残したまま、新しい表を足す", async () => {
    const name = `migrate-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({
      guardian: "id",
      children: "id, guardianId, [guardianId+nickname]",
      outbox: "++seq, entity, createdAt",
      meta: "key",
    });
    await v1.table("meta").put({ key: "k", value: 1 });
    v1.close();

    const v2 = new KaeriuchiDB(name);
    await v2.open();
    expect(v2.verno).toBe(2);
    expect(await v2.meta.get("k")).toEqual({ key: "k", value: 1 });
    expect(await v2.mistakes.count()).toBe(0);
    await v2.delete();
  });
});
