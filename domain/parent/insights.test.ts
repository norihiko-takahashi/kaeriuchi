import { describe, expect, it } from "vitest";
import type { BattleRecord } from "@/domain/game/types";
import { computeInsights, type MistakeFact, weekStartOf } from "./insights";

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

describe("学習のようす（U7）", () => {
  it("週は月曜から", () => {
    expect(weekStartOf("2026-11-12")).toBe("2026-11-09"); // 木曜 → 月曜
    expect(weekStartOf("2026-11-09")).toBe("2026-11-09");
    expect(weekStartOf("2026-11-15")).toBe("2026-11-09"); // 日曜
  });

  it("数・撃破・再来の撃破率・教科ごと・TOP5・週ごとの推移", () => {
    const mistakes = [
      m("a", "math", "math.fraction.add-denominators", "2026-11-02"),
      m("b", "math", "math.fraction.add-denominators", "2026-11-10"),
      m("c", "math", "math.carry.missing", "2026-11-10"),
      m("d", "japanese", "japanese.kanji.reading", "2026-11-11"),
    ];
    const records = [
      rec("a", "2026-11-02", "first"),
      rec("a", "2026-11-03", "revisit"), // 再来で撃破
      rec("a", "2026-11-06", "revisit", "almost"), // 再来で負け
      rec("a", "2026-11-07", "practice"), // れんしゅうは数えない
      rec("b", "2026-11-10", "first", "almost"),
      rec("d", "2026-11-11", "first"),
    ];
    const r = computeInsights(mistakes, records, "2026-11-12", 3);
    expect(r.totals).toMatchObject({
      mistakes: 4,
      defeated: 2,
      revisitBattles: 2,
      revisitRate: 0.5,
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
      revisitBattles: 2,
      revisitRate: 0.5,
    });
    expect(r.weekly[2]).toMatchObject({
      registered: 3,
      revisitBattles: 0,
      revisitRate: null,
    });
  });

  it("記録がなければ、率は null（0% と見分ける）", () => {
    const r = computeInsights([], [], "2026-11-12");
    expect(r.totals).toMatchObject({
      mistakes: 0,
      revisitRate: null,
      streak: 0,
    });
    expect(r.weekly).toHaveLength(8);
    expect(r.topTypes).toEqual([]);
  });

  it("TOP5 は5つまで。同じ数なら ID の順", () => {
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
