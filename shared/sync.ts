/**
 * 同期の API の形（U8 §4・nfr-design.md §4）。
 * 画面のプログラムにも入るので、Zod は使わずに型だけを置く（形の確認はサーバーの server/sync/validate.ts）。
 */
import type { SyncEntity } from "./schemas";

/** 1回に送る・受け取る件数（U8-SEC-5） */
export const SYNC_BATCH = 200;
/** 1件の大きさの上限（JSON の文字数で数える。日本語は1文字3バイトなので、さらに小さく見る・U8-SEC-5） */
export const SYNC_ITEM_MAX_BYTES = 64 * 1024;
/** 1回の大きさの上限 */
export const SYNC_BODY_MAX_BYTES = 1024 * 1024;
/** 削除してから取り消せる日数（決定 2） */
export const UNDO_DAYS = 7;
/** 報告・採点し直しを残す日数（2026-11-17 に決定：最長1年） */
export const REPORT_KEEP_DAYS = 365;

export interface SyncChange {
  entity: SyncEntity;
  id: string;
  op: "upsert" | "delete";
  payload?: unknown;
}

export interface SyncRequest {
  /** 前回受け取った通し番号（初めては 0） */
  since: number;
  changes: SyncChange[];
}

/** クラウドから受け取る変更。消したものは中身を付けない */
export interface PulledChange {
  entity: SyncEntity;
  id: string;
  deleted: boolean;
  payload?: unknown;
}

export interface RejectedChange {
  entity: SyncEntity;
  id: string;
  reason: string;
}

export interface SyncResponse {
  /** 次に送る通し番号 */
  cursor: number;
  /** まだ受け取っていない変更が残っている */
  more: boolean;
  changes: PulledChange[];
  /** 受け付けなかった変更（形がちがう、ほかの家庭の記録を指す、など）。端末はもう送らない */
  rejected: RejectedChange[];
}
