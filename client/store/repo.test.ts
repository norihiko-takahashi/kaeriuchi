import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPin, verifyPin } from "@/client/crypto/pin-hash";
import { KaeriuchiDB, setDBForTesting } from "./db";
import {
  adoptAccount,
  applyGradePromotion,
  createChild,
  deleteAllLocalData,
  deleteChild,
  devSignIn,
  exportData,
  getChild,
  getGuardian,
  getRules,
  listChildren,
  MAX_CHILDREN,
  pendingOutbox,
  recordConsent,
  setGuardianPinHash,
  updateChild,
} from "./repo";

const avatar = { face: 0, color: 0, accessory: 0 };
let db: KaeriuchiDB;

beforeEach(async () => {
  db = new KaeriuchiDB(`test-${crypto.randomUUID()}`);
  setDBForTesting(db);
  await devSignIn("parent@example.com");
});

afterEach(async () => {
  await db.delete();
  setDBForTesting(undefined);
});

describe("プロフィール", () => {
  it("作ると、学年から表示モードが決まり、使い方のルールの初期値が付く", async () => {
    const child = await createChild({
      nickname: "きつね",
      grade: "e2",
      avatar,
    });
    expect(child.displayMode).toBe("lower");
    expect(await getRules(child.id)).toEqual({
      dailyMistakeLimit: 10,
      notifications: false,
    });
  });

  it("4人まで（BR-1.1）", async () => {
    for (let i = 0; i < MAX_CHILDREN; i++) {
      await createChild({ nickname: `こ${i}`, grade: "e3", avatar });
    }
    await expect(
      createChild({ nickname: "5にんめ", grade: "e3", avatar }),
    ).rejects.toThrow();
  });

  it("学年を変えると、表示モードも変わる。手で変えていたらそのまま（BR-1.6）", async () => {
    const child = await createChild({ nickname: "a", grade: "e2", avatar });
    const promoted = await updateChild(child.id, { grade: "e3" });
    expect(promoted.displayMode).toBe("upper");

    const manual = await updateChild(child.id, { displayMode: "junior" });
    expect(manual.displayModeOverridden).toBe(true);
    const later = await updateChild(child.id, { grade: "e4" });
    expect(later.displayMode).toBe("junior");
  });

  it("変更は、同じトランザクションで送信待ち（outbox）に入る。PIN のハッシュは入れない", async () => {
    const child = await createChild({ nickname: "a", grade: "e5", avatar });
    await updateChild(child.id, { pinHash: "secret" });
    const items = await pendingOutbox();
    const childItems = items.filter((i) => i.entity === "child");
    expect(childItems).toHaveLength(2);
    expect(JSON.stringify(items)).not.toContain("secret");
  });

  it("削除すると端末から消え、削除の変更が outbox に入る", async () => {
    const child = await createChild({ nickname: "a", grade: "e5", avatar });
    await deleteChild(child.id);
    expect(await getChild(child.id)).toBeUndefined();
    expect(await listChildren()).toHaveLength(0);
    const items = await pendingOutbox();
    expect(items.at(-2)).toMatchObject({
      entity: "child",
      id: child.id,
      op: "delete",
    });
  });
});

describe("年度の切り替え（BR-1.5）", () => {
  it("年度が変わったら学年を進める", async () => {
    const child = await createChild({ nickname: "a", grade: "e6", avatar });
    const nextYear = new Date(Date.UTC(child.gradeSchoolYear + 1, 3, 2));
    const updated = await applyGradePromotion(nextYear);
    expect(updated).toHaveLength(1);
    expect((await getChild(child.id))?.grade).toBe("j1");
    expect((await getChild(child.id))?.displayMode).toBe("junior");
  });

  it("同じ年度なら何もしない", async () => {
    await createChild({ nickname: "a", grade: "e6", avatar });
    expect(await applyGradePromotion(new Date())).toHaveLength(0);
  });
});

describe("書き出し・削除（BR-4）", () => {
  it("書き出しに PIN のハッシュを含めない", async () => {
    await recordConsent();
    await setGuardianPinHash("guardian-secret");
    const child = await createChild({ nickname: "a", grade: "e5", avatar });
    await updateChild(child.id, { pinHash: "child-secret" });
    const data = await exportData();
    const json = JSON.stringify(data);
    expect(json).not.toContain("secret");
    expect(data.children).toHaveLength(1);
  });

  it("子どもごとに書き出せる", async () => {
    const a = await createChild({ nickname: "a", grade: "e5", avatar });
    await createChild({ nickname: "b", grade: "e5", avatar });
    const data = await exportData(a.id);
    expect(data.children.map((c) => c.nickname)).toEqual(["a"]);
    expect(Object.keys(data.guardian.rules)).toEqual([a.id]);
  });

  it("全部消せる", async () => {
    await createChild({ nickname: "a", grade: "e5", avatar });
    await deleteAllLocalData();
    expect(await listChildren()).toHaveLength(0);
    expect(await pendingOutbox()).toHaveLength(0);
  });
});

describe("PIN のハッシュ", () => {
  it("正しい PIN だけ通る（テストでは回数を減らす）", async () => {
    const stored = await hashPin("482915", 1000);
    expect(stored.startsWith("pbkdf2-sha256$1000$")).toBe(true);
    expect(await verifyPin("482915", stored)).toBe(true);
    expect(await verifyPin("482916", stored)).toBe(false);
    expect(await verifyPin("482915", "broken")).toBe(false);
  });

  it("同じ PIN でもソルトが違うので、ハッシュは毎回変わる", async () => {
    expect(await hashPin("482915", 1000)).not.toBe(
      await hashPin("482915", 1000),
    );
  });
});

describe("クラウドのアカウントにつなぐ（U8）", () => {
  it("まだつないでいない記録は、ログインしたアカウントに付け替える（送信待ちも）", async () => {
    const local = await getGuardian();
    const child = await createChild({
      nickname: "きつね",
      grade: "e3",
      avatar,
    });
    expect(
      await adoptAccount({ guardianId: "server-1", email: "p@example.com" }),
    ).toBe("ok");
    const g = await getGuardian();
    expect(g).toMatchObject({ id: "server-1", email: "p@example.com" });
    expect(g?.accountLinkedAt).toBeTruthy();
    expect(await db.guardian.get(local?.id ?? "")).toBeUndefined();
    expect((await getChild(child.id))?.guardianId).toBe("server-1");
    const outbox = await pendingOutbox();
    expect(
      outbox.every(
        (o) => (o.payload as { guardianId?: string })?.guardianId !== local?.id,
      ),
    ).toBe(true);
    // もう一度同じアカウントなら、そのまま
    expect(
      await adoptAccount({ guardianId: "server-1", email: "p@example.com" }),
    ).toBe("ok");
  });

  it("別のアカウントにつないだ記録とは混ぜない。記録がなければ、そのアカウントで始める", async () => {
    await adoptAccount({ guardianId: "server-1", email: "p@example.com" });
    expect(
      await adoptAccount({ guardianId: "server-2", email: "q@example.com" }),
    ).toBe("conflict");
    expect((await getGuardian())?.id).toBe("server-1");
    await deleteAllLocalData();
    expect(
      await adoptAccount({ guardianId: "server-2", email: "q@example.com" }),
    ).toBe("ok");
    expect((await getGuardian())?.id).toBe("server-2");
  });
});
