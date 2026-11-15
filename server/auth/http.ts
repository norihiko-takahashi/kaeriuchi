import { NextResponse } from "next/server";
import type { Config } from "@/server/config";
import { AuthError, type AuthErrorCode, type AuthService } from "./service";
import type { StoredSession } from "./store";
import { TTL } from "./tokens";

/**
 * ログインの API の共通の処理（U8-SEC-2・3・6）。
 * Cookie：HttpOnly・SameSite=Lax。HTTPS では Secure と __Host- を付ける。
 */

export function cookieName(config: Config): string {
  return config.APP_URL.startsWith("https://")
    ? "__Host-kaeriuchi_session"
    : "kaeriuchi_session";
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function setSessionCookie(
  res: NextResponse,
  config: Config,
  token: string,
) {
  res.cookies.set(cookieName(config), token, {
    httpOnly: true,
    secure: config.APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: TTL.session / 1000,
  });
}

export function clearSessionCookie(res: NextResponse, config: Config) {
  res.cookies.set(cookieName(config), "", {
    httpOnly: true,
    secure: config.APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** 接続元。ALB の後ろでは X-Forwarded-For の最初の値 */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || "local";
}

/** 状態を変える API は、同じ出どころからだけ受ける（CSRF 対策・U8-SEC-3） */
export function sameOrigin(request: Request, config: Config): boolean {
  if (request.method === "GET" || request.method === "HEAD") return true;
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(config.APP_URL).origin;
}

const STATUS: Record<AuthErrorCode, number> = {
  bad_request: 400,
  invalid: 400,
  rate_limited: 429,
  unauthorized: 401,
};

/** 画面に出してよい文（保護者向け） */
export const MESSAGES: Record<AuthErrorCode, string> = {
  bad_request: "入力の形が正しくありません",
  invalid: "このリンク（番号）は使えません。もう一度やり直してください",
  rate_limited: "しばらく待ってから、もう一度ためしてください",
  unauthorized: "ログインしてください",
};

export function authError(code: AuthErrorCode): NextResponse {
  return NextResponse.json(
    { error: { code, message: MESSAGES[code] } },
    { status: STATUS[code], headers: { "Cache-Control": "no-store" } },
  );
}

export function ok(body: unknown): NextResponse {
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

export interface AuthContext {
  config: Config;
  auth: AuthService;
  ip: string;
  token?: string;
  session?: StoredSession;
}

/**
 * API の共通の入口。出どころと接続元の回数を確かめ、セッションを読む。
 * AuthError は、決まったエラーの返事にする
 */
export async function handle(
  request: Request,
  deps: { config: Config; auth: AuthService },
  fn: (ctx: AuthContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    if (!sameOrigin(request, deps.config)) return authError("bad_request");
    const ip = clientIp(request);
    await deps.auth.checkIp(ip);
    const token = readCookie(request, cookieName(deps.config));
    const session = await deps.auth.getSession(token);
    return await fn({ ...deps, ip, token, session });
  } catch (e) {
    if (e instanceof AuthError) return authError(e.code);
    console.error(
      JSON.stringify({
        level: "error",
        event: "auth_error",
        name: (e as Error)?.name,
      }),
    );
    return NextResponse.json(
      { error: { code: "error", message: "うまくいきませんでした" } },
      { status: 500 },
    );
  }
}

/** セッションが要る API で使う */
export function requireSession(ctx: AuthContext): StoredSession {
  if (!ctx.session) throw new AuthError("unauthorized");
  return ctx.session;
}
