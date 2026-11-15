# U8 NFR 設計：ログイン・クラウド同期

## 1. 新しく入れるライブラリ

| ライブラリ | 用途 | 理由 |
|---|---|---|
| `postgres`（postgres.js） | Postgres の読み書き | 軽く、SQL をそのまま書ける。値は必ずプレースホルダーで渡る（2026-11-15 のコードで変更：表は records を中心に少なく、RLS の SQL を自分で書くので、Drizzle は入れない。移行は SQL のファイルと小さなスクリプト `scripts/db-migrate.mjs`） |
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
├─ postgres.ts        # 本番（postgres.js）
├─ merge.ts           # まとめ方のルール（純粋な関数）
├─ validate.ts        # 送られた変更の形（Zod）
└─ service.ts         # 同期・削除と取り消し・書き出し・AI の回数
server/db/            # 接続、移行の SQL（migrations/）、RLS の設定
scripts/db-migrate.mjs・db-purge.mjs  # 移行と毎日の削除（ECS のタスクで動かす）
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

## 7. コードで決めたこと（2026-11-15）

- **削除は同期では行わない**：子どもの削除は `/api/account/delete-child` だけ（10分以内のログインのし直しが要る・U8-SEC-7）。同期で送られた削除は受け付けない。削除の印は、次の同期ですべての端末に届く
- **バトルは版で比べる**：1回答えるごとに保存して版が上がるので、「足すだけ」ではなく版の大きいほう。消すことはできない（子どもと一緒に消える）
- **報告は端末にも残す**：送信待ちから送ったあとも保護者メニューの一覧に出るように、端末の DB に報告の表を足す（IndexedDB v4）
- **初めての同期**：その端末の記録をすべて送信待ちに入れ直してから送る（つなぐ前の記録・ID を付け替えた記録を、もれなく送る）
- **保護者の設定の時刻**：新しい端末でつないだときは、いちばん古い時刻にしておき、クラウドの設定を採用する
- **AI の回数**：画面は、いま使っている子どもの ID を `x-child-id` で送る。まだ送っていない子どもなら、先に同期する。ログインしていないとき（開発・テスト・評価）はメモリで数える。本番はログインが要る
- **アプリの役割**：アプリは `kaeriuchi_app`（表の持ち主ではない）で入るので RLS が効く。毎日の削除は持ち主の権限で動く関数 `kaeriuchi_purge` を呼ぶ（アプリはほかの家庭の行を読めないまま）
- **同じ保護者の同期は順番に**：トランザクションの中でアドバイザリーロックを取り、通し番号の順に書き込みが見えるようにする（pull の取りこぼしを防ぐ）
