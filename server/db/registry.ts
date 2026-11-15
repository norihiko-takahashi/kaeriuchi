import "server-only";
import type { Config } from "@/server/config";
import { connect, type Sql } from "./client";

/** Postgres の接続を1つだけ作り、ログインと同期で分け合う */
let sql: Sql | undefined;

export function getSql(config: Config): Sql {
  if (!config.DATABASE_URL) throw new Error("DATABASE_URL がありません");
  sql ??= connect(config.DATABASE_URL, { caFile: config.DATABASE_CA_FILE });
  return sql;
}
