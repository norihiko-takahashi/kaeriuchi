import { describe, expect, it } from "vitest";
import { operatorOf, parseConfig } from "./config";

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
        DATABASE_URL: "postgres://app@db.example/kaeriuchi",
        DATABASE_CA_FILE: "/etc/ssl/rds.pem",
        AUTH_PROVIDER: "native",
        MAIL_FROM: "login@kaeriuchi.example",
        OPERATOR_NAME: "運営者",
        SUPPORT_EMAIL: "support@kaeriuchi.example",
        BEDROCK_MODEL_ANALYZE: "anthropic.claude-sonnet-x",
        BEDROCK_MODEL_GENERATE: "anthropic.claude-sonnet-x",
        BEDROCK_MODEL_VERIFY: "anthropic.claude-haiku-x",
        BEDROCK_MODEL_GRADE: "anthropic.claude-haiku-x",
      }).AI_PROVIDER,
    ).toBe("bedrock");
  });

  it("Postgres には接続先が要り、本番では証明書の場所も要る", () => {
    expect(() => parseConfig({ SYNC_STORE: "postgres" })).toThrow(
      /DATABASE_URL/,
    );
    expect(
      parseConfig({ SYNC_STORE: "postgres", DATABASE_URL: "postgres://x/y" })
        .SYNC_STORE,
    ).toBe("postgres");
    expect(() =>
      parseConfig({
        APP_ENV: "production",
        AI_PROVIDER: "bedrock",
        SYNC_STORE: "postgres",
        DATABASE_URL: "postgres://x/y",
        AUTH_PROVIDER: "native",
        MAIL_FROM: "a@b.jp",
        OPERATOR_NAME: "運営者",
        SUPPORT_EMAIL: "support@b.jp",
        BEDROCK_MODEL_ANALYZE: "anthropic.a",
        BEDROCK_MODEL_GENERATE: "anthropic.a",
        BEDROCK_MODEL_VERIFY: "anthropic.a",
        BEDROCK_MODEL_GRADE: "anthropic.a",
      }),
    ).toThrow(/DATABASE_CA_FILE/);
  });

  it("本番では、同意の文に出す運営者と問い合わせ先が要る", () => {
    expect(() =>
      parseConfig({
        APP_ENV: "production",
        AI_PROVIDER: "bedrock",
        SYNC_STORE: "postgres",
        DATABASE_URL: "postgres://x/y",
        DATABASE_CA_FILE: "/ca.pem",
        AUTH_PROVIDER: "native",
        MAIL_FROM: "a@b.jp",
        BEDROCK_MODEL_ANALYZE: "anthropic.a",
        BEDROCK_MODEL_GENERATE: "anthropic.a",
        BEDROCK_MODEL_VERIFY: "anthropic.a",
        BEDROCK_MODEL_GRADE: "anthropic.a",
      }),
    ).toThrow(/OPERATOR_NAME/);
    expect(operatorOf(parseConfig({})).name).toContain("開発用");
  });

  it("知らない値はエラー", () => {
    expect(() => parseConfig({ AI_PROVIDER: "unknown" })).toThrow();
  });
});

describe("Bedrock の設定（BR-U2-2）", () => {
  const models = {
    AI_PROVIDER: "bedrock",
    BEDROCK_MODEL_ANALYZE: "anthropic.claude-sonnet-x",
    BEDROCK_MODEL_GENERATE: "anthropic.claude-sonnet-x",
    BEDROCK_MODEL_VERIFY: "anthropic.claude-haiku-x",
    BEDROCK_MODEL_GRADE: "anthropic.claude-haiku-x",
  };

  it("東京リージョンで、役割ごとのモデルがそろっていれば通る。プロファイルで社用・個人用を切り替える", () => {
    const c = parseConfig({ ...models, AWS_PROFILE: "company" });
    expect(c.AWS_REGION).toBe("ap-northeast-1");
    expect(c.AWS_PROFILE).toBe("company");
  });

  it("東京以外のリージョンは使わない", () => {
    expect(() => parseConfig({ ...models, AWS_REGION: "us-east-1" })).toThrow(
      /東京リージョン/,
    );
  });

  it("モデル ID が足りなければエラー", () => {
    expect(() => parseConfig({ AI_PROVIDER: "bedrock" })).toThrow(
      /BEDROCK_MODEL_ANALYZE/,
    );
  });

  it.each([
    "apac.anthropic.claude-x",
    "global.anthropic.claude-x",
    "jp.anthropic.claude-x",
  ])("リージョンをまたぐ推論のプロファイル %s は使わない", (id) => {
    expect(() => parseConfig({ ...models, BEDROCK_MODEL_ANALYZE: id })).toThrow(
      /リージョンをまたぐ/,
    );
  });

  it("空の値は、指定していないものとして扱う", () => {
    expect(parseConfig({ AWS_PROFILE: "" }).AWS_PROFILE).toBeUndefined();
  });
});
