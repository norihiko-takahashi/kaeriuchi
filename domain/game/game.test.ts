import { describe, expect, it } from "vitest";
import { effectiveToday } from "./clock";
import { addDays, daysBetween, weekday } from "./day";
import { dex, higher, rankOf } from "./dex";
import {
  isDue,
  isMastered,
  MASTERED_STAGE,
  nextMode,
  replay,
  reviewState,
  todayRevisits,
} from "./review";
import { sheetProgress } from "./sheet";
import { streak } from "./streak";
import type { BattleMode, BattleRecord } from "./types";
import { levelFor, sumXp, xpForStep, xpToNext } from "./xp";

let order = 0;
const rec = (
  day: string,
  mode: BattleMode,
  result: "defeated" | "almost" = "defeated",
  problems: BattleRecord["problems"] = [
    { hints: 0, rescued: false },
    { hints: 0, rescued: false },
  ],
): BattleRecord => ({
  battleId: `b${++order}`,
  mistakeId: "m1",
  mode,
  result,
  day,
  order,
  problems,
});

describe("日付", () => {
  it.each([
    ["2026-01-31", 1, "2026-02-01"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2027-02-28", 1, "2027-03-01"],
    ["2026-12-31", 30, "2027-01-30"],
  ])("%s の %i 日後は %s（月末・うるう年）", (d, n, want) => {
    expect(addDays(d, n)).toBe(want);
  });
  it("日数の差と曜日", () => {
    expect(daysBetween("2026-11-01", "2026-11-12")).toBe(11);
    expect(weekday("2026-11-09")).toBe(1); // 月曜
  });
  it("時計を戻したら、前に見た日を今日にする（U6-TIME-1）", () => {
    const now = new Date(2026, 10, 10, 12);
    expect(effectiveToday(now, "2026-11-12")).toEqual({
      today: "2026-11-12",
      clockBack: true,
    });
    expect(effectiveToday(now, "2026-11-09")).toEqual({
      today: "2026-11-10",
      clockBack: false,
    });
    expect(effectiveToday(now).clockBack).toBe(false);
  });
});

describe("再来の日程（BR-6-2）", () => {
  it("1・3・7・14・30日後に再来し、5回目で完全撃破", () => {
    const records = [rec("2026-11-01", "first")];
    let s = reviewState(records);
    expect(s).toEqual({ stage: 1, dueDay: "2026-11-02" });
    const days = ["2026-11-02", "2026-11-05", "2026-11-12", "2026-11-26"];
    const want = ["2026-11-05", "2026-11-12", "2026-11-26", "2026-12-26"];
    for (const [i, d] of days.entries()) {
      records.push(rec(d, "revisit"));
      s = reviewState(records);
      expect(s.dueDay).toBe(want[i]);
    }
    records.push(rec("2026-12-26", "revisit"));
    s = reviewState(records);
    expect(s.stage).toBe(MASTERED_STAGE);
    expect(isMastered(s)).toBe(true);
    expect(isDue(s, "2027-01-30")).toBe(false);
  });

  it("初めてのバトルであと一歩なら翌日。再来であと一歩なら最初に戻る", () => {
    expect(reviewState([rec("2026-11-01", "first", "almost")])).toEqual({
      stage: 0,
      dueDay: "2026-11-02",
    });
    const s = reviewState([
      rec("2026-11-01", "first"),
      rec("2026-11-02", "revisit"),
      rec("2026-11-05", "revisit", "almost"),
    ]);
    expect(s).toEqual({ stage: 1, dueDay: "2026-11-06" });
  });

  it("れんしゅうは日程を進めない（BR-6-1）", () => {
    const s = reviewState([
      rec("2026-11-01", "first"),
      rec("2026-11-01", "practice"),
      rec("2026-11-01", "practice", "almost"),
    ]);
    expect(s).toEqual({ stage: 1, dueDay: "2026-11-02" });
  });

  it("次のバトルの種類", () => {
    expect(nextMode({ stage: 0 }, "2026-11-01")).toBe("first");
    expect(nextMode({ stage: 1, dueDay: "2026-11-02" }, "2026-11-01")).toBe(
      "practice",
    );
    expect(nextMode({ stage: 1, dueDay: "2026-11-02" }, "2026-11-03")).toBe(
      "revisit",
    );
    expect(nextMode({ stage: MASTERED_STAGE }, "2026-11-03")).toBe("practice");
  });

  it("今日の再来は、古い順に1日5匹まで。5匹倒したらその日はおしまい", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({
      id: i,
      state: { stage: 2, dueDay: `2026-11-0${7 - i}` },
    }));
    items.push({ id: 99, state: { stage: 2, dueDay: "2026-11-20" } });
    const t = todayRevisits(items, 0, "2026-11-10");
    expect(t.list.map((i) => i.id)).toEqual([6, 5, 4, 3, 2]);
    expect(t.doneForToday).toBe(false);
    expect(todayRevisits(items, 2, "2026-11-10").list).toHaveLength(3);
    const done = todayRevisits(items, 5, "2026-11-10");
    expect(done).toEqual({ list: [], doneForToday: true });
    expect(todayRevisits([], 0, "2026-11-10").doneForToday).toBe(false);
  });
});

