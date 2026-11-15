import type { NextResponse } from "next/server";
import { z } from "zod";
import {
  authError,
  clearSessionCookie,
  handle,
  ok,
  requireSession,
} from "@/server/auth/http";
import { getAuth } from "@/server/auth/registry";
import { AuthError } from "@/server/auth/service";
import { getSync } from "@/server/sync/registry";

/**
 * アカウントの API（U8 §5）。/api/account/<action>。どれもログインが要る。
 * 削除と書き出しは、10分以内にログインし直す（またはパスキーで確かめる）ことが要る（U8-SEC-7）。
 * GET  export                       クラウドの記録を書き出す（JSON）
 * GET  deleted-children             取り消せる、消した子ども
 * POST delete-child {childId}       子どもを消す（7日のうちは取り消せる）
 * POST restore-child {childId}      子どもの削除を取り消す
 * POST delete                       アカウントを消す（すべての端末がログアウトする。7日のうちは取り消せる）
 */

type Ctx = { params: Promise<{ action: string }> };

const ChildId = z.object({ childId: z.string().min(1).max(64) });

async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) throw new AuthError("bad_request");
  return parsed.data;
}

async function route(request: Request, { params }: Ctx): Promise<NextResponse> {
  const { action } = await params;
  return handle(request, getAuth(), async (ctx) => {
    const session = requireSession(ctx);
    const { auth } = ctx;
    const sync = getSync();
    const g = session.guardianId;
    switch (`${request.method} ${action}`) {
      case "GET export": {
        auth.requireRecentAuth(session);
        const res = ok(await sync.exportAll(g));
        res.headers.set(
          "Content-Disposition",
          'attachment; filename="kaeriuchi-cloud.json"',
        );
        return res;
      }
      case "GET deleted-children":
        return ok({ children: await sync.deletedChildren(g) });
      case "POST delete-child": {
        auth.requireRecentAuth(session);
        const { childId } = await body(request, ChildId);
        await sync.deleteChild(g, childId);
        return ok({});
      }
      case "POST restore-child": {
        const { childId } = await body(request, ChildId);
        if (!(await sync.restoreChild(g, childId)))
          throw new AuthError("invalid");
        return ok({});
      }
      case "POST delete": {
        auth.requireRecentAuth(session);
        await sync.markAccountDeleted(g);
        await auth.deleteAccount(session);
        const res = ok({});
        clearSessionCookie(res, ctx.config);
        return res;
      }
      default:
        return authError("bad_request");
    }
  });
}

export const GET = route;
export const POST = route;
