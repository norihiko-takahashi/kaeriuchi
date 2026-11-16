import { Duration, Stack, type StackProps } from "aws-cdk-lib";
import type * as route53 from "aws-cdk-lib/aws-route53";
import * as r53 from "aws-cdk-lib/aws-route53";
import * as ses from "aws-cdk-lib/aws-ses";
import type { Construct } from "constructs";
import type { EnvConfig } from "./config";

/**
 * Mail：ログイン用のメールの送信元（SES）。
 * サブドメインを SES で確かめ（DKIM・Route 53 に自動で記録）、送信元のドメイン（MAIL FROM）と DMARC を設定する。
 * 「試しの状態」を外す申請は、手で行う（docs/deploy.md）
 */
export class MailStack extends Stack {
  readonly identity: ses.EmailIdentity;
  readonly configurationSet: ses.ConfigurationSet;
  readonly mailFrom: string;

  constructor(
    scope: Construct,
    id: string,
    config: EnvConfig,
    zone: route53.IPublicHostedZone,
    props: StackProps,
  ) {
    super(scope, id, props);
    this.configurationSet = new ses.ConfigurationSet(this, "Config", {
      // 届かなかった・迷惑メールにされたアドレスには、送らない
      suppressionReasons: ses.SuppressionReasons.BOUNCES_AND_COMPLAINTS,
      sendingEnabled: true,
    });
    this.identity = new ses.EmailIdentity(this, "Identity", {
      identity: ses.Identity.publicHostedZone(zone),
      mailFromDomain: `mail.${config.domain}`,
      configurationSet: this.configurationSet,
    });
    // なりすましのメールを受け取った側で捨ててもらう（SPF は MAIL FROM、DKIM は SES の鍵でそろう）
    new r53.TxtRecord(this, "Dmarc", {
      zone,
      recordName: `_dmarc.${config.domain}`,
      values: ["v=DMARC1; p=quarantine; adkim=s; aspf=s"],
      ttl: Duration.hours(1),
    });
    this.mailFrom = `login@${config.domain}`;
  }
}
