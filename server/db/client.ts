import "server-only";
import { readFileSync } from "node:fs";
import postgres, { type Sql } from "postgres";

/**
 * Postgres の接続（U8）。アプリの役割（kaeriuchi_app）で入る。
 * 本番は TLS で、RDS の証明書（DATABASE_CA_FILE）で相手を確かめる（U8-PRIV-3）。
 */

export type { Sql };

/** bigint（時刻のミリ秒・通し番号）を数として読む */
const types = {
  bigint: {
    to: 20,
    from: [20],
    serialize: (x: number) => String(x),
    parse: (x: string) => Number(x),
  },
};

export function connect(
  url: string,
  opts: { caFile?: string; max?: number; password?: string } = {},
): Sql {
  return postgres(url, {
    max: opts.max ?? 10,
    idle_timeout: 60,
    connect_timeout: 10,
    onnotice: () => {},
    types,
    ...(opts.password ? { password: opts.password } : {}),
    ssl: opts.caFile
      ? // 場所は設定で決める（ビルドの依存の追跡から外す）
        { ca: readFileSync(/*turbopackIgnore: true*/ opts.caFile, "utf8") }
      : undefined,
  }) as unknown as Sql;
}
