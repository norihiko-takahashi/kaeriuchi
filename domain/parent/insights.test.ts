import { describe, expect, it } from "vitest";
import { addDays } from "@/domain/game/day";
import type { BattleRecord } from "@/domain/game/types";
import {
  computeInsights,
  dayDetail,
  type MistakeFact,
  recordedDays,
  stageName,
  weekStartOf,
} from "./insights";

let order = 0;
const rec = (
  mistakeId: string,
  day: string,
  mode: BattleRecord["mode"],
  result: BattleRecord["result"] = "defeated",
): BattleRecord => ({
  battleId: `b${++order}`,
  mistakeId,
  mode,
  result,
  day,
  order,
  problems: [{ hints: 0, rescued: false }],
});
const m = (
  id: string,
  subject: string,
  type: string,
  day: string,
): MistakeFact => ({
  id,
  subject,
  mistakeTypeId: type,
  createdDay: day,
});

/** 初めて撃破してから、日程どおりに再来を5回撃破する（1・3・7・14・30日後）→ 覚えた */
function toMastery(id: string, start: string): BattleRecord[] {
  const out = [rec(id, start, "first")];
  let d = start;
  for (const gap of [1, 3, 7, 14, 30]) {
    d = addDays(d, gap);
    out.push(rec(id, d, "revisit"));
  }
  return out;
}

describe("学習のようす（U7）", () => {
  it("週は月曜から", () => {
    expect(weekStartOf("2026-11-12")).toBe("2026-11-09"); // 木曜 → 月曜
    expect(weekStartOf("2026-11-09")).toBe("2026-11-09");
    expect(weekStartOf("2026-11-15")).toBe("2026-11-09"); // 日曜
  });

  it("段階の名前", () => {
    expect([0, 1, 2, 5, 6].map(stageName)).toEqual([
      "notYet",
      "once",
      "revisited",
      "revisited",
      "mastered",
    ]);
  });

  it("今週・これまで・教科ごと・登録の多い間違い・週ごとの推移", () => {
    const mistakes = [
      m("a", "math", "math.fraction.add-denominators", "2026-11-02"),
      m("b", "math", "math.fraction.add-denominators", "2026-11-10"),
      m("c", "math", "math.carry.missing", "2026-11-10"),
      m("d", "japanese", "japanese.kanji.reading", "2026-11-11"),
    ];
    const records = [
      rec("a", "2026-11-02", "first"),
      rec("a", "2026-11-03", "revisit"), // 再来で撃破
      rec("a", "2026-11-06", "revisit", "almost"), // 再来で負け → 1回撃破に戻る
      rec("a", "2026-11-07", "practice"), // れんしゅうは数えない
      rec("b", "2026-11-10", "first", "almost"),
      rec("d", "2026-11-11", "first"),
      rec("a", "2026-11-12", "practice"),
    ];
    const r = computeInsights(mistakes, records, "2026-11-12", 3);
    expect(r.total).toBe(4);
    expect(r.since).toBe("2026-11-02");
    expect(r.stages).toEqual({
      mastered: 0,
      revisited: 0,
      once: 2,
      notYet: 2,
    });
    expect(r.revisit).toEqual({ battles: 2, defeated: 1, rate: 0.5 });
    // 今週：バトル3回（れんしゅうも数える）、撃破は d の1問。先週は a の1問
    expect(r.thisWeek).toEqual({
      start: "2026-11-09",
      end: "2026-11-15",
      battles: 3,
      defeated: 1,
      revisitBattles: 0,
      revisitDefeated: 0,
      lastWeekDefeated: 1,
    });
    expect(r.bySubject).toEqual([
      { subject: "math", total: 3, defeated: 1 },
      { subject: "japanese", total: 1, defeated: 1 },
    ]);
    expect(r.topTypes[0]).toEqual({
      mistakeTypeId: "math.fraction.add-denominators",
      total: 2,
      defeated: 1,
    });
    expect(r.weekly.map((w) => w.weekStart)).toEqual([
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
    ]);
    expect(r.weekly[1]).toMatchObject({
      registered: 1,
      defeated: 1,
      revisitBattles: 2,
      revisitRate: 0.5,
    });
    expect(r.weekly[2]).toMatchObject({
      registered: 3,
      defeated: 1,
      revisitBattles: 0,
      revisitRate: null,
    });
    expect(r.recentMastered).toBeNull();
  });

  it("カレンダーは最初の記録の週から。未来は空で、今日に印。チケットの日も分かる", () => {
    const mistakes = [m("a", "math", "t", "2026-11-04")];
    const records = [
      rec("a", "2026-11-04", "first"), // 水
      rec("a", "2026-11-05", "revisit"), // 木
      // 11-06（金）は休み → お休みチケットでつながる
      rec("a", "2026-11-07", "practice"),
      rec("a", "2026-11-07", "practice"),
    ];
    const r = computeInsights(mistakes, records, "2026-11-08");
    const days = r.calendar.days;
    expect(days[0].day).toBe("2026-11-02");
    expect(days.at(-1)?.day).toBe("2026-11-08"); // 今日が日曜
    const byDay = new Map(days.map((d) => [d.day, d]));
    expect(byDay.get("2026-11-04")).toMatchObject({
      battles: 1,
      registered: 1,
    });
    expect(byDay.get("2026-11-06")).toMatchObject({ battles: 0, ticket: true });
    expect(byDay.get("2026-11-07")?.battles).toBe(2);
    expect(byDay.get("2026-11-08")).toMatchObject({
      today: true,
      future: false,
    });
    expect(r.calendar.activeDays).toBe(3);
    // チケットの日は数えないが、途切れない（4・5・7日の3日）
    expect(r.streak.current).toBe(3);
  });

  it("カレンダーは長くても weeks 週まで。今日より先は future", () => {
    const mistakes = [m("a", "math", "t", "2026-01-05")];
    const r = computeInsights(mistakes, [], "2026-11-12", 8);
    expect(r.calendar.days).toHaveLength(56);
    expect(r.calendar.days[0].day).toBe("2026-09-21");
    expect(r.calendar.days.filter((d) => d.future)).toHaveLength(3);
    expect(r.calendar.activeDays).toBe(0);
  });

  it("最初の週は、先週と比べない", () => {
    const mistakes = [m("a", "math", "t", "2026-11-10")];
    const r = computeInsights(
      mistakes,
      [rec("a", "2026-11-10", "first")],
      "2026-11-12",
    );
    expect(r.thisWeek.lastWeekDefeated).toBeNull();
    expect(r.calendar.days).toHaveLength(7);
  });

  it("いちばん新しく「覚えた」になった間違い", () => {
    const mistakes = [
      m("a", "math", "t", "2026-08-01"),
      m("b", "math", "t", "2026-08-03"),
    ];
    const records = [
      ...toMastery("a", "2026-08-01"),
      ...toMastery("b", "2026-08-03"),
    ];
    const r = computeInsights(mistakes, records, "2026-11-12");
    expect(r.stages.mastered).toBe(2);
    expect(r.recentMastered).toEqual({
      mistake: mistakes[1],
      day: "2026-09-27",
    });
    expect(r.revisit).toEqual({ battles: 10, defeated: 10, rate: 1 });
  });

  it("記録がなければ、率は null（0% と見分ける）", () => {
    const r = computeInsights([], [], "2026-11-12");
    expect(r.total).toBe(0);
    expect(r.since).toBeNull();
    expect(r.revisit.rate).toBeNull();
    expect(r.streak.current).toBe(0);
    expect(r.calendar.days).toHaveLength(7);
    expect(r.weekly).toHaveLength(8);
    expect(r.topTypes).toEqual([]);
    expect(r.thisWeek.lastWeekDefeated).toBeNull();
  });

  it("消したミスモンの記録や、未来の日付の記録は数えない", () => {
    const mistakes = [m("a", "math", "t", "2026-11-10")];
    const r = computeInsights(
      mistakes,
      [rec("gone", "2026-11-10", "first"), rec("a", "2026-11-20", "first")],
      "2026-11-12",
    );
    expect(r.thisWeek.battles).toBe(0);
    expect(r.stages.notYet).toBe(1);
  });

  it("登録の多い間違いは5つまで。同じ数なら ID の順", () => {
    const mistakes = Array.from({ length: 7 }, (_, i) =>
      m(
        `x${i}`,
        "math",
        `math.t.${String.fromCharCode(103 - i)}`,
        "2026-11-10",
      ),
    );
    const r = computeInsights(mistakes, [], "2026-11-12");
    expect(r.topTypes.map((t) => t.mistakeTypeId)).toEqual([
      "math.t.a",
      "math.t.b",
      "math.t.c",
      "math.t.d",
      "math.t.e",
    ]);
  });
});

