import type { ProblemDraft } from "@/shared/problem";
import blocklist from "./blocklist.json";

/**
 * 出す前の安全のチェック（U45-SAFE-1・2）。
 * 1段目：出さない言葉の一覧。2段目：検証役の AI の判定（pipeline.ts）。
 */

const ASCII = /^[a-z ]+$/;

const terms = blocklist.words.map((w) => {
  const word = w.normalize("NFKC").toLowerCase();
  return ASCII.test(word)
    ? { test: (s: string) => new RegExp(`\\b${word}\\b`).test(s) }
    : { test: (s: string) => s.includes(word) };
});

/** 個人情報らしい文字（電話番号、メールアドレス、郵便番号、番地までの住所） */
const PII_PATTERNS = [
  /(?<!\d)0\d{1,4}-\d{1,4}-\d{3,4}(?!\d)/,
  /(?<![\d.])0[5-9]0\d{8}(?!\d)/,
  /[\w.+-]+@[\w-]+\.[\w.-]+/,
  /〒\s*\d{3}-?\d{4}/,
  /[都道府県].{1,8}[市区町村].{0,12}\d+\s*(丁目|番地|番|号)/,
];

export type SafetyIssue = "blocked_word" | "pii";

/** 問題の中の、子どもに見せる文字をすべて集める */
export function visibleText(p: ProblemDraft): string {
  const f = p.format;
  const extra =
    f.kind === "choice"
      ? f.options
      : f.kind === "text"
        ? f.acceptable
        : f.kind === "ordering"
          ? f.tokens
          : f.kind === "self-check"
            ? [f.model]
            : [f.unit ?? ""];
  return [p.prompt, p.answer, p.explanation, ...p.hints, ...extra].join("\n");
}

export function checkSafety(p: ProblemDraft): SafetyIssue | null {
  const text = visibleText(p).normalize("NFKC").toLowerCase();
  if (terms.some((t) => t.test(text))) return "blocked_word";
  if (PII_PATTERNS.some((re) => re.test(text))) return "pii";
  return null;
}
