import { describe, expect, it } from "vitest";
import { parseConfig } from "./config";

describe("設定（U1-PORT-3）", () => {
  it("何も指定しなければ、開発用の設定になる", () => {
    expect(parseConfig({})).toMatchObject({
      APP_ENV: "local",
      AI_PROVIDER: "mock",
      SYNC_STORE: "memory",
      AUTH_PROVIDER: "dev",
    });
  });

  it("本番の環境で開発用の設定のままなら、起動しない", () => {
    expect(() => parseConfig({ APP_ENV: "production" })).toThrow(
      /AI_PROVIDER=mock, SYNC_STORE=memory, AUTH_PROVIDER=dev/,
    );
  });

  it("本番の設定がそろっていれば通る", () => {
    expect(
      parseConfig({
        APP_ENV: "production",
        APP_URL: "https://kaeriuchi.example",
        AI_PROVIDER: "bedrock",
        SYNC_STORE: "postgres",
        AUTH_PROVIDER: "authjs",
      }).AI_PROVIDER,
    ).toBe("bedrock");
  });

  it("知らない値はエラー", () => {
    expect(() => parseConfig({ AI_PROVIDER: "unknown" })).toThrow();
  });
});
