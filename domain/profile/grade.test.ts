import { describe, expect, it } from "vitest";
import {
  defaultDisplayMode,
  isGraduated,
  promoteGrade,
  schoolYearOf,
} from "./grade";

describe("defaultDisplayMode（小1〜2／小3〜6／中学）", () => {
  it.each([
    ["e1", "lower"],
    ["e2", "lower"],
    ["e3", "upper"],
    ["e6", "upper"],
    ["j1", "junior"],
    ["j3", "junior"],
  ] as const)("%s → %s", (grade, mode) => {
    expect(defaultDisplayMode(grade)).toBe(mode);
  });
});

describe("schoolYearOf（4月1日に切り替わる・日本時間）", () => {
  it("3月31日は前の年度", () => {
    expect(schoolYearOf(new Date("2027-03-31T14:59:59Z"))).toBe(2026);
  });
  it("日本時間の4月1日0時からは新しい年度", () => {
    // 2027-04-01T00:00 JST = 2027-03-31T15:00Z
    expect(schoolYearOf(new Date("2027-03-31T15:00:00Z"))).toBe(2027);
  });
});

describe("promoteGrade（BR-1.5）", () => {
  it("同じ年度なら変わらない", () => {
    const r = promoteGrade(
      { grade: "e3", gradeSchoolYear: 2026 },
      new Date("2027-01-10T00:00:00Z"),
    );
    expect(r).toEqual({ grade: "e3", gradeSchoolYear: 2026, graduated: false });
  });

  it("年度が1つ進むと1つ上がる", () => {
    const r = promoteGrade(
      { grade: "e6", gradeSchoolYear: 2026 },
      new Date("2027-04-02T00:00:00Z"),
    );
    expect(r).toEqual({ grade: "j1", gradeSchoolYear: 2027, graduated: false });
  });

  it("しばらく開かなかったら、その分まとめて上がる", () => {
    const r = promoteGrade(
      { grade: "e1", gradeSchoolYear: 2026 },
      new Date("2029-05-01T00:00:00Z"),
    );
    expect(r.grade).toBe("e4");
  });

  it("中3の次は中3のまま「卒業」（Phase 2 で高校生に対応）", () => {
    const r = promoteGrade(
      { grade: "j3", gradeSchoolYear: 2026 },
      new Date("2027-04-02T00:00:00Z"),
    );
    expect(r).toEqual({ grade: "j3", gradeSchoolYear: 2027, graduated: true });
  });

  it("中2から2年進んでも中3で止まる", () => {
    const r = promoteGrade(
      { grade: "j2", gradeSchoolYear: 2026 },
      new Date("2028-04-02T00:00:00Z"),
    );
    expect(r).toEqual({ grade: "j3", gradeSchoolYear: 2028, graduated: true });
  });
});

describe("isGraduated", () => {
  it("中3の年度のうちは卒業ではない", () => {
    expect(
      isGraduated(
        { grade: "j3", gradeSchoolYear: 2026 },
        new Date("2027-03-01"),
      ),
    ).toBe(false);
  });
});
