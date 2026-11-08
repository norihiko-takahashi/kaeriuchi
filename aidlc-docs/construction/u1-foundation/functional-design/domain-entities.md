# U1 機能設計：端末の中のデータ（IndexedDB）

`inception/application-design/domain-model.md` の型のうち、U1 で使うものを、IndexedDB（Dexie）の表として決めます。

## 1. 表（スキーマ v1）

| 表 | 主キー | 索引 | 中身 |
|---|---|---|---|
| `guardian` | `id` | — | 保護者（1端末に1件）。同意の版、使い方のルール、PIN のハッシュ |
| `children` | `id` | `guardianId`, `[guardianId+nickname]` | 子どものプロフィール |
| `outbox` | `seq`（自動で増える番号） | `entity`, `createdAt` | 送信待ちの変更（U8 でクラウドに送る） |
| `meta` | `key` | — | スキーマの版、端末の ID、最後に同期した位置（cursor）など |

U3 以降の表（`sheets`, `mistakes`, `battles`, `attempts`, `gameEvents`, `reviewStates`）は、それぞれのユニットでスキーマの版を上げて追加します。

## 2. 送信待ち（outbox）

```ts
interface OutboxItem {
  seq?: number;               // 自動で増える番号
  entity: SyncEntity;         // "child" | "guardianSettings" | ...
  id: string;                 // 対象のデータの ID
  op: "upsert" | "delete";
  payload?: unknown;
  clientUpdatedAt: string;
  createdAt: string;
}
```

- 画面からの変更は、**表への書き込みと outbox への追加を、1つのトランザクションで**行う。どちらか片方だけが残ることがないようにする。
- 同じデータへの変更が outbox に複数たまっていたら、送る前に、最後の1件にまとめてよい（`attempt` のような追記だけのデータを除く）。
- U1 では outbox に記録するだけで、送らない（送るのは U8）。

## 3. データ構造の移行

- スキーマの版ごとに、移行の処理（Dexie の `version(n).upgrade()`）を書く。
- 移行の処理には、すべて単体テストを付ける（前の版のデータを入れて、移行後に正しく読めることを確かめる）。

## 4. 保存容量

- ブラウザに「保存したデータを消さないで」とお願いする（`navigator.storage.persist()`）。ホーム画面に追加した PWA では、許可されやすい。
- 使っている容量を `navigator.storage.estimate()` で確認し、保護者メニューに表示する。
