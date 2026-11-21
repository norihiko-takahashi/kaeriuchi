import { beforeEach, describe, expect, it } from "vitest";
import { DAY } from "@/server/auth/tokens";
import type { SyncChange } from "@/shared/sync";
import { SyncService } from "./service";
import type { SyncStore } from "./store";

/**
 * 同期の保存先の共通のテスト（U8-TEST-1）。メモリと Postgres の両方で同じテストを通す。
 */

export const G = "guardian-a";
export const OTHER = "guardian-b";

export function child(id: string, version = 1, extra: object = {}) {
  return {
    id,
    guardianId: G,
    nickname: "ほのお",
    grade: "e2",
    displayMode: "lower",
    displayModeOverridden: false,
    gradeSchoolYear: 2026,
    avatar: { face: 0, color: 0, accessory: 0 },
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    version,
    ...extra,
  };
}
export const sheet = (id: string, childId: string, version = 1) => ({
  id,
  guardianId: G,
  childId,
  title: "さんすう 11/15 の テスト",
  subject: "math",
  createdDay: "2026-11-15",
  version,
});
export const mistake = (
  id: string,
  childId: string,
  sheetId: string,
  v = 1,
) => ({
  id,
  guardianId: G,
  childId,
  sheetId,
  subject: "math",
  grade: "e2",
  question: "1/2 + 1/3 = ?",
  childAnswer: "2/5",
  correctAnswer: "5/6",
  createdDay: "2026-11-15",
  updatedDay: "2026-11-15",
  status: "new",
  version: v,
});
export const battle = (
  id: string,
  childId: string,
  mistakeId: string,
  v = 1,
) => ({
  id,
  guardianId: G,
  childId,
  mistakeId,
  mode: "first",
  problems: [],
  lastAnswers: [],
  state: { phase: "playing" },
  startedDay: "2026-11-15",
  version: v,
});
export const settings = (updatedAt: string, rules: object = {}) => ({
  id: G,
  email: "secret@example.com",
  pinHash: "pin-hash",
  rules,
  consentVersion: "2026-11",
  updatedAt,
});

export const up = (
  entity: SyncChange["entity"],
  payload: { id: string; [k: string]: unknown },
): SyncChange => ({ entity, id: payload.id, op: "upsert", payload });

