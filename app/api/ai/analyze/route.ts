import { NextResponse } from "next/server";
import { mistakeTypeCatalog } from "@/server/ai/catalog";
import { classifyError, errorResponse, guard } from "@/server/ai/guard";
import { checkImage, MAX_IMAGE_BYTES } from "@/server/ai/image";
import { analyzePrompt } from "@/server/ai/prompts";
import { aiAllowed, getProvider } from "@/server/ai/registry";
import { Grade, Subject } from "@/server/ai/schemas";
import { logAiCall } from "@/server/ai/telemetry";

/**
 * POST /api/ai/analyze
 * multipart/form-data：image（JPEG・PNG）、grade、subject（任意）
 * 画像はメモリ上だけで扱い、保存しない（NFR-P2）。
 */
export async function POST(request: Request) {
  const g = guard(request, "analyze");
  if (g instanceof NextResponse) return g;
  const { requestId, config, signal } = g;

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_IMAGE_BYTES + 64 * 1024)
    return errorResponse("bad_request", requestId);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("bad_request", requestId);
  }
  const file = form.get("image");
  const grade = Grade.safeParse(form.get("grade"));
  const subjectRaw = form.get("subject");
  const subject = subjectRaw ? Subject.safeParse(subjectRaw) : undefined;
  if (
    !(file instanceof Blob) ||
    !grade.success ||
    (subject && !subject.success)
  ) {
    return errorResponse("bad_request", requestId);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = checkImage(bytes);
  if (!image.ok) {
    logAiCall({
      requestId,
      route: "analyze",
      provider: config.AI_PROVIDER,
      latencyMs: 0,
      outcome: "rejected",
    });
    return errorResponse(
      image.error === "metadata" ? "image_metadata" : "bad_request",
      requestId,
    );
  }

  if (!(await aiAllowed(config)))
    return errorResponse("ai_unavailable", requestId);

  const started = Date.now();
  try {
    const subjectHint = subject?.success ? subject.data : undefined;
    const { value, usage } = await getProvider(config).analyzeMistake(
      {
        image: { mime: image.mime, data: bytes },
        grade: grade.data,
        subjectHint,
        mistakeTypeCatalog: mistakeTypeCatalog(subjectHint),
      },
      { requestId, signal },
    );
    logAiCall({
      requestId,
      route: "analyze",
      provider: config.AI_PROVIDER,
      promptVersion: analyzePrompt.id,
      latencyMs: Date.now() - started,
      outcome: "ok",
      usage,
    });
    return NextResponse.json(
      {
        analysis: value,
        meta: {
          requestId,
          provider: config.AI_PROVIDER,
          model: usage.model,
          promptVersion: analyzePrompt.id,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const code = classifyError(e);
    logAiCall({
      requestId,
      route: "analyze",
      provider: config.AI_PROVIDER,
      promptVersion: analyzePrompt.id,
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
