import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import {
  BETA_DEFAULTS,
  betaConfigFromEnv,
  type EnvConfig,
} from "../lib/config";
import { buildKaeriuchi } from "../lib/kaeriuchi";

/**
 * AWS には触らずに、構成（CloudFormation のテンプレート）を作って確かめる（infrastructure-design.md §2）。
 * スナップショットは、構成の変わり目をレビューで見るためのもの（pnpm test:update で更新）
 */

const env = {
  KAERIUCHI_AWS_ACCOUNT: "123456789012",
  KAERIUCHI_DOMAIN: "kaeriuchi.example.jp",
  KAERIUCHI_ALERT_EMAIL: "alerts@example.jp",
  KAERIUCHI_OPERATOR_NAME: "運営者テスト",
  BEDROCK_MODEL_ANALYZE: "anthropic.claude-sonnet-test-v1:0",
  BEDROCK_MODEL_GENERATE: "anthropic.claude-sonnet-test-v1:0",
  BEDROCK_MODEL_VERIFY: "anthropic.claude-haiku-test-v1:0",
  BEDROCK_MODEL_GRADE: "anthropic.claude-haiku-test-v1:0",
  KAERIUCHI_IMAGE_TAG: "abc1234",
};

function build(overrides: Partial<EnvConfig> = {}) {
  const app = new App({
    context: { "@aws-cdk/core:defaultCrossStackReferences": "strong" },
  });
  const stacks = buildKaeriuchi(app, {
    ...betaConfigFromEnv(env),
    ...overrides,
  });
  const t = Object.fromEntries(
    Object.entries(stacks).map(([k, s]) => [k, Template.fromStack(s)]),
  ) as Record<keyof typeof stacks, Template>;
  return { app, t };
}

describe("設定", () => {
  it("足りない値があれば止める。違うアカウント・リージョンをまたぐモデルは使わない", () => {
    expect(() => betaConfigFromEnv({})).toThrow(/BEDROCK_MODEL_ANALYZE/);
    expect(() =>
      betaConfigFromEnv({ ...env, CDK_DEFAULT_ACCOUNT: "999999999999" }),
    ).toThrow(/AWS_PROFILE/);
    expect(() =>
      betaConfigFromEnv({ ...env, KAERIUCHI_AWS_ACCOUNT: "12" }),
    ).toThrow(/12けた/);
    expect(() =>
      betaConfigFromEnv({ ...env, BEDROCK_MODEL_GRADE: "apac.anthropic.x" }),
    ).toThrow(/リージョンをまたぐ/);
    expect(() =>
      betaConfigFromEnv({ ...env, KAERIUCHI_DOMAIN: "not a domain" }),
    ).toThrow(/形/);
    expect(betaConfigFromEnv(env)).toMatchObject(BETA_DEFAULTS);
  });
});

