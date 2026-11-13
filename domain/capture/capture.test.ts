import { describe, expect, it } from "vitest";
import {
  centerRect,
  clampRect,
  describePosition,
  fitWithin,
  frameAt,
  frameWarning,
  growRect,
  handleAt,
  minSide,
  moveRect,
  rectFromPoints,
  resizeRect,
  sortFrames,
} from "./geometry";

const photo = { width: 1000, height: 2000 };

describe("枠の計算（U3）", () => {
  it("2つの点から四角。どちら向きでも同じ。写真の外は切り詰める", () => {
    expect(
      rectFromPoints({ x: 300, y: 400 }, { x: 100, y: 100 }, photo),
    ).toEqual({ x: 100, y: 100, w: 200, h: 300 });
    expect(
      rectFromPoints({ x: -50, y: 1900 }, { x: 1200, y: 2100 }, photo),
    ).toEqual({ x: 0, y: 1900, w: 1000, h: 100 });
  });

  it("動かしても写真からはみ出さない", () => {
    const r = { x: 900, y: 10, w: 100, h: 100 };
    expect(moveRect(r, 50, -50, photo)).toEqual({
      x: 900,
      y: 0,
      w: 100,
      h: 100,
    });
    expect(moveRect(r, -100, 30, photo)).toEqual({
      x: 800,
      y: 40,
      w: 100,
      h: 100,
    });
    expect(clampRect({ x: 0, y: 0, w: 5000, h: 10 }, photo).w).toBe(1000);
  });

  it("角で大きさを変える。反対の角は動かず、最小の大きさより小さくならない", () => {
    const r = { x: 100, y: 100, w: 200, h: 200 };
    expect(resizeRect(r, "se", 50, 20, photo)).toEqual({
      x: 100,
      y: 100,
      w: 250,
      h: 220,
    });
    expect(resizeRect(r, "nw", -50, -150, photo)).toEqual({
      x: 50,
      y: 0,
      w: 250,
      h: 300,
    });
    expect(resizeRect(r, "ne", -500, 500, photo)).toEqual({
      x: 100,
      y: 260,
      w: minSide(photo),
      h: minSide(photo),
    });
    expect(resizeRect(r, "sw", 0, 5000, photo).h).toBe(1900);
    expect(growRect(r, 10, -10, photo)).toEqual({
      x: 100,
      y: 100,
      w: 210,
      h: 190,
    });
  });

  it("小さすぎ・大きすぎの注意", () => {
    expect(minSide(photo)).toBe(40);
    expect(frameWarning({ x: 0, y: 0, w: 39, h: 400 }, photo)).toBe("tooSmall");
    expect(frameWarning({ x: 0, y: 0, w: 1000, h: 1300 }, photo)).toBe(
      "tooLarge",
    );
    expect(frameWarning({ x: 0, y: 0, w: 400, h: 200 }, photo)).toBeNull();
  });

  it("確認の順番は、上の段から、段の中は左から", () => {
    const f = (id: string, x: number, y: number, h = 100) => ({
      id,
      x,
      y,
      w: 100,
      h,
    });
    const sorted = sortFrames([
      f("c", 100, 500),
      f("b", 600, 130), // a と同じ段（上の端の差 30 ≤ 50）
      f("a", 100, 100),
      f("d", 50, 900),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("指の位置の枠と取っ手", () => {
    const frames = [
      { id: "a", x: 0, y: 0, w: 300, h: 300 },
      { id: "b", x: 200, y: 200, w: 300, h: 300 },
    ];
    expect(frameAt(frames, { x: 250, y: 250 })?.id).toBe("b");
    expect(frameAt(frames, { x: 50, y: 50 })?.id).toBe("a");
    expect(frameAt(frames, { x: 900, y: 900 })).toBeUndefined();
    expect(handleAt(frames[1], { x: 505, y: 495 }, 20)).toBe("se");
    expect(handleAt(frames[1], { x: 195, y: 200 }, 20)).toBe("nw");
    expect(handleAt(frames[1], { x: 350, y: 350 }, 20)).toBeNull();
  });

  it("読み上げの位置・真ん中の枠・縮める大きさ", () => {
    expect(describePosition({ x: 0, y: 0, w: 100, h: 100 }, photo)).toBe(
      "うえの ほう・ひだり",
    );
    expect(describePosition({ x: 450, y: 950, w: 100, h: 100 }, photo)).toBe(
      "まんなか",
    );
    expect(describePosition({ x: 800, y: 1800, w: 100, h: 100 }, photo)).toBe(
      "したの ほう・みぎ",
    );
    expect(centerRect(photo)).toEqual({ x: 350, y: 850, w: 300, h: 300 });
    expect(fitWithin({ width: 4000, height: 3000 }, 2048)).toEqual({
      width: 2048,
      height: 1536,
    });
    expect(fitWithin({ width: 800, height: 600 }, 2048)).toEqual({
      width: 800,
      height: 600,
    });
  });
});
