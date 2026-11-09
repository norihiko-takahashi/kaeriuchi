# かえりうち

> 宿題の間違いを撮影すると、その間違い専用の問題が出るゲーミフィケーション学習アプリ（小中学生・全教科 / PWA）

間違えた問題は「ミスモン（間違いモンスター）」として現れます。専用の問題に正解してミスモンを**返り討ち**にし、
時間をおいて再び現れるミスモンも倒して、苦手を「わかった」に変えていきます。

## ステータス

AI-DLC（AI-Driven Development Lifecycle）で開発しています。

- Inception：完了
- Construction：**U1 基盤・プロフィール**を作成済み。**U2 AI 基盤**を作成中（AI を呼ぶ土台。画面はまだ変わらない）

進み具合は [aidlc-docs/aidlc-state.md](aidlc-docs/aidlc-state.md) を見てください。

## 動かし方

Node.js 26 と pnpm が必要です（バージョンは `.nvmrc`）。

```bash
pnpm install
```

```bash
pnpm dev
```

http://localhost:3000 を開きます。開発用のサーバーでは Service Worker（オフライン対応）は動きません。

本番と同じ形（standalone ビルド）で動かすとき：

```bash
pnpm build
```

```bash
node scripts/start-standalone.mjs
```

Docker で動かすとき：

```bash
docker compose up --build
```

## チェック

| コマンド | 内容 |
|---|---|
| `pnpm lint` | Biome での lint と整形のチェック |
| `pnpm typecheck` | 型チェック |
| `pnpm test` / `pnpm test:coverage` | 単体テスト（`domain/` のカバレッジは 90% 以上） |
| `pnpm build && pnpm check:bundle` | 子ども向けの画面の JavaScript が 200KB 以内か |
| `pnpm build && pnpm e2e` | E2E テストとアクセシビリティのチェック（Chromium と WebKit） |
| `pnpm eval --provider mock\|bedrock --suite analyze\|generate` | AI の評価（bedrock は費用がかかる。準備は [docs/aws-account-setup.md](docs/aws-account-setup.md)） |

## ドキュメント

| ドキュメント | 内容 |
|---|---|
| [aidlc-docs/inception/requirements/requirements.md](aidlc-docs/inception/requirements/requirements.md) | 要件定義 |
| [aidlc-docs/inception/requirements/data-inventory.md](aidlc-docs/inception/requirements/data-inventory.md) | 扱うデータの一覧（プライバシー） |
| [aidlc-docs/inception/requirements/open-questions.md](aidlc-docs/inception/requirements/open-questions.md) | 未決事項の決定と、検証が必要な課題（R1・R2） |
| [aidlc-docs/inception/user-stories/stories.md](aidlc-docs/inception/user-stories/stories.md) | ユーザーストーリー |
| [aidlc-docs/inception/application-design/](aidlc-docs/inception/application-design/) | アプリケーション設計 |
| [aidlc-docs/inception/units/unit-of-work.md](aidlc-docs/inception/units/unit-of-work.md) | 作業ユニットへの分割 |
| [aidlc-docs/inception/plans/execution-plan.md](aidlc-docs/inception/plans/execution-plan.md) | Construction フェーズの実行計画 |
| [aidlc-docs/inception/plans/content-data-plan.md](aidlc-docs/inception/plans/content-data-plan.md) | 間違いのタイプの一覧と、評価用データの作成計画 |
| [aidlc-docs/construction/u1-foundation/](aidlc-docs/construction/u1-foundation/) | U1 の設計とコードのまとめ |
