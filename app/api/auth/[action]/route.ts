import type { NextResponse } from "next/server";
import { z } from "zod";
import {
  type AuthContext,
  authError,
  clearSessionCookie,
  handle,
  ok,
  requireSession,
  setSessionCookie,
} from "@/server/auth/http";
import { getAuth } from "@/server/auth/registry";
import { AuthError, type NewSession } from "@/server/auth/service";

/**
 * ログインの API（U8、functional-design.md §1〜3）。/api/auth/<action>
 * GET  session                     いまのログイン
 * POST link {email}                ログイン用のリンクを送る
 * POST verify {token}              リンクを確かめてログインする
 * POST logout                      ログアウト
 * POST code                        端末をつなぐ番号を出す（ログインが要る）
 * POST redeem {code}               番号で端末をつなぐ
 * GET  devices / PATCH / DELETE    端末の一覧・名前の変更・ほかの端末のログアウト
 * POST passkey-register-options / passkey-register {response}
 * POST passkey-login-options / passkey-login {challengeId, response, reauth?}
 */

type Ctx = { params: Promise<{ action: string }> };

const Email = z.object({ email: z.string().max(254) });
const Token = z.object({ token: z.string().min(10).max(200) });
const Code = z.object({ code: z.string().max(20) });
const DeviceId = z.object({ deviceId: z.string().max(100) });
const Rename = DeviceId.extend({ name: z.string().max(40) });
const RegisterBody = z.object({ response: z.record(z.string(), z.unknown()) });
const LoginBody = z.object({
  challengeId: z.string().max(100),
  response: z.record(z.string(), z.unknown()),
  reauth: z.boolean().optional(),
});

async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const json = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new AuthError("bad_request");
  return parsed.data;
}

const userAgent = (r: Request) => r.headers.get("user-agent") ?? "";

function signedIn(ctx: AuthContext, s: NewSession): NextResponse {
  const res = ok({
    guardianId: s.session.guardianId,
    email: s.email,
    deviceId: s.session.deviceId,
  });
  setSessionCookie(res, ctx.config, s.token);
  return res;
}

async function run(request: Request, action: string, ctx: AuthContext) {
  const { auth } = ctx;
  const key = `${request.method} ${action}`;
  switch (key) {
    case "GET session": {
      const s = requireSession(ctx);
      return ok({
        guardianId: s.guardianId,
        email: await auth.emailOf(s),
        deviceId: s.deviceId,
        hasPasskey: await auth.hasPasskey(s),
        recentAuth: auth.isRecentAuth(s),
      });
    }
    case "POST link": {
      const { email } = await body(request, Email);
      return ok(await auth.requestLoginLink(email, ctx.ip));
    }
    case "POST verify": {
      const { token } = await body(request, Token);
      return signedIn(
        ctx,
        await auth.verifyLoginLink(token, ctx.ip, userAgent(request)),
      );
    }
    case "POST logout": {
      if (ctx.token) await auth.signOut(ctx.token);
      const res = ok({});
      clearSessionCookie(res, ctx.config);
      return res;
    }
    case "POST code":
      return ok(await auth.createLinkCode(requireSession(ctx)));
    case "POST redeem": {
      const { code } = await body(request, Code);
      return signedIn(
        ctx,
        await auth.redeemLinkCode(code, ctx.ip, userAgent(request)),
      );
    }
    case "GET devices":
      return ok({ devices: await auth.listDevices(requireSession(ctx)) });
    case "PATCH devices": {
      const { deviceId, name } = await body(request, Rename);
      await auth.renameDevice(requireSession(ctx), deviceId, name);
      return ok({});
    }
    case "DELETE devices": {
      const { deviceId } = await body(request, DeviceId);
      await auth.revokeDevice(requireSession(ctx), deviceId);
      return ok({});
    }
    case "POST passkey-register-options":
      return ok(await auth.passkeyRegistrationOptions(requireSession(ctx)));
    case "POST passkey-register": {
      const { response } = await body(request, RegisterBody);
      await auth.verifyPasskeyRegistration(
        requireSession(ctx),
        response as never,
      );
      return ok({});
    }
    case "POST passkey-login-options":
      return ok(await auth.passkeyAuthenticationOptions(ctx.ip));
    case "POST passkey-login": {
      const { challengeId, response, reauth } = await body(request, LoginBody);
      const current = reauth ? requireSession(ctx) : undefined;
      const result = await auth.verifyPasskeyAuthentication(
        challengeId,
        response as never,
        userAgent(request),
        current,
      );
      if ("token" in result) return signedIn(ctx, result);
      return ok({ recentAuth: true });
    }
    default:
      return authError("bad_request");
  }
}

async function route(request: Request, { params }: Ctx) {
  const { action } = await params;
  return handle(request, getAuth(), (ctx) => run(request, action, ctx));
}

export const GET = route;
export const POST = route;
export const PATCH = route;
export const DELETE = route;
