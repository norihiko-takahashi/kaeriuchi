import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { Mailer } from "./mail";
import type { AuthStore, StoredSession } from "./store";
import {
  DAY,
  deviceNameFrom,
  EMAIL,
  hashToken,
  LIMITS,
  normalizeCode,
  normalizeEmail,
  randomCode,
  randomToken,
  TTL,
} from "./tokens";

/**
 * ログイン（U8、functional-design.md §1〜3）。メールのリンク・端末をつなぐ番号・パスキー・セッション。
 * 保存先（AuthStore）とメール（Mailer）は差し替えられる。
 */

export type AuthErrorCode =
  | "bad_request"
  | "invalid"
  | "rate_limited"
  | "unauthorized";

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
    this.name = "AuthError";
  }
}

export interface AuthDeps {
  store: AuthStore;
  mailer: Mailer;
  /** アプリの URL（例：https://kaeriuchi.example.jp）。リンクとパスキーの確認に使う */
  appUrl: string;
  now?: () => number;
  /**
   * 回数の上限を何倍にするか（初期値 1）。開発用のログインだけで使う
   * （E2E では、すべてのテストが同じ接続元から来るため）
   */
  limitScale?: number;
}

export interface NewSession {
  /** Cookie に入れる値（保存するのはハッシュだけ） */
  token: string;
  session: StoredSession;
  email: string;
}

export interface Device {
  deviceId: string;
  deviceName: string;
  createdDay: string;
  lastSeenDay: string;
  current: boolean;
}

/** 日本時間の日付（NFR-P11：時刻は残さない） */
export const jstDay = (ms: number) =>
  new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

const utf8 = (s: string) => new TextEncoder().encode(s);
const b64url = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const fromB64url = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

export class AuthService {
  private store: AuthStore;
  private mailer: Mailer;
  private origin: string;
  private rpID: string;
  private now: () => number;
  private scale: number;

  constructor(deps: AuthDeps) {
    this.store = deps.store;
    this.mailer = deps.mailer;
    const url = new URL(deps.appUrl);
    this.origin = url.origin;
    this.rpID = url.hostname;
    this.now = deps.now ?? Date.now;
    this.scale = deps.limitScale ?? 1;
  }

  /** 回数の制限。超えたら rate_limited */
  private async limit(key: string, [max, windowMs]: readonly [number, number]) {
    if ((await this.store.hit(key, windowMs, this.now())) > max * this.scale)
      throw new AuthError("rate_limited");
  }

  /** すべての API の、接続元ごとの上限（U8-SEC-6。β版は WAF の代わり） */
  async checkIp(ip: string) {
    await this.limit(`all:${ip}`, LIMITS.allPerIp);
  }

  /* ---------- メールのリンク ---------- */

  /**
   * ログイン用のリンクを送る。登録されていないアドレスでも同じように送り、
   * そのリンクで新しいアカウントを作る（登録の有無を外に出さない）
   */
  async requestLoginLink(
    rawEmail: string,
    ip: string,
  ): Promise<{ devLink?: string }> {
    const email = normalizeEmail(rawEmail);
    if (!EMAIL.test(email) || email.length > 254)
      throw new AuthError("bad_request");
    await this.limit(`link-ip:${ip}`, LIMITS.linkPerIp);
    await this.limit(`link-email:${hashToken(email)}`, LIMITS.linkPerEmail);
    const token = randomToken();
    await this.store.saveLoginToken({
      hash: hashToken(token),
      email,
      expiresAt: this.now() + TTL.loginLink,
    });
    const url = `${this.origin}/login/verify#${token}`;
    await this.mailer.sendLoginLink(email, url);
    return this.mailer.showsLinks ? { devLink: url } : {};
  }

  async verifyLoginLink(
    token: string,
    ip: string,
    userAgent: string,
  ): Promise<NewSession> {
    await this.limit(`verify-ip:${ip}`, LIMITS.verifyPerIp);
    const email = await this.store.consumeLoginToken(
      hashToken(token),
      this.now(),
    );
    if (!email) throw new AuthError("invalid");
    let guardian = await this.store.findGuardianByEmail(email);
    if (!guardian) {
      guardian = { id: crypto.randomUUID(), email, createdAt: this.now() };
      await this.store.createGuardian(guardian);
    }
    return { ...(await this.newSession(guardian.id, userAgent)), email };
  }

