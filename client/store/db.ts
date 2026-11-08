import Dexie, { type EntityTable } from "dexie";
import type { ChildProfile, Guardian, OutboxItem } from "@/shared/schemas";

export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * 端末の中のデータ（IndexedDB）。スキーマ v1。
 * 表を増やすときは version(n) を足し、移行の処理と単体テストを書く。
 */
export class KaeriuchiDB extends Dexie {
  guardian!: EntityTable<Guardian, "id">;
  children!: EntityTable<ChildProfile, "id">;
  outbox!: EntityTable<OutboxItem, "seq">;
  meta!: EntityTable<MetaRow, "key">;

  constructor(name = "kaeriuchi") {
    super(name);
    this.version(1).stores({
      guardian: "id",
      children: "id, guardianId, [guardianId+nickname]",
      outbox: "++seq, entity, createdAt",
      meta: "key",
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
