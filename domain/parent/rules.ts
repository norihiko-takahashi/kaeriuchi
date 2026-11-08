import type { UsageRules } from "@/shared/schemas";

export const DAILY_LIMIT_MIN = 1;
export const DAILY_LIMIT_MAX = 30;

/** 使い方のルールの初期値（BR-3.1〜3.4） */
export function defaultRules(): UsageRules {
  return { dailyMistakeLimit: 10, notifications: false };
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(hhmm: string): number {
  const match = TIME.exec(hhmm);
  if (!match) throw new Error(`時刻の形式が正しくありません: ${hhmm}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isValidTime(hhmm: string): boolean {
  return TIME.test(hhmm);
}

/**
 * いまが使える時間帯かどうか（BR-3.2）。
 * 開始より終了が前なら、夜をまたぐ時間帯として扱う（例：20:00〜07:00）。
 */
export function isWithinAllowedHours(rules: UsageRules, now: Date): boolean {
  if (!rules.allowedHours) return true;
  const [start, end] = rules.allowedHours.map(toMinutes);
  const current = now.getHours() * 60 + now.getMinutes();
  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

export function clampDailyLimit(value: number): number {
  if (!Number.isFinite(value)) return DAILY_LIMIT_MIN;
  return Math.min(
    DAILY_LIMIT_MAX,
    Math.max(DAILY_LIMIT_MIN, Math.round(value)),
  );
}
