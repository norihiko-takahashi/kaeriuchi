import { Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type { Construct } from "constructs";
import type { EnvConfig } from "./config";

/**
 * Network：VPC（2つの AZ）と、通信の許可（セキュリティグループ）。
 * - 公開サブネット：ALB（β版はアプリも。公開 IP はあるが、入ってくる通信は ALB からだけ）
 * - 隔離サブネット：データベース（外とは通信できない）
 * - 本番（egress: endpoints）：アプリは隔離サブネットに置き、AWS のサービスへは VPC エンドポイントだけで出る
 * NAT ゲートウェイは置かない（2026-11-14 に決定）
 */
/** 使う AZ（どのアカウントにもある 1a・1c）。名前で決めて、調べるために AWS を呼ばない */
export const AZS = ["ap-northeast-1a", "ap-northeast-1c"];

export class NetworkStack extends Stack {
  readonly vpc: ec2.Vpc;
  readonly albSg: ec2.SecurityGroup;
  readonly appSg: ec2.SecurityGroup;
  readonly dbSg: ec2.SecurityGroup;
  readonly appSubnets: ec2.SubnetSelection;
  readonly assignPublicIp: boolean;

  override get availabilityZones(): string[] {
    return AZS;
  }

  constructor(
    scope: Construct,
    id: string,
    config: EnvConfig,
    props: StackProps,
  ) {
    super(scope, id, props);
    const endpoints = config.egress === "endpoints";

    this.vpc = new ec2.Vpc(this, "Vpc", {
      ipAddresses: ec2.IpAddresses.cidr("10.40.0.0/16"),
      availabilityZones: AZS,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        {
          name: "data",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
        ...(endpoints
          ? [
              {
                name: "app",
                subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                cidrMask: 24,
              },
            ]
          : []),
      ],
      // 使わない既定のセキュリティグループのルールを消す
      restrictDefaultSecurityGroup: true,
    });
    this.appSubnets = endpoints
      ? { subnetGroupName: "app" }
      : { subnetType: ec2.SubnetType.PUBLIC };
    this.assignPublicIp = !endpoints;

    this.albSg = new ec2.SecurityGroup(this, "AlbSg", {
      vpc: this.vpc,
      description: "ALB: HTTPS from the internet",
      allowAllOutbound: false,
    });
    this.albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS");
    this.albSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "HTTP (redirect to HTTPS)",
    );

    this.appSg = new ec2.SecurityGroup(this, "AppSg", {
      vpc: this.vpc,
      description: "App: only from the ALB",
      // AWS のサービス（Bedrock・SES など）へ HTTPS で出る。β版は公開サブネットから。
      // 本番の隔離サブネットにはインターネットへの道がないので、出られるのはエンドポイントと S3 のゲートウェイだけ
      allowAllOutbound: false,
    });
    this.appSg.addIngressRule(this.albSg, ec2.Port.tcp(3000), "From ALB");
    this.albSg.addEgressRule(this.appSg, ec2.Port.tcp(3000), "To app");
    this.appSg.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "HTTPS to AWS services",
    );

    this.dbSg = new ec2.SecurityGroup(this, "DbSg", {
      vpc: this.vpc,
      description: "Database: only from the app",
      allowAllOutbound: false,
    });
    this.dbSg.addIngressRule(this.appSg, ec2.Port.tcp(5432), "From app");
    this.appSg.addEgressRule(this.dbSg, ec2.Port.tcp(5432), "To database");

    if (endpoints) {
      this.vpc.addGatewayEndpoint("S3", {
        service: ec2.GatewayVpcEndpointAwsService.S3,
        subnets: [this.appSubnets],
      });
      const endpointSg = new ec2.SecurityGroup(this, "EndpointSg", {
        vpc: this.vpc,
        description: "VPC endpoints: only from the app",
        allowAllOutbound: false,
      });
      endpointSg.addIngressRule(this.appSg, ec2.Port.tcp(443), "From app");
      const services = {
        Ecr: ec2.InterfaceVpcEndpointAwsService.ECR,
        EcrDocker: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
        Logs: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
        Secrets: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
        BedrockRuntime: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
        Email: ec2.InterfaceVpcEndpointAwsService.EMAIL,
      };
      for (const [name, service] of Object.entries(services))
        this.vpc.addInterfaceEndpoint(name, {
          service,
          subnets: this.appSubnets,
          securityGroups: [endpointSg],
          privateDnsEnabled: true,
        });
    }
  }
}
