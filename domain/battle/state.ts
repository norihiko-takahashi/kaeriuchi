/**
 * バトルの規則（BR-45-4〜6、BR-45-8）。画面と保存に依存しない、純粋な関数だけで書く。
 * 1回答えるごとに、この状態をそのまま端末に保存する（U45-OFF-3）。
 */

/** 正解のダメージ。見たヒントの数（0〜2）で決まる（BR-45-5） */
export const DAMAGE_BY_HINTS = [100, 70, 40] as const;
/** 通信が切れていて、子どもが「おなじ」と選んだとき（U45-OFF-2） */
export const SELF_JUDGED_DAMAGE = 40;
/** 「あってるのに ×に なった」で正解として扱ったとき（BR-45-8） */
export const RESCUE_DAMAGE = 100;
/** 1問に挑戦できる回数（BR-45-4） */
export const MAX_TRIES = 3;
export const HP_PER_PROBLEM = 100;

export type ProblemOutcome = "pending" | "cleared" | "revealed";

export interface ProblemProgress {
  outcome: ProblemOutcome;
  /** 間違えた回数 */
  wrong: number;
  /** 見たヒントの数（0〜2） */
  hints: number;
  damage: number;
  /** 「あってるのに ×」で正解として扱ったか */
  rescued: boolean;
  /** 通信が切れていて、子どもが「おなじ」と選んだか */
  selfJudged: boolean;
}

export type Phase =
  /** 答えを待っている（間違えたあとも、ここに戻る） */
  | "asking"
  /** 正解して、ダメージの演出を見せている */
  | "hit"
  /** 3回間違えて、答えと解説を見せている */
  | "revealed"
  | "finished";

export type BattleResult = "defeated" | "almost";

export interface BattleState {
  index: number;
  phase: Phase;
  problems: ProblemProgress[];
  /** このバトルで「あってるのに ×」の救済を使ったか（1回のバトルで1問まで） */
  rescueUsed: boolean;
  /** 直前の答えが間違いだったか（「あってるのに ×」を出せるか） */
  lastWrong: boolean;
  result?: BattleResult;
}

export function startBattle(count: number): BattleState {
  if (count < 1) throw new RangeError("問題がありません");
  return {
    index: 0,
    phase: "asking",
    problems: Array.from({ length: count }, () => ({
      outcome: "pending",
      wrong: 0,
      hints: 0,
      damage: 0,
      rescued: false,
      selfJudged: false,
    })),
    rescueUsed: false,
    lastWrong: false,
  };
}

const current = (s: BattleState) => s.problems[s.index];

function patch(s: BattleState, p: Partial<ProblemProgress>): ProblemProgress[] {
  return s.problems.map((q, i) => (i === s.index ? { ...q, ...p } : q));
}

/** ミスモンの HP の最大値（BR-45-5） */
export const maxHp = (s: BattleState) => s.problems.length * HP_PER_PROBLEM;

/** いまの HP。撃破したら 0 にする（最後の一撃） */
export function hp(s: BattleState): number {
  if (s.result === "defeated") return 0;
  const dealt = s.problems.reduce((sum, p) => sum + p.damage, 0);
  return Math.max(0, maxHp(s) - dealt);
}

/** 「ヒント」ボタン。間違える前でも見られる（BR-45-4） */
export function showHint(s: BattleState): BattleState {
  if (s.phase !== "asking" || current(s).hints >= 2) return s;
  return { ...s, problems: patch(s, { hints: current(s).hints + 1 }) };
}

export interface AnswerOptions {
  /** 通信が切れていて、子どもが「おなじ」と選んだ */
  selfJudged?: boolean;
}

/** 答えの採点の結果を反映する */
export function answer(
  s: BattleState,
  correct: boolean,
  opts: AnswerOptions = {},
): BattleState {
  if (s.phase !== "asking") return s;
  const p = current(s);
  if (correct) {
    const damage = opts.selfJudged
      ? SELF_JUDGED_DAMAGE
      : DAMAGE_BY_HINTS[Math.min(p.hints, 2)];
    return {
      ...s,
      phase: "hit",
      lastWrong: false,
      problems: patch(s, {
        outcome: "cleared",
        damage,
        selfJudged: !!opts.selfJudged,
      }),
    };
  }
  const wrong = p.wrong + 1;
  if (wrong >= MAX_TRIES) {
    return {
      ...s,
      phase: "revealed",
      lastWrong: true,
      problems: patch(s, { outcome: "revealed", wrong, damage: 0 }),
    };
  }
  // 1回目の間違いでヒント1、2回目でヒント2（BR-45-4）
  return {
    ...s,
    lastWrong: true,
    problems: patch(s, { wrong, hints: Math.max(p.hints, wrong) }),
  };
}

/** 「あってるのに ×に なった」で、その場では正解として扱えるか（BR-45-8） */
export function canRescue(s: BattleState): boolean {
  return (
    !s.rescueUsed &&
    s.lastWrong &&
    (s.phase === "asking" || s.phase === "revealed")
  );
}

/** 「あってるのに ×に なった」。使えないときは、何も変えない（報告だけは送れる） */
export function rescue(s: BattleState): BattleState {
  if (!canRescue(s)) return s;
  return {
    ...s,
    phase: "hit",
    rescueUsed: true,
    lastWrong: false,
    problems: patch(s, {
      outcome: "cleared",
      damage: RESCUE_DAMAGE,
      rescued: true,
    }),
  };
}

/** 次の問題へ。最後の問題なら、結果を決める（BR-45-6） */
export function next(s: BattleState): BattleState {
  if (s.phase !== "hit" && s.phase !== "revealed") return s;
  if (s.index + 1 < s.problems.length) {
    return { ...s, index: s.index + 1, phase: "asking", lastWrong: false };
  }
  const result: BattleResult = s.problems.every((p) => p.outcome === "cleared")
    ? "defeated"
    : "almost";
  return { ...s, phase: "finished", lastWrong: false, result };
}
