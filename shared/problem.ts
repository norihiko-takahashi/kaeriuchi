/**
 * かえりうち問題の形（画面とサーバーの両方で使う）。
 * Zod を画面のプログラムに含めないよう、型だけをここに置く（U1-PERF-2）。
 * サーバーの Zod のスキーマ（server/ai/schemas.ts）は、この型と一致させる（型のテストで確かめる）。
 */

export type Subject = "math" | "japanese" | "english" | "science" | "social";

export const SUBJECT_LABELS: Record<Subject, string> = {
  math: "さんすう・すうがく",
  japanese: "こくご",
  english: "えいご",
  science: "りか",
  social: "しゃかい",
};

export type NumericCondition = "reduced" | "decimal" | "mixed";

export type AnswerFormat =
  | { kind: "numeric"; unit?: string; condition?: NumericCondition }
  | { kind: "choice"; options: string[] }
  | { kind: "text"; acceptable: string[] }
  | { kind: "ordering"; tokens: string[] }
  | { kind: "self-check"; model: string };

export type ProblemRole = "same-type" | "focus" | "stretch";

export interface RubyEntry {
  word: string;
  reading: string;
}

export interface ProblemDraft {
  role: ProblemRole;
  prompt: string;
  format: AnswerFormat;
  answer: string;
  hints: string[];
  explanation: string;
  /** ふりがな（BR-6-7）。サーバーで確かめたものだけが入る */
  ruby?: RubyEntry[];
}

/** 検証の結果（U45-Q-4） */
export interface Verification {
  method: "arith" | "solver";
  /** 作り直しの回数（0 か 1） */
  regenerations: number;
  promptVersion: string;
  verifierPromptVersion: string;
  provider: string;
  model: string;
  verifierModel: string;
}

/** 検証に通った問題。これ以外は画面に出さない（U45-Q-1） */
export interface VerifiedProblem extends ProblemDraft {
  verification: Verification;
}

/** 生成の API が1行ずつ返すもの（NDJSON） */
export type GenerateLine =
  | { problem: VerifiedProblem }
  | {
      done: true;
      meta: {
        requestId: string;
        verified: number;
        rejected: number;
        regenerated: boolean;
        timedOut: boolean;
      };
    }
  | { error: { code: string; requestId: string } };

/** 間違いのタイプの判定の結果 */
export interface ClassifyResult {
  mistakeTypeId: string;
  unit: string;
  explanation: string;
}

/** これより少なければ、戦わずに「うまく つくれなかった」にする（BR-45-2） */
export const MIN_BATTLE_PROBLEMS = 2;