describe("XP とレベル（BR-6-4）", () => {
  const xpOf = (records: BattleRecord[]) =>
    replay(records).map((s) => sumXp(xpForStep(s)));

  it("撃破 +50、ヒントなし +30、再来 +40、完全撃破 +100", () => {
    const records = [
      rec("2026-11-01", "first"),
      rec("2026-11-02", "revisit"),
      rec("2026-11-05", "revisit"),
      rec("2026-11-12", "revisit"),
      rec("2026-11-26", "revisit"),
      rec("2026-12-26", "revisit"),
    ];
    expect(xpOf(records)).toEqual([80, 70, 70, 70, 70, 130]);
  });

  it("ヒント1つで −5。撃破の XP は 20 より下がらない。「あってるのに ×」はヒントなしに数えない", () => {
    const hinted = [
      { hints: 1, rescued: false },
      { hints: 2, rescued: false },
    ];
    expect(xpOf([rec("2026-11-01", "first", "defeated", hinted)])).toEqual([
      35,
    ]);
    const many = Array.from({ length: 5 }, () => ({
      hints: 2,
      rescued: false,
    }));
    expect(xpOf([rec("2026-11-01", "first", "defeated", many)])).toEqual([20]);
    const rescued = [{ hints: 0, rescued: true }];
    expect(xpOf([rec("2026-11-01", "first", "defeated", rescued)])).toEqual([
      50,
    ]);
  });

  it("あと一歩 +10、れんしゅう +10。報告にはない", () => {
    expect(
      xpOf([
        rec("2026-11-01", "first", "almost"),
        rec("2026-11-02", "first"),
        rec("2026-11-02", "practice"),
      ]),
    ).toEqual([10, 80, 10]);
  });

  it("レベルは 100 + 50 ×（L − 1）ずつ", () => {
    expect(xpToNext(1)).toBe(100);
    expect(xpToNext(3)).toBe(200);
    expect(levelFor(0)).toEqual({ level: 1, into: 0, need: 100 });
    expect(levelFor(99).level).toBe(1);
    expect(levelFor(100)).toEqual({ level: 2, into: 0, need: 150 });
    expect(levelFor(260)).toEqual({ level: 3, into: 10, need: 200 });
    expect(levelFor(-5).level).toBe(1);
  });
});

