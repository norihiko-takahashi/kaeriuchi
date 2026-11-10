import { NextResponse } from "next/server";
import { classifyError, errorResponse, guard } from "@/server/ai/guard";
import { generatePrompt, solvePrompt } from "@/server/ai/prompts";
import type { Usage } from "@/server/ai/provider";
import { aiAllowed, getProvider } from "@/server/ai/registry";
import { GenerateRequest } from "@/server/ai/schemas";
import { logAiCall } from "@/server/ai/telemetry";
import { runPipeline } from "@/server/problems/pipeline";

/**
 * POST /api/ai/generate
 * JSON：GenerateRequest。結果は NDJSON（1行に1問）で返す。
 * 検証（検算・検証役の AI）と安全のチェックに通った問題だけを、通った順に送る（U4・BR-45-2）。
 * 最後の行は { done, meta }。通った数が2問より少なければ、端末は「うまく つくれなかった」を出す。
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
  const totals: Record<"generate" | "verify", Usage> = {
    generate: { model: "", inputTokens: 0, outputTokens: 0, retries: 0 },
    verify: { model: "", inputTokens: 0, outputTokens: 0, retries: 0 },
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      let verified = 0;
      let rejected = 0;
      let outcome: "ok" | "timeout" | "invalid_output" | "error" = "ok";
      try {
        for await (const line of runPipeline(
          provider,
          body.data,
          { requestId, signal },
          {
            onUsage: (role, u) => {
              const t = totals[role];
              t.model = u.model;
              t.inputTokens += u.inputTokens;
              t.outputTokens += u.outputTokens;
              t.retries = Math.max(t.retries, u.retries);
            },
          },
        )) {
          if ("done" in line) {
            verified = line.meta.verified;
            rejected = line.meta.rejected;
            if (line.meta.timedOut) outcome = "timeout";
          }
          send(line);
        }
      } catch (e) {
        const code = classifyError(e);
        outcome =
          code === "timeout"
            ? "timeout"
            : code === "invalid_output"
              ? "invalid_output"
              : "error";
        send({ error: { code, requestId } });
      } finally {
        const latencyMs = Date.now() - started;
        logAiCall({
          requestId,
          route: "generate",
          provider: config.AI_PROVIDER,
          promptVersion: generatePrompt.id,
          latencyMs,
          outcome,
          usage: totals.generate,
          verified,
          rejected,
        });
        if (totals.verify.model) {
          logAiCall({
            requestId,
            route: "verify",
            provider: config.AI_PROVIDER,
            promptVersion: solvePrompt.id,
            latencyMs,
            outcome,
            usage: totals.verify,
          });
        }
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
