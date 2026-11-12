import { gradeLocally, gradeNumber } from "@/domain/battle/grading";
import {
  normalizeText,
  normalizeWords,
} from "@/domain/battle/grading/normalize";
import { ratToString } from "@/domain/math/rational";
import { generatePrompt, solvePrompt } from "@/server/ai/prompts";
import { cleanRuby } from "@/server/ai/ruby";
import type {
  AIProvider,
  CallContext,
  GenerateInput,
  Usage,
} from "@/server/ai/provider";
import type {
  MistakeAnalysis,
  ProblemDraft,
  ProblemRole,
} from "@/server/ai/schemas";
import type { Grade } from "@/shared/constants";
import type { GenerateLine, VerifiedProblem } from "@/shared/problem";
import { checkSafety } from "./safety";
import { evaluateProblem } from "./verify/arith";

/**
 * 問題の生成と検証（U4、business-logic-model.md §4、BR-45-2・3）。
 * 生成 → 安全のチェック → 検証（検算・検証役の AI） → 通った問題だけを1問ずつ返す。
 * 足りなければ1回だけ作り直す。検証していない問題は、絶対に返さない。
 */

export const ROLES: Record<"first" | "revisit", ProblemRole[]> = {
  first: ["same-type", "focus", "stretch"],
  revisit: ["same-type", "stretch"],
};

export { MIN_BATTLE_PROBLEMS as MIN_PROBLEMS } from "@/shared/problem";

export type RejectReason =
  | "invalid_shape"
  | "blocked_word"
  | "pii"
  | "inappropriate"
  | "arith_mismatch"
  | "solver_mismatch"
  | "solver_error";

export interface PipelineInput {
  analysis: MistakeAnalysis;
  grade: Grade;
  mode: "first" | "revisit";
  avoid: string[];
}

export interface PipelineHooks {
  /** AI を呼ぶたびに、使用量を知らせる（記録と費用の計算に使う） */
  onUsage?: (role: "generate" | "verify", usage: Usage) => void;
  /** 落とした問題の理由（中身は渡さない） */
  onReject?: (reason: RejectReason) => void;
}

/** 問題の形の中で、矛盾がないか（AI に聞かずに確かめられること） */
function shapeOk(p: ProblemDraft): boolean {
  if (!p.answer.trim()) return false;
  const f = p.format;
  switch (f.kind) {
    case "choice": {
      const opts = f.options.map(normalizeText);
      return (
        new Set(opts).size === opts.length &&
        opts.filter((o) => o === normalizeText(p.answer)).length === 1
      );
    }
    case "ordering": {
      const sorted = (xs: string[]) =>
        xs
          .map((x) => x.toLowerCase())
          .sort()
          .join(" ");
      const words = normalizeWords(p.answer).split(" ");
      return sorted(f.tokens.map(normalizeWords)) === sorted(words);
    }
    case "numeric":
      // 作った側の答えが、自分の条件（約分して など）を満たしているか
      return gradeNumber(p.answer, p.answer, f);
    default:
      return true;
  }
}

/** 検証役の答えが、作った側の答えと同じか */
function sameAnswer(p: ProblemDraft, solved: string): boolean {
  if (!solved.trim()) return false;
  const f = p.format;
  switch (f.kind) {
    case "numeric":
      return gradeNumber(solved, p.answer, { unit: f.unit });
    case "choice":
      return (
        f.options.some((o) => normalizeText(o) === normalizeText(solved)) &&
        normalizeText(solved) === normalizeText(p.answer)
      );
    case "ordering":
      return normalizeWords(solved) === normalizeWords(p.answer);
    case "text":
      return gradeLocally(p, { kind: "text", value: solved }) === "correct";
    case "self-check":
      return normalizeText(solved) === normalizeText(p.answer);
  }
}

