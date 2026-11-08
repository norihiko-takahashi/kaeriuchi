import { describe, expect, it } from "vitest";
import {
  lockDurationMs,
  registerFailure,
  registerSuccess,
  remainingLockMs,
  validateChildPin,
  validateGuardianPin,
} from "./pin";

describe("validateGuardianPin（6桁・BR-2.1）", () => {
  it("6桁の数字は OK", () => {
    expect(validateGuardianPin("482915")).toBeUndefined();
  });
  it.each(["12345", "1234567", "12a456", ""])("%s は形式エラー", (pin) => {
    expect(validateGuardianPin(pin)).toBe("format");
  });
  it.each(["000000", "777777"])("%s は繰り返し", (pin) => {
    expect(validateGuardianPin(pin)).toBe("repeated");
  });
  it.each(["123456", "987654", "890123", "210987"])("%s は連番", (pin) => {
    expect(validateGuardianPin(pin)).toBe("sequential");
  });
});

describe("validateChildPin（4桁・任意）", () => {
  it("4桁なら OK（子どもが覚えやすいよう、繰り返しや連番も許す）", () => {
    expect(validateChildPin("1111")).toBeUndefined();
    expect(validateChildPin("123")).toBe("format");
  });
});

describe("待ち時間（BR-2.3）", () => {
  it("4回までは待たない", () => {
    expect(lockDurationMs(4)).toBe(0);
  });
  it("5回で1分、そのあとは倍", () => {
    expect(lockDurationMs(5)).toBe(60_000);
    expect(lockDurationMs(6)).toBe(120_000);
    expect(lockDurationMs(7)).toBe(240_000);
  });
  it("最大30分", () => {
    expect(lockDurationMs(20)).toBe(30 * 60_000);
  });

  it("失敗を重ねるとロックされ、時間がたつと解ける", () => {
    const now = new Date("2026-11-08T10:00:00Z");
    let state = registerSuccess();
    for (let i = 0; i < 5; i++) state = registerFailure(state, now);
    expect(remainingLockMs(state, now)).toBe(60_000);
    expect(remainingLockMs(state, new Date(now.getTime() + 60_000))).toBe(0);
  });

  it("成功したら回数を戻す", () => {
    expect(registerSuccess()).toEqual({ failures: 0 });
  });
});
