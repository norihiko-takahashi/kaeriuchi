export const GUARDIAN_PIN_LENGTH = 6;
export const CHILD_PIN_LENGTH = 4;

export type PinError = "format" | "repeated" | "sequential";

function isRepeated(pin: string): boolean {
  return /^(\d)\1+$/.test(pin);
}

function isSequential(pin: string): boolean {
  const digits = [...pin].map(Number);
  const ascending = digits.every(
    (d, i) => i === 0 || d === (digits[i - 1] + 1) % 10,
  );
  const descending = digits.every(
    (d, i) => i === 0 || d === (digits[i - 1] + 9) % 10,
  );
  return ascending || descending;
}

/** 保護者の PIN のルール（BR-2.1） */
export function validateGuardianPin(pin: string): PinError | undefined {
  if (!new RegExp(`^\\d{${GUARDIAN_PIN_LENGTH}}$`).test(pin)) return "format";
  if (isRepeated(pin)) return "repeated";
  if (isSequential(pin)) return "sequential";
  return undefined;
}

/** 子どもの任意の PIN のルール（BR-2.7） */
export function validateChildPin(pin: string): PinError | undefined {
  if (!new RegExp(`^\\d{${CHILD_PIN_LENGTH}}$`).test(pin)) return "format";
  return undefined;
}

export const PIN_ERROR_MESSAGES: Record<PinError, string> = {
  format: "数字で入力してください",
  repeated: "同じ数字のくり返しは使えません",
  sequential: "連続した数字は使えません",
};

export interface LockoutState {
  /** 続けて間違えた回数 */
  failures: number;
  /** この時刻まで入力できない（ISO 形式） */
  lockedUntil?: string;
}

export const LOCKOUT_THRESHOLD = 5;
const BASE_LOCK_MS = 60_000;
const MAX_LOCK_MS = 30 * 60_000;

/**
 * 間違えたときの待ち時間（BR-2.3）。
 * 5回続けて間違えたら1分。その後は間違えるたびに倍（最大30分）。
 */
export function lockDurationMs(failures: number): number {
  if (failures < LOCKOUT_THRESHOLD) return 0;
  const doublings = failures - LOCKOUT_THRESHOLD;
  return Math.min(BASE_LOCK_MS * 2 ** doublings, MAX_LOCK_MS);
}

export function registerFailure(state: LockoutState, now: Date): LockoutState {
  const failures = state.failures + 1;
  const ms = lockDurationMs(failures);
  return {
    failures,
    lockedUntil:
      ms > 0 ? new Date(now.getTime() + ms).toISOString() : undefined,
  };
}

export function registerSuccess(): LockoutState {
  return { failures: 0 };
}

/** まだ入力できないなら、あと何ミリ秒か。入力できるなら 0 */
export function remainingLockMs(state: LockoutState, now: Date): number {
  if (!state.lockedUntil) return 0;
  return Math.max(0, new Date(state.lockedUntil).getTime() - now.getTime());
}
