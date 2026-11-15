import type {
  AuthStore,
  StoredGuardian,
  StoredPasskey,
  StoredSession,
} from "./store";

/** 開発とテスト用のログインの保存先（サーバーのメモリ。再起動で消える） */
export class MemoryAuthStore implements AuthStore {
  private guardians = new Map<string, StoredGuardian>();
  private loginTokens = new Map<
    string,
    { email: string; expiresAt: number; used: boolean }
  >();
  private linkCodes = new Map<
    string,
    { guardianId: string; expiresAt: number }
  >();
  private sessions = new Map<string, StoredSession>();
  private passkeys = new Map<string, StoredPasskey>();
  private challenges = new Map<
    string,
    { challenge: string; expiresAt: number }
  >();
  private hits = new Map<string, number[]>();

  async findGuardianByEmail(email: string) {
    return [...this.guardians.values()].find((g) => g.email === email);
  }
  async getGuardian(id: string) {
    return this.guardians.get(id);
  }
  async createGuardian(g: StoredGuardian) {
    this.guardians.set(g.id, { ...g });
  }

  async saveLoginToken(t: { hash: string; email: string; expiresAt: number }) {
    this.loginTokens.set(t.hash, {
      email: t.email,
      expiresAt: t.expiresAt,
      used: false,
    });
  }
  async consumeLoginToken(hash: string, now: number) {
    const t = this.loginTokens.get(hash);
    if (!t || t.used || t.expiresAt <= now) return undefined;
    t.used = true;
    return t.email;
  }

  async saveLinkCode(c: {
    hash: string;
    guardianId: string;
    expiresAt: number;
  }) {
    for (const [k, v] of this.linkCodes)
      if (v.guardianId === c.guardianId) this.linkCodes.delete(k);
    this.linkCodes.set(c.hash, {
      guardianId: c.guardianId,
      expiresAt: c.expiresAt,
    });
  }
  async consumeLinkCode(hash: string, now: number) {
    const c = this.linkCodes.get(hash);
    this.linkCodes.delete(hash);
    if (!c || c.expiresAt <= now) return undefined;
    return c.guardianId;
  }

  async createSession(s: StoredSession) {
    this.sessions.set(s.hash, { ...s });
  }
  async getSession(hash: string) {
    const s = this.sessions.get(hash);
    return s ? { ...s } : undefined;
  }
  async updateSession(hash: string, patch: Partial<StoredSession>) {
    const s = this.sessions.get(hash);
    if (s) this.sessions.set(hash, { ...s, ...patch, hash });
  }
  async deleteSession(hash: string) {
    this.sessions.delete(hash);
  }
  async listSessions(guardianId: string) {
    return [...this.sessions.values()]
      .filter((s) => s.guardianId === guardianId)
      .map((s) => ({ ...s }));
  }
  async deleteSessionsOf(guardianId: string, deviceId?: string) {
    for (const [k, s] of this.sessions)
      if (s.guardianId === guardianId && (!deviceId || s.deviceId === deviceId))
        this.sessions.delete(k);
  }

  async addPasskey(p: StoredPasskey) {
    this.passkeys.set(p.id, { ...p });
  }
  async getPasskey(id: string) {
    const p = this.passkeys.get(id);
    return p ? { ...p } : undefined;
  }
  async listPasskeys(guardianId: string) {
    return [...this.passkeys.values()].filter(
      (p) => p.guardianId === guardianId,
    );
  }
  async updatePasskeyCounter(id: string, counter: number) {
    const p = this.passkeys.get(id);
    if (p) p.counter = counter;
  }

  async saveChallenge(key: string, challenge: string, expiresAt: number) {
    this.challenges.set(key, { challenge, expiresAt });
  }
  async takeChallenge(key: string, now: number) {
    const c = this.challenges.get(key);
    this.challenges.delete(key);
    return c && c.expiresAt > now ? c.challenge : undefined;
  }

  async hit(key: string, windowMs: number, now: number) {
    const list = (this.hits.get(key) ?? []).filter((t) => t > now - windowMs);
    list.push(now);
    this.hits.set(key, list);
    return list.length;
  }
  async count(key: string, windowMs: number, now: number) {
    return (this.hits.get(key) ?? []).filter((t) => t > now - windowMs).length;
  }
}
