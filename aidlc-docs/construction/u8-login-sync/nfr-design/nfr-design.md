# U8 NFR 設計：ログイン・クラウド同期

## 1. 新しく入れるライブラリ

| ライブラリ | 用途 | 理由 |
|---|---|---|
| `drizzle-orm`・`drizzle-kit`・`postgres` | Postgres の読み書きと、表の形の移行 | 型が付き、SQL に近く、軽い（設計で想定していたもの） |
| `@simplewebauthn/server`・`@simplewebauthn/browser` | パスキー（WebAuthn） | WebAuthn の定番。標準に沿っている |
| `@aws-sdk/client-sesv2` | メールの送信 | AWS の公式 |
| `aws-cdk-lib`・`constructs`（`infra/cdk/` だけ） | AWS の構成をコードで書く | 決定（CDK） |

画面（子ども向け）に入るのは `@simplewebauthn/browser` だけで、保護者の画面でだけ読み込む（子どもの画面の 200KB の予算に入れない）。

## 2. ディレクトリ

```
server/auth/
├─ provider.ts        # AuthProvider（platform-interfaces.md）
├─ dev.ts             # 開発用：メールを送らず、リンクをログと画面に出す
├─ native.ts          # 本番：リンク・番号・セッション・パスキーを自分たちで扱う（Postgres に保存）
├─ tokens.ts          # 乱数とハッシュ、期限（純粋な関数）
└─ mail.ts            # Mailer（dev：ログ、ses：SES）
server/sync/
├─ store.ts           # SyncStore
├─ memory.ts          # テスト・開発用
├─ postgres.ts        # 本番（Drizzle）
├─ merge.ts           # まとめ方のルール（純粋な関数）
└─ schema.ts          # Postgres の表（Drizzle）
server/db/            # 接続、移行（drizzle-kit）、RLS の設定
app/api/auth/*        # リンクの送信・確認、番号、パスキー、ログアウト、端末の一覧
app/api/sync/route.ts # push と pull をまとめた1つの API
app/api/account/*     # 書き出し、削除、削除の取り消し
client/sync/          # Sync Client（送信待ちを送る・受け取った変更を IndexedDB に入れる）
infra/cdk/            # AWS の構成（インフラ設計）
```

## 3. データベースの表（Postgres）

| 表 | 中身 |
|---|---|
| `guardians` | ID、メールアドレス（小文字にそろえる）、作った日、削除の印 |
| `login_tokens` | トークンのハッシュ、メールアドレス、期限、使った印 |
| `link_codes` | 番号のハッシュ、保護者の ID、期限、まちがえた回数 |
| `sessions` | セッションのハッシュ、保護者の ID、端末の ID、端末の名前、期限、最後に同期した日 |
| `passkeys` | 公開鍵、カウンター、保護者の ID |
| `records` | 同期する記録をまとめて1つの表に入れる：保護者の ID、種類（`child`・`mistake`・`battle`…）、記録の ID、版、中身（JSONB）、削除の印、サーバーで付ける通し番号（pull の目印） |
| `ai_usage` | 子どもの ID・日付・API ごとの回数（1日の上限） |

- `records` をまとめて1つの表にするのは、記録の種類が増えても表を足さずに済み、同期の処理が1つで済むため。中身の形は Zod で確かめる。
- 行ごとのアクセス制御：接続ごとに `app.guardian_id` を設定し、`records` などは `guardian_id = current_setting('app.guardian_id')` の行だけ見えるようにする。

## 4. 同期の流れ

1. 端末は `POST /api/sync` に、送信待ち（最大200件）と、前回受け取った通し番号を送る
2. サーバーは1つのトランザクションで、変更ごとにまとめ方のルール（`merge.ts`）を当て、`records` に入れる
3. 通し番号より後の変更（ほかの端末の分）を、最大200件返す。まだ残っていれば「つづきあり」
4. 端末は、受け取った変更を IndexedDB に入れ、送った分を送信待ちから消す。つづきがあればもう一度

## 5. 回数の制限

- いまのサーバーのメモリの数え方（U2）を、`ai_usage` の表で数える形に変える（複数台のサーバーでも正しく数える）。開発・テストではメモリのまま。
- リンクの送信・番号の入力・同期の回数の制限も、同じ表の仕組みで数える。

## 6. テスト

- `merge.ts`・`tokens.ts`・削除の期限は単体テスト。
- `SyncStore` は、同じテストを `memory` と `postgres` の両方で通す（CI に Postgres のサービスを足す）。
- E2E は開発用のログインと、メモリの保存先で動かす（CI に AWS は使わない）。
