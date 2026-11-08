import { describe, expect, it } from "vitest";
import { CURRENT_CONSENT_VERSION, needsConsent } from "./consent";

describe("needsConsent（BR-5.1）", () => {
  it("同意していなければ必要", () => {
    expect(needsConsent(undefined)).toBe(true);
  });
  it("古い版に同意していたら、もう一度必要", () => {
    expect(needsConsent("0.0.1")).toBe(true);
  });
  it("今の版に同意していれば不要", () => {
    expect(needsConsent(CURRENT_CONSENT_VERSION)).toBe(false);
  });
});
