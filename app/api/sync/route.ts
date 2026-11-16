import { NextResponse } from "next/server";
import { authError, handle, ok, requireSession } from "@/server/auth/http";
import { getAuth } from "@/server/auth/registry";
import { getSync } from "@/server/sync/registry";
import { SyncRequestSchema } from "@/server/sync/validate";
import { SYNC_BODY_MAX_BYTES } from "@/shared/sync";

/**
 * 同期（U8 §4）。送信待ちを受け取り（push）、前回より後のクラウドの変更を返す（pull）。
 * ログインした保護者の記録だけを触る（U8-SEC-4）。
 */
export async function POST(request: Request): Promise<NextResponse> {
  return handle(request, getAuth(), async (ctx) => {
    const session = requireSession(ctx);
    await ctx.auth.checkSync(session);
    const text = await request.text();
    if (text.length > SYNC_BODY_MAX_BYTES)
      return NextResponse.json(
        { error: { code: "too_large", message: "大きすぎます" } },
        { status: 413 },
      );
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return authError("bad_request");
    }
    const body = SyncRequestSchema.safeParse(json);
    if (!body.success) return authError("bad_request");
    const res = await getSync().sync(
      session.guardianId,
      body.data.since,
      body.data.changes,
    );
    return ok(res);
  });
}
