import { NextResponse } from "next/server";
import { loggingWarnings } from "@/server/ai/providers/bedrock/account";
import { getAccountStatus } from "@/server/ai/registry";
import { bedrockModels, getConfig } from "@/server/config";

/**
 * GET /api/health/ready
 * つながっている AI・AWS のアカウント（末尾4桁）・リージョン・モデルと、
 * Bedrock の呼び出しの記録の設定を返す。社用と個人用の取り違えを防ぐため（business-logic-model.md §3）。
 * 秘密の値は返さない。
 */
export async function GET() {
  const config = getConfig();
  const body: Record<string, unknown> = {
    status: "ok",
    appEnv: config.APP_ENV,
    aiProvider: config.AI_PROVIDER,
    aiApiEnabled: config.APP_ENV !== "production",
  };

  if (config.AI_PROVIDER === "bedrock") {
    const { status, error } = await getAccountStatus(config);
    body.aws = {
      profile: config.AWS_PROFILE ?? "(既定)",
      region: config.AWS_REGION,
      models: bedrockModels(config),
      accountLast4: status?.accountLast4,
      invocationLogging: status?.logging,
    };
    const warnings = status
      ? loggingWarnings(status.logging, config.BEDROCK_LOG_RETENTION_MAX_DAYS)
      : [error ?? "AWS のアカウントの状態を読めませんでした"];
    body.warnings = warnings;
    const blocked =
      !status ||
      (status.logging.enabled && status.logging.imageDataDeliveryEnabled);
    if (blocked) {
      body.status = "degraded";
      body.aiApiEnabled = false;
    }
  }

  return NextResponse.json(body, {
    status: body.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