  private async newSession(guardianId: string, userAgent: string) {
    const token = randomToken();
    const now = this.now();
    const session: StoredSession = {
      hash: hashToken(token),
      guardianId,
      deviceId: crypto.randomUUID(),
      deviceName: deviceNameFrom(userAgent).slice(0, 40),
      createdAt: now,
      expiresAt: now + TTL.session,
      authAt: now,
      lastSeenDay: jstDay(now),
    };
    await this.store.createSession(session);
    return { token, session };
  }

  /* ---------- セッション ---------- */

  /** Cookie の値からセッションを探す。期限が近ければ延ばし、使った日を記録する */
  async getSession(
    token: string | undefined,
  ): Promise<StoredSession | undefined> {
    if (!token) return undefined;
    const hash = hashToken(token);
    const s = await this.store.getSession(hash);
    const now = this.now();
    if (!s) return undefined;
    if (s.expiresAt <= now) {
      await this.store.deleteSession(hash);
      return undefined;
    }
    const guardian = await this.store.getGuardian(s.guardianId);
    if (!guardian || guardian.deletedAt) return undefined;
    const day = jstDay(now);
    // 使うたびに 30日に延ばす（書き込みは1日に1回まで）
    if (s.lastSeenDay !== day || s.expiresAt - now < TTL.session - DAY) {
      const patch = { lastSeenDay: day, expiresAt: now + TTL.session };
      await this.store.updateSession(hash, patch);
      return { ...s, ...patch };
    }
    return s;
  }

  async emailOf(session: StoredSession): Promise<string> {
    const g = await this.store.getGuardian(session.guardianId);
    if (!g) throw new AuthError("unauthorized");
    return g.email;
  }

  /** 削除・書き出しの前に、ログインし直してから10分以内か（U8-SEC-7） */
  isRecentAuth(session: StoredSession): boolean {
    return this.now() - session.authAt <= TTL.recentAuth;
  }

  async signOut(token: string) {
    await this.store.deleteSession(hashToken(token));
  }

  /* ---------- 端末の一覧 ---------- */

  async listDevices(current: StoredSession): Promise<Device[]> {
    const sessions = await this.store.listSessions(current.guardianId);
    return sessions
      .filter((s) => s.expiresAt > this.now())
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((s) => ({
        deviceId: s.deviceId,
        deviceName: s.deviceName,
        createdDay: jstDay(s.createdAt),
        lastSeenDay: s.lastSeenDay,
        current: s.hash === current.hash,
      }));
  }

