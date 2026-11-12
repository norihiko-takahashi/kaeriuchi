import type { ProblemProgress } from "@/domain/battle/state";

export type BattleMode = "first" | "revisit" | "practice";

/** 最後までやったバトル1回分（ゲームの計算はすべて、これの一覧から行う） */
export interface BattleRecord {
  battleId: string;
  mistakeId: string;
  mode: BattleMode;
  result: "defeated" | "almost";
  /** 終えた日 */
  day: string;
  /** 終えた順番（同じ日の中の並び） */
  order: number;
  problems: Pick<ProblemProgress, "hints" | "rescued">[];
}
