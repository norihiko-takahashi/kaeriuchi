import type { Grade } from "@/shared/constants";
import type {
  GradeResult,
  MistakeAnalysis,
  MistakeTypeSummary,
  ProblemDraft,
  SolveResult,
  Subject,
} from "./schemas";

export type AiRole = "analyze" | "generate" | "verify" | "grade";

/** 1回の呼び出しの使用量（記録と費用の計算に使う） */
export interface Usage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  retries: number;
}

export interface WithUsage<T> {
  value: T;
  usage: Usage;
}

export interface CallContext {
  requestId: string;
  signal?: AbortSignal;
}

export interface AnalyzeInput {
  image: { mime: "image/jpeg" | "image/png"; data: Uint8Array };
  grade: Grade;
  subjectHint?: Subject;
  mistakeTypeCatalog: MistakeTypeSummary[];
}

export interface GenerateInput {
  analysis: MistakeAnalysis;
  grade: Grade;
  count: number;
  mode: "first" | "revisit" | "boss";
  avoid: string[];
}

/**
 * AI のプロバイダー（inception/application-design/ai-provider.md）。
 * AWS などの SDK に依存してよいのは、実装（providers/*）の中だけ。
 */
export interface AIProvider {
  readonly name: "mock" | "bedrock";

  analyzeMistake(
    input: AnalyzeInput,
    ctx: CallContext,
  ): Promise<WithUsage<MistakeAnalysis>>;

  /** 問題を1問ずつ返す */
  generateCounterProblems(
    input: GenerateInput,
    ctx: CallContext,
  ): AsyncIterable<WithUsage<ProblemDraft>>;

  /** 検証役として、問題を独自に解く（作った側の答えは渡さない） */
  solve(
    input: {
      problem: Omit<ProblemDraft, "answer" | "explanation">;
      grade: Grade;
    },
    ctx: CallContext,
  ): Promise<WithUsage<SolveResult>>;

  gradeFreeText(
    input: { problem: ProblemDraft; answer: string; grade: Grade },
    ctx: CallContext,
  ): Promise<WithUsage<GradeResult>>;
}
