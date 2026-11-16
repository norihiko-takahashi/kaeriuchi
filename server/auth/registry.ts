import "server-only";
import { type Config, getConfig } from "@/server/config";
import { getSql } from "@/server/db/registry";
import { DevMailer, SesMailer } from "./mail";
import { MemoryAuthStore } from "./memory";
import { PostgresAuthStore } from "./postgres";
import { AuthService } from "./service";
import type { AuthStore } from "./store";

/**
 * ログインの仕組みを、設定から1つだけ作る（U8）。
 * 保存先：SYNC_STORE=memory はメモリ（開発・テスト）、postgres は Postgres
 */
let cached: { auth: AuthService; config: Config } | undefined;
let store: AuthStore | undefined;

export function getAuth(): { auth: AuthService; config: Config } {
  if (cached) return cached;
  const config = getConfig();
  if (config.SYNC_STORE === "dynamo")
    throw new Error("SYNC_STORE=dynamo のログインの保存先は、ありません");
  store ??=
    config.SYNC_STORE === "postgres"
      ? new PostgresAuthStore(getSql(config))
      : new MemoryAuthStore();
  const mailer =
    config.AUTH_PROVIDER === "native" && config.MAIL_FROM
      ? new SesMailer(config.MAIL_FROM)
      : new DevMailer();
  cached = {
    auth: new AuthService({
      store,
      mailer,
      appUrl: config.APP_URL,
      // 開発用のログインでは上限をゆるめる（E2E はすべて同じ接続元から来る）。本番の設定では使わない
      limitScale:
        config.AUTH_PROVIDER === "dev" && config.APP_ENV !== "production"
          ? 100
          : 1,
    }),
    config,
  };
  return cached;
}

/** テスト用 */
export function resetAuthForTesting() {
  cached = undefined;
  store = undefined;
}
