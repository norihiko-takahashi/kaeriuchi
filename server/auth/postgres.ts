import "server-only";
import type { Sql } from "@/server/db/client";
import type {
  AuthStore,
  StoredGuardian,
  StoredPasskey,
  StoredSession,
} from "./store";

/** 本番のログインの保存先（Postgres）。保存するのはハッシュだけ（U8-SEC-1） */

interface SessionRow {
  hash: string;
  guardian_id: string;
  device_id: string;
  device_name: string;
  created_at: number;
  expires_at: number;
  auth_at: number;
  last_seen_day: string;
}

const toSession = (r: SessionRow): StoredSession => ({
  hash: r.hash,
  guardianId: r.guardian_id,
  deviceId: r.device_id,
  deviceName: r.device_name,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  authAt: r.auth_at,
  lastSeenDay: r.last_seen_day,
});

const toGuardian = (r: {
  id: string;
  email: string;
  created_at: number;
  deleted_at: number | null;
}): StoredGuardian => ({
  id: r.id,
  email: r.email,
  createdAt: r.created_at,
  ...(r.deleted_at === null ? {} : { deletedAt: r.deleted_at }),
});

const toPasskey = (r: {
  id: string;
  guardian_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
  created_at: number;
}): StoredPasskey => ({
  id: r.id,
  guardianId: r.guardian_id,
  publicKey: r.public_key,
  counter: r.counter,
  transports: r.transports ?? undefined,
  createdAt: r.created_at,
});

const SESSION_COLUMNS = {
  guardianId: "guardian_id",
  deviceId: "device_id",
  deviceName: "device_name",
  createdAt: "created_at",
  expiresAt: "expires_at",
  authAt: "auth_at",
  lastSeenDay: "last_seen_day",
} as const;

export class PostgresAuthStore implements AuthStore {
  constructor(private sql: Sql) {}

  async findGuardianByEmail(email: string) {
    const [r] = await this.sql`SELECT * FROM guardians WHERE email = ${email}`;
    return r && toGuardian(r as never);
  }
  async getGuardian(id: string) {
    const [r] = await this.sql`SELECT * FROM guardians WHERE id = ${id}`;
    return r && toGuardian(r as never);
  }
  async createGuardian(g: StoredGuardian) {
    await this.sql`
      INSERT INTO guardians (id, email, created_at, deleted_at)
      VALUES (${g.id}, ${g.email}, ${g.createdAt}, ${g.deletedAt ?? null})`;
  }

  async setGuardianDeleted(id: string, at: number | null) {
    await this.sql`UPDATE guardians SET deleted_at = ${at} WHERE id = ${id}`;
  }
  async deleteGuardian(id: string) {
    // セッション・パスキー・番号・記録は、外部キーで一緒に消える
    await this.sql`DELETE FROM guardians WHERE id = ${id}`;
  }

  async saveLoginToken(t: { hash: string; email: string; expiresAt: number }) {
    await this.sql`
      INSERT INTO login_tokens (hash, email, expires_at) VALUES (${t.hash}, ${t.email}, ${t.expiresAt})`;
  }
  async consumeLoginToken(hash: string, now: number) {
    const [r] = await this.sql<{ email: string }[]>`
      UPDATE login_tokens SET used = true
      WHERE hash = ${hash} AND NOT used AND expires_at > ${now}
      RETURNING email`;
    return r?.email;
  }

  async saveLinkCode(c: {
    hash: string;
    guardianId: string;
    expiresAt: number;
  }) {
    await this.sql.begin(async (tx) => {
      await tx`DELETE FROM link_codes WHERE guardian_id = ${c.guardianId}`;
      await tx`
        INSERT INTO link_codes (hash, guardian_id, expires_at)
        VALUES (${c.hash}, ${c.guardianId}, ${c.expiresAt})`;
    });
  }
  async consumeLinkCode(hash: string, now: number) {
    const [r] = await this.sql<{ guardian_id: string; expires_at: number }[]>`
      DELETE FROM link_codes WHERE hash = ${hash} RETURNING guardian_id, expires_at`;
    return r && r.expires_at > now ? r.guardian_id : undefined;
  }

