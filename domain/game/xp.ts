import rules from "@/content/game/rules.json";
import { isMastered, type ReplayStep } from "./review";

/** XP の内訳（結果の画面で見せる・BR-6-4） */
export interface XpPart {
  kind:
    | "firstDefeat"
    | "revisitDefeat"
    | "mastered"
    | "noHintBonus"
    | "hints"
    | "almost"
    | "practice";
  xp: number;
}

export function xpForStep(step: ReplayStep): XpPart[] {
  const x = rules.xp;
  const r = step.record;
  if (r.mode === "practice") return [{ kind: "practice", xp: x.practice }];
  if (r.result === "almost") return [{ kind: "almost", xp: x.almost }];

  const parts: XpPart[] = [];
  if (r.mode === "first" || step.before.stage === 0)
    parts.push({ kind: "firstDefeat", xp: x.firstDefeat });
  else if (isMastered(step.after))
    parts.push({ kind: "mastered", xp: x.mastered });
  else parts.push({ kind: "revisitDefeat", xp: x.revisitDefeat });

  const noHint = r.problems.every((p) => p.hints === 0 && !p.rescued);
  if (noHint) parts.push({ kind: "noHintBonus", xp: x.noHintBonus });

  const hints = r.problems.reduce((n, p) => n + p.hints, 0);
  if (hints > 0) {
    const before = parts.reduce((n, p) => n + p.xp, 0);
    // 撃破の XP は、下限より下がらない
    const penalty = Math.min(
      hints * x.perHint,
      Math.max(0, before - x.defeatFloor),
    );
    if (penalty > 0) parts.push({ kind: "hints", xp: -penalty });
  }
  return parts;
}

export const sumXp = (parts: XpPart[]) => parts.reduce((n, p) => n + p.xp, 0);

/** レベル L から L+1 に上がるのに要る XP */
export const xpToNext = (level: number) =>
  rules.level.base + rules.level.step * (level - 1);

export interface LevelInfo {
  level: number;
  /** いまのレベルの中でたまった XP */
  into: number;
  /** 次のレベルまでに要る XP（いまのレベルの分全体） */
  need: number;
}

export function levelFor(totalXp: number): LevelInfo {
  let level = 1;
  let rest = Math.max(0, totalXp);
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, into: rest, need: xpToNext(level) };
}
