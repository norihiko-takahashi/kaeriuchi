# AWS アカウントの用意（Bedrock につなぐまで）

かえりうちの AI（Amazon Bedrock の Claude）を、新しい AWS アカウントで使えるようにするまでの手順です。
会社に所属している間は社用のアカウント、そのあとは個人用のアカウントを使う前提で、**どちらのアカウントでも同じ手順**で用意できるようにしています。

> 本物の Bedrock を使わなくても、開発は偽物の AI（`AI_PROVIDER=mock`、何も設定しないときの値）で全部動きます。

## 0. 先に確かめること（社用のアカウントの場合）

- 子どもの宿題の写真（切り抜いたもの）を、そのアカウントの Bedrock に送ってよいか（会社のデータの扱いの決まり）
- 会社の資源で作ったもの（コード、利用者のデータ）の権利がどうなるか。辞めたあとに個人用のアカウントへ移せるか
- そのアカウントの「モデルの呼び出しの記録」の設定を、会社の管理者が決めていないか（下の 2）。決まっていて合わないときは、かえりうち専用のアカウントを用意してもらう

## 1. Bedrock で使うモデルの許可を申請する

- リージョンは **東京（ap-northeast-1）** にする
- Bedrock のコンソールの「モデルアクセス」で、Claude の Sonnet と Haiku（その時点の最新版）を申請する
- 東京リージョンで使えるモデル ID を控える。**`apac.`・`global.`・`jp.` などで始まる ID（リージョンをまたぐ推論）は使わない**（国外で処理されることがあるため。アプリも起動しない）

## 2. モデルの呼び出しの記録を設定する

Bedrock の「設定」→「モデルの呼び出しの記録」で、次のようにします（アカウントとリージョンごとに1つの設定です）。

| 項目 | 値 |
|---|---|
| 記録 | オン |
| テキスト | オン（不正利用の調査や監査のため） |
| **画像** | **オフ（子どもの宿題の写真を残さない）** |
| 埋め込み・動画・音声 | オフ |
| 送り先 | 東京リージョンの CloudWatch Logs |
| ロググループ | KMS で暗号化する。**保持期間 30日**。見られるのは監査用の役割だけにする |

画像がオンになっていると、アプリは AI の API を止めます（`/api/health/ready` に理由が出ます）。

## 3. 権限（IAM）を作る

- `infra/aws/iam-policy-bedrock.json` を元に、ポリシーを作る。`REPLACE_WITH_...` を、1 で控えたモデル ID と、アカウント ID に書き換える
- このポリシーを付けたロール（IAM Identity Center なら権限セット）を作る
- アクセスキーは作らない（SSO を使う）

## 4. 自分の PC で、AWS のプロファイルを作る

```bash
aws configure sso --profile company
```

個人用のアカウントなら `--profile personal` にします。ログインし直すときは次のとおりです。

```bash
aws sso login --profile company
```

## 5. アプリの設定

```bash
cp .env.company.example .env.local
```

`.env.local` を開いて、`BEDROCK_MODEL_*` に 1 で控えたモデル ID を入れます（解析・生成は Sonnet、検証・採点は Haiku）。`.env.local` はリポジトリに入りません。

## 6. つながり先を確かめる

```bash
pnpm dev
```

http://localhost:3000/api/health/ready を開いて、次を確かめます。

- `aws.accountLast4`：**つなぎたいアカウントの末尾4桁か**（社用と個人用の取り違えを防ぐ）
- `aws.region`：`ap-northeast-1`
- `aws.invocationLogging.imageDataDeliveryEnabled`：`false`
- `aws.invocationLogging.retentionDays`：30 以下
- `warnings`：空

## 7. 評価を動かす（費用がかかります）

```bash
pnpm eval --provider bedrock --suite analyze
```

```bash
pnpm eval --provider bedrock --suite generate
```

結果は `evals/reports/` に出ます。プロンプトやモデルを変えたときは、結果を PR に貼ってください。1件あたりの費用の目標は 10円以内です。

## アカウントを移すとき（社用 → 個人用）

1. 新しいアカウントで 1〜4 を行う（プロファイル名は `personal`）
2. `.env.personal.example` を `.env.local` にコピーし、モデル ID を入れる
3. 6 で、末尾4桁が新しいアカウントになっていることを確かめる

クラウドに保存した利用者のデータ（U8 以降）を移す手順は、U8 で書きます。
