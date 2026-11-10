/**
 * ミスモンとバトルの記録（端末の IndexedDB に置き、U8 でクラウドと同期する）。
 * 学習の記録には時刻を残さず、日付だけを残す（NFR-P11）。
 * Zod を画面のプログラムに含めないよう、型だけをここに置く。
 */
import type { BattleState } from "@/domain/battle/state";
import type { Grade } from "./constants";
import type { Subject, VerifiedProblem } from "./problem";

export type MistakeStatus = "new" | "defeated" | "almost";

/** ミスモン（間違えた問題1問） */
export interface Mistake {
  id: string;
  guardianId: string;
  childId: string;
  subject: Subject;
  /** 登録したときの学年 */
  grade: Grade;
  question: string;
  childAnswer: string;
  correctAnswer: string;
  mistakeTypeId: string;
  unit: string;
  explanation: string;
  source: "manual";
  status: MistakeStatus;
  /** これまでに出した問題（再来で同じ問題を出さないため） */
  usedPrompts: string[];
  /** 判定したときの AI（報告と評価の突き合わせ用） */
  classifiedBy: { provider: string; model: string; promptVersion: string };
  /** 登録した日（端末の日付。1日の登録数を数える・BR-3.1） */
  createdDay: string;
  /** 最後に戦った日 */
  lastBattleDay?: string;
  updatedDay: string;
  version: number;
}

/** バトル1回分。1回答えるごとに保存する（U45-OFF-3） */
export interface Battle {
  id: string;
  guardianId: string;
  childId: string;
  mistakeId: string;
  mode: "first" | "revisit";
  problems: VerifiedProblem[];
  /** 問題ごとの、最後の子どもの答え（報告と、あとで採点し直すため） */
  lastAnswers: (string | null)[];
  state: BattleState;
  startedDay: string;
  finishedDay?: string;
  version: number;
}

export const REPORT_REASONS = [
  "marked-wrong",
  "answer-wrong",
  "unclear",
  "difficulty",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** 子どもに見せる理由の言葉（BR-45-8。この順に並べる） */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  "marked-wrong": "あってるのに ×に なった",
  "answer-wrong": "こたえが ちがうと おもう",
  unclear: "もんだいの いみが わからない",
  difficulty: "むずかしすぎる・かんたんすぎる",
  other: "そのほか",
};

export const REPORT_FREE_TEXT_MAX = 100;

/**
 * 「あれ？おかしいかも」の報告（BR-45-8）。
 * 画像、ニックネーム、子どものプロフィールの ID は含めない（U45-PRIV-2）。
 */
export interface ProblemReport {
  id: string;
  reason: ReportReason;
  freeText?: string;
  problem: Omit<VerifiedProblem, "verification">;
  childAnswer: string | null;
  mistake: Pick<
    Mistake,
    | "subject"
    | "grade"
    | "question"
    | "childAnswer"
    | "correctAnswer"
    | "mistakeTypeId"
  >;
  /** その場で正解として扱ったか（「あってるのに ×」の救済） */
  rescued: boolean;
  promptVersion: string;
  verifierPromptVersion: string;
  provider: string;
  model: string;
  verifierModel: string;
  createdDay: string;
}

/** 通信が切れていて「おなじ？」で答えた分。通信が戻ったら AI で採点し直して記録する（U45-OFF-2） */
export interface PendingRegrade {
  id: string;
  problem: Omit<VerifiedProblem, "verification">;
  answer: string;
  grade: Grade;
  /** 子どもが選んだ結果（さかのぼって変えない） */
  childSaidSame: boolean;
  createdDay: string;
  /** AI の採点の結果（あとで入る） */
  aiCorrect?: boolean;
}
