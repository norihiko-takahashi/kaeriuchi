import { describe, expect, it } from "vitest";
import { dayKey } from "@/domain/time/day";
import { clampDailyLimit, defaultRules, isWithinAllowedHours } from "./rules";

const at = (hh: number, mm = 0) => new Date(2026, 10, 8, hh, mm);

describe("使い方のルール（BR-3）", () => {
  it("初期値：1日10問、時間の制限なし、通知オフ", () => {
    expect(defaultRules()).toEqual({
      dailyMistakeLimit: 10,
      notifications: false,
    });
  });

  it("時間の制限がなければいつでも使える", () => {
    expect(isWithinAllowedHours(defaultRules(), at(3))).toBe(true);
  });

  it("16:00〜20:00", () => {
    const rules = {
      ...defaultRules(),
      allowedHours: ["16:00", "20:00"] as [string, string],
    };
    expect(isWithinAllowedHours(rules, at(15, 59))).toBe(false);
    expect(isWithinAllowedHours(rules, at(16))).toBe(true);
    expect(isWithinAllowedHours(rules, at(19, 59))).toBe(true);
    expect(isWithinAllowedHours(rules, at(20))).toBe(false);
  });

  it("夜をまたぐ時間帯（20:00〜07:00）", () => {
    const rules = {
      ...defaultRules(),
      allowedHours: ["20:00", "07:00"] as [string, string],
    };
    expect(isWithinAllowedHours(rules, at(23))).toBe(true);
    expect(isWithinAllowedHours(rules, at(6, 30))).toBe(true);
    expect(isWithinAllowedHours(rules, at(12))).toBe(false);
  });

  it("1日の上限は1〜30問に収める", () => {
    expect(clampDailyLimit(0)).toBe(1);
    expect(clampDailyLimit(31)).toBe(30);
    expect(clampDailyLimit(12.4)).toBe(12);
    expect(clampDailyLimit(Number.NaN)).toBe(1);
  });
});

describe("dayKey（区切りは午前0時・BR-3.3）", () => {
  it("23:59 と 0:00 は別の日", () => {
    expect(dayKey(new Date(2026, 10, 8, 23, 59))).toBe("2026-11-08");
    expect(dayKey(new Date(2026, 10, 9, 0, 0))).toBe("2026-11-09");
  });
});

describe("時刻の形式", () => {
  it("isValidTime", async () => {
    const { isValidTime } = await import("./rules");
    expect(isValidTime("07:30")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("7:30")).toBe(false);
  });
  it("開始と終了が同じなら制限なしとして扱う", () => {
    const rules = {
      ...defaultRules(),
      allowedHours: ["08:00", "08:00"] as [string, string],
    };
    expect(isWithinAllowedHours(rules, at(3))).toBe(true);
  });
  it("形式が正しくない時刻はエラー", () => {
    const rules = {
      ...defaultRules(),
      allowedHours: ["8時", "20:00"] as [string, string],
    };
    expect(() => isWithinAllowedHours(rules, at(3))).toThrow();
  });
});