describe("図鑑（BR-6-3）", () => {
  it("まだ → 銅 → 銀 → 金。タイプごとに強い方", () => {
    expect(rankOf({ stage: 0 })).toBe("seen");
    expect(rankOf({ stage: 1 })).toBe("bronze");
    expect(rankOf({ stage: 3 })).toBe("silver");
    expect(rankOf({ stage: MASTERED_STAGE })).toBe("gold");
    expect(higher("silver", "bronze")).toBe("silver");
    const d = dex([
      { mistakeTypeId: "a", state: { stage: 1 } },
      { mistakeTypeId: "a", state: { stage: 2 } },
      { mistakeTypeId: "a", state: { stage: 0 } },
      { mistakeTypeId: "b", state: { stage: 0 } },
    ]);
    expect(Object.fromEntries(d)).toEqual({ a: "silver", b: "seen" });
  });
});

describe("連続記録（BR-6-5）", () => {
  it("毎日やればのびる。今日まだでも途切れない", () => {
    const s = streak(["2026-11-10", "2026-11-11"], "2026-11-12");
    expect(s).toMatchObject({ current: 2, best: 2, todayDone: false });
    expect(streak(["2026-11-12"], "2026-11-12")).toMatchObject({
      current: 1,
      todayDone: true,
    });
    expect(streak([], "2026-11-12")).toMatchObject({ current: 0, tickets: 1 });
  });

  it("1日休んでも、お休みチケットで自動でつなぐ。2日目は途切れる。いちばん長い記録は残る", () => {
    // 2026-11-10(火) 11(水) やった、12(木) 休み、13(金) やった
    const s = streak(["2026-11-10", "2026-11-11", "2026-11-13"], "2026-11-13");
    expect(s).toMatchObject({
      current: 3,
      tickets: 0,
      ticketDays: ["2026-11-12"],
    });
    // チケットがないまま 14(土) も 15(日) も休み → 途切れる
    const broken = streak(
      ["2026-11-10", "2026-11-11", "2026-11-13"],
      "2026-11-16",
    );
    expect(broken).toMatchObject({ current: 0, best: 3 });
  });

  it("月曜にチケットが1枚もどる（ためておけるのは1枚まで）", () => {
    // 2026-11-06(金) 開始、7(土) 休み（チケット使用）、8(日) やった、9(月) にもどる、10(火) 休み（使用）
    const days = ["2026-11-06", "2026-11-08", "2026-11-09", "2026-11-11"];
    const s = streak(days, "2026-11-11");
    expect(s.ticketDays).toEqual(["2026-11-07", "2026-11-10"]);
    expect(s.current).toBe(4);
    // 休まずに月曜をまたいでも、2枚にはならない
    const full = streak(
      ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"],
      "2026-11-11",
    );
    expect(full.tickets).toBe(1);
  });

  it("未来の日付（時計を戻した前の記録）は数えない", () => {
    expect(streak(["2026-11-20"], "2026-11-12").current).toBe(0);
  });
});

describe("テストの進み具合（BR-6-1）", () => {
  it("全部を1回ずつ撃破したらクリア", () => {
    expect(sheetProgress([{ stage: 1 }, { stage: 0 }])).toEqual({
      defeated: 1,
      total: 2,
      cleared: false,
    });
    expect(sheetProgress([{ stage: 1 }, { stage: 6 }]).cleared).toBe(true);
    expect(sheetProgress([]).cleared).toBe(false);
  });
});

describe("速さ（U6-PERF-1）", () => {
  it("ミスモン 1,000匹・バトル 5,000回でも 50ms 以内", () => {
    const records: BattleRecord[] = [];
    for (let m = 0; m < 1000; m++)
      for (let b = 0; b < 5; b++)
        records.push({
          ...rec(addDays("2026-01-01", b * 3), b ? "revisit" : "first"),
          mistakeId: `m${m}`,
        });
    const t0 = performance.now();
    const byMistake = new Map<string, BattleRecord[]>();
    for (const r of records)
      byMistake.set(r.mistakeId, [...(byMistake.get(r.mistakeId) ?? []), r]);
    let xp = 0;
    for (const rs of byMistake.values())
      for (const s of replay(rs)) xp += sumXp(xpForStep(s));
    streak(
      records.map((r) => r.day),
      "2026-11-12",
    );
    expect(xp).toBeGreaterThan(0);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});
