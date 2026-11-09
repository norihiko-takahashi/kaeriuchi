import pricing from "./pricing.json";
import type { Usage } from "./provider";

/**
 * AI の呼び出しの記録（BR-U2-5）。標準出力に JSON で出す（公開先に依存しない）。
 * 画像、問題文、子どもの答え、AI の出力の中身は、ここに渡さない・出さない（U2-PRIV-2）。
 */

export type Outcome =
  | "ok"
  | "invalid_output"
  | "timeout"
  | "error"
  | "rate_limited"
  | "rejected";

export interface AiCallLog {
  requestId: string;
  route: "analyze" | "classify" | "generate" | "verify" | "grade";
  /** 生成：通った数・落とした数（中身は出さない） */
  verified?: number;
  rejected?: number;
  provider: string;
  promptVersion?: string;
  latencyMs: number;
  outcome: Outcome;
  usage?: Usage;
}

export function estimateCostJpy(usage: Usage): number {
  const model = usage.model.toLowerCase();
  const price = pricing.models.find((p) => model.includes(p.match));
  if (!price) return Number.NaN;
  const usd =
    (usage.inputTokens / 1000) * price.inputUsdPer1k +
    (usage.outputTokens / 1000) * price.outputUsdPer1k;
  return Math.round(usd * pricing.jpyPerUsd * 100) / 100;
}

export function logAiCall(entry: AiCallLog, write = console.log) {
  const { usage, ...rest } = entry;
  write(
    JSON.stringify({
      level: entry.outcome === "ok" ? "info" : "warn",
      event: "ai_call",
      ...rest,
      model: usage?.model,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      retries: usage?.retries,
      costJpy: usage ? estimateCostJpy(usage) : undefined,
    }),
  );
}