describe("日の詳細（U7）", () => {
  const mistakes = [
    m("a", "math", "t", "2026-08-01"),
    m("b", "english", "u", "2026-09-29"),
  ];
  const records = [
    ...toMastery("a", "2026-08-01"), // 最後の再来は 2026-09-25
    rec("b", "2026-09-29", "first", "almost"),
    rec("b", "2026-09-30", "first"),
    rec("b", "2026-10-01", "revisit", "almost"),
    rec("b", "2026-10-01", "practice"),
  ];

  it("その日のバトルの種類・再来の回数・覚えた", () => {
    const d = dayDetail(mistakes, records, "2026-09-25", "2026-11-12");
    expect(d.battles).toEqual([
      {
        battleId: expect.any(String),
        mistake: mistakes[0],
        kind: "revisit",
        revisitNo: 5,
        won: true,
        masteredNow: true,
      },
    ]);
    expect(d.registered).toEqual([]);
    expect(d.today).toBe(false);
  });

  it("初めて（2回目のちょうせんも初めて）・再来でもう一度・れんしゅう。登録した間違い", () => {
    const d1 = dayDetail(mistakes, records, "2026-09-29", "2026-11-12");
    expect(d1.battles.map((b) => [b.kind, b.won])).toEqual([["first", false]]);
    expect(d1.registered).toEqual([mistakes[1]]);
    const d2 = dayDetail(mistakes, records, "2026-10-01", "2026-11-12");
    expect(
      d2.battles.map((b) => [b.kind, b.revisitNo, b.won, b.masteredNow]),
    ).toEqual([
      ["revisit", 1, false, false],
      ["practice", undefined, true, false],
    ]);
  });

  it("前の日・次の日は、記録のある日だけ", () => {
    const d = dayDetail(mistakes, records, "2026-09-29", "2026-11-12");
    expect(d.prev).toBe("2026-09-25");
    expect(d.next).toBe("2026-09-30");
    const last = dayDetail(mistakes, records, "2026-10-01", "2026-10-01");
    expect(last).toMatchObject({ next: null, today: true });
    expect(recordedDays(mistakes, records, "2026-08-02")).toEqual([
      "2026-08-01",
      "2026-08-02",
    ]);
  });
});
