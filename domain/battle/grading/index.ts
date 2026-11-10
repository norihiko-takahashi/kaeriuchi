import type { AnswerFormat, ProblemDraft } from "@/shared/problem";
import { editDistance, normalizeText, normalizeWords } from "./normalize";
import { gradeNumber } from "./numeric";

/**
 * 端末での採点（BR-45-7、NFR-S3）。
 * "unsure" は、短い文で一覧にはないが似ているとき。通信できれば AI で採点し、
 * できなければ子どもに「おなじ？」と聞く（U45-OFF-2）。
 */
export type Verdict = "correct" | "wrong" | "unsure";

/** 子どもの答え。並べ替えは単語の並び、自己採点は「できた」かどうか */
export type ChildAnswer =
  | { kind: "text"; value: string }
  | { kind: "ordering"; value: string[] }
  | { kind: "self-check"; value: boolean };

function similar(answer: string, accepted: string[]): boolean {
  if (answer.length < 2) return false;
  return accepted.some(
    (a) =>
      a.length >= 2 &&
      (answer.includes(a) ||
        a.includes(answer) ||
        editDistance(answer, a) <= Math.max(1, Math.floor(a.length / 4))),
  );
}

export function gradeLocally(
  problem: Pick<ProblemDraft, "format" | "answer">,
  input: ChildAnswer,
): Verdict {
  const format: AnswerFormat = problem.format;
  switch (format.kind) {
    case "numeric":
      if (input.kind !== "text") return "wrong";
      return gradeNumber(input.value, problem.answer, format)
        ? "correct"
        : "wrong";
    case "choice":
      if (input.kind !== "text") return "wrong";
      return normalizeText(input.value) === normalizeText(problem.answer)
        ? "correct"
        : "wrong";
    case "text": {
      if (input.kind !== "text") return "wrong";
      const got = normalizeText(input.value);
      if (!got) return "wrong";
      const accepted = [problem.answer, ...format.acceptable].map(
        normalizeText,
      );
      if (accepted.includes(got)) return "correct";
      return similar(got, accepted) ? "unsure" : "wrong";
    }
    case "ordering":
      if (input.kind !== "ordering") return "wrong";
      return normalizeWords(input.value.join(" ")) ===
        normalizeWords(problem.answer)
        ? "correct"
        : "wrong";
    case "self-check":
      if (input.kind !== "self-check") return "wrong";
      return input.value ? "correct" : "wrong";
  }
}

export { normalizeText, normalizeWords } from "./normalize";
export { gradeNumber, parseNumber } from "./numeric";
