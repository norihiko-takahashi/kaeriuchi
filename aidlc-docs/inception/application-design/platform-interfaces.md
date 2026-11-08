# アプリケーション設計：基盤のインターフェース（SyncStore・AuthProvider）

公開先、同期の保存先、ログインの基盤は固定しません（OQ7）。`AIProvider`（`ai-provider.md`）と同じように、インターフェースの後ろに隠します。

## 1. SyncStore（同期の保存先）

```ts
type SyncEntity = "child" | "mistake" | "battle" | "attempt" | "gameEvent" | "guardianSettings";

interface ChangeRecord {
  entity: SyncEntity;
  id: string;
  op: "upsert" | "delete";
  payload?: unknown;          // Zod で検証したもの
  clientUpdatedAt: string;
  deviceId: string;
}

interface SyncStore {
  /** 端末からの変更を反映し、反映した結果（サーバーの updatedAt と version）を返す */
  push(guardianId: string, changes: ChangeRecord[]): Promise<{ applied: ChangeRecord[]; rejected: { id: string; reason: string }[] }>;

  /** cursor より後の変更を返す */
  pull(guardianId: string, cursor: string | null, limit: number): Promise<{ changes: ChangeRecord[]; nextCursor: string }>;

  /** 子ども1人分、またはアカウント全体のデータを書き出す */
  export(guardianId: string, childId?: string): Promise<ReadableStream>;

  /** 削除する（論理削除したあと、決めた期間が過ぎたら本当に消す） */
  purge(guardianId: string, childId?: string): Promise<void>;
}
```

- すべてのメソッドは `guardianId` を必ず受け取り、実装の中でもその保護者のデータだけを触る（Postgres なら、行ごとのアクセス制御（RLS）も合わせて使う）。
- 実装の候補：`MemorySyncStore`（テスト用）、`PostgresSyncStore`（Drizzle ORM。最初の実装の想定）、`DynamoSyncStore`（AWS を選んだとき）。
- 同期の方式は「変更の記録の受け渡し」（push と pull）にする。特定のサービスのリアルタイム同期の機能には頼らない。

## 2. AuthProvider（ログイン）

```ts
interface AuthProvider {
  sendMagicLink(email: string, redirectTo: string): Promise<void>;
  verifyMagicLink(token: string): Promise<Session>;

  passkeyRegistrationOptions(session: Session): Promise<PublicKeyCredentialCreationOptionsJSON>;
  verifyPasskeyRegistration(session: Session, response: RegistrationResponseJSON): Promise<void>;
  passkeyAuthenticationOptions(email?: string): Promise<PublicKeyCredentialRequestOptionsJSON>;
  verifyPasskeyAuthentication(response: AuthenticationResponseJSON): Promise<Session>;

  getSession(request: Request): Promise<Session | null>;
  listDevices(guardianId: string): Promise<DeviceSession[]>;
  revokeDevice(guardianId: string, deviceId: string): Promise<void>;
  signOut(session: Session): Promise<void>;
}

interface Session { guardianId: string; deviceId: string; expiresAt: string }
```

- 実装の候補：`DevAuthProvider`（開発用。メールを送らずに、リンクをログに出す）、Auth.js（自分たちで運用する）、Cognito、Supabase Auth。
- パスキーは WebAuthn の標準に従う（実装では SimpleWebAuthn などのライブラリを使う想定）。基盤側に機能があれば、それを使ってもよい。
- セッションは HttpOnly の Cookie で持つ。子どもが使う端末では、保護者向けの画面に入るときに、もう一度 PIN か端末の認証（指紋・顔など）を求める（US-7.2）。

## 3. 設定

| 環境変数 | 例 |
|---|---|
| `AI_PROVIDER` | `mock` / `bedrock` / `anthropic` |
| `SYNC_STORE` | `memory` / `postgres` / `dynamo` |
| `AUTH_PROVIDER` | `dev` / `authjs` / `cognito` / `supabase` |

`docker compose up` だけで、Mock の AI、ローカルの Postgres、開発用のログインを使って、全機能が動くようにします。
