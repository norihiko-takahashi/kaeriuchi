import {
  CfnOutput,
  Duration,
  Stack,
  type StackProps,
  TimeZone,
} from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as schedulerTargets from "aws-cdk-lib/aws-scheduler-targets";
import type * as secrets from "aws-cdk-lib/aws-secretsmanager";
import type * as ses from "aws-cdk-lib/aws-ses";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import type { Construct } from "constructs";
import { type EnvConfig, REGION } from "./config";
import { ADMIN_USER, APP_USER, DB_NAME } from "./data";

/** イメージの中の、RDS の証明書の束（Dockerfile で入れる） */
export const DATABASE_CA_FILE = "/app/certs/rds-global-bundle.pem";

export interface AppDeps {
  net: {
    vpc: ec2.IVpc;
    albSg: ec2.ISecurityGroup;
    appSg: ec2.ISecurityGroup;
    appSubnets: ec2.SubnetSelection;
    assignPublicIp: boolean;
  };
  repository: ecr.IRepository;
  zone: route53.IPublicHostedZone;
  db: { host: string; port: string };
  adminSecret: secrets.ISecret;
  appSecret: secrets.ISecret;
  mail: {
    identity: ses.IEmailIdentity;
    configurationSet: ses.IConfigurationSet;
    mailFrom: string;
  };
}

/**
 * App：ALB（HTTPS）・ECS（Fargate・Graviton）・証明書・アプリの権限・毎日の削除。
 * - タスクの中で、移行（db-migrate）が終わってからアプリが起動する（同じイメージ・管理用のパスワードは移行のコンテナだけ）
 * - アプリの権限は最小：東京の決まったモデルの Bedrock・この送信元の SES だけ
 */
export class AppStack extends Stack {
  readonly cluster: ecs.Cluster;
  readonly service: ecs.FargateService;
  readonly alb: elbv2.ApplicationLoadBalancer;
  readonly targetGroup: elbv2.ApplicationTargetGroup;
  readonly purgeTask: ecs.FargateTaskDefinition;

