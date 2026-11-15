import { createHash, randomBytes, randomInt } from "node:crypto";

/**
 * ログインの値（U8-SEC-1）。推測できない乱数で作り、保存するのはハッシュだけ（漏れても使えない）。
 */

/** ログイン用のリンク・セッションの値（32バイト、URL に使える形） */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** 端末をつなぐ番号（8けた。先頭の 0 も使う） */
export function randomCode(): string {
  return String(randomInt(0, 100_000_000)).padStart(8, "0");
}

export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** メールアドレスをそろえる（前後の空白を取り、小文字にする） */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 番号の入力は、数字以外（空白・ハイフン）を取ってから確かめる */
export const normalizeCode = (code: string) => code.replace(/\D/g, "");

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;

/** 期限（U8 の機能設計） */
export const TTL = {
  loginLink: 15 * MINUTE,
  linkCode: 10 * MINUTE,
  session: 30 * DAY,
  /** 削除・書き出しの前に、ログインし直してからの時間（U8-SEC-7） */
  recentAuth: 10 * MINUTE,
  /** パスキーの手続きの間だけ使う値 */
  challenge: 5 * MINUTE,
} as const;

/** 回数の制限（U8-SEC-6）。[回数, 期間] */
export const LIMITS = {
  linkPerEmail: [5, 60 * MINUTE],
  linkPerIp: [20, 60 * MINUTE],
  verifyPerIp: [60, 60 * MINUTE],
  codeFailPerIp: [5, 10 * MINUTE],
  passkeyPerIp: [30, 60 * MINUTE],
  allPerIp: [300, 5 * MINUTE],
} as const satisfies Record<string, readonly [number, number]>;

/** ブラウザの情報から、端末の名前を付ける（例：「iPad（Safari）」）。保護者があとから変えられる */
export function deviceNameFrom(userAgent: string): string {
  const ua = userAgent;
  const os = /iPad/.test(ua)
    ? "iPad"
    : /iPhone/.test(ua)
      ? "iPhone"
      : /Android/.test(ua)
        ? /Mobile/.test(ua)
          ? "Android のスマホ"
          : "Android のタブレット"
        : /Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /CrOS/.test(ua)
              ? "Chromebook"
              : "たんまつ";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua) || /CriOS\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  return browser ? `${os}（${browser}）` : os;
}
