import { describe, expect, it } from "vitest";
import { runLimited } from "./queue";

describe("2つずつ並べて送る（U3）", () => {
  it("同時に動くのは limit まで。失敗してもほかは続ける", async () => {
    let running = 0;
    let peak = 0;
    const settled: [number, string][] = [];
    await runLimited(
      [1, 2, 3, 4, 5],
      2,
      async (n) => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        if (n === 3) throw new Error("x");
        return n * 10;
      },
      (i, r) => settled.push([i, r.status]),
    );
    expect(peak).toBe(2);
    expect(settled.sort()).toEqual([
      [0, "fulfilled"],
      [1, "fulfilled"],
      [2, "rejected"],
      [3, "fulfilled"],
      [4, "fulfilled"],
    ]);
  });

  it("止めたら、まだ始めていないものは始めない", async () => {
    const started: number[] = [];
    let stopped = false;
    await runLimited(
      [0, 1, 2, 3],
      1,
      async (n) => {
        started.push(n);
        if (n === 1) stopped = true;
      },
      () => {},
      () => stopped,
    );
    expect(started).toEqual([0, 1]);
  });
});
