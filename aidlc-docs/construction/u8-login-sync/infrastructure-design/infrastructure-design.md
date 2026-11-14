# U8 インフラ設計：AWS の構成

2026-11-14 に決定：**ふつうの ECS（Fargate）**、構成は **AWS CDK（TypeScript）**、データベースは **RDS for PostgreSQL（1台から）**、メールは **Amazon SES**。すべて東京リージョン（ap-northeast-1）。

## 1. 構成

```
利用者 ─ HTTPS ─▶ ALB（公開サブネット、ACM の証明書、WAF）
                    └─▶ ECS Fargate（アプリ 2台）
                           ├─▶ RDS for PostgreSQL（隔離サブネット、暗号化、バックアップ 7日）
                           └─▶ Bedrock・SES・ECR・CloudWatch Logs・Secrets Manager（出口は下の表）
毎日1回の処理（EventBridge → ECS のタスク）：削除から7日過ぎた記録を消す
```

構成図：https://claude.ai/artifact/GgzjiTnYAK2YYGNo2YEpHf

### アプリから AWS のサービスへの出口（2026-11-14 に決定）

| 環境 | 出口 | アプリの置き場所 | 月の費用（出口の分） | AWS の外へ出られるか |
|---|---|---|---|---|
| **β版** | **C. 公開サブネットに置く** | 公開サブネット（公開 IP あり。入ってくる通信は ALB からだけに、セキュリティグループで絞る） | 約1,000円 | 出られる |
| **本番** | **B. VPC エンドポイントだけ** | プライベートサブネット（公開 IP なし） | 約9,000円（約6つ） | 出られない |

- 比べた案：A. NAT ゲートウェイ1台（約7,000円、外へ出られる）。どの案でも、データベースは隔離サブネットで、外から直接アプリに届く道は ALB だけ。
- 最初の案（「NAT を置かないと安くなる」）は誤りだった。VPC エンドポイントは1つずつに費用がかかり、約6つ要るため NAT より高い。
- CDK では、環境ごとの設定1つ（`egress: "public" | "endpoints"`）で切り替える。
- ログは CloudWatch Logs（30日）。費用の通知（AWS Budgets）を月 1.5万円で出す。

## 2. CDK のスタック（`infra/cdk/`）

| スタック | 中身 |
|---|---|
| `Network` | VPC（2つの AZ、公開・プライベート・隔離のサブネット）。本番だけ VPC エンドポイント |
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
