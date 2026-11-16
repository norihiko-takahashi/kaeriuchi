# U8 コードの作成：まとめ

3つに分けて作った（1. ログイン 2. 同期 3. AWS の構成）。PR #19。

## 1. ログイン

| 場所 | 内容 |
|---|---|
| `server/auth/tokens.ts` | 乱数（32バイト）・8けたの番号・ハッシュ・期限・回数の上限・端末の名前 |
| `server/auth/service.ts` | メールのリンク（15分・1回きり）、セッション（30日・使うたびに延びる）、端末をつなぐ番号（10分・接続元ごとに10分に5回まちがえで止める）、端末の一覧・ほかの端末のログアウト、パスキー、ログインのし直し（10分）、アカウントの削除と7日のうちの取り消し |
| `server/auth/{memory,postgres}.ts` | 保存先（ハッシュだけを保存） |
| `server/auth/mail.ts` | 開発用（リンクを画面に出す）と SES |
| `server/auth/http.ts`・`app/api/auth/[action]/route.ts` | Cookie（HttpOnly・SameSite=Lax・HTTPS では Secure と `__Host-`）、出どころの確認（CSRF）、接続元ごとの上限 |
| `app/login/*`・`app/parent/devices` | ログイン・リンクを開いたところ（削除の手続き中なら取り消しを選ぶ）・番号でつなぐ・端末の一覧とパスキー |
| `client/store/repo.ts` の `adoptAccount` | ログインしたアカウントと端末の記録を結ぶ。別のアカウントの記録とは混ぜない |

## 2. 同期

| 場所 | 内容 |
|---|---|
| `server/sync/merge.ts` | まとめ方：プロフィール・ミスモン・テスト・バトルは版、保護者の設定は時刻、報告は足すだけ、削除が勝つ |
| `server/sync/validate.ts` | 送られた変更の形（Zod）。1件 64KB・1回 200件、ほかの保護者の記録・未来の日付は受けない。PIN とメールアドレスは落とす |
| `server/sync/service.ts` | 同期（1つのトランザクションで送る・受け取る）、子どもの削除と取り消し（7日）、アカウントの削除の印、書き出し、AI の回数（子どもごと） |
| `server/sync/{memory,postgres}.ts` | 保存先。Postgres はトランザクションごとに保護者を設定し、RLS でその家庭の行だけ。同じ保護者は順番に |
| `server/db/migrations/0001_init.sql`・`scripts/db-migrate.mjs`・`scripts/db-purge.mjs` | 表・RLS・毎日の削除の関数（持ち主の権限）。移行は同時に1つだけ |
| `app/api/sync`・`app/api/account/[action]` | 同期・書き出し・子どもの削除と取り消し・アカウントの削除（削除と書き出しはログインのし直しが要る） |
| `client/sync/engine.ts`・`runner.ts` | 端末の同期。起動・前に戻ったとき・変更の5秒後・オンラインに戻ったとき。失敗は最大5分まで間隔をあける。初めては端末の記録を全部送る。ログアウトさせられたらログインの画面へ |
| `server/ai/guard.ts`・`client/ai/api.ts` | AI の1日の回数を子どもごとに。ログインしていれば、その子がこの保護者の子どもかを確かめ、データベースで数える。本番はログインが要る |
| `components/auth/reauth.tsx`・`app/parent/data`・`components/sync-status.tsx` | ログインのし直し（パスキーかメール）、消したデータ、アカウントの削除、クラウドの書き出し、保護者メニューの同期の状態 |
| `client/store/db.ts`（v4） | 報告の表（送ったあとも一覧に残す） |

## 3. AWS の構成

| 場所 | 内容 |
|---|---|
| `infra/cdk/` | Zone・Repo・Network・Mail・Data・App・Ops の7つのスタック（β版：アプリ1台・公開サブネット・WAF なし・RDS PostgreSQL 17 1台・費用の知らせ 65 USD） |
| `infra/cdk/test/stacks.test.ts` | 構成のテスト（通信の許可・暗号化・パスワードの渡し方・権限・本番の構成）とスナップショット |
| `scripts/deploy-beta.sh`・`docs/deploy.md` | 手元の PC からのデプロイ（アカウントの取り違えを防ぐ・コミットした版だけ・動いている版を確かめる） |
| `Dockerfile` | RDS の証明書の束・移行と削除のスクリプトを入れる |

## 確かめたこと
- 単体テスト 445件（メモリと本物の Postgres で同じテスト）、構成のテスト 20件
- E2E 18件（Chromium・WebKit、axe・CSP）。新しく：番号でつないだ端末に同意とプロフィールが届く・ログアウトさせた端末がログインの画面に戻る・子どもの削除と取り消し・アカウントの削除と取り消し・同期の状態
- Postgres につないだ状態での E2E（手元）
- CI：Postgres 17 での単体テスト、イメージの中から移行と削除を動かす、`cdk synth`（認証情報なし）
- 画面の大きさ：いちばん大きい `/battle` が 198.6KB（予算 200KB。残り 1.4KB）

## まだできていないこと
- 本物の AWS へのデプロイ（あなたの PC から・`docs/deploy.md`）。東京の単価と db.t4g.micro の可否は、そのときに確かめる
- パスキーの登録とログインの実機での確認（127.0.0.1 では WebAuthn が使えない。Issue #8 に足す）
- SES の試しの状態を外す申請、本物のメールが届くかの確認
- 同意の文に「削除してから最長14日で完全に消える」「運営者は個人」を入れて、法律面を確かめる
