import { describe, expect, it } from "vitest";
import { parseConfig } from "@/server/config";
import { classifyError, DailyCounter, errorResponse, guard } from "./guard";

const req = (deviceId?: string) =>
  new Request("http://localhost/api/ai/analyze", {
    method: "POST",
    headers: deviceId ? { "x-device-id": deviceId } : {},
  });

describe("guard（BR-U2-3・BR-U2-4）", () => {
  it("本番の環境では、ログインができるまで AI の API を動かさない", async () => {
    const config = parseConfig({
      APP_ENV: "production",
      APP_URL: "https://example.jp",
      AI_PROVIDER: "bedrock",
      SYNC_STORE: "postgres",
      AUTH_PROVIDER: "authjs",
      BEDROCK_MODEL_ANALYZE: "anthropic.claude-sonnet-x",
      BEDROCK_MODEL_GENERATE: "anthropic.claude-sonnet-x",
      BEDROCK_MODEL_VERIFY: "anthropic.claude-haiku-x",
      BEDROCK_MODEL_GRADE: "anthropic.claude-haiku-x",
    });
    const res = guard(req("device-12345678"), "analyze", { config });
    expect(res).toBeInstanceOf(Response);
    const r = res as Response;
    expect(r.status).toBe(503);
    expect((await r.json()).error.code).toBe("disabled");
  });

  it("端末の ID がなければ受け付けない", () => {
    const res = guard(req(), "analyze", { config: parseConfig({}) });
    expect((res as Response).status).toBe(400);
  });

  it("端末の ID があれば通り、requestId と時間切れの合図が付く", () => {
    const res = guard(req("device-12345678"), "analyze", {
      config: parseConfig({}),
      counter: new DailyCounter(),
    });
    expect(res).not.toBeInstanceOf(Response);
    const ok = res as Exclude<typeof res, Response>;
    expect(ok.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(ok.signal).toBeInstanceOf(AbortSignal);
  });

  it("1日の上限を超えたら 429", () => {
    const counter = new DailyCounter({ analyze: 1, generate: 1, grade: 1 });
    const deps = { config: parseConfig({}), counter };
    expect(guard(req("device-12345678"), "analyze", deps)).not.toBeInstanceOf(
      Response,
    );
    const second = guard(req("device-12345678"), "analyze", deps) as Response;
    expect(second.status).toBe(429);
  });
});

describe("DailyCounter", () => {
  it("端末ごと・API ごとに数え、日本時間の日付が変わると数え直す", () => {
    const c = new DailyCounter({ analyze: 2, generate: 1, grade: 1 });
    const day1 = new Date("2026-11-09T14:00:00Z"); // 日本時間 23:00
    expect(c.take("a", "analyze", day1)).toBe(true);
    expect(c.take("a", "analyze", day1)).toBe(true);
    expect(c.take("a", "analyze", day1)).toBe(false);
    expect(c.take("b", "analyze", day1)).toBe(true);
    expect(c.take("a", "generate", day1)).toBe(true);
    const day2 = new Date("2026-11-09T15:00:00Z"); // 日本時間 0:00
    expect(c.take("a", "analyze", day2)).toBe(true);
  });
});

describe("エラー", () => {
  it("エラーの形と、子ども向けの文", async () => {
    const r = errorResponse("rate_limited", "req-1");
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({
      error: {
        code: "rate_limited",
        message: expect.any(String),
        requestId: "req-1",
      },
    });
  });

  it("エラーの種類を分ける", () => {
    expect(classifyError({ name: "TimeoutError" })).toBe("timeout");
    expect(classifyError({ name: "AbortError" })).toBe("timeout");
    expect(classifyError({ name: "InvalidOutputError" })).toBe(
      "invalid_output",
    );
    expect(classifyError(new Error("x"))).toBe("ai_unavailable");
    expect(classifyError(undefined)).toBe("ai_unavailable");
  });
});
