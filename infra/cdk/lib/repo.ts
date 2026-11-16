import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import type { Construct } from "constructs";

/**
 * Repo：アプリのイメージの置き場所（ECR）。
 * サービスより先にイメージを送れるように、別のスタックにする（最初のデプロイの順番・docs/deploy.md）
 */
export class RepoStack extends Stack {
  readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    this.repository = new ecr.Repository(this, "App", {
      // 同じタグを上書きしない（どのコミットのイメージかが変わらない）
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      imageScanOnPush: true,
      encryption: ecr.RepositoryEncryption.AES_256,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        { description: "古いイメージは20個まで残す", maxImageCount: 20 },
      ],
    });
    new CfnOutput(this, "RepositoryUri", {
      value: this.repository.repositoryUri,
    });
  }
}
