/**
 * 環境ごとの設定（infrastructure-design.md §1・§2）。
 * 個人のドメイン・メールアドレス・アカウントの番号は、リポジトリに入れない。
 * デプロイのときに、環境変数（docs/deploy.md）から読む。
 */

export const REGION = "ap-northeast-1";

export interface BedrockModels {
  analyze: string;
  generate: string;
  verify: string;
  grade: string;
}

export interface EnvConfig {
  /** スタックの名前の頭（例：KaeriuchiBeta） */
  name: string;
  account: string;
  /** かえりうち用のサブドメイン（Route 53 に任せる。例：kaeriuchi.example.jp） */
  domain: string;
  /** 費用とアラームの知らせを受けるメールアドレス */
  alertEmail: string;
  /**
   * アプリから AWS のサービスへの出口（2026-11-14 に決定）。
   * public：公開サブネットに置く（β版）／endpoints：VPC エンドポイントだけ（本番）
   */
  egress: "public" | "endpoints";
  /** アプリの台数（β版は1台） */
  appCount: number;
  /** データベースの大きさ（β版は db.t4g.micro・1台） */
  dbInstanceType: string;
  dbMultiAz: boolean;
  /** WAF（β版は入れない・本番は入れる） */
  waf: boolean;
  /** 費用の知らせ（USD。AWS Budgets は USD で数える。β版は 1万円 ≒ 65 USD） */
  budgetUsd: number;
  bedrockModels: BedrockModels;
  /** ECR のイメージのタグ（git のコミット） */
  imageTag: string;
}

export const BETA_DEFAULTS = {
  name: "KaeriuchiBeta",
  egress: "public",
  appCount: 1,
  dbInstanceType: "t4g.micro",
  dbMultiAz: false,
  waf: false,
  budgetUsd: 65,
} as const satisfies Partial<EnvConfig>;

const CROSS_REGION_PREFIX = /^(us|eu|apac|jp|global|au|ca)\./i;

/** 環境変数から β版の設定を作る。足りなければ、何が足りないかを出して止める */
export function betaConfigFromEnv(
  env: Record<string, string | undefined>,
): EnvConfig {
  const need = (key: string) => {
    const v = env[key]?.trim();
    if (!v) throw new Error(`${key} を設定してください（docs/deploy.md）`);
    return v;
  };
  const models: BedrockModels = {
    analyze: need("BEDROCK_MODEL_ANALYZE"),
    generate: need("BEDROCK_MODEL_GENERATE"),
    verify: need("BEDROCK_MODEL_VERIFY"),
    grade: need("BEDROCK_MODEL_GRADE"),
  };
  // リージョンをまたぐ推論のプロファイルは使わない（BR-U2-2。アプリの設定と同じ確認）
  for (const id of Object.values(models))
    if (CROSS_REGION_PREFIX.test(id))
      throw new Error(
        `リージョンをまたぐ推論のプロファイルは使いません: ${id}`,
      );
  const config: EnvConfig = {
    ...BETA_DEFAULTS,
    account: need("KAERIUCHI_AWS_ACCOUNT"),
    domain: need("KAERIUCHI_DOMAIN").toLowerCase(),
    alertEmail: need("KAERIUCHI_ALERT_EMAIL"),
    bedrockModels: models,
    imageTag: env.KAERIUCHI_IMAGE_TAG?.trim() || "bootstrap",
  };
  // いまの認証情報（AWS_PROFILE）のアカウントが、指定したアカウントと違えば止める（社用と個人用の取り違えを防ぐ）。
  // リージョンは、どのスタックも東京に固定している
  if (env.CDK_DEFAULT_ACCOUNT && env.CDK_DEFAULT_ACCOUNT !== config.account)
    throw new Error(
      `いまの認証情報のアカウント（${env.CDK_DEFAULT_ACCOUNT}）が、KAERIUCHI_AWS_ACCOUNT と違います。AWS_PROFILE を確かめてください`,
    );
  if (!/^\d{12}$/.test(config.account))
    throw new Error("KAERIUCHI_AWS_ACCOUNT は12けたの数字です");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(config.domain))
    throw new Error(
      `KAERIUCHI_DOMAIN の形が正しくありません: ${config.domain}`,
    );
  return config;
}
