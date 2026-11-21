#!/usr/bin/env bash
# β版のデプロイ（infrastructure-design.md §2・docs/deploy.md）。あなたの手元の PC から動かす。
#   pnpm run deploy:beta zone   … 初めの1回：サブドメインのホストゾーンだけを作り、NS レコードを出す
#   pnpm run deploy:beta        … イメージを作って送り、構成とアプリを新しくする
# 認証情報はファイルにも画面にも出さない（AWS_PROFILE の SSO を使う）。
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)
STEP=${1:-all}
NAME=KaeriuchiBeta
REGION=ap-northeast-1
export AWS_REGION=$REGION AWS_DEFAULT_REGION=$REGION

need() {
  if [ -z "${!1:-}" ]; then
    echo "環境変数 $1 を設定してください（docs/deploy.md）" >&2
    exit 1
  fi
}
for v in AWS_PROFILE KAERIUCHI_AWS_ACCOUNT KAERIUCHI_DOMAIN KAERIUCHI_ALERT_EMAIL KAERIUCHI_OPERATOR_NAME \
  BEDROCK_MODEL_ANALYZE BEDROCK_MODEL_GENERATE BEDROCK_MODEL_VERIFY BEDROCK_MODEL_GRADE; do
  need "$v"
done

# 社用と個人用のアカウントの取り違えを防ぐ
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
if [ "$ACCOUNT" != "$KAERIUCHI_AWS_ACCOUNT" ]; then
  echo "いまのプロファイル（$AWS_PROFILE）のアカウントが、KAERIUCHI_AWS_ACCOUNT と違います" >&2
  exit 1
fi
export CDK_DEFAULT_ACCOUNT=$ACCOUNT CDK_DEFAULT_REGION=$REGION

cdk() { (cd "$ROOT/infra/cdk" && pnpm exec cdk "$@"); }
output() {
  aws cloudformation describe-stacks --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text
}

(cd infra/cdk && pnpm install --frozen-lockfile >/dev/null)

if [ "$STEP" = "zone" ]; then
  cdk deploy "$NAME-Zone" --require-approval broadening
  echo
  echo "次の NS レコードを、いまの DNS の「$KAERIUCHI_DOMAIN」に足してください："
  output "$NAME-Zone" NameServers | tr ' ' '\n'
  exit 0
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "コミットしていない変更があります。デプロイするのはコミットした版だけです" >&2
  exit 1
fi
TAG=$(git rev-parse --short=12 HEAD)
export KAERIUCHI_IMAGE_TAG=$TAG

# 1. イメージの置き場所
cdk deploy "$NAME-Repo" --require-approval broadening
REPO=$(output "$NAME-Repo" RepositoryUri)

# 2. イメージを作って送る（Graviton 用。同じコミットのものがあれば作らない）
if aws ecr describe-images --repository-name "${REPO#*/}" --image-ids imageTag="$TAG" >/dev/null 2>&1; then
  echo "イメージ $TAG は送ってあります"
else
  aws ecr get-login-password | docker login --username AWS --password-stdin "${REPO%%/*}"
  docker buildx build --platform linux/arm64 --build-arg GIT_SHA="$TAG" \
    -t "$REPO:$TAG" --push .
fi

# 3. 構成とアプリ（セキュリティに関わる変更があれば、続けるかを聞かれる）
cdk deploy --all --require-approval broadening

# 4. 新しい版が動いているかを確かめる
CLUSTER=$(output "$NAME-App" ClusterName)
SERVICE=$(output "$NAME-App" ServiceName)
aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"
VERSION=$(curl -fsS "https://$KAERIUCHI_DOMAIN/api/health" | node -pe 'JSON.parse(require("fs").readFileSync(0)).version')
if [ "$VERSION" != "$TAG" ]; then
  echo "動いている版（$VERSION）が、デプロイした版（$TAG）と違います" >&2
  exit 1
fi
echo "デプロイしました：https://$KAERIUCHI_DOMAIN（$TAG）"
