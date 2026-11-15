import type { EntityTable } from "dexie";
import { getDB, type KaeriuchiDB } from "@/client/store/db";
import type { Battle, Mistake, Sheet } from "@/shared/battle";
import type { ChildProfile, Guardian, OutboxItem } from "@/shared/schemas";
import {
  type PulledChange,
  SYNC_BATCH,
  SYNC_BODY_MAX_BYTES,
  type SyncChange,
  type SyncResponse,
} from "@/shared/sync";

/**
 * 同期（U8 §4・nfr-design.md §4）。送信待ちを送り、クラウドの変更を端末に入れる。
 * 画面の操作を止めないように裏で動き、失敗したら間隔をあけてやり直す（U8-PERF-2）。
 * 子どもの画面には何も出さない。状態は保護者メニューで見る。
 */

const CURSOR = "sync-cursor";
const STATUS = "sync-status";
const INITIALIZED = "sync-initialized";
export const SIGNED_OUT = "signed-out";

export interface SyncStatus {
  /** 最後に同期できた日（時刻は残さない・NFR-P11） */
  lastSyncedDay?: string;
  /** 続けて失敗した回数 */
  failures: number;
}

export type SyncOutcome =
  | "ok"
  | "offline"
  | "not-linked"
  | "signed-out"
  | "failed";

type Fetch = typeof fetch;

