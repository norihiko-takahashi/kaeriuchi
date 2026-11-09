import { NextResponse } from "next/server";
import { classifyError, errorResponse, guard } from "@/server/ai/guard";
import { gradePrompt } from "@/server/ai/prompts";
import { aiAllowed, getProvider } from "@/server/ai/registry";
import { GradeRequest } from "@/server/ai/schemas";
import { logAiCall } from "@/server/ai/telemetry";

/** POST /api/ai/grade：短い文の答えを採点する（ルールで判断できないときだけ使う・FR-5.3） */
export async function POST(request: Request) {
  const g = guard(request, "grade");
  if (g instanceof NextResponse) return g;
  const { requestId, config, signal } = g;

  const body = GradeRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse("bad_request", requestId);
  if (!(await aiAllowed(config)))
    return errorResponse("ai_unavailable", requestId);

  const started = Date.now();
  try {
    const { value, usage } = await getProvider(config).gradeFreeText(
      body.data,
      {
        requestId,
        signal,
      },
    );
    logAiCall({
      requestId,
      route: "grade",
      provider: config.AI_PROVIDER,
      promptVersion: gradePrompt.id,
      latencyMs: Date.now() - started,
      outcome: "ok",
      usage,
    });
    return NextResponse.json(
      { result: value, meta: { requestId } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const code = classifyError(e);
    logAiCall({
      requestId,
      route: "grade",
      provider: config.AI_PROVIDER,
      promptVersion: gradePrompt.id,
      latencyMs: Date.now() - started,
      outcome: code === "timeout" ? "timeout" : "error",
    });
    return errorResponse(code, requestId);
  }
}
