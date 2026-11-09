import { describe, expect, it } from "vitest";
import { estimateCostJpy, logAiCall } from "./telemetry";

describe("記録（BR-U2-5）", () => {
  it("費用の目安を計算する", () => {
    expect(
      estimateCostJpy({
        model: "anthropic.claude-sonnet-x",
        inputTokens: 2000,
        outputTokens: 500,
        retries: 0,
      }),
    ).toBeCloseTo(2.03, 1);
    expect(
      estimateCostJpy({
        model: "mock-analyze",
        inputTokens: 0,
        outputTokens: 0,
        retries: 0,
      }),
    ).toBe(0);
    expect(
      estimateCostJpy({
        model: "unknown",
        inputTokens: 1,
        outputTokens: 1,
        retries: 0,
      }),
    ).toBeNaN();
  });

  it("1行の JSON で出し、中身（画像・問題文）の項目は持たない", () => {
    const lines: string[] = [];
    logAiCall(
      {
        requestId: "r1",
        route: "analyze",
        provider: "bedrock",
        promptVersion: "analyze@1",
        latencyMs: 1234,
        outcome: "ok",
        usage: {
          model: "anthropic.claude-sonnet-x",
          inputTokens: 10,
          outputTokens: 5,
          retries: 0,
        },
      },
      (l) => lines.push(l),
    );
    const log = JSON.parse(lines[0]);
    expect(log).toMatchObject({
      level: "info",
      event: "ai_call",
      requestId: "r1",
      model: "anthropic.claude-sonnet-x",
      outcome: "ok",
    });
    expect(Object.keys(log).sort()).toEqual(
      [
        "costJpy",
        "event",
        "inputTokens",
        "latencyMs",
        "level",
        "model",
        "outcome",
        "outputTokens",
        "promptVersion",
        "provider",
        "requestId",
        "retries",
        "route",
      ].sort(),
    );
  });

  it("失敗は warn で出す", () => {
    const lines: string[] = [];
    logAiCall(
      {
        requestId: "r2",
        route: "generate",
        provider: "mock",
        latencyMs: 1,
        outcome: "timeout",
      },
      (l) => lines.push(l),
    );
    expect(JSON.parse(lines[0]).level).toBe("warn");
  });
});