export function syncSuite(name: string, makeStore: () => Promise<SyncStore>) {
  describe(`同期（${name}）`, () => {
    let now: number;
    let sync: SyncService;
    const tick = (ms: number) => {
      now += ms;
    };

    beforeEach(async () => {
      now = Date.UTC(2026, 10, 15, 3, 0, 0);
      sync = new SyncService(await makeStore(), { now: () => now });
    });

    const family = () => [
      up("child", child("c1")),
      up("sheet", sheet("s1", "c1")),
      up("mistake", mistake("m1", "c1", "s1")),
      up("battle", battle("b1", "c1", "m1")),
    ];

    it("送った変更を、ほかの端末が受け取れる。同じものを2回送っても1つ", async () => {
      const first = await sync.sync(G, 0, family());
      expect(first.rejected).toEqual([]);
      await sync.sync(G, first.cursor, family());
      const other = await sync.sync(G, 0, []);
      expect(other.changes.map((c) => `${c.entity}:${c.id}`)).toEqual([
        "child:c1",
        "sheet:s1",
        "mistake:m1",
        "battle:b1",
      ]);
      expect(other.more).toBe(false);
      expect((await sync.sync(G, other.cursor, [])).changes).toEqual([]);
    });

    it("版の大きいほうを採用する。古い版は受け付けたことにして、入れない", async () => {
      await sync.sync(G, 0, family());
      const r1 = await sync.sync(G, 0, [
        up("mistake", mistake("m1", "c1", "s1", 3)),
      ]);
      const r2 = await sync.sync(G, r1.cursor, [
        up("mistake", { ...mistake("m1", "c1", "s1", 2), status: "defeated" }),
      ]);
      expect(r2.rejected).toEqual([]);
      const all = await sync.sync(G, 0, []);
      const m = all.changes.find((c) => c.id === "m1");
      expect(m?.payload).toMatchObject({ version: 3, status: "new" });
    });

    it("保護者の設定は、時刻の新しいほう。メールアドレスと PIN は入れない。消した子どものルールも入れない", async () => {
      await sync.sync(G, 0, [up("child", child("c1"))]);
      await sync.sync(G, 0, [
        up(
          "guardianSettings",
          settings("2026-11-15T02:00:00.000Z", {
            c1: { dailyMistakeLimit: 5, notifications: true },
            ghost: { dailyMistakeLimit: 5, notifications: true },
          }),
        ),
      ]);
      await sync.sync(G, 0, [
        up("guardianSettings", settings("2026-11-15T01:00:00.000Z")),
      ]);
      const all = await sync.sync(G, 0, []);
      const s = all.changes.find((c) => c.entity === "guardianSettings");
      expect(s?.payload).not.toHaveProperty("email");
      expect(s?.payload).not.toHaveProperty("pinHash");
      expect(s?.payload).toMatchObject({
        updatedAt: "2026-11-15T02:00:00.000Z",
        rules: { c1: { dailyMistakeLimit: 5 } },
      });
      expect((s?.payload as { rules: object }).rules).not.toHaveProperty(
        "ghost",
      );
    });

    it("子どもの PIN のハッシュは入れない", async () => {
      await sync.sync(G, 0, [up("child", child("c1", 1, { pinHash: "x" }))]);
      const all = await sync.sync(G, 0, []);
      expect(all.changes[0].payload).not.toHaveProperty("pinHash");
    });

    it("ほかの家庭の記録は見えず、ほかの家庭の子どもを指す記録も受け付けない", async () => {
      await sync.sync(G, 0, family());
      expect((await sync.sync(OTHER, 0, [])).changes).toEqual([]);
      const r = await sync.sync(OTHER, 0, [
        up("sheet", { ...sheet("s9", "c1"), guardianId: OTHER }),
        up("child", child("c2")),
      ]);
      expect(r.rejected).toEqual([
        { entity: "sheet", id: "s9", reason: "missing_parent" },
        { entity: "child", id: "c2", reason: "owner" },
      ]);
    });

    it("形のちがうもの・未来の日付・大きすぎるもの・消せない記録の削除は受け付けない", async () => {
      await sync.sync(G, 0, [up("child", child("c1"))]);
      const r = await sync.sync(G, 0, [
        up("sheet", { ...sheet("s1", "c1"), createdDay: "2026-11-20" }),
        up("sheet", { ...sheet("s2", "c1"), title: "" }),
        up("mistake", {
          ...mistake("m1", "c1", "s1"),
          question: "あ".repeat(70_000),
        }),
        { entity: "child", id: "m2", op: "delete" },
        { entity: "child", id: "c3", op: "upsert", payload: child("c4") },
        { entity: "unknown", id: "x" } as unknown as SyncChange,
      ]);
      expect(r.rejected.map((x) => `${x.id}:${x.reason}`)).toEqual([
        "s1:future",
        "s2:shape",
        "m1:too_large",
        "m2:not_deletable",
        "c3:shape",
      ]);
    });

    it("子どもを消すと、その子の記録すべてに削除の印が付き、送られてきても戻らない。7日のうちは取り消せる", async () => {
      const first = await sync.sync(G, 0, [
        ...family(),
        up("child", child("c2")),
      ]);
      await sync.deleteChild(G, "c1");
      await sync.deleteChild(G, "c1");
      const del = await sync.sync(G, first.cursor, [
        up("mistake", mistake("m1", "c1", "s1", 9)),
      ]);
      expect(del.changes.map((c) => `${c.id}:${c.deleted}`).sort()).toEqual([
        "b1:true",
        "c1:true",
        "m1:true",
        "s1:true",
      ]);
      expect(del.changes.every((c) => c.payload === undefined)).toBe(true);
      // 古い端末から、消した子どもの記録が届いても戻さない
      const late = await sync.sync(G, del.cursor, [
        up("child", child("c1", 5)),
        up("sheet", sheet("s5", "c1")),
      ]);
      expect(late.changes).toEqual([]);
      expect(late.rejected).toEqual([
        { entity: "sheet", id: "s5", reason: "parent_deleted" },
      ]);

      expect(await sync.deletedChildren(G)).toEqual([
        {
          id: "c1",
          nickname: "ほのお",
          deletedDay: "2026-11-15",
          purgeDay: "2026-11-22",
        },
      ]);
      expect(await sync.restoreChild(G, "c1")).toBe(true);
      const back = await sync.sync(G, late.cursor, []);
      expect(back.changes.map((c) => `${c.id}:${c.deleted}`).sort()).toEqual([
        "b1:false",
        "c1:false",
        "m1:false",
        "s1:false",
      ]);
      expect(await sync.restoreChild(G, "c2")).toBe(false);
    });

    it("7日たつと取り消せず、毎日の処理で本当に消える", async () => {
      await sync.sync(G, 0, family());
      await sync.deleteChild(G, "c1");
      tick(6 * DAY);
      expect(await sync.purge()).toBe(0);
      expect(await sync.deletedChildren(G)).toHaveLength(1);
      tick(DAY);
      expect(await sync.deletedChildren(G)).toEqual([]);
      expect(await sync.restoreChild(G, "c1")).toBe(false);
      expect(await sync.purge()).toBe(4);
      expect((await sync.sync(G, 0, [])).changes).toEqual([]);
    });

    it("1回に返すのは200件まで。残りは「つづきあり」", async () => {
      const changes = [
        up("child", child("c1")),
        ...Array.from({ length: 199 }, (_, i) =>
          up("sheet", sheet(`s${i}`, "c1")),
        ),
      ];
      await sync.sync(G, 0, changes);
      await sync.sync(G, 0, [up("sheet", sheet("s-last", "c1"))]);
      const p1 = await sync.sync(G, 0, []);
      expect(p1.changes).toHaveLength(200);
      expect(p1.more).toBe(true);
      const p2 = await sync.sync(G, p1.cursor, []);
      expect(p2.changes.map((c) => c.id)).toEqual(["s-last"]);
      expect(p2.more).toBe(false);
    });

    it("報告と採点し直しは受け取るが、端末には返さない。同じ ID は最初の1回だけ", async () => {
      const report = {
        id: "r1",
        reason: "unclear",
        createdDay: "2026-11-15",
      };
      const r = await sync.sync(G, 0, [
        up("report", report),
        up("report", { ...report, reason: "other" }),
        up("regrade", { id: "g1", createdDay: "2026-11-15" }),
      ]);
      expect(r.rejected).toEqual([]);
      expect(r.changes).toEqual([]);
      expect(r.cursor).toBeGreaterThan(0);
    });

    it("報告と採点し直しは、作った日から1年で、毎日の処理で消える", async () => {
      await sync.sync(G, 0, [
        up("report", { id: "r1", reason: "unclear", createdDay: "2026-11-15" }),
        up("regrade", { id: "g1", createdDay: "2026-11-15" }),
        up("child", child("c1")),
      ]);
      tick(364 * DAY);
      expect(await sync.purge()).toBe(0);
      tick(DAY);
      expect(await sync.purge()).toBe(2);
      // 学習の記録は残る
      expect((await sync.exportAll(G)).children).toHaveLength(1);
    });

    it("アカウントの削除はすべてに印を付け、取り消すと戻る。書き出しは消していない記録だけ", async () => {
      await sync.sync(G, 0, [
        ...family(),
        up("child", child("c2")),
        up("guardianSettings", settings("2026-11-15T01:00:00.000Z")),
      ]);
      await sync.deleteChild(G, "c2");
      const out = await sync.exportAll(G);
      expect(out.children.map((c) => c.id)).toEqual(["c1"]);
      expect(out.mistakes).toHaveLength(1);
      expect(out.guardianSettings).toMatchObject({ id: G });

      await sync.markAccountDeleted(G);
      expect((await sync.exportAll(G)).children).toEqual([]);
      await sync.restoreAccount(G);
      // 先に消していた子どもは、アカウントの取り消しでは戻らない
      expect((await sync.exportAll(G)).children.map((c) => c.id)).toEqual([
        "c1",
      ]);
    });

    it("AI の回数は、この保護者の子どもごとに数える。日付が変わると数え直す", async () => {
      await sync.sync(G, 0, [
        up("child", child("c1")),
        up("child", child("c2")),
      ]);
      expect(await sync.takeAi(G, "c1", "analyze", 2)).toBe("ok");
      expect(await sync.takeAi(G, "c1", "analyze", 2)).toBe("ok");
      expect(await sync.takeAi(G, "c1", "analyze", 2)).toBe("limit");
      expect(await sync.takeAi(G, "c1", "grade", 2)).toBe("ok");
      expect(await sync.takeAi(G, "c2", "analyze", 2)).toBe("ok");
      expect(await sync.takeAi(OTHER, "c1", "analyze", 2)).toBe(
        "unknown_child",
      );
      expect(await sync.takeAi(G, "ghost", "analyze", 2)).toBe("unknown_child");
      await sync.deleteChild(G, "c2");
      expect(await sync.takeAi(G, "c2", "analyze", 2)).toBe("unknown_child");
      tick(DAY);
      expect(await sync.takeAi(G, "c1", "analyze", 2)).toBe("ok");
    });
  });
}
