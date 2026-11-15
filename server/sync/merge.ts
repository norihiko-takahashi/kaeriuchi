import type { SyncEntity } from "@/shared/schemas";

/**
 * まとめ方のルール（U8 §4、domain-model.md）。純粋な関数。
 * - 報告・採点し直し：足すだけ（同じ ID は最初の1回だけ）
 * - プロフィール・ミスモン・テスト・バトル：版（version）が大きいほう。同じならサーバーに先に届いたほう
 *   （バトルは1回答えるごとに版が上がって保存されるので、版で比べる。消すことはできない）
 * - 保護者の設定：更新の時刻が新しいほう
 * - 削除が勝つ：消した記録は、送られてきても戻さない（取り消しはアカウントの API だけ）
 */

export type MergeRule = "append" | "version" | "updatedAt";

export const MERGE_RULES: Record<SyncEntity, MergeRule> = {
  child: "version",
  guardianSettings: "updatedAt",
  mistake: "version",
  battle: "version",
  sheet: "version",
  report: "append",
  regrade: "append",
};

/** 端末から消せる記録（子どもの削除。ほかは子どもを消したときに一緒に消える） */
export const DELETABLE: ReadonlySet<SyncEntity> = new Set(["child"]);

export interface Comparable {
  version: number;
  updatedAt?: string;
  deleted: boolean;
}

export type MergeDecision =
  | { action: "write" }
  | { action: "skip"; reason: "deleted" | "older" | "exists" };

export function decide(
  entity: SyncEntity,
  existing: Comparable | undefined,
  incoming: { op: "upsert" | "delete"; version: number; updatedAt?: string },
): MergeDecision {
  if (existing?.deleted) return { action: "skip", reason: "deleted" };
  if (incoming.op === "delete") return { action: "write" };
  if (!existing) return { action: "write" };
  switch (MERGE_RULES[entity]) {
    case "append":
      return { action: "skip", reason: "exists" };
    case "version":
      return incoming.version > existing.version
        ? { action: "write" }
        : { action: "skip", reason: "older" };
    case "updatedAt":
      return (incoming.updatedAt ?? "") > (existing.updatedAt ?? "")
        ? { action: "write" }
        : { action: "skip", reason: "older" };
  }
}

/** 削除の印を付けてから、本当に消すまでの日数がたったか（U8-PRIV-2） */
export function purgeable(deletedDay: string, today: string, days: number) {
  return addDays(deletedDay, days) <= today;
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