  async createSession(s: StoredSession) {
    await this.sql`
      INSERT INTO sessions (hash, guardian_id, device_id, device_name, created_at, expires_at, auth_at, last_seen_day)
      VALUES (${s.hash}, ${s.guardianId}, ${s.deviceId}, ${s.deviceName}, ${s.createdAt}, ${s.expiresAt}, ${s.authAt}, ${s.lastSeenDay})`;
  }
  async getSession(hash: string) {
    const [r] = await this.sql<
      SessionRow[]
    >`SELECT * FROM sessions WHERE hash = ${hash}`;
    return r && toSession(r);
  }
  async updateSession(hash: string, patch: Partial<StoredSession>) {
    const set: Record<string, unknown> = {};
    for (const [k, col] of Object.entries(SESSION_COLUMNS)) {
      const v = patch[k as keyof typeof SESSION_COLUMNS];
      if (v !== undefined) set[col] = v;
    }
    if (Object.keys(set).length === 0) return;
    await this.sql`UPDATE sessions SET ${this.sql(set)} WHERE hash = ${hash}`;
  }
  async deleteSession(hash: string) {
    await this.sql`DELETE FROM sessions WHERE hash = ${hash}`;
  }
  async listSessions(guardianId: string) {
    return (
      await this.sql<SessionRow[]>`
        SELECT * FROM sessions WHERE guardian_id = ${guardianId} ORDER BY created_at`
    ).map(toSession);
  }
  async deleteSessionsOf(guardianId: string, deviceId?: string) {
    await this.sql`
      DELETE FROM sessions WHERE guardian_id = ${guardianId}
        AND (${deviceId ?? null}::text IS NULL OR device_id = ${deviceId ?? null})`;
  }

  async addPasskey(p: StoredPasskey) {
    await this.sql`
      INSERT INTO passkeys (id, guardian_id, public_key, counter, transports, created_at)
      VALUES (${p.id}, ${p.guardianId}, ${p.publicKey}, ${p.counter},
        ${p.transports ? this.sql.json(p.transports) : null}, ${p.createdAt})`;
  }
  async getPasskey(id: string) {
    const [r] = await this.sql`SELECT * FROM passkeys WHERE id = ${id}`;
    return r && toPasskey(r as never);
  }
  async listPasskeys(guardianId: string) {
    return (
      await this
        .sql`SELECT * FROM passkeys WHERE guardian_id = ${guardianId} ORDER BY created_at`
    ).map((r) => toPasskey(r as never));
  }
  async updatePasskeyCounter(id: string, counter: number) {
    await this.sql`UPDATE passkeys SET counter = ${counter} WHERE id = ${id}`;
  }

  async saveChallenge(key: string, challenge: string, expiresAt: number) {
    await this.sql`
      INSERT INTO challenges (key, challenge, expires_at) VALUES (${key}, ${challenge}, ${expiresAt})
      ON CONFLICT (key) DO UPDATE SET challenge = EXCLUDED.challenge, expires_at = EXCLUDED.expires_at`;
  }
  async takeChallenge(key: string, now: number) {
    const [r] = await this.sql<{ challenge: string; expires_at: number }[]>`
      DELETE FROM challenges WHERE key = ${key} RETURNING challenge, expires_at`;
    return r && r.expires_at > now ? r.challenge : undefined;
  }

  async hit(key: string, windowMs: number, now: number) {
    const [r] = await this.sql<{ n: number }[]>`
      WITH ins AS (INSERT INTO rate_hits (key, at) VALUES (${key}, ${now}))
      SELECT count(*)::int + 1 AS n FROM rate_hits WHERE key = ${key} AND at > ${now - windowMs}`;
    return r.n;
  }
  async count(key: string, windowMs: number, now: number) {
    const [r] = await this.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM rate_hits WHERE key = ${key} AND at > ${now - windowMs}`;
    return r.n;
  }
}
