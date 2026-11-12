import type { ProblemDraft, RubyEntry } from "@/shared/problem";

/**
 * AI が返したふりがなを確かめる（BR-6-7、U6-RUBY-1）。
 * 合わないものは捨てる（問題そのものは出す）。
 */

export const MAX_RUBY = 30;
const HIRAGANA = /^[\u3041-\u3096\u30fc]+$/u;
const HAN = /\p{Script=Han}/u;

/** ふりがなを付けてよい文（子どもに見せる文。答えには付けない） */
function rubyTargets(p: ProblemDraft): string {
  const f = p.format;
  const extra =
    f.kind === "choice"
      ? f.options
      : f.kind === "text"
        ? f.acceptable
        : f.kind === "ordering"
          ? f.tokens
          : [];
  return [p.prompt, p.explanation, ...p.hints, ...extra].join("\n");
}

export function cleanRuby(p: ProblemDraft): ProblemDraft {
  const { ruby, ...rest } = p;
  if (!ruby?.length) return rest;
  const text = rubyTargets(p);
  const seen = new Set<string>();
  const ok: RubyEntry[] = [];
  for (const r of ruby) {
    const word = r.word.normalize("NFC").trim();
    const reading = r.reading.normalize("NFC").trim();
    if (seen.has(word)) continue;
    if (!HAN.test(word) || !HIRAGANA.test(reading)) continue;
    if (!text.includes(word)) continue;
    seen.add(word);
    ok.push({ word, reading });
    if (ok.length >= MAX_RUBY) break;
  }
  return ok.length ? { ...rest, ruby: ok } : rest;
}
