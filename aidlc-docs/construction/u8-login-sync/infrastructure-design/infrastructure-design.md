# U8 インフラ設計：AWS の構成

2026-11-14 に決定：**ふつうの ECS（Fargate）**、構成は **AWS CDK（TypeScript）**、データベースは **RDS for PostgreSQL（1台から）**、メールは **Amazon SES**。すべて東京リージョン（ap-northeast-1）。

## 1. 構成

```
利用者 ─ HTTPS ─▶ ALB（公開サブネット、ACM の証明書、WAF）
                    └─▶ ECS Fargate（アプリ 2台、プライベートサブネット）
                           ├─▶ RDS for PostgreSQL（隔離サブネット、暗号化、バックアップ 7日）
                           ├─▶ Bedrock（VPC エンドポイント）
                           ├─▶ SES（VPC エンドポイント）
                           └─▶ Secrets Manager（DB のパスワード、VPC エンドポイント）
毎日1回の処理（EventBridge → ECS のタスク）：削除から7日過ぎた記録を消す
```

- **NAT ゲートウェイを置かない**（月 5,000円ほど節約）。アプリが外に出る先は AWS のサービスだけなので、VPC エンドポイントで足りる。コンテナのイメージは ECR から（エンドポイント経由）。
- DB には、アプリのタスクからだけつながる（セキュリティグループ）。
- ログは CloudWatch Logs（30日）。費用の通知（AWS Budgets）を月 1.5万円で出す。

## 2. CDK のスタック（`infra/cdk/`）

| スタック | 中身 |
|---|---|
| `Network` | VPC（2つの AZ、公開・プライベート・隔離のサブネット）、VPC エンドポイント |
| `Data` | RDS、Secrets Manager、KMS の鍵 |
| `App` | ECR、ECS のクラスター・サービス・タスク定義、ALB、ACM、WAF、ロール（Bedrock は `iam-policy-bedrock.json` と同じ最小の権限） |
| `Mail` | SES のドメインの確認（DKIM）、送信の設定 |
| `Ops` | 削除の処理（EventBridge）、Budgets、アラーム |

- 環境は `beta`（まず1つ）。本番は同じスタックを別の名前で作る。
- CI では `cdk synth` とスナップショットのテストだけを動かす（AWS には触らない）。実際に作る（`cdk deploy`）のは、AWS の準備のあと、あなたの手元か、承認つきの GitHub Actions から。

## 3. あなたに用意してもらうもの（AWS の準備のとき）

1. Bedrock の準備（`docs/aws-account-setup.md`、U2 のまま）
2. 公開するドメイン（例：`kaeriuchi.example`）。Route 53 で管理するか、DNS の設定を足せること
3. SES の「試しの状態」を外す申請（数日かかることがある）
4. CDK を初めて使うための準備（`cdk bootstrap`。手順は `docs/deploy.md` に書く）
