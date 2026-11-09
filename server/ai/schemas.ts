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
  z.object({ kind: z.literal("numeric"), unit: z.string().optional() }),
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

/** AI が作った問題（検証の前） */
export const ProblemDraft = z.object({
  role: z.enum(["same-type", "focus", "stretch"]),
  prompt: z.string().max(600),
  format: AnswerFormat,
  answer: z.string().max(200),
  hints: z.array(z.string().max(200)).min(1).max(2),
  explanation: z.string().max(400),
});
export type ProblemDraft = z.infer<typeof ProblemDraft>;

export const ProblemDrafts = z.object({
  problems: z.array(ProblemDraft).min(1).max(5),
});

export const SolveResult = z.object({ answer: z.string().max(200) });
export type SolveResult = z.infer<typeof SolveResult>;

export const GradeResult = z.object({
  correct: z.boolean(),
  feedback: z.string().max(200),
});
export type GradeResult = z.infer<typeof GradeResult>;

/* ---------- API の入力 ---------- */

export const GenerateRequest = z.object({
  analysis: MistakeAnalysis,
  grade: Grade,
  count: z.number().int().min(1).max(5).default(3),
  mode: z.enum(["first", "revisit", "boss"]).default("first"),
  avoid: z.array(z.string().max(600)).max(20).default([]),
});
export type GenerateRequest = z.infer<typeof GenerateRequest>;

export const GradeRequest = z.object({
  problem: ProblemDraft,
  answer: z.string().max(200),
  grade: Grade,
});
export type GradeRequest = z.infer<typeof GradeRequest>;
