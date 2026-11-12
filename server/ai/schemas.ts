import { z } from "zod";
import { DISPLAY_MODES, GRADES } from "@/shared/constants";

export const Grade = z.enum(GRADES);
export const Subject = z.enum([
  "math",
  "japanese",
  "english",
  "science",
  "social",
]);
export type Subject = z.infer<typeof Subject>;
export { DISPLAY_MODES };

/** 間違いのタイプの候補（AI に渡す一覧の1件） */
export const MistakeTypeSummary = z.object({
  id: z.string(),
  label: z.string(),
});
export type MistakeTypeSummary = z.infer<typeof MistakeTypeSummary>;

const Confidence = z.number().min(0).max(1);

/** 解析の結果（inception/application-design/ai-provider.md §2） */
export const MistakeAnalysis = z.object({
  subject: Subject,
  unit: z.string().max(60),
  question: z.string().max(1000),
  childAnswer: z.string().max(300),
  correctAnswer: z.string().max(300),
  /** 候補の一覧にないときは "other" */
  mistakeTypeId: z.string().max(100),
  explanation: z.string().max(200),
  confidence: z.object({
    question: Confidence,
    childAnswer: Confidence,
    correctAnswer: Confidence,
  }),
  /** 名前・学校名などが写っていたか（扱いは課題 R1） */
  piiDetected: z.boolean(),
  /** 丸付け（赤ペン）があったか（課題 R2） */
  gradingMarksFound: z.boolean(),
});
export type MistakeAnalysis = z.infer<typeof MistakeAnalysis>;

export const AnswerFormat = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("numeric"),
    unit: z.string().max(20).optional(),
    /** 答えの形の条件（BR-45-7）。問題文にも書く */
    condition: z.enum(["reduced", "decimal", "mixed"]).optional(),
  }),
  z.object({
    kind: z.literal("choice"),
    options: z.array(z.string().max(100)).min(2).max(6),
  }),
  z.object({
    kind: z.literal("text"),
    acceptable: z.array(z.string().max(100)).min(1).max(10),
  }),
  z.object({
    kind: z.literal("ordering"),
    tokens: z.array(z.string().max(40)).min(2).max(12),
  }),
  z.object({ kind: z.literal("self-check"), model: z.string().max(40) }),
]);
export type AnswerFormat = z.infer<typeof AnswerFormat>;

export const ProblemRole = z.enum(["same-type", "focus", "stretch"]);
export type ProblemRole = z.infer<typeof ProblemRole>;

/** AI が作った問題（検証の前） */
/** ふりがな（BR-6-7）。漢字の語とその読み（ひらがな） */
export const RubyEntry = z.object({
  word: z.string().min(1).max(20),
  reading: z.string().min(1).max(40),
});

export const ProblemDraft = z.object({
  role: ProblemRole,
  prompt: z.string().max(600),
  format: AnswerFormat,
  answer: z.string().max(200),
  hints: z.array(z.string().max(200)).min(1).max(2),
  explanation: z.string().max(400),
  // 多すぎても問題ごと落とさず、server/ai/ruby.ts で 30語に切る
  ruby: z.array(RubyEntry).max(60).optional(),
});
export type ProblemDraft = z.infer<typeof ProblemDraft>;

export const ProblemDrafts = z.object({
  problems: z.array(ProblemDraft).min(1).max(5),
});

/** 検証役の答え。子ども向けとして適切かも、同じ呼び出しで答える（U45-SAFE-1） */
export const SolveResult = z.object({
  answer: z.string().max(200),
  appropriate: z.boolean(),
});
export type SolveResult = z.infer<typeof SolveResult>;

/** 間違いのタイプの判定（手で入れたとき）の結果 */
export const ClassifyResult = z.object({
  mistakeTypeId: z.string().max(100),
  unit: z.string().max(60),
  explanation: z.string().max(200),
});
export type ClassifyResult = z.infer<typeof ClassifyResult>;

export const GradeResult = z.object({
  correct: z.boolean(),
  feedback: z.string().max(200),
});
export type GradeResult = z.infer<typeof GradeResult>;

/* ---------- API の入力 ---------- */

export const GenerateRequest = z.object({
  analysis: MistakeAnalysis,
  grade: Grade,
  /** 初回は3問、再来は2問（BR-45-3） */
  mode: z.enum(["first", "revisit"]).default("first"),
  avoid: z.array(z.string().max(600)).max(20).default([]),
});
export type GenerateRequest = z.infer<typeof GenerateRequest>;

/** 手で入れた間違い（BR-45-1）。正しい答えは、子どもが入れたものを使う */
export const ClassifyRequest = z.object({
  subject: Subject,
  grade: Grade,
  question: z.string().trim().min(1).max(200),
  childAnswer: z.string().trim().min(1).max(100),
  correctAnswer: z.string().trim().min(1).max(100),
});
export type ClassifyRequest = z.infer<typeof ClassifyRequest>;

export const GradeRequest = z.object({
  problem: ProblemDraft,
  answer: z.string().max(200),
  grade: Grade,
});
export type GradeRequest = z.infer<typeof GradeRequest>;
