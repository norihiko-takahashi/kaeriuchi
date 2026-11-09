import Dexie, { type EntityTable } from "dexie";
import type { Battle, Mistake, PendingRegrade } from "@/shared/battle";
import type { ChildProfile, Guardian, OutboxItem } from "@/shared/schemas";

export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * 端末の中のデータ（IndexedDB）。
 * 表を増やすときは version(n) を足し、移行の処理と単体テストを書く。
 * v2（U4・U5）：ミスモン、バトル、あとで採点し直す答え。v1 のデータはそのまま残る。
 */
export class KaeriuchiDB extends Dexie {
  guardian!: EntityTable<Guardian, "id">;
  children!: EntityTable<ChildProfile, "id">;
  outbox!: EntityTable<OutboxItem, "seq">;
  meta!: EntityTable<MetaRow, "key">;
  mistakes!: EntityTable<Mistake, "id">;
  battles!: EntityTable<Battle, "id">;
  regrades!: EntityTable<PendingRegrade, "id">;

  constructor(name = "kaeriuchi") {
    super(name);
    this.version(1).stores({
      guardian: "id",
      children: "id, guardianId, [guardianId+nickname]",
      outbox: "++seq, entity, createdAt",
      meta: "key",
    });
    // 表を足すだけなので、v1 のデータの移しかえは要らない
    this.version(2).stores({
      mistakes: "id, childId, [childId+createdDay], status",
      battles: "id, mistakeId, childId",
      regrades: "id",
    });
  }
}

let instance: KaeriuchiDB | undefined;

export function getDB(): KaeriuchiDB {
  instance ??= new KaeriuchiDB();
  return instance;
}

/** テスト用：別の名前の DB に差し替える */
export function setDBForTesting(db: KaeriuchiDB | undefined) {
  instance = db;
}
