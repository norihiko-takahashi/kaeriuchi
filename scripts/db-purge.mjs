/**
 * 毎日1回の削除（U8-PRIV-2）。削除の印から7日たった記録と、アカウントを消して7日たった保護者を、本当に消す。
 * 消した数だけをログに残す（中身は残さない）。アプリの役割（DATABASE_URL）で、持ち主の権限で動く関数を呼ぶ。
 *   node scripts/db-purge.mjs
 */
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const DAY = 86_400_000;
const UNDO_DAYS = 7;
/** 報告・採点し直しを残す日数（shared/sync.ts の REPORT_KEEP_DAYS と同じ） */
const REPORT_KEEP_DAYS = 365;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL がありません");
  process.exit(1);
}
const sql = postgres(url, {
  max: 1,
  onnotice: () => {},
  password: process.env.DATABASE_PASSWORD || undefined,
  ssl: process.env.DATABASE_CA_FILE
    ? { ca: await readFile(process.env.DATABASE_CA_FILE, "utf8") }
    : undefined,
});
try {
  const now = Date.now();
  // 日本時間の日付で数える（同期の削除の印と同じ）
  const jstDay = (ms) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
  const beforeDay = jstDay(now - UNDO_DAYS * DAY);
  const reportBeforeDay = jstDay(now - REPORT_KEEP_DAYS * DAY);
  const [r] =
    await sql`SELECT * FROM kaeriuchi_purge(${beforeDay}, ${now - UNDO_DAYS * DAY}, ${now}, ${reportBeforeDay})`;
  console.log(
    JSON.stringify({
      level: "info",
      event: "purge",
      records: r.records,
      guardians: r.guardians,
    }),
  );
} finally {
  await sql.end();
}
