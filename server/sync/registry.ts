import "server-only";
import { getConfig } from "@/server/config";
import { getSql } from "@/server/db/registry";
import { MemorySyncStore } from "./memory";
import { PostgresSyncStore } from "./postgres";
import { SyncService } from "./service";
import type { SyncStore } from "./store";

/**
 * 同期の仕組みを、設定から1つだけ作る（U8）。
 * SYNC_STORE=memory はメモリ（開発・テスト）、postgres は Postgres
 */
let cached: SyncService | undefined;
let store: SyncStore | undefined;

export function getSync(): SyncService {
  if (cached) return cached;
  const config = getConfig();
  if (config.SYNC_STORE === "dynamo")
    throw new Error("SYNC_STORE=dynamo の同期の保存先は、ありません");
  store ??=
    config.SYNC_STORE === "postgres"
      ? new PostgresSyncStore(getSql(config))
      : new MemorySyncStore();
  cached = new SyncService(store);
  return cached;
}

/** テスト用 */
export function resetSyncForTesting(next?: SyncStore) {
  cached = undefined;
  store = next;
}