const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function meta<T>(db: KaeriuchiDB, key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function getSyncStatus(): Promise<
  SyncStatus & { pending: number; signedOut: boolean }
> {
  const db = getDB();
  const status = (await meta<SyncStatus>(db, STATUS)) ?? { failures: 0 };
  return {
    ...status,
    pending: await db.outbox.count(),
    signedOut: (await meta<boolean>(db, SIGNED_OUT)) === true,
  };
}

/** ログインし直したら、ログアウトの印を消す */
export async function clearSignedOut() {
  await getDB().meta.delete(SIGNED_OUT);
}

export async function isSignedOut(): Promise<boolean> {
  return (await meta<boolean>(getDB(), SIGNED_OUT)) === true;
}

/* ---------- 送るもの ---------- */

const { stripChild, stripGuardian } = {
  stripChild: ({ pinHash: _p, ...c }: ChildProfile) => c,
  /** メールアドレス・PIN のハッシュは送らない（U8-PRIV-1） */
  stripGuardian: ({
    pinHash: _p,
    email: _e,
    accountLinkedAt: _a,
    ...g
  }: Guardian) => g,
};
export { stripChild, stripGuardian };

/**
 * この端末で初めて同期するとき、端末の記録をすべて送信待ちに入れ直す。
 * つないだ前の記録（ID を付け替えたもの・送信待ちに入っていないもの）も、もれなく送るため。
 * 報告と採点し直しは、端末に残っていないので、送信待ちのものをそのまま残す
 */
async function enqueueEverything(db: KaeriuchiDB, guardian: Guardian) {
  const t = new Date().toISOString();
  const item = (entity: OutboxItem["entity"], id: string, payload: unknown) =>
    ({
      entity,
      id,
      op: "upsert",
      payload,
      clientUpdatedAt: t,
      createdAt: t,
    }) satisfies OutboxItem;
  await db.transaction(
    "rw",
    [db.outbox, db.children, db.sheets, db.mistakes, db.battles, db.meta],
    async () => {
      const keep = await db.outbox
        .filter((i) => i.entity === "report" || i.entity === "regrade")
        .toArray();
      await db.outbox.clear();
      const children = (await db.children.toArray()).filter(
        (c) => c.guardianId === guardian.id && !c.deletedAt,
      );
      const ids = new Set(children.map((c) => c.id));
      const mine = <T extends { childId: string }>(rows: T[]) =>
        rows.filter((r) => ids.has(r.childId));
      const rows: OutboxItem[] = [
        ...children.map((c) => item("child", c.id, stripChild(c))),
        ...mine(await db.sheets.toArray()).map((s) => item("sheet", s.id, s)),
        ...mine(await db.mistakes.toArray()).map((m) =>
          item("mistake", m.id, m),
        ),
        ...mine(await db.battles.toArray()).map((b) => item("battle", b.id, b)),
        item("guardianSettings", guardian.id, stripGuardian(guardian)),
        ...keep.map(({ seq: _s, ...i }) => i),
      ];
      await db.outbox.bulkAdd(rows);
      await db.meta.put({ key: INITIALIZED, value: guardian.id });
    },
  );
}

/** 1回に送る分（200件・1MB まで） */
function takeBatch(items: OutboxItem[]): OutboxItem[] {
  const batch: OutboxItem[] = [];
  let size = 64;
  for (const i of items.slice(0, SYNC_BATCH)) {
    size += JSON.stringify(toChange(i)).length + 1;
    if (size > SYNC_BODY_MAX_BYTES * 0.9 && batch.length > 0) break;
    batch.push(i);
  }
  return batch;
}

const toChange = (i: OutboxItem): SyncChange => ({
  entity: i.entity,
  id: i.id,
  op: i.op,
  payload: i.op === "upsert" ? i.payload : undefined,
});

/* ---------- 受け取ったもの ---------- */

type Versioned = { id: string; version: number };

async function applyVersioned<T extends Versioned>(
  table: EntityTable<T, "id">,
  c: PulledChange,
  keep?: (local: T) => Partial<T>,
) {
  if (c.deleted) return table.delete(c.id as never);
  const incoming = c.payload as T;
  const local = await table.get(c.id as never);
  if (local && incoming.version < local.version) return;
  await table.put({ ...incoming, ...(local && keep ? keep(local) : {}) });
}

async function deleteChildLocally(db: KaeriuchiDB, childId: string) {
  await db.children.delete(childId);
  const ids = {
    mistake: await db.mistakes.where("childId").equals(childId).primaryKeys(),
    battle: await db.battles.where("childId").equals(childId).primaryKeys(),
    sheet: await db.sheets.where("childId").equals(childId).primaryKeys(),
  };
  await db.mistakes.bulkDelete(ids.mistake);
  await db.battles.bulkDelete(ids.battle);
  await db.sheets.bulkDelete(ids.sheet);
  await db.outbox
    .filter(
      (i) =>
        (i.entity === "child" && i.id === childId) ||
        ((i.entity === "mistake" ||
          i.entity === "battle" ||
          i.entity === "sheet") &&
          (ids[i.entity] as string[]).includes(i.id)),
    )
    .delete();
}

async function applyPulled(db: KaeriuchiDB, changes: PulledChange[]) {
  await db.transaction(
    "rw",
    [
      db.guardian,
      db.children,
      db.sheets,
      db.mistakes,
      db.battles,
      db.outbox,
      db.meta,
    ],
    async () => {
      let maxOrder = 0;
      for (const c of changes) {
        switch (c.entity) {
          case "child":
            if (c.deleted) await deleteChildLocally(db, c.id);
            else
              await applyVersioned<ChildProfile>(db.children, c, (local) => ({
                pinHash: local.pinHash,
              }));
            break;
          case "guardianSettings": {
            const local = await db.guardian.get(c.id);
            const incoming = c.payload as Guardian | undefined;
            if (!local || !incoming || c.deleted) break;
            if (incoming.updatedAt < local.updatedAt) break;
            await db.guardian.put({
              ...local,
              ...incoming,
              pinHash: local.pinHash,
              email: local.email,
              accountLinkedAt: local.accountLinkedAt,
            });
            break;
          }
          case "sheet":
            await applyVersioned<Sheet>(db.sheets, c);
            break;
          case "mistake":
            await applyVersioned<Mistake>(db.mistakes, c);
            break;
          case "battle":
            await applyVersioned<Battle>(db.battles, c);
            maxOrder = Math.max(
              maxOrder,
              (c.payload as Battle | undefined)?.order ?? 0,
            );
            break;
        }
      }
      // ほかの端末で終えたバトルより後の順番を付けるように
      const order = (await meta<number>(db, "battle-order")) ?? 0;
      if (maxOrder > order)
        await db.meta.put({ key: "battle-order", value: maxOrder });
    },
  );
}

/* ---------- 同期 ---------- */

let running: Promise<SyncOutcome> | null = null;

/** いま同期する。同時に呼ばれても1回だけ動く */
export function syncNow(deps: { fetch?: Fetch } = {}): Promise<SyncOutcome> {
  running ??= run(deps.fetch ?? fetch).finally(() => {
    running = null;
  });
  return running;
}

async function run(fetchFn: Fetch): Promise<SyncOutcome> {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return "offline";
  const db = getDB();
  const guardian = await db.guardian.toCollection().first();
  if (!guardian?.accountLinkedAt) return "not-linked";
  if (await isSignedOut()) return "signed-out";
  if ((await meta<string>(db, INITIALIZED)) !== guardian.id) {
    await db.meta.delete(CURSOR);
    await enqueueEverything(db, guardian);
  }

  try {
    for (let round = 0; round < 50; round++) {
      const pending = await db.outbox
        .orderBy("seq")
        .limit(SYNC_BATCH)
        .toArray();
      const batch = takeBatch(pending);
      const since = (await meta<number>(db, CURSOR)) ?? 0;
      const res = await fetchFn("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ since, changes: batch.map(toChange) }),
      });
      if (res.status === 401) {
        // ほかの端末からログアウトさせられた（U8 §3）。端末の記録は消さない
        await db.meta.put({ key: SIGNED_OUT, value: true });
        return "signed-out";
      }
      if (!res.ok) throw new Error(`sync ${res.status}`);
      const body = (await res.json()) as SyncResponse;
      await applyPulled(db, body.changes);
      // 送った分を消す（送っている間に足された変更は残る。受け付けられなかったものも、もう送らない）
      await db.outbox.bulkDelete(
        batch.map((i) => i.seq).filter((s): s is number => s !== undefined),
      );
      await db.meta.put({ key: CURSOR, value: body.cursor });
      const more = (await db.outbox.count()) > 0 && batch.length > 0;
      if (!body.more && !more) break;
    }
    await db.meta.put({
      key: STATUS,
      value: { lastSyncedDay: localDay(), failures: 0 } satisfies SyncStatus,
    });
    return "ok";
  } catch {
    const prev = (await meta<SyncStatus>(db, STATUS)) ?? { failures: 0 };
    await db.meta.put({
      key: STATUS,
      value: { ...prev, failures: prev.failures + 1 } satisfies SyncStatus,
    });
    return "failed";
  }
}

/** 失敗が続いたときの、次にやり直すまでの時間（5秒から倍にして、最大 5分） */
export function retryDelay(failures: number): number {
  return Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, failures - 1));
}

/** テスト用 */
export function resetSyncStateForTesting() {
  running = null;
}
