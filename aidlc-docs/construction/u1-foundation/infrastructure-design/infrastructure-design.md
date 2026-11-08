# U1 インフラ設計：基盤・プロフィール

公開先は固定しない（OQ7）ので、U1 では「どこでも動かせる形にビルドする」ところまでを作ります。本番の公開先は、U8 のインフラ設計で決めます。

## 1. リポジトリとブランチ

- 1つのリポジトリに、Next.js のアプリを1つ置く（monorepo にはしない）。
- `main` を常に動く状態に保つ。変更はすべて PR で入れ、CI が通ったものだけをマージする。
- **`main` のブランチ保護は、いまは入れない**（1人で開発しているため。2026-11-08 に決定）。そのぶん、AI のエージェントは `main` に直接 push せず、必ず作業ブランチから PR で出し、CI が通ってからマージする運用にする。開発する人が増えたら、PR と CI の成功を必須にする保護を入れる。

## 2. CI（GitHub Actions）

PR を作ったときと、`main` にマージしたときに動かします。

| ジョブ | 内容 | 失敗の条件 |
|---|---|---|
| `lint` | Biome での lint と整形のチェック | 違反がある |
| `typecheck` | `tsc --noEmit` | 型のエラーがある |
| `test` | Vitest（単体、部品）とカバレッジ | テストが落ちる。`domain/` のカバレッジが 90% 未満 |
| `e2e` | Playwright（Chromium と WebKit）。トレースは、失敗した場合に再実行するときだけ記録する | テストが落ちる |
| `a11y` | E2E の中で axe-core をかける | WCAG 2.2 AA の違反がある |
| `build` | `next build`（standalone）と、JavaScript の大きさの予算のチェック | ビルドが失敗する。予算を超える |
| `docker` | Docker のイメージのビルド（push はしない） | ビルドが失敗する |
| `security` | 依存ライブラリの脆弱性チェック（`pnpm audit`）、秘密情報のスキャン（gitleaks） | 重大な脆弱性がある。秘密情報が見つかる |
| `lighthouse` | Lighthouse CI（モバイル設定） | U1-PERF-1 を満たさない |

- 依存ライブラリの更新は、Dependabot で、週に1回まとめて PR を作る。
- GitHub の CodeQL（コードの脆弱性スキャン）も有効にする。

## 3. Docker

```dockerfile
# 依存ライブラリ → ビルド → 実行、の3段階
FROM node:<LTS>-slim AS deps
# pnpm install --frozen-lockfile

FROM node:<LTS>-slim AS build
# pnpm build（output: "standalone"）

FROM node:<LTS>-slim AS run
# standalone の出力と、静的なファイルだけをコピーする
# root ではないユーザーで動かす
# HEALTHCHECK で /api/health を確認する
```

- イメージには、秘密情報を入れない（実行するときに環境変数で渡す）。
- `docker-compose.yml` は、U1 ではアプリだけを動かす。Postgres は U8 で追加する。

## 4. 環境

| 環境 | 場所 | 使うもの | U1 での状態 |
|---|---|---|---|
| ローカル | 開発者の PC、または `docker compose up` | Mock の AI、メモリ上の同期、開発用のログイン | 作る |
| CI | GitHub Actions | ローカルと同じ | 作る |
| プレビュー（PR ごと） | 未定 | ローカルと同じ | U8 で公開先を決めてから |
| ステージング・本番 | 未定 | 本番の AI、同期、ログイン | U8 で決める |

## 5. ヘルスチェック

- `GET /api/health`：アプリが動いているかを返す（`{ status: "ok", version }`）。外部のサービスにはつながない。
- U2 と U8 で、AI や DB につながるかを確かめる `GET /api/health/ready` を足す。