export async function* runPipeline(
  provider: AIProvider,
  input: PipelineInput,
  ctx: CallContext,
  hooks: PipelineHooks = {},
): AsyncGenerator<GenerateLine> {
  const roles = ROLES[input.mode];
  const seen = [...input.avoid];
  const missing = [...roles];
  let verified = 0;
  let rejected = 0;
  let timedOut = false;
  let regenerated = false;
  let lastError: unknown;
  const reject = (reason: RejectReason) => {
    rejected++;
    hooks.onReject?.(reason);
  };
  const aborted = () => ctx.signal?.aborted === true;

  async function verify(
    raw: ProblemDraft,
    model: string,
    regenerations: number,
  ): Promise<VerifiedProblem | null> {
    // ふりがなは、合わないものを先に捨てる（読みも安全のチェックに入れる・BR-6-7）
    const draft = cleanRuby(raw);
    if (!shapeOk(draft)) {
      reject("invalid_shape");
      return null;
    }
    const issue = checkSafety(draft);
    if (issue) {
      reject(issue);
      return null;
    }
    // 計算の式なら、計算器で確かめる（U45-Q-3）
    const computed =
      draft.format.kind === "numeric" ? evaluateProblem(draft.prompt) : null;
    if (
      computed &&
      draft.format.kind === "numeric" &&
      !gradeNumber(draft.answer, ratToString(computed), draft.format)
    ) {
      reject("arith_mismatch");
      return null;
    }
    // 検証役の AI：作った答えを見せずに解かせ、子ども向けとして適切かも答えさせる（U45-SAFE-1）。
    // 計算器で確かめた問題でも、ヒントと解説の文があるので、適切かどうかは必ず聞く
    const { answer: _a, explanation: _e, ruby: _r, ...shown } = draft;
    let solved: Awaited<ReturnType<AIProvider["solve"]>>;
    try {
      solved = await provider.solve(
        { problem: shown, grade: input.grade },
        ctx,
      );
    } catch (e) {
      if (aborted()) throw e;
      reject("solver_error");
      return null;
    }
    hooks.onUsage?.("verify", solved.usage);
    if (!solved.value.appropriate) {
      reject("inappropriate");
      return null;
    }
    if (!computed && !sameAnswer(draft, solved.value.answer)) {
      reject("solver_mismatch");
      return null;
    }
    return {
      ...draft,
      verification: {
        method: computed ? "arith" : "solver",
        regenerations,
        promptVersion: generatePrompt.id,
        verifierPromptVersion: solvePrompt.id,
        provider: provider.name,
        model,
        verifierModel: solved.usage.model,
      },
    };
  }

  for (let round = 0; round < 2 && missing.length > 0 && !aborted(); round++) {
    if (round > 0) regenerated = true;
    const request: GenerateInput = {
      analysis: input.analysis,
      grade: input.grade,
      roles: [...missing],
      mode: input.mode,
      avoid: [...seen],
    };
    const passed: ProblemRole[] = [];
    try {
      for await (const { value, usage } of provider.generateCounterProblems(
        request,
        ctx,
      )) {
        hooks.onUsage?.("generate", usage);
        seen.push(value.prompt);
        const ok = await verify(value, usage.model, round);
        if (ok) {
          verified++;
          passed.push(value.role);
          yield { problem: ok };
        }
      }
    } catch (e) {
      lastError = e;
      if (aborted()) timedOut = true;
    }
    // 同じ役割が2回通ることもあるので、通った分だけ取り除く
    for (const role of passed) {
      const i = missing.indexOf(role);
      if (i >= 0) missing.splice(i, 1);
    }
  }
  if (aborted()) timedOut = true;

  // 1問も作れず、AI の呼び出しが失敗していたなら、そのエラーを伝える
  if (verified === 0 && lastError && !timedOut) throw lastError;

  yield {
    done: true,
    meta: {
      requestId: ctx.requestId,
      verified,
      rejected,
      regenerated,
      timedOut,
    },
  };
}
