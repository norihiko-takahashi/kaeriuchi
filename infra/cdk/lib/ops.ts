import { Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import type * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import type * as rds from "aws-cdk-lib/aws-rds";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import type { Construct } from "constructs";
import type { EnvConfig } from "./config";

/**
 * Ops：費用の知らせ（AWS Budgets）と、アラーム（メールで知らせる）。
 */
export class OpsStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    config: EnvConfig,
    deps: {
      alb: elbv2.ApplicationLoadBalancer;
      targetGroup: elbv2.ApplicationTargetGroup;
      service: ecs.FargateService;
      db: rds.DatabaseInstance;
    },
    props: StackProps,
  ) {
    super(scope, id, props);

    // 月の費用：実際に 80%・100%、見込みで 100% を超えたら知らせる
    const notify = (
      type: "ACTUAL" | "FORECASTED",
      threshold: number,
    ): budgets.CfnBudget.NotificationWithSubscribersProperty => ({
      notification: {
        notificationType: type,
        comparisonOperator: "GREATER_THAN",
        threshold,
        thresholdType: "PERCENTAGE",
      },
      subscribers: [{ subscriptionType: "EMAIL", address: config.alertEmail }],
    });
    new budgets.CfnBudget(this, "Budget", {
      budget: {
        budgetName: `${config.name}-monthly`,
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: config.budgetUsd, unit: "USD" },
      },
      notificationsWithSubscribers: [
        notify("ACTUAL", 80),
        notify("ACTUAL", 100),
        notify("FORECASTED", 100),
      ],
    });

    const topic = new sns.Topic(this, "Alarms", {
      displayName: "kaeriuchi alarms",
      enforceSSL: true,
    });
    topic.addSubscription(new subs.EmailSubscription(config.alertEmail));
    const alarm = (
      id: string,
      metric: cloudwatch.IMetric,
      threshold: number,
      description: string,
      op = cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    ) =>
      new cloudwatch.Alarm(this, id, {
        metric,
        threshold,
        evaluationPeriods: 3,
        datapointsToAlarm: 2,
        comparisonOperator: op,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: description,
      }).addAlarmAction(new actions.SnsAction(topic));

    const period = Duration.minutes(5);
    alarm(
      "App5xx",
      deps.targetGroup.metrics.httpCodeTarget(
        elbv2.HttpCodeTarget.TARGET_5XX_COUNT,
        { period, statistic: "Sum" },
      ),
      10,
      "アプリの 5xx が5分に10回以上",
    );
    alarm(
      "Unhealthy",
      deps.targetGroup.metrics.unhealthyHostCount({ period }),
      1,
      "ヘルスチェックに通らないアプリがある",
    );
    alarm(
      "DbCpu",
      deps.db.metricCPUUtilization({ period }),
      80,
      "データベースの CPU が 80% 以上",
    );
    alarm(
      "DbStorage",
      deps.db.metricFreeStorageSpace({ period }),
      2 * 1024 ** 3,
      "データベースの空きが 2GB を下回った",
      cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
    );
  }
}
