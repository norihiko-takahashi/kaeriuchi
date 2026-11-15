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
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const done = new Set(
    (await sql`SELECT name FROM schema_migrations`).map((r) => r.name),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied = [];
  for (const name of files) {
    if (done.has(name)) continue;
    const text = await readFile(new URL(name, `file://${dir}`), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
    });
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
    max: 1,
    onnotice: () => {},
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
