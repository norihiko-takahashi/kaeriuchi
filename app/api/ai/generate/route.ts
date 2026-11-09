import { NextResponse } from "next/server";
import { classifyError, errorResponse, guard } from "@/server/ai/guard";
import { generatePrompt } from "@/server/ai/prompts";
import { aiAllowed, getProvider } from "@/server/ai/registry";
import { GenerateRequest } from "@/server/ai/schemas";
import { logAiCall } from "@/server/ai/telemetry";

/**
 * POST /api/ai/generate
 * JSON：GenerateRequest。結果は NDJSON（1行に1問）で返す。
 * 正答の検証（検算・検証役の AI）と安全のチェックは、U4 でこの間に入れる。
 */
export async function POST(request: Request) {
  const g = guard(request, "generate");
  if (g instanceof NextResponse) return g;
  const { requestId, config, signal } = g;

  const body = GenerateRequest.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) return errorResponse("bad_request", requestId);
  if (!(await aiAllowed(config)))
    return errorResponse("ai_unavailable", requestId);

  const provider = getProvider(config);
  const started = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let outputTokens = 0;
      let inputTokens = 0;
      let model = "";
      let retries = 0;
      try {
        for await (const { value, usage } of provider.generateCounterProblems(
          body.data,
          {
            requestId,
            signal,
          },
        )) {
          inputTokens += usage.inputTokens;
          outputTokens += usage.outputTokens;
          model = usage.model;
          retries = Math.max(retries, usage.retries);
          controller.enqueue(
            encoder.encode(`${JSON.stringify({ problem: value })}\n`),
          );
        }
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ done: true, meta: { requestId, provider: config.AI_PROVIDER, model, promptVersion: generatePrompt.id } })}\n`,
          ),
        );
        logAiCall({
          requestId,
          route: "generate",
          provider: config.AI_PROVIDER,
          promptVersion: generatePrompt.id,
          latencyMs: Date.now() - started,
          outcome: "ok",
          usage: { model, inputTokens, outputTokens, retries },
        });
      } catch (e) {
        const code = classifyError(e);
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ error: { code, requestId } })}\n`),
        );
        logAiCall({
          requestId,
          route: "generate",
          provider: config.AI_PROVIDER,
          promptVersion: generatePrompt.id,
          latencyMs: Date.now() - started,
          outcome:
            code === "timeout"
              ? "timeout"
              : code === "invalid_output"
                ? "invalid_output"
                : "error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
