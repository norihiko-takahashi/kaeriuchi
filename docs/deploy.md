# β版のデプロイ（あなたの手元の PC から）

かえりうちの AWS の構成（`infra/cdk/`）と、アプリの入れ替えの手順です。
**デプロイは、いつもあなたの PC から行います**（2026-11-15 に決定）。GitHub Actions と Claude の作業環境は AWS に触りません。

構成の中身は `aidlc-docs/construction/u8-login-sync/infrastructure-design/infrastructure-design.md` を見てください。

## 0. 用意するもの

| もの | 確かめ方 |
|---|---|
| Node.js 26・pnpm（`package.json` の版） | `node -v`・`pnpm -v` |
| AWS CLI v2 | `aws --version` |
| Docker（buildx が使えるもの。Graviton 用のイメージを作る） | `docker buildx version` |
| 個人の AWS アカウントの SSO のプロファイル（`docs/aws-account-setup.md` の 4） | `aws sso login --profile personal` |
| Bedrock のモデルの許可と、呼び出しの記録の設定（`docs/aws-account-setup.md` の 1・2） | Bedrock のコンソール |

## 1. 設定（環境変数）

個人のドメイン・メールアドレス・アカウントの番号は**リポジトリに入れません**。毎回、シェルで設定します（`~/.kaeriuchi-beta.env` などに書いて `source` してもかまいません。そのファイルはリポジトリの外に置きます）。

```bash
export AWS_PROFILE=personal
export KAERIUCHI_AWS_ACCOUNT=123456789012        # 個人のアカウントの番号（12けた）
export KAERIUCHI_DOMAIN=kaeriuchi.example.jp     # かえりうち用のサブドメイン
export KAERIUCHI_ALERT_EMAIL=you@example.jp      # 費用とアラームの知らせの宛先
export KAERIUCHI_OPERATOR_NAME="（あなたの名前）"        # 同意の文とプライバシーポリシーに出す運営者の名前（個人）
export BEDROCK_MODEL_ANALYZE=anthropic.claude-...   # 東京で使えるモデル ID（apac. などで始まるものは使わない）
export BEDROCK_MODEL_GENERATE=anthropic.claude-...
export BEDROCK_MODEL_VERIFY=anthropic.claude-...
export BEDROCK_MODEL_GRADE=anthropic.claude-...
```

いまのプロファイルのアカウントが `KAERIUCHI_AWS_ACCOUNT` と違うときは、デプロイは止まります（社用と個人用の取り違えを防ぐため）。

## 2. 初めての1回だけ

### 2-1. CDK の準備（アカウントとリージョンごとに1回）

```bash
cd infra/cdk && pnpm install && pnpm exec cdk bootstrap aws://$KAERIUCHI_AWS_ACCOUNT/ap-northeast-1
```

### 2-2. サブドメインを Route 53 に任せる

```bash
pnpm run deploy:beta zone
```

最後に出る NS レコード（4行）を、いまお使いの DNS（ドメインを取ったところ）に、**`KAERIUCHI_DOMAIN` の NS レコード**として足します。ドメイン本体のレコード（メールなど）は変えません。

足せたかは、次で確かめます（4つの名前が出れば OK。反映に数分〜数時間かかることがあります）。

```bash
dig NS $KAERIUCHI_DOMAIN +short
```

**NS が反映されるまで、次に進まないでください。** 証明書（ACM）の確認が終わらず、デプロイが止まったままになります。

### 2-3. SES の「試しの状態」を外す申請

SES のコンソール（東京リージョン）→「アカウントダッシュボード」→「本番アクセスをリクエスト」から申請します。用途は「保護者のログイン用のリンクを送るメールだけ。1日に数十通」と書きます。数日かかることがあります。
外れるまでは、SES で確認したアドレスにしかメールが届きません（自分のアドレスで試すことはできます）。

## 3. デプロイ（毎回）

コミットした版だけをデプロイします（コミットしていない変更があると止まります）。

```bash
git checkout main && git pull
pnpm run deploy:beta
```

スクリプトは次のことを順に行います。

1. イメージの置き場所（ECR）を用意する
2. Graviton 用のイメージを作り、コミットの番号のタグで送る（同じものがあれば作らない）
3. 構成とアプリを新しくする（`cdk deploy --all`）。**権限や通信の許可が広がる変更があるときは、続けるかを聞かれます**。中身を読んで、分からなければ止めてください
4. 新しい版が動き、`https://$KAERIUCHI_DOMAIN/api/health` の版がコミットと同じかを確かめる

アプリが起動するたびに、先に表の形を新しくします（同じタスクの中で、移行が終わってからアプリが起動します）。動かなかったときは、ECS が自動で前の版に戻します。

## 4. 確かめるところ

- **ログ**：CloudWatch Logs の `KaeriuchiBeta-App-Logs...`（`app`・`migrate`・`purge`）。30日で消えます
- **毎日の削除**：日本時間 3:17 に動きます（`purge` のログに、消した数だけが出ます）
- **費用**：月 65 USD（約1万円）の 80%・100% と、見込みで 100% を超えたら、メールで知らせます。AWS Budgets はドルで数えます
- **アラーム**：アプリの 5xx・ヘルスチェック・データベースの CPU と空き容量。初めに届く「SNS の購読の確認」のメールで、確認のリンクを押してください

## 5. 困ったとき

| ようす | 見るところ |
|---|---|
| `cdk deploy` が証明書のところで止まる | NS が反映されていない（2-2） |
| ログインのメールが届かない | SES の試しの状態（2-3）。迷惑メールのフォルダ。SES の「抑制リスト」 |
| タスクがすぐ止まる | `migrate` のログ（データベースにつながらない・移行の失敗）。`app` のログ（設定の不足は起動のときにエラーで出る） |
| AI が使えない | `/api/health/ready`。Bedrock のモデルの許可・呼び出しの記録の設定 |

## 6. 消すとき

データベースは消せない設定（削除保護）にしてあり、消すときは最後のスナップショットを残します。ECR のリポジトリと KMS の鍵も残ります。本当に消すときは、手で削除保護を外してから `cdk destroy` します（手順は、そのときに一緒に確かめます）。
