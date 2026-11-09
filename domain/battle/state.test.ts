import { describe, expect, it } from "vitest";
import {
  answer,
  canRescue,
  hp,
  maxHp,
  next,
  rescue,
  showHint,
  startBattle,
} from "./state";

describe("バトルの規則", () => {
  it("HP は問題の数 × 100（BR-45-5）", () => {
    const s = startBattle(3);
    expect(maxHp(s)).toBe(300);
    expect(hp(s)).toBe(300);
    expect(() => startBattle(0)).toThrow(RangeError);
  });

  it("1回目の正解は 100、2回目は 70、3回目は 40", () => {
    let s = startBattle(3);
    s = answer(s, true);
    expect(s.phase).toBe("hit");
    expect(hp(s)).toBe(200);
    s = next(s);
    s = answer(s, false);
    expect(s.problems[1].hints).toBe(1);
    s = answer(s, true);
    expect(s.problems[1].damage).toBe(70);
    s = next(s);
    s = answer(answer(s, false), false);
    expect(s.problems[2].hints).toBe(2);
    s = answer(s, true);
    expect(s.problems[2].damage).toBe(40);
    s = next(s);
    expect(s.phase).toBe("finished");
    expect(s.result).toBe("defeated");
    expect(hp(s)).toBe(0);
  });

  it("ヒントボタンで見た分だけダメージが減る。2段階まで", () => {
    let s = startBattle(1);
    s = showHint(s);
    s = showHint(s);
    s = showHint(s);
    expect(s.problems[0].hints).toBe(2);
    s = answer(s, true);
    expect(s.problems[0].damage).toBe(40);
    // 答えたあとはヒントを出さない
    expect(showHint(s)).toBe(s);
  });

  it("3回間違えたら答えを見せ、ダメージなし。結果は「あと一歩」（BR-45-4・6）", () => {
    let s = startBattle(2);
    s = answer(answer(answer(s, false), false), false);
    expect(s.phase).toBe("revealed");
    expect(s.problems[0].outcome).toBe("revealed");
    expect(answer(s, true)).toBe(s);
    s = next(s);
    s = next(answer(s, true));
    expect(s.result).toBe("almost");
    expect(hp(s)).toBe(100);
  });

  it("通信が切れていて「おなじ」を選んだら、ダメージは 40", () => {
    const s = answer(startBattle(1), true, { selfJudged: true });
    expect(s.problems[0]).toMatchObject({ damage: 40, selfJudged: true });
  });

  it("「あってるのに ×」は、間違えた直後に1回のバトルで1問まで（BR-45-8）", () => {
    let s = startBattle(3);
    expect(canRescue(s)).toBe(false);
    expect(rescue(s)).toBe(s);
    s = answer(s, false);
    expect(canRescue(s)).toBe(true);
    s = rescue(s);
    expect(s.problems[0]).toMatchObject({
      outcome: "cleared",
      damage: 100,
      rescued: true,
    });
    s = answer(next(s), false);
    expect(canRescue(s)).toBe(false);
    expect(rescue(s)).toBe(s);
  });

  it("答えを見せたあとでも「あってるのに ×」を使える", () => {
    let s = startBattle(1);
    s = answer(answer(answer(s, false), false), false);
    s = rescue(s);
    s = next(s);
    expect(s.result).toBe("defeated");
  });

  it("答えを待っているときは、次へ進めない", () => {
    const s = startBattle(1);
    expect(next(s)).toBe(s);
  });
});
