import { afterEach, describe, expect, it } from "vitest";
import { resetConfigForTesting } from "@/server/config";
import { GET } from "./route";

afterEach(() => {
  delete process.env.APP_ENV;
  resetConfigForTesting();
});

describe("GET /api/health/ready", () => {
  it("偽物の AI のときは、AWS には触れずに状態を返す", async () => {
    resetConfigForTesting();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "ok",
      aiProvider: "mock",
      aiApiEnabled: true,
    });
  });

  it("本番の環境では、AI の API は止まっていると伝える", async () => {
    process.env.APP_ENV = "staging";
    resetConfigForTesting();
    const body = await (await GET()).json();
    expect(body.appEnv).toBe("staging");
  });
});
