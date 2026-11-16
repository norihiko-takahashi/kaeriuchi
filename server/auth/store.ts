/**
 * ログインの保存先（U8）。本番は Postgres、開発とテストはメモリ（NFR-I2）。
 * どの値も、保存するのはハッシュだけ（U8-SEC-1）。
 */

export interface StoredGuardian {
  id: string;
  email: string;
  createdAt: number;
  /** 削除の印（アカウントの削除・U8 の機能設計 §5） */
  deletedAt?: number;
}

export interface StoredSession {
  hash: string;
  guardianId: string;
  deviceId: string;
  deviceName: string;
  createdAt: number;
  expiresAt: number;
  /** 最後にログインし直した時刻（削除・書き出しの前の確認・U8-SEC-7） */
  authAt: number;
  /** 最後に使った日（日付だけ・NFR-P11） */
  lastSeenDay: string;
}

export interface StoredPasskey {
  /** 資格情報の ID（base64url） */
  id: string;
  guardianId: string;
  /** 公開鍵（base64url） */
  publicKey: string;
  counter: number;
  transports?: string[];
  createdAt: number;
}

export interface AuthStore {
  findGuardianByEmail(email: string): Promise<StoredGuardian | undefined>;
  getGuardian(id: string): Promise<StoredGuardian | undefined>;
  createGuardian(g: StoredGuardian): Promise<void>;
  /** アカウントの削除の印を付ける・外す（null） */
  setGuardianDeleted(id: string, at: number | null): Promise<void>;
  /** 本当に消す（セッション・パスキーも一緒に） */
  deleteGuardian(id: string): Promise<void>;

  saveLoginToken(t: {
    hash: string;
    email: string;
    expiresAt: number;
  }): Promise<void>;
  /** 使えるなら使った印を付けて、メールアドレスを返す（1回きり） */
  consumeLoginToken(hash: string, now: number): Promise<string | undefined>;

  /** 同時に出せるのは1つ。前のものは消す */
  saveLinkCode(c: {
    hash: string;
    guardianId: string;
    expiresAt: number;
  }): Promise<void>;
  consumeLinkCode(hash: string, now: number): Promise<string | undefined>;

  createSession(s: StoredSession): Promise<void>;
  getSession(hash: string): Promise<StoredSession | undefined>;
  updateSession(hash: string, patch: Partial<StoredSession>): Promise<void>;
  deleteSession(hash: string): Promise<void>;
  listSessions(guardianId: string): Promise<StoredSession[]>;
  deleteSessionsOf(guardianId: string, deviceId?: string): Promise<void>;

  addPasskey(p: StoredPasskey): Promise<void>;
  getPasskey(id: string): Promise<StoredPasskey | undefined>;
  listPasskeys(guardianId: string): Promise<StoredPasskey[]>;
  updatePasskeyCounter(id: string, counter: number): Promise<void>;

  saveChallenge(
    key: string,
    challenge: string,
    expiresAt: number,
  ): Promise<void>;
  /** 1回きり */
  takeChallenge(key: string, now: number): Promise<string | undefined>;

  /** 回数を1つ足し、期間の中の回数を返す（回数の制限・U8-SEC-6） */
  hit(key: string, windowMs: number, now: number): Promise<number>;
  /** 回数を数えずに、期間の中の回数を返す */
  count(key: string, windowMs: number, now: number): Promise<number>;
}
