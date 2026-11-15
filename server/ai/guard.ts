import { NextResponse } from "next/server";
import { cookieName, readCookie } from "@/server/auth/http";
import { getAuth } from "@/server/auth/registry";
import type { StoredSession } from "@/server/auth/store";
import { type Config, getConfig } from "@/server/config";
import { getSync } from "@/server/sync/registry";
import type { SyncService } from "@/server/sync/service";

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
  | "unauthorized"
  | "disabled";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  image_metadata: 400,
  rate_limited: 429,
  timeout: 504,
  ai_unavailable: 503,
  invalid_output: 502,
  unauthorized: 401,
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
  unauthorized: "いまは つかえないよ。おうちの ひとに みてもらってね",
  disabled: "いまは つかえないよ",
};

export function errorResponse(code: ErrorCode, requestId: string) {
  return NextResponse.json(
    { error: { code, message: MESSAGES[code], requestId } },
    { status: STATUS[code], headers: { "Cache-Control": "no-store" } },
  );
}

export type AiRoute = "analyze" | "classify" | "generate" | "grade";

/** 1日の回数の上限（子どもごと・BR-U2-3、U8 §6）。ログインしていればデータベースで数える */
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
 * 回数の制限をサーバーのメモリに数える。ログインしていないとき（開発・テスト・評価）だけ使う
 */
export class DailyCounter {
  private counts = new Map<string, number>();
  private day = "";

  constructor(private limits: Record<AiRoute, number> = DAILY_LIMITS) {}

  /** 使えれば数えて true、上限なら false */
  take(childId: string, route: AiRoute, now = new Date()): boolean {
    const today = jstDay(now);
    if (today !== this.day) {
      this.counts.clear();
      this.day = today;
    }
    const key = `${route}:${childId}`;
    const used = this.counts.get(key) ?? 0;
    if (used >= this.limits[route]) return false;
    this.counts.set(key, used + 1);
    return true;
  }
}

const counter = new DailyCounter();

const CHILD_ID = /^[A-Za-z0-9-]{8,64}$/;

export interface GuardResult {
  requestId: string;
  config: Config;
  signal: AbortSignal;
}

export interface GuardDeps {
  config?: Config;
  counter?: DailyCounter;
  /** ログインしている保護者（Cookie から読む） */
  session?: (request: Request) => Promise<StoredSession | undefined>;
  sync?: () => SyncService;
}

async function sessionOf(request: Request) {
  const { auth, config } = getAuth();
  return auth.getSession(readCookie(request, cookieName(config)));
}

/**
 * どの AI の API でも、最初に呼ぶ。
 * - 子どもの ID ごとに、1日の回数を数える（U8 §6）。ログインしていれば、その子がこの保護者の子どもかを確かめ、
 *   データベースで数える（サーバーが何台でも正しく数える）
 * - 本番の環境では、ログインしていなければ動かさない（BR-U2-4）
 * - 時間切れの合図（AbortSignal）を作る
 */
export async function guard(
  request: Request,
  route: AiRoute,
  deps: GuardDeps = {},
): Promise<GuardResult | NextResponse> {
  const requestId = crypto.randomUUID();
  const config = deps.config ?? getConfig();

  const childId = request.headers.get("x-child-id") ?? "";
  if (!CHILD_ID.test(childId)) return errorResponse("bad_request", requestId);

  const session = await (deps.session ?? sessionOf)(request);
  if (session) {
    const r = await (deps.sync ?? getSync)().takeAi(
      session.guardianId,
      childId,
      route,
      DAILY_LIMITS[route],
    );
    if (r === "unknown_child") return errorResponse("bad_request", requestId);
    if (r === "limit") return errorResponse("rate_limited", requestId);
  } else if (config.APP_ENV === "production") {
    return errorResponse("unauthorized", requestId);
  } else if (!(deps.counter ?? counter).take(childId, route)) {
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
