import { NextResponse } from "next/server";
import { type Config, getConfig } from "@/server/config";

/**
 * AI の API の共通の処理（BR-U2-3・BR-U2-4、nfr-design.md §5・§6）。
 */

export type ErrorCode =
  | "bad_request"
  | "image_metadata"
  | "rate_limited"
  | "timeout"
  | "ai_unavailable"
  | "invalid_output"
  | "disabled";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  image_metadata: 400,
  rate_limited: 429,
  timeout: 504,
  ai_unavailable: 503,
  invalid_output: 502,
  disabled: 503,
};

/** 子どもに見せる文（中の仕組みの詳細は出さない・U2-SEC-5） */
const MESSAGES: Record<ErrorCode, string> = {
  bad_request: "うまく よみこめなかったよ。もう一回 ためしてね",
  image_metadata:
    "しゃしんに よけいな じょうほうが ついているよ。もう一回 とりなおしてね",
  rate_limited: "きょうは もう つかえないよ。また あしたね",
  timeout: "じかんが かかりすぎちゃった。もう一回 ためしてね",
  ai_unavailable: "いまは つかえないよ。すこし まってから ためしてね",
  invalid_output: "うまく つくれなかったよ。もう一回 ためしてね",
  disabled: "いまは つかえないよ",
};

export function errorResponse(code: ErrorCode, requestId: string) {
  return NextResponse.json(
    { error: { code, message: MESSAGES[code], requestId } },
    { status: STATUS[code], headers: { "Cache-Control": "no-store" } },
  );
}

export type AiRoute = "analyze" | "classify" | "generate" | "grade";

/** 1日の回数の上限（端末ごと・BR-U2-3）。U8 で保護者ごとに DB で数える形に変える */
export const DAILY_LIMITS: Record<AiRoute, number> = {
  analyze: 30,
  /** 手で入れた間違いの判定（U45-COST-1） */
  classify: 30,
  generate: 60,
  grade: 200,
};

/** 1回の AI の呼び出しの時間切れ（BR-U2-3） */
export const TIMEOUT_MS: Record<AiRoute, number> = {
  analyze: 20_000,
  classify: 10_000,
  /** 生成から検証まで、全部で（U45-PERF-4） */
  generate: 30_000,
  grade: 10_000,
};

/** 日本時間の日付（回数を数える「1日」） */
function jstDay(now: Date): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/**
 * 回数の制限。サーバーのメモリに数える（nfr-design.md §5 の注意を参照）。
 */
export class DailyCounter {
  private counts = new Map<string, number>();
  private day = "";

  constructor(private limits: Record<AiRoute, number> = DAILY_LIMITS) {}

  /** 使えれば数えて true、上限なら false */
  take(deviceId: string, route: AiRoute, now = new Date()): boolean {
    const today = jstDay(now);
    if (today !== this.day) {
      this.counts.clear();
      this.day = today;
    }
    const key = `${route}:${deviceId}`;
    const used = this.counts.get(key) ?? 0;
    if (used >= this.limits[route]) return false;
    this.counts.set(key, used + 1);
    return true;
  }
}

const counter = new DailyCounter();

const DEVICE_ID = /^[A-Za-z0-9-]{8,64}$/;

export interface GuardResult {
  requestId: string;
  config: Config;
  signal: AbortSignal;
}

/**
 * どの AI の API でも、最初に呼ぶ。
 * - 本番の環境では、ログインができるまで（U8）動かさない（BR-U2-4）
 * - 端末の ID ごとに、1日の回数を数える
 * - 時間切れの合図（AbortSignal）を作る
 */
export function guard(
  request: Request,
  route: AiRoute,
  deps: { config?: Config; counter?: DailyCounter } = {},
): GuardResult | NextResponse {
  const requestId = crypto.randomUUID();
  const config = deps.config ?? getConfig();
  if (config.APP_ENV === "production")
    return errorResponse("disabled", requestId);

  const deviceId = request.headers.get("x-device-id") ?? "";
  if (!DEVICE_ID.test(deviceId)) return errorResponse("bad_request", requestId);
  if (!(deps.counter ?? counter).take(deviceId, route)) {
    return errorResponse("rate_limited", requestId);
  }
  return { requestId, config, signal: AbortSignal.timeout(TIMEOUT_MS[route]) };
}

/** AI の呼び出しで起きたエラーを、エラーの種類に分ける */
export function classifyError(e: unknown): ErrorCode {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "TimeoutError" || name === "AbortError") return "timeout";
  if (name === "InvalidOutputError") return "invalid_output";
  return "ai_unavailable";
}