  constructor(
    scope: Construct,
    id: string,
    config: EnvConfig,
    deps: AppDeps,
    props: StackProps,
  ) {
    super(scope, id, props);
    const { net } = deps;
    const image = ecs.ContainerImage.fromEcrRepository(
      deps.repository,
      config.imageTag,
    );
    const dbUrl = (user: string) =>
      `postgres://${user}@${deps.db.host}:${deps.db.port}/${DB_NAME}`;

    this.cluster = new ecs.Cluster(this, "Cluster", { vpc: net.vpc });
    const logGroup = new logs.LogGroup(this, "Logs", {
      retention: logs.RetentionDays.ONE_MONTH,
    });

    // アプリが使う AWS の権限（タスクのロール）
    const taskRole = new iam.Role(this, "TaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "kaeriuchi app: Bedrock (Tokyo models) and SES only",
    });
    const models = [...new Set(Object.values(config.bedrockModels))];
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "InvokeKaeriuchiModelsInTokyoOnly",
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ],
        resources: models.map(
          (m) => `arn:aws:bedrock:${REGION}::foundation-model/${m}`,
        ),
      }),
    );
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "ReadInvocationLoggingSettings",
        actions: ["bedrock:GetModelInvocationLoggingConfiguration"],
        resources: ["*"],
      }),
    );
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "ReadInvocationLogRetention",
        actions: ["logs:DescribeLogGroups"],
        resources: [`arn:aws:logs:${REGION}:${this.account}:log-group:*`],
      }),
    );
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "SendLoginMail",
        actions: ["ses:SendEmail"],
        resources: [
          deps.mail.identity.emailIdentityArn,
          this.formatArn({
            service: "ses",
            resource: "configuration-set",
            resourceName: deps.mail.configurationSet.configurationSetName,
          }),
        ],
        conditions: {
          StringEquals: { "ses:FromAddress": deps.mail.mailFrom },
        },
      }),
    );

    const task = new ecs.FargateTaskDefinition(this, "Task", {
      cpu: 256,
      memoryLimitMiB: 1024,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      taskRole,
    });
    const migrate = task.addContainer("migrate", {
      image,
      essential: false,
      command: ["node", "scripts/db-migrate.mjs"],
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: "migrate" }),
      environment: {
        DATABASE_ADMIN_URL: dbUrl(ADMIN_USER),
        DATABASE_CA_FILE,
      },
      secrets: {
        DATABASE_ADMIN_PASSWORD: ecs.Secret.fromSecretsManager(
          deps.adminSecret,
          "password",
        ),
        APP_DB_PASSWORD: ecs.Secret.fromSecretsManager(deps.appSecret),
      },
    });
    const app = task.addContainer("app", {
      image,
      essential: true,
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: "app" }),
      environment: {
        APP_ENV: "production",
        APP_URL: `https://${config.domain}`,
        AI_PROVIDER: "bedrock",
        SYNC_STORE: "postgres",
        AUTH_PROVIDER: "native",
        MAIL_FROM: deps.mail.mailFrom,
        DATABASE_URL: dbUrl(APP_USER),
        DATABASE_CA_FILE,
        AWS_REGION: REGION,
        BEDROCK_MODEL_ANALYZE: config.bedrockModels.analyze,
        BEDROCK_MODEL_GENERATE: config.bedrockModels.generate,
        BEDROCK_MODEL_VERIFY: config.bedrockModels.verify,
        BEDROCK_MODEL_GRADE: config.bedrockModels.grade,
      },
      secrets: {
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(deps.appSecret),
      },
      healthCheck: {
        command: [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
        ],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        startPeriod: Duration.seconds(30),
      },
    });
    // 表の形を新しくしてから、アプリを起動する
    app.addContainerDependencies({
      container: migrate,
      condition: ecs.ContainerDependencyCondition.SUCCESS,
    });

    this.service = new ecs.FargateService(this, "Service", {
      cluster: this.cluster,
      taskDefinition: task,
      desiredCount: config.appCount,
      vpcSubnets: net.appSubnets,
      assignPublicIp: net.assignPublicIp,
      securityGroups: [net.appSg],
      // 新しい版が動いてから古い版を止める。動かなければ前の版に戻す
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { enable: true, rollback: true },
      healthCheckGracePeriod: Duration.seconds(90),
    });

    // HTTPS（証明書は DNS で確かめる）
    const certificate = new acm.Certificate(this, "Cert", {
      domainName: config.domain,
      validation: acm.CertificateValidation.fromDns(deps.zone),
    });
    this.alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc: net.vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: net.albSg,
      dropInvalidHeaderFields: true,
    });
    this.alb.addRedirect({ sourcePort: 80, targetPort: 443 });
    const https = this.alb.addListener("Https", {
      port: 443,
      certificates: [certificate],
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
      open: false,
    });
    this.targetGroup = https.addTargets("App", {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [
        this.service.loadBalancerTarget({
          containerName: "app",
          containerPort: 3000,
        }),
      ],
      healthCheck: {
        path: "/api/health",
        healthyHttpCodes: "200",
        interval: Duration.seconds(15),
      },
      deregistrationDelay: Duration.seconds(30),
    });
    new route53.ARecord(this, "Alias", {
      zone: deps.zone,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(this.alb),
      ),
    });

    if (config.waf) this.addWaf();

    // 毎日1回の削除（U8-PRIV-2）。日本時間 3:17
    this.purgeTask = new ecs.FargateTaskDefinition(this, "PurgeTask", {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
    this.purgeTask.addContainer("purge", {
      image,
      command: ["node", "scripts/db-purge.mjs"],
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: "purge" }),
      environment: { DATABASE_URL: dbUrl(APP_USER), DATABASE_CA_FILE },
      secrets: {
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(deps.appSecret),
      },
    });
    new scheduler.Schedule(this, "Purge", {
      description: "kaeriuchi: purge records deleted 7+ days ago",
      schedule: scheduler.ScheduleExpression.cron({
        minute: "17",
        hour: "3",
        timeZone: TimeZone.ASIA_TOKYO,
      }),
      target: new schedulerTargets.EcsRunFargateTask(this.cluster, {
        taskDefinition: this.purgeTask,
        vpcSubnets: net.appSubnets,
        assignPublicIp: net.assignPublicIp,
        securityGroups: [net.appSg],
      }),
    });

    new CfnOutput(this, "Url", { value: `https://${config.domain}` });
    new CfnOutput(this, "ClusterName", { value: this.cluster.clusterName });
    new CfnOutput(this, "ServiceName", { value: this.service.serviceName });
  }

  /** 本番だけ：AWS が管理するルールと、接続元ごとの回数の上限 */
  private addWaf() {
    const managed = (
      name: string,
      priority: number,
      countOnly: string[] = [],
    ) => ({
      name,
      priority,
      overrideAction: { none: {} },
      statement: {
        managedRuleGroupStatement: {
          vendorName: "AWS",
          name,
          ruleActionOverrides: countOnly.map((rule) => ({
            name: rule,
            actionToUse: { count: {} },
          })),
        },
      },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: name,
        sampledRequestsEnabled: false,
      },
    });
    const acl = new wafv2.CfnWebACL(this, "Waf", {
      scope: "REGIONAL",
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "kaeriuchi",
        sampledRequestsEnabled: false,
      },
      rules: [
        managed("AWSManagedRulesAmazonIpReputationList", 1),
        managed("AWSManagedRulesKnownBadInputsRuleSet", 2),
        // 写真（最大数 MB）と同期（最大 1MB）は、本文が 8KB を超えるので、本文の大きさのルールは数えるだけ
        managed("AWSManagedRulesCommonRuleSet", 3, ["SizeRestrictions_BODY"]),
        {
          name: "RatePerIp",
          priority: 10,
          action: { block: {} },
          statement: {
            rateBasedStatement: { limit: 1500, aggregateKeyType: "IP" },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "RatePerIp",
            sampledRequestsEnabled: false,
          },
        },
      ],
    });
    new wafv2.CfnWebACLAssociation(this, "WafAlb", {
      resourceArn: this.alb.loadBalancerArn,
      webAclArn: acl.attrArn,
    });
  }
}
