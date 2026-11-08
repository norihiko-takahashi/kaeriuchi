import { describe, expect, it } from "vitest";
import { checkNickname, countChars, looksLikeRealName } from "./nickname";

describe("checkNickname（BR-1.2〜1.4）", () => {
  it("前後の空白を取り除く", () => {
    const r = checkNickname("  ほのおのきつね ");
    expect(r.value).toBe("ほのおのきつね");
    expect(r.error).toBeUndefined();
  });

  it("空はだめ", () => {
    expect(checkNickname("   ").error).toBe("empty");
  });

  it("16文字までは OK、17文字はだめ", () => {
    expect(checkNickname("あ".repeat(16)).error).toBeUndefined();
    expect(checkNickname("あ".repeat(17)).error).toBe("too-long");
  });

  it("絵文字は1文字として数える", () => {
    expect(countChars("👨‍👩‍👧🦊")).toBe(2);
    expect(checkNickname("🦊".repeat(16)).error).toBeUndefined();
  });

  it("改行はだめ", () => {
    expect(checkNickname("きつね\nたろう").error).toBe("newline");
  });

  it.each([
    "https://example.com",
    "www.example",
    "kitsune@example.com",
    "090-1234-5678",
    "０９０１２３４５６７８",
  ])("連絡先の形 %s はだめ", (name) => {
    expect(checkNickname(name).error).toBe("contact-info");
  });

  it("短い数字はだめにしない", () => {
    expect(checkNickname("さんすう100てん").error).toBeUndefined();
  });

  it("同じ保護者の中で同じニックネームはだめ", () => {
    expect(checkNickname("きつね", ["きつね"]).error).toBe("duplicate");
  });
});

describe("looksLikeRealName（やさしく確認するだけ）", () => {
  it.each([
    "山田太郎",
    "田中 花子",
    "ゆうとくん",
    "さくらちゃん",
  ])("%s は本名らしい", (name) => {
    expect(looksLikeRealName(name)).toBe(true);
  });
  it.each([
    "ほのおのきつね",
    "さんすうマスター",
    "Kitsune",
  ])("%s は本名らしくない", (name) => {
    expect(looksLikeRealName(name)).toBe(false);
  });
  it("本名らしくても保存は止めない", () => {
    const r = checkNickname("山田太郎");
    expect(r.error).toBeUndefined();
    expect(r.looksLikeRealName).toBe(true);
  });
});
