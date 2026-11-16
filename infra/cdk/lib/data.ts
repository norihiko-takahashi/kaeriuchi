import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
import { InstanceType } from "aws-cdk-lib/aws-ec2";
import * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import type { EnvConfig } from "./config";

export const DB_NAME = "kaeriuchi";
/** 表の持ち主（移行だけで使う） */
export const ADMIN_USER = "kaeriuchi_admin";
/** アプリの役割（RLS が効く・server/db/migrations/0001_init.sql） */
export const APP_USER = "kaeriuchi_app";

/**
 * Data：RDS for PostgreSQL・パスワード（Secrets Manager）・保存の暗号化の鍵（KMS）。
 * 隔離サブネットに置き、アプリからだけつなげる。保存時は KMS で暗号化、通信は TLS だけ（U8-PRIV-3）。
 * バックアップは毎日・7日分（東京リージョンの中だけ）。
 */
export class DataStack extends Stack {
  readonly db: rds.DatabaseInstance;
  readonly adminSecret: secrets.ISecret;
  readonly appSecret: secrets.Secret;
  readonly key: kms.Key;

  constructor(
    scope: Construct,
    id: string,
    config: EnvConfig,
    net: { vpc: ec2.IVpc; dbSg: ec2.ISecurityGroup },
    props: StackProps,
  ) {
    super(scope, id, props);

    this.key = new kms.Key(this, "Key", {
      description: "kaeriuchi: database storage",
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const params = new rds.ParameterGroup(this, "Params", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_17,
      }),
      parameters: {
        // TLS でない接続は受けない
        "rds.force_ssl": "1",
        // 実行した SQL（中身に記録が入る）はログに出さない。遅いものだけ時間を出す
        log_statement: "none",
        log_min_duration_statement: "1000",
      },
    });

    this.db = new rds.DatabaseInstance(this, "Db", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_17,
      }),
      instanceType: new InstanceType(config.dbInstanceType),
      vpc: net.vpc,
      vpcSubnets: { subnetGroupName: "data" },
      securityGroups: [net.dbSg],
      multiAz: config.dbMultiAz,
      publiclyAccessible: false,
      databaseName: DB_NAME,
      // パスワードは Secrets Manager の AWS が管理する鍵で暗号化する
      // （自分の鍵にすると、鍵の許可でアプリのスタックとの参照が循環する）
      credentials: rds.Credentials.fromGeneratedSecret(ADMIN_USER),
      parameterGroup: params,
      caCertificate: rds.CaCertificate.RDS_CA_RSA2048_G1,
      storageType: rds.StorageType.GP3,
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      storageEncrypted: true,
      storageEncryptionKey: this.key,
      backupRetention: Duration.days(7),
      preferredBackupWindow: "18:00-18:30", // 日本時間 3:00〜3:30
      preferredMaintenanceWindow: "sun:19:00-sun:19:30", // 日本時間 月曜 4:00〜4:30
      autoMinorVersionUpgrade: true,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.SNAPSHOT,
      cloudwatchLogsExports: ["postgresql"],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_MONTH,
      enablePerformanceInsights: false,
      copyTagsToSnapshot: true,
    });
    if (!this.db.secret)
      throw new Error("データベースのパスワードがありません");
    this.adminSecret = this.db.secret;

    // アプリの役割のパスワード（移行のときに kaeriuchi_app に付ける）
    this.appSecret = new secrets.Secret(this, "AppDbPassword", {
      description: "kaeriuchi: password of the app role (kaeriuchi_app)",
      generateSecretString: {
        passwordLength: 40,
        excludePunctuation: true,
      },
    });
  }
}
