# U2 NFR 設計：AI の基盤

## 1. 使う技術

| 用途 | 採用するもの |
|---|---|
| Bedrock の呼び出し | `@aws-sdk/client-bedrock-runtime`（Converse API と ConverseStream API） |
| つながり先の確認 | `@aws-sdk/client-sts`（GetCallerIdentity）、`@aws-sdk/client-bedrock`（GetModelInvocationLoggingConfiguration） |
| 認証情報 | `@aws-sdk/credential-providers` の `fromNodeProviderChain`（`AWS_PROFILE` を読む） |
| 出力の形 | Zod のスキーマを JSON スキーマに変え（`z.toJSONSchema`）、Converse の「ツールの呼び出し」の入力の形として渡す。返ってきた JSON を、もう一度 Zod で検証する |
| テスト | Vitest、`aws-sdk-client-mock` |

## 2. ディレクトリ

```
server/ai/
├─ provider.ts            # AIProvider インターフェース
├─ schemas.ts             # 入出力の Zod スキーマ
├─ prompts/               # プロンプト（版の番号つき）
├─ pricing.json           # モデルごとの単価（円/1000トークン）
├─ guard.ts               # リクエスト ID、大きさの上限、回数の制限、時間切れ、エラーの形
├─ image.ts               # 画像の検証と、位置情報などのメタデータの確認
├─ telemetry.ts           # 構造化したログ
└─ providers/
   ├─ mock/               # 決まった答え（fixtures/）
   └─ bedrock/            # AWS の SDK を使ってよい唯一の場所
app/api/ai/
├─ analyze/route.ts
├─ generate/route.ts
└─ grade/route.ts
app/api/health/ready/route.ts
evals/
├─ suites/                # 評価のサンプル（入力と、期待する答え）
├─ run.ts                 # pnpm eval
└─ reports/
```

## 3. 写真の位置情報を送らない（U2-PRIV-1）

- **端末で**：画像を Canvas で描き直してから JPEG にする（U3 で作る）。描き直すと、EXIF などのメタデータは残らない。
- **サーバーで**：念のため、受け取った JPEG に EXIF（APP1）などのメタデータが残っていないかを調べる。残っていたら、**受け付けない**（400）。サーバーで画像を描き直す仕組み（sharp など）は、依存が重いので入れない。

## 4. 呼び出しの記録（U2-PRIV-3）

Bedrock の「モデルの呼び出しの記録」は、AWS アカウントとリージョンごとに1つの設定です。**オンにして使い、画像だけは記録しない**ようにします。

| 設定 | 値 |
|---|---|
| `textDataDeliveryEnabled` | `true`（文章は記録する） |
| `imageDataDeliveryEnabled` | **`false`（子どもの宿題の写真は記録しない）** |
| `videoDataDeliveryEnabled`・`audioDataDeliveryEnabled`・`embeddingDataDeliveryEnabled` | `false`（使わないので記録しない） |
| 送り先 | 東京リージョンの CloudWatch Logs（または S3） |
| 保存期間 | 30日で自動削除（CloudWatch Logs の保持期間、S3 なら保存期間の設定） |
| 暗号化・見られる人 | KMS で暗号化し、見られるのは監査用の役割だけにする |

**アプリの確かめ方**（起動したときと、`/api/health/ready` を開いたとき）
- `GetModelInvocationLoggingConfiguration` で設定を読む。
- **画像が記録される設定（`imageDataDeliveryEnabled = true`）なら、AI の API は 503 を返して動かさない。**
- 記録がオンかオフか、送り先、保存期間（CloudWatch Logs なら `DescribeLogGroups` で読む）を、`/api/health/ready` に出す。保存期間が30日より長ければ警告を出す。

**アプリのログとの突き合わせ**：Converse の `requestMetadata` に `requestId` を入れる。アプリのログには中身を出さないまま、問題があったときに、同じ `requestId` で呼び出しの記録を探せる。

**社用のアカウントでの注意**：会社の管理者が「画像も記録する」と決めている場合は、かえりうちだけ設定を変えることはできない。その場合は、かえりうち専用の AWS アカウントを用意してもらう（あとで個人用に移すときも、話が単純になる）。

## 5. 回数の制限（U2-COST-3）

- 端末の ID（U1 で IndexedDB に作ったもの）を、リクエストの `X-Device-Id` に入れて送る。
- サーバーは、端末の ID ごとに、その日の回数をメモリに数える。
- **注意**：メモリに数えるので、サーバーを起動し直すと数え直しになり、サーバーが複数台のときは台ごとに数える。端末の ID は、作り直せば変えられる。U8 でログインと保存先（DB）ができたら、保護者ごとに DB で数える形に変える。

## 6. エラーの形

```json
{ "error": { "code": "rate_limited", "message": "きょうは もう つかえないよ", "requestId": "..." } }
```

`code` は `bad_request`・`image_metadata`・`rate_limited`・`timeout`・`ai_unavailable`・`invalid_output`・`disabled` のどれか。

## 7. 記録（ログ）の形

```json
{ "level": "info", "event": "ai_call", "requestId": "...", "route": "analyze",
  "provider": "bedrock", "model": "...", "promptVersion": "analyze@1",
  "latencyMs": 4210, "inputTokens": 1830, "outputTokens": 410, "costJpy": 2.1,
  "outcome": "ok", "retries": 0 }
```
