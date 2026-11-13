import { NextResponse } from "next/server";
import { isKnownMistakeType, mistakeTypeCatalog } from "@/server/ai/catalog";
import { classifyError, errorResponse, guard } from "@/server/ai/guard";
import { classifyPrompt } from "@/server/ai/prompts";
import { aiAllowed, getProvider } from "@/server/ai/registry";
import { ClassifyRequest } from "@/server/ai/schemas";
import { logAiCall } from "@/server/ai/telemetry";

/**
 * POST /api/ai/classify：手で入れた間違いの、間違いのタイプを判定する（画像なし・§3）。
 * 入れた文は保存しない。ログにも出さない（U45-PRIV-1）。
 */
export async function POST(request: Request) {
  const g = guard(request, "classify");
  if (g instanceof NextResponse) return g;
  const { requestId, config, signal } = g;

  const body = ClassifyRequest.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) return errorResponse("bad_request", requestId);
  if (!(await aiAllowed(config)))
    return errorResponse("ai_unavailable", requestId);

  const started = Date.now();
  const catalog = mistakeTypeCatalog(body.data.subject, body.data.grade);
  try {
    const { value, usage } = await getProvider(config).classifyMistake(
      { ...body.data, mistakeTypeCatalog: catalog },
      { requestId, signal },
    );
    // 一覧にないタイプが返ってきたら "other" にする。
    // 学年で絞った候補の外でも、一覧にあるものは受け付ける（学年より先の問題を解いていることもあるため）
    const known = isKnownMistakeType(value.mistakeTypeId);
    logAiCall({
      requestId,
      route: "classify",
      provider: config.AI_PROVIDER,
      promptVersion: classifyPrompt.id,
      latencyMs: Date.now() - started,
      outcome: "ok",
      usage,
    });
    return NextResponse.json(
      {
        result: {
          ...value,
          mistakeTypeId: known ? value.mistakeTypeId : "other",
        },
        meta: {
          requestId,
          provider: config.AI_PROVIDER,
          model: usage.model,
          promptVersion: classifyPrompt.id,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const code = classifyError(e);
    logAiCall({
      requestId,
      route: "classify",
      provider: config.AI_PROVIDER,
      promptVersion: classifyPrompt.id,
      latencyMs: Date.now() - started,
      outcome:
        code === "timeout"
          ? "timeout"
          : code === "invalid_output"
            ? "invalid_output"
            : "error",
    });
    return errorResponse(code, requestId);
  }
}
