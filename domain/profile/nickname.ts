export const NICKNAME_MAX = 16;

export type NicknameError =
  | "empty"
  | "too-long"
  | "newline"
  | "contact-info"
  | "duplicate";

export interface NicknameCheck {
  value: string;
  error?: NicknameError;
  /** 本名らしいので、やさしく確認する（保存は止めない。BR-1.3） */
  looksLikeRealName: boolean;
}

/** 書記素（見た目の1文字）で数える。絵文字や結合文字も1文字 */
export function countChars(text: string): number {
  const segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });
  let count = 0;
  for (const _ of segmenter.segment(text)) count++;
  return count;
}

const URL_PATTERN = /(https?:\/\/|www\.|\.(com|net|jp|org|io|me)\b)/i;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** 電話番号らしい形：数字（全角も含む）が、区切りをはさんで10桁以上 */
const PHONE_PATTERN = /(?:[0-9０-９][\s\-‐ー－()（）]*){10,}/;

export function containsContactInfo(text: string): boolean {
  return (
    URL_PATTERN.test(text) ||
    EMAIL_PATTERN.test(text) ||
    PHONE_PATTERN.test(text)
  );
}

const KANJI_ONLY = /^[\p{Script=Han}々]{2,6}$/u;
const HONORIFIC = /(さん|くん|ちゃん|君|様)$/;

/**
 * 本名らしいかの簡単な判定（BR-1.3）。
 * 精度は高くない。判定の方法は課題 R1 と一緒に見直す。
 */
export function looksLikeRealName(text: string): boolean {
  const compact = text.replace(/[\s　]/g, "");
  if (KANJI_ONLY.test(compact)) return true;
  if (HONORIFIC.test(compact)) return true;
  return false;
}

/** ニックネームを整えて、ルール（BR-1.2〜1.4）に合うかを調べる */
export function checkNickname(
  raw: string,
  existing: readonly string[] = [],
): NicknameCheck {
  const value = raw.trim();
  const base = { value, looksLikeRealName: looksLikeRealName(value) };
  if (/[\r\n]/.test(value)) return { ...base, error: "newline" };
  if (value.length === 0) return { ...base, error: "empty" };
  if (containsContactInfo(value)) return { ...base, error: "contact-info" };
  if (countChars(value) > NICKNAME_MAX) return { ...base, error: "too-long" };
  if (existing.some((name) => name.trim() === value)) {
    return { ...base, error: "duplicate" };
  }
  return base;
}

export const NICKNAME_ERROR_MESSAGES: Record<NicknameError, string> = {
  empty: "ニックネームを いれてね",
  "too-long": `${NICKNAME_MAX}もじ までに してね`,
  newline: "かいぎょうは つかえないよ",
  "contact-info": "URL・メールアドレス・でんわばんごうは つかえないよ",
  duplicate: "おなじ ニックネームの ひとが もう いるよ",
};
