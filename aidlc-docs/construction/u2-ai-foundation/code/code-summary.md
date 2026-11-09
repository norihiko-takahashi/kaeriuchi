# U2 コードの作成：まとめ

## 1. 作ったもの

| 場所 | 内容 |
|---|---|
| `server/ai/provider.ts`、`schemas.ts` | `AIProvider` のインターフェースと、入出力の Zod スキーマ |
| `server/ai/providers/mock/` | 偽物の AI（教科ごとに決まった答えを返す） |
| `server/ai/providers/bedrock/index.ts` | Bedrock（Converse API）につなぐ部分。画像を渡し、ツールの呼び出しで JSON を受け取り、Zod で検証する。形が違えば最大2回やり直し、混雑のエラーは待ち時間を延ばしてやり直す。`requestMetadata` に `requestId` を付ける |
| `server/ai/providers/bedrock/account.ts` | つながっているアカウント（末尾4桁）と、呼び出しの記録の設定（画像を記録するか、保存期間）を読む |
| `server/ai/prompts/` | プロンプト（`analyze@1`・`generate@1`・`solve@1`・`grade@1`）。画像の中の文字に従わない約束を共通で入れる |
| `server/ai/image.ts` | 画像の検証（JPEG・PNG の判定、2MB、4096px、位置情報などのメタデータがあれば受け付けない） |
| `server/ai/guard.ts` | API の共通の処理（本番では止める、端末ごとの1日の回数、時間切れ、エラーの形） |
| `server/ai/telemetry.ts`、`pricing.json` | 構造化したログと、費用の目安（中身は出さない） |
| `server/ai/registry.ts` | 設定に合わせてプロバイダーを選ぶ。Bedrock では、画像が記録される設定、または設定を読めないときは AI を止める |
| `server/config.ts` | `AWS_PROFILE`（社用・個人用の切り替え）、東京リージョンだけ、リージョンをまたぐ推論のモデル ID は起動しない、役割ごとのモデル ID |
| `app/api/ai/{analyze,generate,grade}` | AI の API。生成は NDJSON で1問ずつ返す |
| `app/api/health/ready` | つながり先と、呼び出しの記録の設定の確認 |
| `content/mistake-types/seed.json` | 動作確認のための、仮の間違いのタイプの一覧（9件） |
| `evals/` | 評価の仕組み（`pnpm eval`）と、合成した宿題の画像3枚 |
| `docs/aws-account-setup.md`、`infra/aws/iam-policy-bedrock.json`、`.env.*.example` | AWS アカウント（社用・個人用）を用意する手順、最小の権限、設定の例 |

## 2. 確かめたこと（ローカル・Node.js 26）

| 確認 | 結果 |
|---|---|
| 単体テスト | 171件すべて成功。`domain/`・`server/ai/` のカバレッジは行 99%・分岐 95.8% |
| 契約テスト | 偽物の AI と Bedrock（SDK を差し替え）が、同じ入力に同じ形の出力を返す |
| 評価（偽物の AI） | 解析 3件・生成 1件、すべて合格（仕組みの確認） |
| E2E（Chromium） | 8件成功（U1 のもの） |
| lint、型チェック、ビルド、大きさの予算、脆弱性 | 問題なし |

**確かめていないもの**
- **本物の Bedrock での動き**：AWS の準備（`docs/aws-account-setup.md`）ができてから、あなたが `pnpm eval --provider bedrock` で確かめる。プロンプトの質と費用は、そこで初めてわかる
- E2E が、ビルド直後の負荷の高いときに1回だけ失敗した（どのテストかは記録できていない。その後4回は成功）。CI で出たら原因を調べる

## 3. 設計から変えたこと・残したこと

| # | 内容 |
|---|---|
| 1 | 問題の生成は、1回の呼び出しでまとめて作ってから1問ずつ返す。**1問目を早く出すためのストリーミング（ConverseStream）は U4 で入れる**（U2-PERF-2 の 10秒は、U4 で確かめる） |
| 2 | 生成した問題の正答の検証（検算・検証役の AI）と安全のチェックは、U4 で `/api/ai/generate` の中に入れる。U2 では、検証役の AI（`solve`）を作り、評価で使っている |
| 3 | モデルの単価（`pricing.json`）は目安の値。実際の請求は AWS の請求書で確かめる |
| 4 | 間違いのタイプの一覧は仮のもの（9件）。本格的なものは `content-data-plan.md` の計画どおり U4 で作る |
