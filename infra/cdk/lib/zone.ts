import { CfnOutput, Fn, Stack, type StackProps } from "aws-cdk-lib";
import * as route53 from "aws-cdk-lib/aws-route53";
import type { Construct } from "constructs";
import type { EnvConfig } from "./config";

/**
 * Zone：かえりうち用のサブドメインのホストゾーン（Route 53）。
 * 最初にこのスタックだけをデプロイし、出てきた NS レコード（4つ）を、いまの DNS に足す（docs/deploy.md）。
 * そのあとでないと、証明書（ACM）と SES の確認が終わらない
 */
export class ZoneStack extends Stack {
  readonly zone: route53.PublicHostedZone;

  constructor(
    scope: Construct,
    id: string,
    config: EnvConfig,
    props: StackProps,
  ) {
    super(scope, id, props);
    this.zone = new route53.PublicHostedZone(this, "Zone", {
      zoneName: config.domain,
      comment: "kaeriuchi",
    });
    new CfnOutput(this, "NameServers", {
      description: "いまの DNS に、このサブドメインの NS レコードとして足す",
      value: Fn.join(" ", this.zone.hostedZoneNameServers ?? []),
    });
  }
}
