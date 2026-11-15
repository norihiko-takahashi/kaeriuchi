import { describe, expect, it } from "vitest";
import type { StoredSession } from "@/server/auth/store";
import { parseConfig } from "@/server/config";
import { MemorySyncStore } from "@/server/sync/memory";
import { SyncService } from "@/server/sync/service";
import {
  classifyError,
  DAILY_LIMITS,
  DailyCounter,
  errorResponse,
  type GuardResult,
  guard,
} from "./guard";

const req = (childId?: string) =>
  new Request("http://localhost/api/ai/analyze", {
    method: "POST",
    headers: childId ? { "x-child-id": childId } : {},
  });

const noSession = async () => undefined;
const session = async () =>
  ({ guardianId: "g-1", deviceId: "d", hash: "h" }) as StoredSession;

describe("guard（BR-U2-3・BR-U2-4・U8 §6）", () => {
  const production = () =>
    parseConfig({
      APP_ENV: "production",
      APP_URL: "https://example.jp",
      AI_PROVIDER: "bedrock",
      SYNC_STORE: "postgres",
      DATABASE_URL: "postgres://app@db.example/kaeriuchi",
      DATABASE_CA_FILE: "/etc/ssl/rds.pem",
      AUTH_PROVIDER: "native",
      MAIL_FROM: "login@example.jp",
      BEDROCK_MODEL_ANALYZE: "anthropic.claude-sonnet-x",
      BEDROCK_MODEL_GENERATE: "anthropic.claude-sonnet-x",
      BEDROCK_MODEL_VERIFY: "anthropic.claude-haiku-x",
      BEDROCK_MODEL_GRADE: "anthropic.claude-haiku-x",
    });

  it("本番の環境では、ログインしていなければ AI の API を動かさない", async () => {
    const r = (await guard(req("child-12345678"), "analyze", {
      config: production(),
      session: noSession,
    })) as Response;
    expect(r.status).toBe(401);
    expect((await r.json()).error.code).toBe("unauthorized");
  });

  it("子どもの ID がなければ受け付けない", async () => {
    const res = await guard(req(), "analyze", {
      config: parseConfig({}),
      session: noSession,
    });
    expect((res as Response).status).toBe(400);
  });

  it("ログインしていないとき（開発・テスト）は、メモリで子どもごとに数え、requestId と時間切れの合図が付く", async () => {
    const counter = new DailyCounter({
      analyze: 1,
      classify: 1,
      generate: 1,
      grade: 1,
    });
    const deps = { config: parseConfig({}), counter, session: noSession };
    const ok = (await guard(
      req("child-12345678"),
      "analyze",
      deps,
    )) as GuardResult;
    expect(ok.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(ok.signal).toBeInstanceOf(AbortSignal);
    const second = (await guard(
      req("child-12345678"),
      "analyze",
      deps,
    )) as Response;
    expect(second.status).toBe(429);
    expect(
      await guard(req("child-87654321"), "analyze", deps),
    ).not.toBeInstanceOf(Response);
  });

  it("ログインしていれば、その保護者の子どもかを確かめて、データベースで数える", async () => {
    const service = new SyncService(new MemorySyncStore());
    const kid = {
      id: "child-12345678",
      guardianId: "g-1",
      nickname: "きつね",
      grade: "e2",
      displayMode: "lower",
      displayModeOverridden: false,
      gradeSchoolYear: 2026,
      avatar: { face: 0, color: 0, accessory: 0 },
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      version: 1,
    };
    await service.sync("g-1", 0, [
      { entity: "child", id: kid.id, op: "upsert", payload: kid },
    ]);
    const deps = {
      config: production(),
      session,
      sync: () => service,
    };
    expect(
      await guard(req("child-12345678"), "analyze", deps),
    ).not.toBeInstanceOf(Response);
    const unknown = (await guard(
      req("child-00000000"),
      "analyze",
      deps,
    )) as Response;
    expect(unknown.status).toBe(400);
    for (let i = 1; i < DAILY_LIMITS.analyze; i++)
      await guard(req("child-12345678"), "analyze", deps);
    const over = (await guard(
      req("child-12345678"),
      "analyze",
      deps,
    )) as Response;
    expect(over.status).toBe(429);
  });
});

describe("DailyCounter", () => {
  it("端末ごと・API ごとに数え、日本時間の日付が変わると数え直す", () => {
    const c = new DailyCounter({
      analyze: 2,
      classify: 1,
      generate: 1,
      grade: 1,
    });
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