describe("β版の構成", () => {
  const { app, t } = build();

  it("すべてのスタックを、循環なく作れる", () => {
    const asm = app.synth();
    expect(asm.stacks.map((s) => s.stackName).sort()).toEqual(
      [
        "KaeriuchiBeta-App",
        "KaeriuchiBeta-Data",
        "KaeriuchiBeta-Mail",
        "KaeriuchiBeta-Network",
        "KaeriuchiBeta-Ops",
        "KaeriuchiBeta-Repo",
        "KaeriuchiBeta-Zone",
      ].sort(),
    );
  });

  it("NAT ゲートウェイも VPC エンドポイントも置かない（出口は公開サブネット）", () => {
    t.network.resourceCountIs("AWS::EC2::NatGateway", 0);
    t.network.resourceCountIs("AWS::EC2::VPCEndpoint", 0);
  });

  it("アプリには ALB からだけ、データベースにはアプリからだけ入れる", () => {
    const ingress = t.network.findResources("AWS::EC2::SecurityGroupIngress");
    const rules = Object.values(ingress).map(
      (r) => (r as { Properties: Record<string, unknown> }).Properties,
    );
    expect(rules.filter((r) => r.FromPort === 3000)).toHaveLength(1);
    expect(rules.filter((r) => r.FromPort === 5432)).toHaveLength(1);
    for (const r of rules) expect(r).not.toHaveProperty("CidrIp");
    // インターネットから入れるのは ALB の 80・443 だけ
    t.network.hasResourceProperties("AWS::EC2::SecurityGroup", {
      GroupDescription: "ALB: HTTPS from the internet",
      SecurityGroupIngress: [
        Match.objectLike({ CidrIp: "0.0.0.0/0", FromPort: 443 }),
        Match.objectLike({ CidrIp: "0.0.0.0/0", FromPort: 80 }),
      ],
    });
  });

  it("データベースは外から見えず、暗号化・TLS だけ・バックアップ7日・消せない設定", () => {
    t.data.hasResourceProperties("AWS::RDS::DBInstance", {
      Engine: "postgres",
      EngineVersion: "17",
      DBInstanceClass: "db.t4g.micro",
      MultiAZ: false,
      PubliclyAccessible: false,
      StorageEncrypted: true,
      BackupRetentionPeriod: 7,
      DeletionProtection: true,
      CACertificateIdentifier: "rds-ca-rsa2048-g1",
    });
    t.data.hasResourceProperties("AWS::RDS::DBParameterGroup", {
      Parameters: Match.objectLike({ "rds.force_ssl": "1" }),
    });
    t.data.hasResource("AWS::RDS::DBInstance", {
      DeletionPolicy: "Snapshot",
    });
  });

  it("アプリは Graviton・1台。パスワードは環境変数に書かず、Secrets Manager から入れる", () => {
    t.app.hasResourceProperties("AWS::ECS::TaskDefinition", {
      Cpu: "256",
      Memory: "1024",
      RuntimePlatform: { CpuArchitecture: "ARM64" },
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: "migrate",
          Essential: false,
          Secrets: Match.arrayWith([
            Match.objectLike({ Name: "DATABASE_ADMIN_PASSWORD" }),
          ]),
        }),
        Match.objectLike({
          Name: "app",
          Secrets: [Match.objectLike({ Name: "DATABASE_PASSWORD" })],
          DependsOn: [{ ContainerName: "migrate", Condition: "SUCCESS" }],
        }),
      ]),
    });
    t.app.hasResourceProperties("AWS::ECS::Service", {
      DesiredCount: 1,
      DeploymentConfiguration: Match.objectLike({
        MinimumHealthyPercent: 100,
        DeploymentCircuitBreaker: { Enable: true, Rollback: true },
      }),
      NetworkConfiguration: {
        AwsvpcConfiguration: Match.objectLike({ AssignPublicIp: "ENABLED" }),
      },
    });
    const text = JSON.stringify(t.app.toJSON());
    expect(text).not.toMatch(/PASSWORD"\s*,\s*"Value"/);
    // アプリのコンテナには、管理用のパスワードを渡さない
    const defs = Object.values(
      t.app.findResources("AWS::ECS::TaskDefinition"),
    ).flatMap(
      (r) =>
        (
          r as {
            Properties: {
              ContainerDefinitions: {
                Name: string;
                Secrets?: { Name: string }[];
              }[];
            };
          }
        ).Properties.ContainerDefinitions,
    );
    for (const d of defs.filter((d) => d.Name !== "migrate"))
      expect((d.Secrets ?? []).map((s) => s.Name)).not.toContain(
        "DATABASE_ADMIN_PASSWORD",
      );
  });

  it("アプリの権限は、東京の決まったモデルの Bedrock と、この送信元の SES だけ", () => {
    t.app.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: "InvokeKaeriuchiModelsInTokyoOnly",
            Resource: [
              "arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-sonnet-test-v1:0",
              "arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-haiku-test-v1:0",
            ],
          }),
          Match.objectLike({
            Sid: "SendLoginMail",
            Condition: {
              StringEquals: { "ses:FromAddress": "login@kaeriuchi.example.jp" },
            },
          }),
        ]),
      },
    });
  });

  it("HTTPS だけ（80 は 443 へ）。WAF は β版では入れない", () => {
    t.app.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
      Port: 443,
      Protocol: "HTTPS",
      SslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
    });
    t.app.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
      Port: 80,
      DefaultActions: [Match.objectLike({ Type: "redirect" })],
    });
    t.app.resourceCountIs("AWS::WAFv2::WebACL", 0);
  });

  it("毎日 日本時間 3:17 に、削除の処理を動かす", () => {
    t.app.hasResourceProperties("AWS::Scheduler::Schedule", {
      ScheduleExpression: "cron(17 3 * * ? *)",
      ScheduleExpressionTimezone: "Asia/Tokyo",
    });
  });

  it("SES はサブドメインで確かめ、MAIL FROM と DMARC を付ける", () => {
    t.mail.hasResourceProperties("AWS::SES::EmailIdentity", {
      EmailIdentity: "kaeriuchi.example.jp",
      MailFromAttributes: { MailFromDomain: "mail.kaeriuchi.example.jp" },
    });
    t.mail.hasResourceProperties("AWS::Route53::RecordSet", {
      Name: "_dmarc.kaeriuchi.example.jp.",
      Type: "TXT",
    });
  });

  it("費用は月 65 USD（約1万円）で知らせる", () => {
    t.ops.hasResourceProperties("AWS::Budgets::Budget", {
      Budget: Match.objectLike({
        BudgetLimit: { Amount: 65, Unit: "USD" },
        TimeUnit: "MONTHLY",
      }),
    });
  });

  it.each([
    "zone",
    "repo",
    "network",
    "mail",
    "data",
    "app",
    "ops",
  ] as const)("スナップショット：%s", (name) => {
    expect(t[name].toJSON()).toMatchSnapshot();
  });
});

describe("本番の構成（出口は VPC エンドポイント・WAF・2台）", () => {
  const { t } = build({
    name: "KaeriuchiProd",
    egress: "endpoints",
    appCount: 2,
    waf: true,
    dbMultiAz: true,
  });

  it("アプリは公開 IP なしで、AWS のサービスへはエンドポイントで出る", () => {
    t.network.resourceCountIs("AWS::EC2::NatGateway", 0);
    t.network.resourceCountIs("AWS::EC2::VPCEndpoint", 7);
    t.app.hasResourceProperties("AWS::ECS::Service", {
      DesiredCount: 2,
      NetworkConfiguration: {
        AwsvpcConfiguration: Match.objectLike({ AssignPublicIp: "DISABLED" }),
      },
    });
    t.data.hasResourceProperties("AWS::RDS::DBInstance", { MultiAZ: true });
  });

  it("WAF を ALB に付ける。写真と同期の本文の大きさは止めない", () => {
    t.app.resourceCountIs("AWS::WAFv2::WebACLAssociation", 1);
    t.app.hasResourceProperties("AWS::WAFv2::WebACL", {
      Rules: Match.arrayWith([
        Match.objectLike({
          Name: "AWSManagedRulesCommonRuleSet",
          Statement: {
            ManagedRuleGroupStatement: Match.objectLike({
              RuleActionOverrides: [
                { Name: "SizeRestrictions_BODY", ActionToUse: { Count: {} } },
              ],
            }),
          },
        }),
      ]),
    });
  });
});
