/**
 * データベースの表の形を新しくする（U8）。管理用の接続（DATABASE_ADMIN_URL）で、server/db/migrations の SQL を順に当てる。
 * APP_DB_PASSWORD があれば、アプリの役割（kaeriuchi_app）にログインのパスワードを付ける（値はどこにも書き出さない）。
 *   pnpm db:migrate
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const DIR = fileURLToPath(new URL("../server/db/migrations/", import.meta.url));

/** @param {import("postgres").Sql} sql */
export async function migrate(sql, dir = DIR) {
  return sql.reserve().then(async (conn) => {
    try {
      await conn`SELECT pg_advisory_lock(${LOCK})`;
      return await apply(conn, dir);
    } finally {
      await conn`SELECT pg_advisory_unlock(${LOCK})`;
      conn.release();
    }
  });
}

/** 移行を同時に当てないためのロックの番号 */
const LOCK = 72_737_201;

async function apply(sql, dir) {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const done = new Set(
    (await sql`SELECT name FROM schema_migrations`).map((r) => r.name),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied = [];
  for (const name of files) {
    if (done.has(name)) continue;
    const text = await readFile(new URL(name, `file://${dir}`), "utf8");
    // ロックを持っている同じ接続で、1つのファイルを1つのトランザクションで当てる
    await sql`BEGIN`;
    try {
      await sql.unsafe(text);
      await sql`INSERT INTO schema_migrations (name) VALUES (${name})`;
      await sql`COMMIT`;
    } catch (e) {
      await sql`ROLLBACK`;
      throw e;
    }
    applied.push(name);
  }
  return applied;
}

/** @param {import("postgres").Sql} sql */
export async function setAppPassword(sql, password) {
  const [{ stmt }] =
    await sql`SELECT format('ALTER ROLE kaeriuchi_app LOGIN PASSWORD %L', ${password}::text) AS stmt`;
  await sql.unsafe(stmt);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) {
    console.error("DATABASE_ADMIN_URL がありません");
    process.exit(1);
  }
  const sql = postgres(url, {
    max: 2,
    onnotice: () => {},
    password: process.env.DATABASE_ADMIN_PASSWORD || undefined,
    ssl: process.env.DATABASE_CA_FILE
      ? { ca: await readFile(process.env.DATABASE_CA_FILE, "utf8") }
      : undefined,
  });
  try {
    const applied = await migrate(sql);
    console.log(
      applied.length
        ? `当てた移行：${applied.join(", ")}`
        : "新しい移行はありません",
    );
    if (process.env.APP_DB_PASSWORD) {
      await setAppPassword(sql, process.env.APP_DB_PASSWORD);
      console.log("アプリの役割のパスワードを設定しました");
    }
  } finally {
    await sql.end();
  }
}
