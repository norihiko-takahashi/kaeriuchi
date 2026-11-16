import type { SyncEntity } from "@/shared/schemas";

/**
 * 同期の保存先（U8・nfr-design.md §3）。本番は Postgres、開発とテストはメモリ（NFR-I2）。
 * どの操作も、1人の保護者の記録の中だけで行う（U8-SEC-4）。
 */

export interface StoredRecord {
  entity: SyncEntity;
  id: string;
  version: number;
  updatedAt?: string;
  /** どの子どもの記録か（子どもを消したときに一緒に消す） */
  childId?: string;
  payload: Record<string, unknown>;
  deleted: boolean;
  /** 削除の印を付けた日（7日たったら本当に消す） */
  deletedDay?: string;
  /** 何の削除で付いた印か（"child:<ID>" か "account"）。取り消すときに、同じ印のものだけ戻す */
  deletedBy?: string;
  /** 書き込むたびにサーバーが付ける通し番号（pull の目印） */
  seq: number;
}

export type NewRecord = Omit<StoredRecord, "seq">;

/** 1人の保護者の記録を、1つのトランザクションで扱う */
export interface SyncTx {
  get(entity: SyncEntity, id: string): Promise<StoredRecord | undefined>;
  /** 書き込み、新しい通し番号を付ける */
  put(record: NewRecord): Promise<void>;
  /** 消していない記録に、削除の印を付ける（childId を指定すると、その子どもの記録だけ） */
  markDeleted(day: string, by: string, childId?: string): Promise<void>;
  /** 同じ印で消した記録を戻す（取り消し） */
  restoreDeleted(by: string): Promise<void>;
  /** 通し番号より後の変更を、古い順に */
  since(seq: number, limit: number): Promise<StoredRecord[]>;
  /** 書き出し用：消していない記録すべて */
  all(): Promise<StoredRecord[]>;
  /** 削除の印を付けた子ども（取り消しの一覧） */
  deletedChildren(): Promise<StoredRecord[]>;
  /** AI の回数を1つ数える。上限に達していれば数えずに false（子どもごと・1日・API ごと） */
  takeAiUsage(
    childId: string,
    day: string,
    route: string,
    limit: number,
  ): Promise<boolean>;
}

export interface SyncStore {
  /** 保護者ごとに順番に行う（同じ保護者の同期が重なっても、通し番号の順に見える） */
  transaction<T>(
    guardianId: string,
    fn: (tx: SyncTx) => Promise<T>,
  ): Promise<T>;
  /** 削除の印を付けた日が beforeDay 以前の記録を、本当に消す。消した数を返す（U8-PRIV-2） */
  purge(beforeDay: string): Promise<number>;
}