  async renameDevice(current: StoredSession, deviceId: string, name: string) {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) throw new AuthError("bad_request");
    const target = (await this.store.listSessions(current.guardianId)).find(
      (s) => s.deviceId === deviceId,
    );
    if (!target) throw new AuthError("invalid");
    await this.store.updateSession(target.hash, { deviceName: trimmed });
  }

  /** ほかの端末をログアウトさせる（端末の中の記録は消さない） */
  async revokeDevice(current: StoredSession, deviceId: string) {
    await this.store.deleteSessionsOf(current.guardianId, deviceId);
  }

  /* ---------- 端末をつなぐ番号（決定 3） ---------- */

  async createLinkCode(
    current: StoredSession,
  ): Promise<{ code: string; expiresAt: number }> {
    const code = randomCode();
    const expiresAt = this.now() + TTL.linkCode;
    await this.store.saveLinkCode({
      hash: hashToken(code),
      guardianId: current.guardianId,
      expiresAt,
    });
    return { code, expiresAt };
  }

  /**
   * 番号で端末をつなぐ。まちがいは接続元ごとに数え、10分に5回まちがえたら、その接続元からは入れない
   * （まちがった番号がどの家庭のものかはわからないため、接続元で数える）
   */
  async redeemLinkCode(
    rawCode: string,
    ip: string,
    userAgent: string,
  ): Promise<NewSession> {
    const [max, windowMs] = LIMITS.codeFailPerIp;
    const failKey = `code-fail:${ip}`;
    if (
      (await this.store.count(failKey, windowMs, this.now())) >=
      max * this.scale
    )
      throw new AuthError("rate_limited");
    const code = normalizeCode(rawCode);
    const guardianId =
      code.length === 8
        ? await this.store.consumeLinkCode(hashToken(code), this.now())
        : undefined;
    if (!guardianId) {
      await this.store.hit(failKey, windowMs, this.now());
      throw new AuthError("invalid");
    }
    const created = await this.newSession(guardianId, userAgent);
    const g = await this.store.getGuardian(guardianId);
    return { ...created, email: g?.email ?? "" };
  }

  /* ---------- パスキー ---------- */

  async passkeyRegistrationOptions(current: StoredSession) {
    const email = await this.emailOf(current);
    const existing = await this.store.listPasskeys(current.guardianId);
    const options = await generateRegistrationOptions({
      rpName: "かえりうち",
      rpID: this.rpID,
      userName: email,
      userDisplayName: "保護者",
      userID: utf8(current.guardianId),
      attestationType: "none",
      excludeCredentials: existing.map((p) => ({
        id: p.id,
        transports: p.transports,
      })),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "preferred",
      },
    });
    await this.store.saveChallenge(
      `reg:${current.hash}`,
      options.challenge,
      this.now() + TTL.challenge,
    );
    return options;
  }

  async verifyPasskeyRegistration(
    current: StoredSession,
    response: Parameters<typeof verifyRegistrationResponse>[0]["response"],
  ) {
    const challenge = await this.store.takeChallenge(
      `reg:${current.hash}`,
      this.now(),
    );
    if (!challenge) throw new AuthError("invalid");
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      requireUserVerification: false,
    }).catch(() => ({ verified: false as const }));
    if (!result.verified) throw new AuthError("invalid");
    const { credential } = result.registrationInfo;
    await this.store.addPasskey({
      id: credential.id,
      guardianId: current.guardianId,
      publicKey: b64url(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports,
      createdAt: this.now(),
    });
  }

  async passkeyAuthenticationOptions(ip: string) {
    await this.limit(`passkey-ip:${ip}`, LIMITS.passkeyPerIp);
    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: "preferred",
    });
    const challengeId = randomToken(16);
    await this.store.saveChallenge(
      `auth:${challengeId}`,
      options.challenge,
      this.now() + TTL.challenge,
    );
    return { challengeId, options };
  }

  async verifyPasskeyAuthentication(
    challengeId: string,
    response: Parameters<typeof verifyAuthenticationResponse>[0]["response"],
    userAgent: string,
    /** すでにログインしている端末で確かめ直すとき（削除・書き出しの前） */
    current?: StoredSession,
  ): Promise<NewSession | StoredSession> {
    const challenge = await this.store.takeChallenge(
      `auth:${challengeId}`,
      this.now(),
    );
    if (!challenge) throw new AuthError("invalid");
    const passkey = await this.store.getPasskey(response.id);
    if (!passkey) throw new AuthError("invalid");
    if (current && passkey.guardianId !== current.guardianId)
      throw new AuthError("invalid");
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      credential: {
        id: passkey.id,
        publicKey: fromB64url(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports,
      },
      requireUserVerification: false,
    }).catch(() => ({
      verified: false as const,
      authenticationInfo: undefined,
    }));
    if (!result.verified || !result.authenticationInfo)
      throw new AuthError("invalid");
    await this.store.updatePasskeyCounter(
      passkey.id,
      result.authenticationInfo.newCounter,
    );
    const guardian = await this.store.getGuardian(passkey.guardianId);
    if (!guardian || guardian.deletedAt) throw new AuthError("invalid");
    if (current) {
      await this.store.updateSession(current.hash, { authAt: this.now() });
      return { ...current, authAt: this.now() };
    }
    return {
      ...(await this.newSession(guardian.id, userAgent)),
      email: guardian.email,
    };
  }

  async hasPasskey(current: StoredSession): Promise<boolean> {
    return (await this.store.listPasskeys(current.guardianId)).length > 0;
  }
}
