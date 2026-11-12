import type { BattleRecord } from "@/domain/game/types";
import type { Battle } from "@/shared/battle";

/** 保存したバトルを、ゲームの計算に使う形にする。終えていないものは null */
export function toRecord(b: Battle): BattleRecord | null {
  if (b.state.phase !== "finished" || !b.state.result || !b.finishedDay)
    return null;
  return {
    battleId: b.id,
    mistakeId: b.mistakeId,
    mode: b.mode,
    result: b.state.result,
    day: b.finishedDay,
    order: b.order ?? 0,
    problems: b.state.problems.map((p) => ({
      hints: p.hints,
      rescued: p.rescued,
    })),
  };
}
