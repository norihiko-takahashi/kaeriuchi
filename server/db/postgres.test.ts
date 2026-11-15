import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authSuite } from "@/server/auth/auth-suite";
import { PostgresAuthStore } from "@/server/auth/postgres";
import { PostgresSyncStore } from "@/server/sync/postgres";
import { G, OTHER, syncSuite } from "@/server/sync/sync-suite";
import { migrate, setAppPassword } from "../../scripts/db-migrate.mjs";
import { connect, type Sql } from "./client";

/**
 * Postgres の保存先のテスト（U8-TEST-1）。TEST_DATABASE_URL（管理用の接続）があるときだけ動かす。CI では必ず動かす。
 * テストごとに新しいデータベースを作り、アプリの役割（kaeriuchi_app）で接続する（RLS を本番と同じに効かせる）。
 */

const ADMIN_URL = process.env.TEST_DATABASE_URL;
if (!ADMIN_URL && process.env.CI)
  throw new Error("CI では TEST_DATABASE_URL が要ります");

const PASSWORD = "test-only-password";
const dbName = `kaeriuchi_test_${crypto.randomUUID().slice(0, 8)}`;
let root: postgres.Sql;
let admin: postgres.Sql;
let app: Sql;

const run = ADMIN_URL ? describe : describe.skip;

run("Postgres", () => {
  beforeAll(async () => {
    root = postgres(ADMIN_URL as string, { max: 1, onnotice: () => {} });
    await root.unsafe(`CREATE DATABASE ${dbName}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${dbName}`;
    admin = postgres(url.toString(), { max: 1, onnotice: () => {} });
    expect(await migrate(admin)).toEqual(["0001_init.sql"]);
    expect(await migrate(admin)).toEqual([]);
    await setAppPassword(admin, PASSWORD);
    url.username = "kaeriuchi_app";
    url.password = PASSWORD;
    app = connect(url.toString(), { max: 4 });
  });

  afterAll(async () => {
    await app?.end();
    await admin?.end();
    await root?.unsafe(`DROP DATABASE IF EXISTS ${dbName}`);
    await root?.end();
  });

  const reset = async () => {
    await admin`TRUNCATE guardians, login_tokens, link_codes, sessions, passkeys, challenges, rate_hits, records, ai_usage CASCADE`;
  };

  authSuite("Postgres", async () => {
    await reset();
    return new PostgresAuthStore(app);
  });

  syncSuite("Postgres", async () => {
    await reset();
    await admin`INSERT INTO guardians (id, email, created_at) VALUES (${G}, 'a@example.com', 0), (${OTHER}, 'b@example.com', 0)`;
    return new PostgresSyncStore(app);
  });

  describe("行ごとのアクセス制御（U8-SEC-4）", () => {
    it("アプリの役割では、設定した保護者の行しか見えず、ほかの保護者の行は書けない", async () => {
      await reset();
      await admin`INSERT INTO guardians (id, email, created_at) VALUES ('ga', 'a@x', 0), ('gb', 'b@x', 0)`;
      await admin`INSERT INTO records (guardian_id, entity, id, version, payload, seq)
        VALUES ('ga', 'child', 'c1', 1, '{}', nextval('records_seq')), ('gb', 'child', 'c2', 1, '{}', nextval('records_seq'))`;

      // 保護者を設定しないと、何も見えない
      expect(await app`SELECT id FROM records`).toHaveLength(0);
      const seen = await app.begin(async (tx) => {
        await tx`SELECT set_config('app.guardian_id', 'ga', true)`;
        // WHERE を書き忘れても、ほかの家庭の行は返らない
        return tx`SELECT id FROM records`;
      });
      expect(seen.map((r) => r.id)).toEqual(["c1"]);
      await expect(
        app.begin(async (tx) => {
          await tx`SELECT set_config('app.guardian_id', 'ga', true)`;
          await tx`INSERT INTO records (guardian_id, entity, id, version, payload, seq)
            VALUES ('gb', 'child', 'c3', 1, '{}', nextval('records_seq'))`;
        }),
      ).rejects.toThrow(/row-level security/);
      const changed = await app.begin(async (tx) => {
        await tx`SELECT set_config('app.guardian_id', 'ga', true)`;
        return tx`UPDATE records SET version = 9 WHERE id = 'c2' RETURNING id`;
      });
      expect(changed).toHaveLength(0);
    });

    it("毎日の削除は、アカウントを消して7日たった保護者と、期限の切れた値を消す", async () => {
      await reset();
      const now = Date.now();
      await admin`INSERT INTO guardians (id, email, created_at, deleted_at)
        VALUES ('old', 'o@x', 0, ${now - 8 * 86_400_000}), ('new', 'n@x', 0, ${now - 86_400_000}), ('live', 'l@x', 0, NULL)`;
      await admin`INSERT INTO login_tokens (hash, email, expires_at) VALUES ('t1', 'a@x', ${now - 1}), ('t2', 'a@x', ${now + 60_000})`;
      const [r] =
        await app`SELECT * FROM kaeriuchi_purge('2026-01-01', ${now - 7 * 86_400_000}, ${now})`;
      expect(r).toEqual({ records: 0, guardians: 1 });
      expect(
        (await admin`SELECT id FROM guardians ORDER BY id`).map((x) => x.id),
      ).toEqual(["live", "new"]);
      expect(
        (await admin`SELECT hash FROM login_tokens`).map((x) => x.hash),
      ).toEqual(["t2"]);
    });
  });
});
