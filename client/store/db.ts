import Dexie, { type EntityTable } from "dexie";
import type { Battle, Mistake, PendingRegrade, Sheet } from "@/shared/battle";
import { SUBJECT_LABELS } from "@/shared/problem";
import type { ChildProfile, Guardian, OutboxItem } from "@/shared/schemas";

export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * 端末の中のデータ（IndexedDB）。
 * 表を増やすときは version(n) を足し、移行の処理と単体テストを書く。
 * v2（U4・U5）：ミスモン、バトル、あとで採点し直す答え。v1 のデータはそのまま残る。
 * v3（U6）：テスト。v2 のミスモンは、子ども・教科・登録した日ごとにテストを作って入れる。
 */
export class KaeriuchiDB extends Dexie {
  guardian!: EntityTable<Guardian, "id">;
  children!: EntityTable<ChildProfile, "id">;
  outbox!: EntityTable<OutboxItem, "seq">;
  meta!: EntityTable<MetaRow, "key">;
  mistakes!: EntityTable<Mistake, "id">;
  battles!: EntityTable<Battle, "id">;
  regrades!: EntityTable<PendingRegrade, "id">;
  sheets!: EntityTable<Sheet, "id">;

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
    this.version(3)
      .stores({
        sheets: "id, childId",
        mistakes: "id, childId, [childId+createdDay], status, sheetId",
        battles: "id, mistakeId, childId",
      })
      .upgrade(async (tx) => {
        const sheets = new Map<string, Sheet>();
        await tx
          .table<Mistake>("mistakes")
          .toCollection()
          .modify((m) => {
            if (m.sheetId) return;
            const key = `${m.childId}|${m.subject}|${m.createdDay}`;
            let sheet = sheets.get(key);
            if (!sheet) {
              sheet = {
                id: crypto.randomUUID(),
                guardianId: m.guardianId,
                childId: m.childId,
                title: sheetTitle(m.subject, m.createdDay),
                subject: m.subject,
                createdDay: m.createdDay,
                version: 1,
              };
              sheets.set(key, sheet);
            }
            m.sheetId = sheet.id;
          });
        await tx.table<Sheet>("sheets").bulkAdd([...sheets.values()]);
        // 終えたバトルに、終えた順番を付ける（始めた日の順）
        let order = 0;
        const battles = await tx.table<Battle>("battles").toArray();
        battles.sort((a, b) => a.startedDay.localeCompare(b.startedDay));
        for (const b of battles) {
          if (b.state.phase === "finished" && b.order === undefined)
            await tx.table<Battle>("battles").update(b.id, { order: ++order });
        }
        await tx.table("meta").put({ key: "battle-order", value: order });
      });
  }
}

/** テストの名前の初期値（BR-6-1）。例：「さんすう 11/11 の テスト」 */
export function sheetTitle(subject: Mistake["subject"], day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${SUBJECT_LABELS[subject].split("・")[0]} ${m}/${d} の テスト`;
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
