import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KaeriuchiDB, setDBForTesting } from "@/client/store/db";
import { createSheet } from "@/client/store/game-repo";
import {
  adoptAccount,
  createChild,
  deleteChild,
  getGuardian,
  listChildren,
  recordConsent,
  setGuardianPinHash,
  setRules,
  updateChild,
} from "@/client/store/repo";
import { MemorySyncStore } from "@/server/sync/memory";
import { SyncService } from "@/server/sync/service";
import {
  getSyncStatus,
  resetSyncStateForTesting,
  retryDelay,
  syncNow,
} from "./engine";

/** 2台の端末（別々の IndexedDB）が、サーバー（メモリ）を通して記録をやりとりする */

const ACCOUNT = { guardianId: "g-1", email: "parent@example.com" };
const avatar = { face: 0, color: 0, accessory: 0 };

let server: SyncService;
let status = 200;
const dbs: KaeriuchiDB[] = [];
const sent: unknown[] = [];

const fakeFetch = (async (_url: string, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  sent.push(body);
  if (status !== 200) return new Response("{}", { status });
  const res = await server.sync(ACCOUNT.guardianId, body.since, body.changes);
  return new Response(JSON.stringify(res), { status: 200 });
}) as typeof fetch;

async function device(): Promise<KaeriuchiDB> {
  const db = new KaeriuchiDB(`sync-${crypto.randomUUID()}`);
  dbs.push(db);
  return db;
}
const use = (db: KaeriuchiDB) => {
  setDBForTesting(db);
  resetSyncStateForTesting();
};
const sync = () => syncNow({ fetch: fakeFetch });

beforeEach(() => {
  server = new SyncService(new MemorySyncStore());
  status = 200;
  sent.length = 0;
});
afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete();
  setDBForTesting(undefined);
});

describe("同期（端末）", () => {
  it("1台目の記録が、2台目に届く。PIN とメールアドレスは送らない", async () => {
    const a = await device();
    use(a);
    await adoptAccount(ACCOUNT);
    await recordConsent();
    await setGuardianPinHash("guardian-pin");
    const kid = await createChild({ nickname: "きつね", grade: "e2", avatar });
    await updateChild(kid.id, { pinHash: "child-pin" });
    await setRules(kid.id, {
      dailyMistakeLimit: 7,
      notifications: false,
    });
    await createSheet(kid.id, "math");
    expect(await sync()).toBe("ok");
    expect(await a.outbox.count()).toBe(0);
    const text = JSON.stringify(sent);
    expect(text).not.toContain("guardian-pin");
    expect(text).not.toContain("child-pin");
    expect(text).not.toContain("parent@example.com");

    const b = await device();
    use(b);
    await adoptAccount(ACCOUNT);
    expect(await sync()).toBe("ok");
    const g = await getGuardian();
    expect(g?.consentVersion).toBeDefined();
    expect(g?.pinHash).toBeUndefined();
    expect(g?.email).toBe("parent@example.com");
    expect(g?.rules[kid.id]?.dailyMistakeLimit).toBe(7);
    const kids = await listChildren();
    expect(kids.map((k) => k.nickname)).toEqual(["きつね"]);
    expect(kids[0].pinHash).toBeUndefined();
    expect(await b.sheets.count()).toBe(1);
    expect(await getSyncStatus()).toMatchObject({
      failures: 0,
      pending: 0,
      signedOut: false,
    });
  });

  it("消した子どもは、ほかの端末からも消える。端末の PIN は残す", async () => {
    const a = await device();
    use(a);
    await adoptAccount(ACCOUNT);
    const kid = await createChild({ nickname: "きつね", grade: "e2", avatar });
    const keep = await createChild({ nickname: "たぬき", grade: "e3", avatar });
    await sync();

    const b = await device();
    use(b);
    await adoptAccount(ACCOUNT);
    await sync();
    await updateChild(keep.id, { pinHash: "b-pin" });

    use(a);
    // クラウドの削除（アカウントの API）のあと、端末からも消す
    await server.deleteChild(ACCOUNT.guardianId, kid.id);
    await deleteChild(kid.id);
    await updateChild(keep.id, { nickname: "たぬきち" });
    await sync();

    use(b);
    await sync();
    const kids = await listChildren();
    expect(kids.map((k) => k.nickname)).toEqual(["たぬきち"]);
    expect(kids[0].pinHash).toBe("b-pin");
  });

  it("端末で新しくした版は、古い版で上書きしない", async () => {
    const a = await device();
    use(a);
    await adoptAccount(ACCOUNT);
    const kid = await createChild({ nickname: "きつね", grade: "e2", avatar });
    await sync();
    // 送る前に、もう一度変える（送信待ちに残っている）
    await updateChild(kid.id, { nickname: "きつねこ" });
    await a.meta.delete("sync-cursor");
    const before = sent.length;
    await sync();
    expect(sent.length).toBeGreaterThan(before);
    expect((await listChildren())[0].nickname).toBe("きつねこ");
  });

  it("ログアウトさせられた端末は、印を付けて止まる。記録は消さない。ログインし直すと戻る", async () => {
    const a = await device();
    use(a);
    await adoptAccount(ACCOUNT);
    await createChild({ nickname: "きつね", grade: "e2", avatar });
    status = 401;
    expect(await sync()).toBe("signed-out");
    expect(await sync()).toBe("signed-out");
    expect((await getSyncStatus()).signedOut).toBe(true);
    expect(await listChildren()).toHaveLength(1);
    status = 200;
    await adoptAccount(ACCOUNT);
    expect(await sync()).toBe("ok");
  });

  it("失敗したら数え、やり直す間隔をだんだんあける（最大5分）", async () => {
    const a = await device();
    use(a);
    await adoptAccount(ACCOUNT);
    status = 503;
    expect(await sync()).toBe("failed");
    expect(await sync()).toBe("failed");
    expect((await getSyncStatus()).failures).toBe(2);
    expect(retryDelay(1)).toBe(5_000);
    expect(retryDelay(3)).toBe(20_000);
    expect(retryDelay(20)).toBe(300_000);
  });

  it("アカウントにつないでいない端末は送らない", async () => {
    use(await device());
    expect(await sync()).toBe("not-linked");
    expect(sent).toEqual([]);
  });
});
