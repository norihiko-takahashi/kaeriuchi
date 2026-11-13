import type { Subject } from "./problem";

/**
 * 撮影（U3）で画面とサーバーが共有する形。サーバーの Zod の形（server/ai/schemas.ts の MistakeAnalysis）と同じ。
 * 画面に Zod を入れないため、型だけをここに置く。
 */
export interface MistakeAnalysis {
  subject: Subject;
  unit: string;
  question: string;
  childAnswer: string;
  correctAnswer: string;
  mistakeTypeId: string;
  explanation: string;
  confidence: { question: number; childAnswer: number; correctAnswer: number };
  /** 名前などが写っていて、伏せ字にした（US-3.3） */
  piiDetected: boolean;
  gradingMarksFound: boolean;
}

export interface AnalyzeResponse {
  analysis: MistakeAnalysis;
  meta: {
    requestId: string;
    provider: string;
    model: string;
    promptVersion: string;
  };
}

/** これより低い信頼度の項目は「たしかめてね」にして、確かめるまで進めない（FR-3.2） */
export const LOW_CONFIDENCE = 0.7;
