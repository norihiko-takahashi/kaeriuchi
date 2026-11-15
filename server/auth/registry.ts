import "server-only";
import { type Config, getConfig } from "@/server/config";
import { DevMailer, SesMailer } from "./mail";
import { MemoryAuthStore } from "./memory";
import { AuthService } from "./service";
import type { AuthStore } from "./store";

/**
 * ログインの仕組みを、設定から1つだけ作る（U8）。
 * 保存先：SYNC_STORE=memory はメモリ（開発・テスト）、postgres は Postgres（U8 の後半で足す）
 */
let cached: { auth: AuthService; config: Config } | undefined;
let store: AuthStore | undefined;

export function getAuth(): { auth: AuthService; config: Config } {
  if (cached) return cached;
  const config = getConfig();
  if (config.SYNC_STORE !== "memory")
    throw new Error(
      `SYNC_STORE=${config.SYNC_STORE} のログインの保存先は、まだありません`,
    );
  store ??= new MemoryAuthStore();
  const mailer =
    config.AUTH_PROVIDER === "native" && config.MAIL_FROM
      ? new SesMailer(config.MAIL_FROM)
      : new DevMailer();
  cached = {
    auth: new AuthService({ store, mailer, appUrl: config.APP_URL }),
    config,
  };
  return cached;
}

/** テスト用 */
export function resetAuthForTesting() {
  cached = undefined;
  store = undefined;
}
