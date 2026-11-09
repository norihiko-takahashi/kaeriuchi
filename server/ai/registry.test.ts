import {
  BedrockClient,
  GetModelInvocationLoggingConfigurationCommand,
} from "@aws-sdk/client-bedrock";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { parseConfig } from "@/server/config";
import {
  aiAllowed,
  getAccountStatus,
  getProvider,
  resetRegistryForTesting,
} from "./registry";

const sts = mockClient(STSClient);
const bedrock = mockClient(BedrockClient);

const bedrockConfig = parseConfig({
  AI_PROVIDER: "bedrock",
  AWS_PROFILE: "personal",
  BEDROCK_MODEL_ANALYZE: "anthropic.claude-sonnet-x",
  BEDROCK_MODEL_GENERATE: "anthropic.claude-sonnet-x",
  BEDROCK_MODEL_VERIFY: "anthropic.claude-haiku-x",
  BEDROCK_MODEL_GRADE: "anthropic.claude-haiku-x",
});

beforeEach(() => {
  resetRegistryForTesting();
  sts.reset();
  bedrock.reset();
  sts.on(GetCallerIdentityCommand).resolves({ Account: "111122223333" });
});

describe("registry", () => {
  it("設定に合わせてプロバイダーを選ぶ", () => {
    expect(getProvider(parseConfig({})).name).toBe("mock");
    resetRegistryForTesting();
    expect(getProvider(bedrockConfig).name).toBe("bedrock");
  });

  it("まだ使えないプロバイダーはエラー", () => {
    expect(() =>
      getProvider(parseConfig({ AI_PROVIDER: "anthropic" })),
    ).toThrow();
  });

  it("Mock なら、いつでも動かしてよい", async () => {
    expect(await aiAllowed(parseConfig({}))).toBe(true);
    expect(await getAccountStatus(parseConfig({}))).toEqual({});
  });

  it("Bedrock で、画像を記録しない設定なら動かしてよい。結果は少しのあいだ覚えておく", async () => {
    bedrock.on(GetModelInvocationLoggingConfigurationCommand).resolves({
      loggingConfig: {
        s3Config: { bucketName: "b" },
        textDataDeliveryEnabled: true,
        imageDataDeliveryEnabled: false,
      },
    });
    expect(await aiAllowed(bedrockConfig)).toBe(true);
    expect((await getAccountStatus(bedrockConfig)).status?.accountLast4).toBe(
      "3333",
    );
    expect(sts.commandCalls(GetCallerIdentityCommand)).toHaveLength(1);
  });

  it("画像も記録する設定なら止める", async () => {
    bedrock.on(GetModelInvocationLoggingConfigurationCommand).resolves({
      loggingConfig: {
        s3Config: { bucketName: "b" },
        imageDataDeliveryEnabled: true,
      },
    });
    expect(await aiAllowed(bedrockConfig)).toBe(false);
  });

  it("設定を読めなければ、安全のため止める", async () => {
    bedrock
      .on(GetModelInvocationLoggingConfigurationCommand)
      .rejects(
        Object.assign(new Error("x"), { name: "AccessDeniedException" }),
      );
    expect(await aiAllowed(bedrockConfig)).toBe(false);
    expect((await getAccountStatus(bedrockConfig)).error).toContain(
      "AccessDeniedException",
    );
  });
});
