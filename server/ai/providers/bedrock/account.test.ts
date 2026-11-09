import {
  BedrockClient,
  GetModelInvocationLoggingConfigurationCommand,
} from "@aws-sdk/client-bedrock";
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type InvocationLoggingStatus,
  loggingBlocksAi,
  loggingWarnings,
  readAccountStatus,
} from "./account";

const sts = mockClient(STSClient);
const bedrock = mockClient(BedrockClient);
const logs = mockClient(CloudWatchLogsClient);
const region = "ap-northeast-1";
const clients = () => ({
  sts: new STSClient({ region }),
  bedrock: new BedrockClient({ region }),
  logs: new CloudWatchLogsClient({ region }),
});

beforeEach(() => {
  sts.reset();
  bedrock.reset();
  logs.reset();
  sts.on(GetCallerIdentityCommand).resolves({ Account: "123456789012" });
});

describe("readAccountStatus", () => {
  it("アカウントの末尾4桁と、呼び出しの記録の設定（文章だけ・30日）を読む", async () => {
    bedrock.on(GetModelInvocationLoggingConfigurationCommand).resolves({
      loggingConfig: {
        cloudWatchConfig: {
          logGroupName: "/kaeriuchi/bedrock",
          roleArn: "arn:x",
        },
        textDataDeliveryEnabled: true,
        imageDataDeliveryEnabled: false,
      },
    });
    logs.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: "/kaeriuchi/bedrock", retentionInDays: 30 }],
    });
    const s = await readAccountStatus(clients(), region);
    expect(s.accountLast4).toBe("9012");
    expect(s.logging).toMatchObject({
      enabled: true,
      textDataDeliveryEnabled: true,
      imageDataDeliveryEnabled: false,
      destination: "cloudwatch",
      retentionDays: 30,
    });
    expect(loggingBlocksAi(s.logging)).toBe(false);
    expect(loggingWarnings(s.logging, 30)).toEqual([]);
  });

  it("画像を記録するかの項目がなければ、安全のため「記録される」とみなして止める", async () => {
    bedrock.on(GetModelInvocationLoggingConfigurationCommand).resolves({
      loggingConfig: {
        s3Config: { bucketName: "b" },
        textDataDeliveryEnabled: true,
      },
    });
    const s = await readAccountStatus(clients(), region);
    expect(s.logging.imageDataDeliveryEnabled).toBe(true);
    expect(s.logging.destination).toBe("s3");
    expect(loggingBlocksAi(s.logging)).toBe(true);
  });

  it("記録の設定がなければ、オフとして扱う", async () => {
    bedrock.on(GetModelInvocationLoggingConfigurationCommand).resolves({});
    const s = await readAccountStatus(clients(), region);
    expect(s.logging).toMatchObject({ enabled: false, destination: "none" });
    expect(loggingBlocksAi(s.logging)).toBe(false);
  });

  it("保持期間を読めなくても、止めずに続ける", async () => {
    bedrock.on(GetModelInvocationLoggingConfigurationCommand).resolves({
      loggingConfig: {
        cloudWatchConfig: { logGroupName: "/g", roleArn: "arn:x" },
        s3Config: { bucketName: "b" },
        imageDataDeliveryEnabled: false,
      },
    });
    logs.on(DescribeLogGroupsCommand).rejects(new Error("denied"));
    const s = await readAccountStatus(clients(), region);
    expect(s.logging.destination).toBe("cloudwatch+s3");
    expect(s.logging.retentionDays).toBeUndefined();
  });

  it("ロググループが見つからなければ、保持期間は不明", async () => {
    bedrock.on(GetModelInvocationLoggingConfigurationCommand).resolves({
      loggingConfig: {
        cloudWatchConfig: { logGroupName: "/g", roleArn: "arn:x" },
        imageDataDeliveryEnabled: false,
      },
    });
    logs.on(DescribeLogGroupsCommand).resolves({ logGroups: [] });
    expect(
      (await readAccountStatus(clients(), region)).logging.retentionDays,
    ).toBeUndefined();
  });
});

describe("loggingWarnings", () => {
  const base: InvocationLoggingStatus = {
    enabled: true,
    textDataDeliveryEnabled: true,
    imageDataDeliveryEnabled: false,
    destination: "cloudwatch",
    retentionDays: 30,
  };

  it("画像も記録される設定なら、止めていることを伝える", () => {
    expect(
      loggingWarnings({ ...base, imageDataDeliveryEnabled: true }, 30)[0],
    ).toContain("止めています");
  });
  it("記録がオフなら、オンにすることを勧める", () => {
    expect(
      loggingWarnings({ ...base, enabled: false, destination: "none" }, 30)[0],
    ).toContain("オフ");
  });
  it("保存期間が長い、または無期限なら警告する", () => {
    expect(loggingWarnings({ ...base, retentionDays: 365 }, 30)[0]).toContain(
      "365",
    );
    expect(loggingWarnings({ ...base, retentionDays: null }, 30)[0]).toContain(
      "無期限",
    );
  });
  it("S3 に保存しているなら、保存期間の確認を促す", () => {
    expect(loggingWarnings({ ...base, destination: "s3" }, 30)[0]).toContain(
      "S3",
    );
  });
});
