import "server-only";
import type { Sql } from "@/server/db/client";
import type { SyncEntity } from "@/shared/schemas";
import type { NewRecord, StoredRecord, SyncStore, SyncTx } from "./store";

/**
 * 本番の同期の保存先（Postgres）。
 * トランザクションごとに app.guardian_id を設定し、RLS でその保護者の行だけにする（U8-SEC-4）。
 * 同じ保護者のトランザクションは、アドバイザリーロックで順番に行う（通し番号の順に書き込みが見えるように）。
 */

interface Row {
  entity: SyncEntity;
  id: string;
  version: number;
  updated_at: string | null;
  child_id: string | null;
  payload: Record<string, unknown>;
  deleted: boolean;
  deleted_day: string | null;
  deleted_by: string | null;
  seq: number;
}

const toRecord = (r: Row): StoredRecord => ({
  entity: r.entity,
  id: r.id,
  version: r.version,
  updatedAt: r.updated_at ?? undefined,
  childId: r.child_id ?? undefined,
  payload: r.payload,
  deleted: r.deleted,
  deletedDay: r.deleted_day ?? undefined,
  deletedBy: r.deleted_by ?? undefined,
  seq: r.seq,
});

export class PostgresSyncStore implements SyncStore {
  constructor(private sql: Sql) {}

  async transaction<T>(
    guardianId: string,
    fn: (tx: SyncTx) => Promise<T>,
  ): Promise<T> {
    return this.sql.begin(async (tx) => {
      await tx`SELECT set_config('app.guardian_id', ${guardianId}, true)`;
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${guardianId}, 0))`;
      const g = guardianId;
      const syncTx: SyncTx = {
        get: async (entity, id) => {
          const [r] = await tx<Row[]>`
            SELECT * FROM records WHERE guardian_id = ${g} AND entity = ${entity} AND id = ${id}`;
          return r && toRecord(r);
        },
        put: async (r: NewRecord) => {
          await tx`
            INSERT INTO records (guardian_id, entity, id, version, updated_at, child_id, payload, deleted, deleted_day, deleted_by, seq)
            VALUES (${g}, ${r.entity}, ${r.id}, ${r.version}, ${r.updatedAt ?? null}, ${r.childId ?? null},
              ${tx.json(r.payload as never)}, ${r.deleted}, ${r.deletedDay ?? null}, ${r.deletedBy ?? null}, nextval('records_seq'))
            ON CONFLICT (guardian_id, entity, id) DO UPDATE SET
              version = EXCLUDED.version, updated_at = EXCLUDED.updated_at, child_id = EXCLUDED.child_id,
              payload = EXCLUDED.payload, deleted = EXCLUDED.deleted, deleted_day = EXCLUDED.deleted_day,
              deleted_by = EXCLUDED.deleted_by, seq = EXCLUDED.seq`;
        },
        markDeleted: async (day, by, childId) => {
          await tx`
            UPDATE records SET deleted = true, deleted_day = ${day}, deleted_by = ${by}, seq = nextval('records_seq')
            WHERE guardian_id = ${g} AND NOT deleted
              AND (${childId ?? null}::text IS NULL OR child_id = ${childId ?? null})`;
        },
        restoreDeleted: async (by) => {
          await tx`
            UPDATE records SET deleted = false, deleted_day = NULL, deleted_by = NULL, seq = nextval('records_seq')
            WHERE guardian_id = ${g} AND deleted AND deleted_by = ${by}`;
        },
        since: async (after, limit) =>
          (
            await tx<Row[]>`
              SELECT * FROM records WHERE guardian_id = ${g} AND seq > ${after} ORDER BY seq LIMIT ${limit}`
          ).map(toRecord),
        all: async () =>
          (
            await tx<Row[]>`
              SELECT * FROM records WHERE guardian_id = ${g} AND NOT deleted ORDER BY seq`
          ).map(toRecord),
        takeAiUsage: async (childId, day, route, limit) => {
          const r = await tx`
            INSERT INTO ai_usage (guardian_id, child_id, day, route, count)
            VALUES (${g}, ${childId}, ${day}, ${route}, 1)
            ON CONFLICT (guardian_id, child_id, day, route) DO UPDATE SET count = ai_usage.count + 1
            WHERE ai_usage.count < ${limit}
            RETURNING count`;
          return r.length > 0;
        },
        deletedChildren: async () =>
          (
            await tx<Row[]>`
              SELECT * FROM records WHERE guardian_id = ${g} AND entity = 'child' AND deleted`
          ).map(toRecord),
      };
      return fn(syncTx);
    }) as Promise<T>;
  }

  /** 毎日の削除。持ち主の権限で動く関数で消す（アプリの役割は、ほかの家庭の行を見られない） */
  async purge(beforeDay: string): Promise<number> {
    const now = Date.now();
    const [r] = await this.sql<{ records: number }[]>`
      SELECT * FROM kaeriuchi_purge(${beforeDay}, ${now - 7 * 86_400_000}, ${now})`;
    return r.records;
  }
}
