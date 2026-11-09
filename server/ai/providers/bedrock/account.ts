import "server-only";
import {
  BedrockClient,
  GetModelInvocationLoggingConfigurationCommand,
} from "@aws-sdk/client-bedrock";
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

/**
 * つながっている AWS アカウントと、Bedrock の呼び出しの記録の設定を確かめる。
 * - 社用と個人用の取り違えを防ぐため、アカウントの末尾4桁を出す
 * - 画像が記録される設定なら、AI の API を止める（U2-PRIV-3）
 */

export interface InvocationLoggingStatus {
  enabled: boolean;
  textDataDeliveryEnabled: boolean;
  imageDataDeliveryEnabled: boolean;
  destination: "cloudwatch" | "s3" | "cloudwatch+s3" | "none";
  cloudWatchLogGroup?: string;
  /** CloudWatch Logs の保持期間（日）。無期限なら null。読めなければ undefined */
  retentionDays?: number | null;
}

export interface AccountStatus {
  accountLast4: string;
  region: string;
  logging: InvocationLoggingStatus;
}

export interface AccountClients {
  sts: STSClient;
  bedrock: BedrockClient;
  logs: CloudWatchLogsClient;
}

export function createAccountClients(
  region: string,
  profile?: string,
): AccountClients {
  const credentials = fromNodeProviderChain(profile ? { profile } : {});
  return {
    sts: new STSClient({ region, credentials }),
    bedrock: new BedrockClient({ region, credentials }),
    logs: new CloudWatchLogsClient({ region, credentials }),
  };
}

export async function readAccountStatus(
  clients: AccountClients,
  region: string,
): Promise<AccountStatus> {
  const identity = await clients.sts.send(new GetCallerIdentityCommand({}));
  const cfg = await clients.bedrock.send(
    new GetModelInvocationLoggingConfigurationCommand({}),
  );
  const lc = cfg.loggingConfig;
  const cw = lc?.cloudWatchConfig?.logGroupName;
  const s3 = lc?.s3Config?.bucketName;
  const logging: InvocationLoggingStatus = {
    enabled: Boolean(lc && (cw || s3)),
    textDataDeliveryEnabled: lc?.textDataDeliveryEnabled ?? false,
    // 項目がないときは、安全のために「画像も記録される」とみなす
    imageDataDeliveryEnabled: lc
      ? (lc.imageDataDeliveryEnabled ?? true)
      : false,
    destination:
      cw && s3 ? "cloudwatch+s3" : cw ? "cloudwatch" : s3 ? "s3" : "none",
    cloudWatchLogGroup: cw,
  };
  if (cw) {
    try {
      const groups = await clients.logs.send(
        new DescribeLogGroupsCommand({ logGroupNamePrefix: cw, limit: 5 }),
      );
      const group = groups.logGroups?.find((g) => g.logGroupName === cw);
      logging.retentionDays = group
        ? (group.retentionInDays ?? null)
        : undefined;
    } catch {
      logging.retentionDays = undefined;
    }
  }
  return {
    accountLast4: (identity.Account ?? "????").slice(-4),
    region,
    logging,
  };
}

/** AI の API を動かしてよいか。画像が記録される設定なら動かさない */
export function loggingBlocksAi(logging: InvocationLoggingStatus): boolean {
  return logging.enabled && logging.imageDataDeliveryEnabled;
}

export function loggingWarnings(
  logging: InvocationLoggingStatus,
  maxRetentionDays: number,
): string[] {
  const warnings: string[] = [];
  if (loggingBlocksAi(logging)) {
    warnings.push(
      "Bedrock の呼び出しの記録で、画像も記録される設定になっています。子どもの写真が保存されるため、AI の API を止めています（imageDataDeliveryEnabled を false にしてください）",
    );
  }
  if (!logging.enabled) {
    warnings.push(
      "Bedrock の呼び出しの記録がオフです。不正利用の調査や監査のため、文章だけを記録する設定にすることを勧めます",
    );
  }
  if (
    logging.destination.includes("cloudwatch") &&
    (logging.retentionDays === null ||
      (typeof logging.retentionDays === "number" &&
        logging.retentionDays > maxRetentionDays))
  ) {
    warnings.push(
      `呼び出しの記録の保存期間が ${maxRetentionDays} 日より長くなっています（${logging.retentionDays ?? "無期限"}）`,
    );
  }
  if (logging.destination.includes("s3")) {
    warnings.push(
      "呼び出しの記録を S3 にも保存しています。S3 の保存期間の設定（ライフサイクル）を確かめてください（アプリからは確かめていません）",
    );
  }
  return warnings;
}
