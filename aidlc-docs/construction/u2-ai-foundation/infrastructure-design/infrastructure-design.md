# U2 インフラ設計：AI の基盤

U2 では、AWS に新しい資源（サーバー、DB など）は作りません。Bedrock を呼ぶための準備だけです。本番の公開先と資源は、U8 で決めます。

## 1. リポジトリに入れるもの

| ファイル | 内容 |
|---|---|
| `infra/aws/iam-policy-bedrock.json` | 最小の権限の IAM ポリシー（U2-SEC-2）。モデルの ARN と、アカウント ID は書き換えて使う |
| `docs/aws-account-setup.md` | 新しい AWS アカウント（社用・個人用）で、使えるようにするまでの手順 |
| `.env.company.example`、`.env.personal.example` | 設定の例（秘密の値は入れない） |

## 2. `docs/aws-account-setup.md` に書く手順

1. 東京リージョン（ap-northeast-1）の Bedrock で、使うモデル（Sonnet・Haiku）へのアクセスを申請する
2. 「モデルの呼び出しの記録」（invocation logging）がオフになっていることを確かめる
3. `iam-policy-bedrock.json` を元に、IAM のロール（または Identity Center の権限セット）を作る
4. 開発者の PC で、AWS のプロファイルを作る（できれば SSO）：`aws configure sso --profile company`
5. `.env.company.example` を `.env.local` にコピーして、モデル ID を入れる
6. `pnpm dev` で起動し、`/api/health/ready` で、アカウントの末尾4桁・リージョン・モデル・記録がオフであることを確かめる
7. `pnpm eval --provider bedrock --suite analyze` で、評価が動くことを確かめる

アカウントを移すとき（社用 → 個人用）は、新しいアカウントで同じ手順を行い、`AWS_PROFILE` を切り替えます。

## 3. 環境ごとの設定

| 環境 | AI | AWS |
|---|---|---|
| ローカル（初期値） | Mock | 使わない |
| ローカル（本物で確かめる） | Bedrock | 開発者の PC のプロファイル（`AWS_PROFILE`） |
| CI | Mock | 使わない（認証情報を置かない） |
| プレビュー・本番 | U8 で決める | 実行環境のロール |

## 4. CI

- 追加するチェック：AI の契約テスト（Mock）、Bedrock のアダプターのテスト（SDK を差し替え）、評価のコマンドが Mock で最後まで動くこと。
- `infra/aws/` の JSON の形のチェック。
