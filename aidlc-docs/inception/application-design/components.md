# アプリケーション設計：コンポーネント

## 1. 全体の構成

```mermaid
flowchart LR
  subgraph Client["PWA（ブラウザ / Next.js のクライアント）"]
    UI["画面（App Router のページ）"]
    Capture["Capture<br/>撮影・切り抜き・圧縮"]
    Battle["Battle Engine<br/>出題・採点"]
    Game["Gamification<br/>XP・図鑑・連続記録・ボス"]
    Sched["Review Scheduler<br/>再来の日程"]
    Store[("Local Store<br/>IndexedDB")]
    SW["Service Worker<br/>オフライン対応"]
  end

  subgraph Server["Next.js サーバー（Route Handler）"]
    API["/api/analyze<br/>/api/generate<br/>/api/grade"]
    SyncAPI["/api/sync<br/>/api/account"]
    Guard["Guard<br/>認証・レート制限・サイズ制限"]
    Auth["AuthProvider<br/>（差し替え可能）"]
    SyncStore["SyncStore<br/>（差し替え可能）"]
    Orchestrator["Problem Pipeline<br/>解析 → 生成 → 検証"]
    Verifier["Verifier<br/>数式エンジン・検証役 AI"]
    Safety["Safety Filter<br/>不適切内容・個人情報の検知"]
    Provider["AIProvider<br/>（差し替え可能）"]
  end

  subgraph AI["AI プロバイダー"]
    Mock["Mock"]
    Bedrock["Amazon Bedrock（最初に検証する）"]
    Claude["Claude API"]
    Other["そのほか"]
  end

  DB[("クラウドの DB<br/>（基盤はインフラ設計で決める）")]
  Sync["Sync Client<br/>差分の送受信・まとめ方のルール"]
  Store <--> Sync
  Sync --> SyncAPI --> Guard
  Guard --> Auth
  SyncAPI --> SyncStore --> DB

  UI --> Capture --> API
  UI --> Battle --> Game
  Battle --> Sched
  Battle -. "短い文の採点" .-> API
  Battle --> Store
  Game --> Store
  Sched --> Store
  API --> Guard --> Orchestrator
  Orchestrator --> Provider
  Orchestrator --> Verifier
  Orchestrator --> Safety
  Verifier --> Provider
  Provider --> Mock & Claude & Bedrock & Other
```

**設計の方針**

1. **オフラインファースト＋クラウド同期**：画面は、端末の IndexedDB を読み書きする（オフラインでも動く）。Sync Client が、裏でクラウドと差分を送り合う。正本はクラウドに置く。
2. **外部のサービスは境界の外に置く**：AI は `AIProvider`、同期の保存先は `SyncStore`、ログインは `AuthProvider` の後ろに隠す。どれも設定で差し替えられ、開発用の実装（Mock、メモリ上で動くもの、ローカルの Postgres）で全機能が動く。公開先（ホスティング）にも依存しない。
3. **画像はクラウドに残さない**：画像は解析のときにメモリ上で扱うだけで、同期するのは文字の情報だけにする（保護者がオンにしたときを除く）。
4. **採点はできるだけ端末で、ルールどおりに**：AI に採点させるのは、短い文の答えでルールでは判断できないときだけ。
5. **AI の出力は信用しない**：すべてを JSON スキーマ（Zod）で検証し、正答も検算してから使う。

## 2. コンポーネント一覧

| # | コンポーネント | 置き場所 | 責務 |
|---|---|---|---|
| C1 | App Shell / UI | client | 画面、ルーティング、表示モード（低学年・高学年・中学生）、ふりがなと読み上げ |
| C2 | Profile & Consent | client | 保護者の同意、子どものプロフィール、保護者用 PIN |
| C3 | Capture | client | カメラ・写真の取り込み、切り抜き、向きの補正、縮小と JPEG 圧縮、名前などの写り込みの簡易チェック |
| C4 | API Client | client | `/api/*` の呼び出し、再試行、タイムアウト、ストリーミングの受け取り |
| C5 | Battle Engine | client | バトルの状態の管理、出題の順番、ヒントの出し方、HP の計算、途中からの再開 |
| C6 | Answer Checker | client | 答え方の形式ごとのルール採点（数値の正規化、同じ意味の答えの一覧、並べ替え） |
| C7 | Gamification | client | XP、レベル、図鑑、連続記録、ボスの出現、コイン |
| C8 | Review Scheduler | client | 再来の日程（決まった間隔）、今日の再来ミスモン、再来用の問題を前もって取りに行く |
| C9 | Local Store | client | IndexedDB（Dexie）のリポジトリ層、データ構造の移行、書き出しと削除。変更を「送信待ち」として記録する |
| C12 | Sync Client | client | 送信待ちの変更の送信、クラウドの差分の取得、データの種類ごとのまとめ方のルール（加算・最後の更新を採用・追記だけ） |
| C13 | Auth Client | client | メールのリンクでのログイン、パスキー（WebAuthn）の登録とログイン、セッションの更新 |
| C10 | Parent Dashboard | client | 集計、使い方のルール、傾向の要約（`/api/summarize`） |
| C11 | Service Worker | client | アプリ本体のキャッシュ、オフラインでのバトル |
| S1 | API Routes | server | `/api/analyze`, `/api/generate`, `/api/grade`, `/api/summarize`, `/api/sync`, `/api/account` |
| S2 | Guard | server | セッションの検証、保護者ごとのデータの境界の確認、レート制限、入力サイズの上限、リクエスト ID |
| S9 | AuthProvider | server | ログインの基盤の抽象化（マジックリンク、パスキー、セッション、端末の一覧） |
| S10 | SyncStore | server | 同期の保存先の抽象化（差分の取得・反映、データの削除、書き出し） |
| S3 | Problem Pipeline | server | 解析 → 生成 → 検証 → 安全チェックの流れの制御、再試行、問題の入れ替え |
| S4 | Verifier | server | 数式の検算（mathjs）、選択肢の一意性、検証役 AI での答え合わせ |
| S5 | Safety Filter | server | 不適切な表現の検知、個人情報（名前・学校名など）の検知と伏せ字化 |
| S6 | AIProvider | server | プロバイダーの抽象化（`ai-provider.md`） |
| S7 | Prompt Registry | server | プロンプトの雛形とバージョン管理、教科ごとの指示 |
| S8 | Telemetry | server | 処理時間、トークン数、コスト、検証の失敗率（個人情報は送らない） |

