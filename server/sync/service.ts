import type { PulledChange, RejectedChange, SyncResponse } from "@/shared/sync";
import { REPORT_KEEP_DAYS, SYNC_BATCH, UNDO_DAYS } from "@/shared/sync";
import { addDays, decide } from "./merge";
import type { StoredRecord, SyncStore, SyncTx } from "./store";
import { type CheckedChange, checkChange } from "./validate";

/**
 * 同期の処理（U8 §4・nfr-design.md §4）。
 * 1回の同期は、1つのトランザクションで「送られた変更を入れる → それより後の変更を返す」。
 */

export const jstDay = (ms: number) =>
  new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

const SERVER_ONLY = new Set(["report", "regrade"]);

const childTag = (id: string) => `child:${id}`;
export const ACCOUNT_TAG = "account";

export class SyncService {
  private now: () => number;

  constructor(
    private store: SyncStore,
    deps: { now?: () => number } = {},
  ) {
    this.now = deps.now ?? Date.now;
  }

  today() {
    return jstDay(this.now());
  }

  async sync(
    guardianId: string,
    since: number,
    changes: unknown[],
  ): Promise<SyncResponse> {
    const today = this.today();
    return this.store.transaction(guardianId, async (tx) => {
      const rejected: RejectedChange[] = [];
      for (const raw of changes) {
        const r = checkChange(raw, guardianId, today);
        if (!r.ok) {
          if (r.entity && r.id)
            rejected.push({ entity: r.entity, id: r.id, reason: r.reason });
          continue;
        }
        const reason = await this.apply(tx, r.change);
        if (reason)
          rejected.push({ entity: r.change.entity, id: r.change.id, reason });
      }
      const rows = await tx.since(since, SYNC_BATCH + 1);
      const page = rows.slice(0, SYNC_BATCH);
      return {
        cursor: page.at(-1)?.seq ?? since,
        more: rows.length > SYNC_BATCH,
        // 報告・採点し直しは、端末に戻さない（端末では使わない）
        changes: page.filter((r) => !SERVER_ONLY.has(r.entity)).map(toPulled),
        rejected,
      };
    });
  }

  /** 1件を入れる。受け付けなかったときは理由を返す */
  private async apply(
    tx: SyncTx,
    c: CheckedChange,
  ): Promise<string | undefined> {
    for (const ref of c.refs) {
      const parent = await tx.get(ref.entity, ref.id);
      if (!parent) return "missing_parent";
      if (parent.deleted) return "parent_deleted";
    }
    const existing = await tx.get(c.entity, c.id);
    const d = decide(c.entity, existing, c);
    // 古い・すでにある・消したものは、受け付けたことにする（端末は送信待ちから消し、pull で正しい版を受け取る）
    if (d.action === "skip") return undefined;

    let payload = c.payload ?? {};
    if (c.entity === "guardianSettings") {
      // 消した子ども・知らない子どものルールは入れない
      const rules: Record<string, unknown> = {};
      for (const [cid, rule] of Object.entries(
        (payload.rules ?? {}) as Record<string, unknown>,
      )) {
        const child = await tx.get("child", cid);
        if (child && !child.deleted) rules[cid] = rule;
      }
      payload = { ...payload, rules };
    }
    await tx.put({
      entity: c.entity,
      id: c.id,
      version: c.version,
      updatedAt: c.updatedAt,
      childId: c.childId,
      payload,
      deleted: false,
    });
    return undefined;
  }

  /**
   * AI の1日の回数を、子どもごとに数える（U8 §6）。
   * その子が、この保護者の子ども（同期した記録にあり、消していない）でなければ数えない
   */
  async takeAi(
    guardianId: string,
    childId: string,
    route: string,
    limit: number,
  ): Promise<"ok" | "limit" | "unknown_child"> {
    const day = this.today();
    return this.store.transaction(guardianId, async (tx) => {
      const child = await tx.get("child", childId);
      if (!child || child.deleted) return "unknown_child";
      return (await tx.takeAiUsage(childId, day, route, limit))
        ? "ok"
        : "limit";
    });
  }

  /* ---------- 削除の取り消し・書き出し（U8 §5） ---------- */

  /**
   * 子どもを消す：その子の記録すべてに削除の印を付ける（次の同期で、すべての端末から消える）。
   * まだ同期していない子どもでも、印を残す（あとから古い端末が送ってきても戻さない）
   */
  async deleteChild(guardianId: string, childId: string) {
    const today = this.today();
    const tag = childTag(childId);
    await this.store.transaction(guardianId, async (tx) => {
      const existing = await tx.get("child", childId);
      if (existing?.deleted) return;
      await tx.put({
        entity: "child",
        id: childId,
        version: existing?.version ?? 0,
        updatedAt: existing?.updatedAt,
        payload: existing?.payload ?? {},
        deleted: true,
        deletedDay: today,
        deletedBy: tag,
      });
      await tx.markDeleted(today, tag, childId);
    });
  }

  /** 取り消せる、消した子ども */
  async deletedChildren(guardianId: string) {
    const today = this.today();
    return this.store.transaction(guardianId, async (tx) =>
      (await tx.deletedChildren())
        .filter(
          (r) =>
            r.deletedBy === childTag(r.id) &&
            r.deletedDay &&
            addDays(r.deletedDay, UNDO_DAYS) > today,
        )
        .map((r) => ({
          id: r.id,
          nickname: String(r.payload.nickname ?? ""),
          deletedDay: r.deletedDay as string,
          purgeDay: addDays(r.deletedDay as string, UNDO_DAYS),
        })),
    );
  }

  async restoreChild(guardianId: string, childId: string): Promise<boolean> {
    const ok = (await this.deletedChildren(guardianId)).some(
      (c) => c.id === childId,
    );
    if (!ok) return false;
    await this.store.transaction(guardianId, (tx) =>
      tx.restoreDeleted(childTag(childId)),
    );
    return true;
  }

  /** アカウントの削除：すべての記録に削除の印を付ける */
  async markAccountDeleted(guardianId: string) {
    const today = this.today();
    await this.store.transaction(guardianId, (tx) =>
      tx.markDeleted(today, ACCOUNT_TAG),
    );
  }

  async restoreAccount(guardianId: string) {
    await this.store.transaction(guardianId, (tx) =>
      tx.restoreDeleted(ACCOUNT_TAG),
    );
  }

  /** クラウドの記録を書き出す（消していないものだけ） */
  async exportAll(guardianId: string) {
    const rows = await this.store.transaction(guardianId, (tx) => tx.all());
    const pick = (e: StoredRecord["entity"]) =>
      rows.filter((r) => r.entity === e).map((r) => r.payload);
    return {
      exportedDay: this.today(),
      guardianSettings: pick("guardianSettings")[0] ?? null,
      children: pick("child"),
      sheets: pick("sheet"),
      mistakes: pick("mistake"),
      battles: pick("battle"),
    };
  }

  /** 毎日1回：削除の印から7日たった記録を本当に消す（U8-PRIV-2） */
  async purge(): Promise<number> {
    return this.store.purge(
      addDays(this.today(), -UNDO_DAYS),
      addDays(this.today(), -REPORT_KEEP_DAYS),
    );
  }
}

function toPulled(r: StoredRecord): PulledChange {
  return r.deleted
    ? { entity: r.entity, id: r.id, deleted: true }
    : { entity: r.entity, id: r.id, deleted: false, payload: r.payload };
}
