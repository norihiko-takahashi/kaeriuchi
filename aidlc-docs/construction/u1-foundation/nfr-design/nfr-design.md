# U1 NFR 設計：基盤・プロフィール

`nfr-requirements.md` の要件を、どう作るかを決めます。

## 1. 使う技術

バージョンは、コードを書き始めるときに、その時点の安定版に決めます（`package.json` で固定する）。

| 用途 | 採用するもの | 理由 |
|---|---|---|
| 実行環境 | Node.js（その時点の LTS 版） | 長くサポートされる版を使う |
| パッケージの管理 | pnpm | 速く、依存関係を厳しく管理できる |
| フレームワーク | Next.js（App Router）、TypeScript の strict モード | 決定済み |
| 見た目 | Tailwind CSS、Radix UI | 決定済み |
| 端末の保存 | Dexie（IndexedDB） | 決定済み |
| スキーマ | Zod | 決定済み |
| PWA | Serwist | Workbox の後継で、Next.js の App Router に対応している |
| lint・整形 | Biome | lint と整形を1つの道具で、速く行える |
| テスト | Vitest、Testing Library、Playwright、axe-core | 単体、部品、E2E、アクセシビリティ |

## 2. PWA とキャッシュ

| 対象 | キャッシュの仕方 | 理由 |
|---|---|---|
| アプリ本体（JS、CSS、フォント、アイコン） | ビルドのときに全部キャッシュし、新しい版が出たら入れ替える | オフラインでもアプリが開くように |
| 画面（HTML） | まずネットワークから取り、だめならキャッシュを使う | 新しい内容を優先しつつ、オフラインでも開けるように |
| ミスモンなどの画像（SVG） | 一度取ったらキャッシュを使う | ほとんど変わらないため |
| `/api/*` | キャッシュしない | AI の結果や同期のデータを、古いまま使わないため |

### 新しいバージョンへの切り替え（U1-PWA-3）
1. 新しい Service Worker を見つけても、すぐには切り替えない（待たせておく）。
2. 次のどちらかのときに切り替える。
   - アプリを次に起動したとき
   - 保護者メニューを開いたとき（「あたらしいバージョンがあります」と表示し、保護者が押したら切り替える）
3. バトルの途中など、子どもが使っている途中では切り替えない。

## 3. 表示モードとふりがな

- 表示モードは、CSS の変数（デザイントークン）の組み合わせとして作る。`<html data-mode="lower|upper|junior">` で切り替える。
- ふりがなを付ける部品 `Ruby` は、表示する文の漢字を1文字ずつ見て、学年別漢字配当表（`content/kanji-by-grade.json`）で、その学年までに習うかどうかを判定する。習っていなければ、`<ruby>` でふりがなを付ける。
- 漢字の読みは、文ごとに用意する（画面の文は、あらかじめふりがなを書いておく。AI が作る問題文は、AI にふりがなも返させる）。漢字の読みを自動で推測する仕組み（形態素解析）は、ブラウザに入れると重いので使わない。

## 4. セキュリティ

### Content Security Policy（U1-SEC-2）

> **実装で変更**：nonce ではなく `script-src 'self' 'unsafe-inline'` にしました（外部のドメインは許可しない、は同じ）。理由は `code/code-summary.md` §3 を見てください。

```
default-src 'self';
script-src 'self' 'nonce-{リクエストごとの値}';
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:;
connect-src 'self';
worker-src 'self' blob:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```
- 外部のドメインは1つも許可しない。もし後で外部のサービスが必要になったら、`data-inventory.md` の更新とレビューを先に行う。
- `style-src` の `'unsafe-inline'` は、アニメーションのライブラリが直接スタイルを書き込むために必要です。スクリプトは nonce で守ります。

### そのほかのヘッダー
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- `Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()`
- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`

### PIN（U1-SEC-4）
- ブラウザの WebCrypto で、PBKDF2（SHA-256）を使い、繰り返しの回数は 600,000 回、ソルトは端末ごとにランダムな16バイトにする。
- 間違えた回数と、次に入力できる時刻は、IndexedDB に保存する。

## 5. 設定（U1-PORT-3）

```ts
// server/config.ts
const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  APP_URL: z.string().url(),
  AI_PROVIDER: z.enum(["mock", "bedrock", "anthropic"]).default("mock"),
  SYNC_STORE: z.enum(["memory", "postgres", "dynamo"]).default("memory"),
  AUTH_PROVIDER: z.enum(["dev", "authjs", "cognito", "supabase"]).default("dev"),
});
```

- 本番の環境で `AUTH_PROVIDER=dev` や `AI_PROVIDER=mock` になっていたら、起動しないようにする（開発用の設定のまま公開してしまう事故を防ぐ）。

## 6. 性能の予算（U1-PERF）

- ビルドのときに、子ども向けの画面ごとに、最初に読み込む JavaScript の大きさを測り、予算（200KB）を超えたら CI を失敗にする。
- Lighthouse CI で、LCP、INP、アクセシビリティの点数を測り、PR ごとに結果を出す。
