import type { SyncEntity } from "@/shared/schemas";
import type { NewRecord, StoredRecord, SyncStore, SyncTx } from "./store";

/** 開発・テスト用の同期の保存先（サーバーのメモリ。再起動で消える） */
export class MemorySyncStore implements SyncStore {
  private rows = new Map<string, Map<string, StoredRecord>>();
  private seq = 0;
  private queues = new Map<string, Promise<unknown>>();
  private aiUsage = new Map<string, number>();

  async transaction<T>(
    guardianId: string,
    fn: (tx: SyncTx) => Promise<T>,
  ): Promise<T> {
    const prev = this.queues.get(guardianId) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(() => this.run(guardianId, fn));
    this.queues.set(guardianId, run);
    return run;
  }

  private async run<T>(
    guardianId: string,
    fn: (tx: SyncTx) => Promise<T>,
  ): Promise<T> {
    const live = this.rows.get(guardianId) ?? new Map<string, StoredRecord>();
    // 失敗したら元に戻せるように、写しの上で書く
    const rows = new Map(
      [...live].map(([k, v]) => [k, structuredClone(v)] as const),
    );
    const key = (entity: SyncEntity, id: string) => `${entity}:${id}`;
    const write = (r: NewRecord) =>
      rows.set(key(r.entity, r.id), structuredClone({ ...r, seq: ++this.seq }));
    const tx: SyncTx = {
      get: async (entity, id) => {
        const r = rows.get(key(entity, id));
        return r && structuredClone(r);
      },
      put: async (r) => {
        write(r);
      },
      markDeleted: async (day, by, childId) => {
        for (const r of [...rows.values()].sort((a, b) => a.seq - b.seq))
          if (!r.deleted && (!childId || r.childId === childId))
            write({ ...r, deleted: true, deletedDay: day, deletedBy: by });
      },
      restoreDeleted: async (by) => {
        for (const r of [...rows.values()].sort((a, b) => a.seq - b.seq))
          if (r.deleted && r.deletedBy === by)
            write({
              ...r,
              deleted: false,
              deletedDay: undefined,
              deletedBy: undefined,
            });
      },
      since: async (after, limit) =>
        [...rows.values()]
          .filter((r) => r.seq > after)
          .sort((a, b) => a.seq - b.seq)
          .slice(0, limit)
          .map((r) => structuredClone(r)),
      all: async () =>
        [...rows.values()]
          .filter((r) => !r.deleted)
          .sort((a, b) => a.seq - b.seq)
          .map((r) => structuredClone(r)),
      takeAiUsage: async (childId, day, route, limit) => {
        const k = `${guardianId}|${childId}|${day}|${route}`;
        const used = this.aiUsage.get(k) ?? 0;
        if (used >= limit) return false;
        this.aiUsage.set(k, used + 1);
        return true;
      },
      deletedChildren: async () =>
        [...rows.values()]
          .filter((r) => r.entity === "child" && r.deleted)
          .map((r) => structuredClone(r)),
    };
    const result = await fn(tx);
    // 通し番号は戻さない（飛んだ番号があってもよい。ほかの保護者と重ならないように）
    this.rows.set(guardianId, rows);
    return result;
  }

  async purge(beforeDay: string, reportBeforeDay: string): Promise<number> {
    let n = 0;
    const oldReport = (r: StoredRecord) =>
      (r.entity === "report" || r.entity === "regrade") &&
      String(r.payload.createdDay ?? "") <= reportBeforeDay;
    for (const rows of this.rows.values())
      for (const [k, r] of rows)
        if (
          (r.deleted && r.deletedDay && r.deletedDay <= beforeDay) ||
          oldReport(r)
        ) {
          rows.delete(k);
          n++;
        }
    return n;
  }
}
