import { describe, expect, it } from "vitest";
import { MemorySyncStore } from "./memory";
import { addDays, decide, purgeable } from "./merge";
import { syncSuite } from "./sync-suite";

syncSuite("メモリ", async () => new MemorySyncStore());

describe("まとめ方のルール（merge.ts）", () => {
  const live = { version: 2, updatedAt: "b", deleted: false };
  it("種類ごとに比べ方を変える。削除が勝つ", () => {
    expect(decide("mistake", live, { op: "upsert", version: 3 }).action).toBe(
      "write",
    );
    expect(decide("mistake", live, { op: "upsert", version: 2 })).toEqual({
      action: "skip",
      reason: "older",
    });
    expect(
      decide("guardianSettings", live, {
        op: "upsert",
        version: 0,
        updatedAt: "c",
      }).action,
    ).toBe("write");
    expect(
      decide("guardianSettings", live, {
        op: "upsert",
        version: 9,
        updatedAt: "a",
      }).action,
    ).toBe("skip");
    expect(decide("report", live, { op: "upsert", version: 9 })).toEqual({
      action: "skip",
      reason: "exists",
    });
    expect(
      decide("child", { ...live, deleted: true }, { op: "upsert", version: 9 }),
    ).toEqual({ action: "skip", reason: "deleted" });
    expect(decide("child", live, { op: "delete", version: 0 }).action).toBe(
      "write",
    );
    expect(
      decide("child", undefined, { op: "upsert", version: 0 }).action,
    ).toBe("write");
  });

  it("日付の計算", () => {
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(purgeable("2026-11-15", "2026-11-22", 7)).toBe(true);
    expect(purgeable("2026-11-15", "2026-11-21", 7)).toBe(false);
  });
});

describe("メモリの保存先", () => {
  it("途中で失敗したら、書いたものを元に戻す", async () => {
    const store = new MemorySyncStore();
    await expect(
      store.transaction("g", async (tx) => {
        await tx.put({
          entity: "child",
          id: "c1",
          version: 1,
          payload: {},
          deleted: false,
        });
        throw new Error("x");
      }),
    ).rejects.toThrow("x");
    expect(await store.transaction("g", (tx) => tx.all())).toEqual([]);
  });
});
