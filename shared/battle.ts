/**
 * ミスモンとバトルの記録（端末の IndexedDB に置き、U8 でクラウドと同期する）。
 * 学習の記録には時刻を残さず、日付だけを残す（NFR-P11）。
 * Zod を画面のプログラムに含めないよう、型だけをここに置く。
 */
import type { BattleState } from "@/domain/battle/state";
import type { BattleMode } from "@/domain/game/types";
import type { Grade } from "./constants";
import type { Subject, VerifiedProblem } from "./problem";

/**
 * new：まだ戦っていない、almost：まだ撃破していない（あと一歩）、defeated：撃破した、mastered：完全撃破。
 * 表示のための目安。再来の日程などは、バトルの記録から計算する（domain/game）
 */
export type MistakeStatus = "new" | "almost" | "defeated" | "mastered";

/** テスト（間違いのまとまり・BR-6-1） */
export interface Sheet {
  id: string;
  guardianId: string;
  childId: string;
  title: string;
  subject: Subject;
  createdDay: string;
  version: number;
}

export const SHEET_TITLE_MAX = 30;
export const SHEET_MISTAKE_MAX = 30;

/** ミスモン（間違えた問題1問） */
export interface Mistake {
  id: string;
  guardianId: string;
  childId: string;
  /** どのテストか（BR-6-1） */
  sheetId: string;
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
  mode: BattleMode;
  problems: VerifiedProblem[];
  /** 問題ごとの、最後の子どもの答え（報告と、あとで採点し直すため） */
  lastAnswers: (string | null)[];
  state: BattleState;
  startedDay: string;
  finishedDay?: string;
  /** 終えた順番（同じ日の中の並び。時刻の代わり） */
  order?: number;
  version: number;
}

export const REPORT_REASONS = [
  "marked-wrong",
  "answer-wrong",
  "unclear",
  "difficulty",
  "reading",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** 子どもに見せる理由の言葉（BR-45-8。この順に並べる） */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  "marked-wrong": "あってるのに ×に なった",
  "answer-wrong": "こたえが ちがうと おもう",
  unclear: "もんだいの いみが わからない",
  difficulty: "むずかしすぎる・かんたんすぎる",
  reading: "よみがなが へん",
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