## 3. 主な処理の流れ

### 3.1 撮影 → バトル開始

```mermaid
sequenceDiagram
  actor Kid as 子ども
  participant C as Capture
  participant API as /api/analyze
  participant P as Pipeline
  participant AI as AIProvider
  participant UI as 確認画面
  participant G as /api/generate
  participant V as Verifier
  participant B as Battle Engine

  Kid->>C: 撮影・切り抜き
  C->>C: 縮小・圧縮・写り込みチェック
  C->>API: 画像 + 学年 + (教科)
  API->>P: analyze
  P->>AI: analyzeMistake
  AI-->>P: MistakeAnalysis (JSON)
  P->>P: スキーマ検証 / 個人情報の伏せ字化
  P-->>UI: 解析結果
  Kid->>UI: 確認・修正
  UI->>G: 確定した MistakeAnalysis
  G->>AI: generateCounterProblems
  AI-->>G: Problem[]
  G->>V: 検算 / 検証役 AI
  V-->>G: 合格した問題（不合格なら作り直し）
  G-->>B: Problem[]（1問ずつストリーミング）
  B->>Kid: バトル開始
```

### 3.2 同期

1. 画面からの変更は、IndexedDB に書き込むと同時に「送信待ち」の一覧に追加する。
2. Sync Client は、オンラインのとき（起動したとき、画面が前面に戻ったとき、変更のあと数秒たったとき）に `/api/sync` を呼ぶ。送信待ちの変更を送り、前回の同期より後のクラウドの変更を受け取る。
3. 受け取った変更は、データの種類ごとのルールで IndexedDB の内容とまとめる（`domain-model.md` の「同期のまとめ方」）。

### 3.3 再来

1. Review Scheduler が、アプリの起動時とバックグラウンドの同期のときに「明日までに再来するミスモン」を探す。
2. それぞれについて `/api/generate`（`mode: "revisit"`）を呼び、前とは違う類題を作って IndexedDB に入れておく。
3. 再来の日になったら、オフラインでもバトルできる。

## 4. 技術スタック（案）

| 層 | 採用するもの | 理由 |
|---|---|---|
| フレームワーク | Next.js（App Router）+ TypeScript（strict） | 決定済み。画面とサーバー API を1つのリポジトリで作れる |
| UI | Tailwind CSS、Radix UI | アクセシビリティに配慮された部品があり、作るのが速い |
| アニメーション | Framer Motion（視差効果を減らす設定に対応） | バトルの演出に使う |
| 端末の保存 | IndexedDB（Dexie） | オフライン用のキャッシュと送信待ちの一覧。データ構造の移行もできる |
| クラウドの保存 | `SyncStore` の後ろに隠す。最初の実装は Postgres（Drizzle ORM）を想定 | Postgres ならどのクラウドにもある。DynamoDB などの実装も足せる |
| ログイン | `AuthProvider` の後ろに隠す。候補は Auth.js、Cognito、Supabase Auth | マジックリンクとパスキーに対応していること |
| スキーマ | Zod | AI の出力の検証、API の入出力の型を1か所で定義する |
| 数式 | mathjs、KaTeX | 検算と数式の表示 |
| PWA | Serwist（Workbox の後継） | Service Worker |
| テスト | Vitest、Testing Library、Playwright | 単体テスト、部品のテスト、E2E テスト |
| AI の評価 | 自前の評価スクリプト（Vitest で実行） | プロンプトの退行（品質が下がること）を確認する |
| AI | Amazon Bedrock（Claude）を最初に検証する。ほかのものにも変えられる | OQ5 |
| ホスティング | 固定しない。`output: "standalone"` で、Docker でも Vercel でも Amplify でも動くようにする | OQ7 |
