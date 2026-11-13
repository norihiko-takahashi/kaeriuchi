# U3 NFR 設計：撮影・切り抜き・解析

新しい外部のライブラリは入れません。画像の処理はブラウザの Canvas と `createImageBitmap` で行います。

## 1. ディレクトリ

```
domain/capture/
├─ geometry.ts        # 枠の作成・動かす・大きさを変える・はみ出さない・並べ替え・大きさの注意（純粋な関数）
├─ crop.ts            # 写真の中の枠 → 切り抜く範囲（縮めた写真の座標 → 元の座標）、出力の大きさ
└─ capture.test.ts
client/capture/
├─ photo.ts           # 写真を読む（向きを直して 2048px に縮める）・捨てる
├─ redact.ts          # かくすペンの線を写真に描く（黒で塗る）
├─ export.ts          # 枠を切り抜いて JPEG（1600px・0.85・2MB まで）にする
└─ analyze-queue.ts   # 2枚ずつ /api/ai/analyze に送る。失敗した枠を覚える
server/ai/pii.ts      # 伏せ字の規則（spikes/r1/pii-text.ts から移す）+ テスト
app/capture/page.tsx  # ①教科 → ②撮る・選ぶ → ③囲む → ④かくすペン → ⑤送る → ⑥1問ずつ確かめる → ⑦登録
components/capture/
├─ frame-editor.tsx   # 写真と枠（指・キーボード）。2本の指で大きく・動かす
└─ review-step.tsx    # 1問の確認（切り抜いた画像と、読み取った結果）
```

## 2. 写真の持ち方（U3-PRIV-1・U3-MEM-1）

- `<input type="file" accept="image/*" capture="environment">` で受け取った `File` を、`createImageBitmap(file, { imageOrientation: "from-image" })` で読み、長い辺 2048px の `OffscreenCanvas`（ない端末は `<canvas>`）に描く。`File` と元の大きさの bitmap はすぐ `close()` して参照を外す。
- 写真は React の状態ではなく、画面の部品の中の参照（`useRef`）にだけ持つ。画面を離れるとき・登録のあと・やめるときに、キャンバスの大きさを 0 にして中身を消す。
- `visibilitychange` で裏に回った時刻を覚え、戻ったときに 10分を過ぎていれば捨てる。
- 写真は IndexedDB・Cache Storage には書かない。Service Worker は `/api/ai/analyze` をキャッシュしない（いまの設定のまま。E2E で確かめる）。

## 3. 枠（geometry.ts）

- 座標は、縮めた写真の画素で持つ（画面の拡大に左右されない）。`{ id, x, y, w, h }`。
- 写真の外にはみ出さないよう、いつも切り詰める。最小の大きさは短い辺の 4%（これより小さく作ると注意）。
- 並べ替え：上の端が近いもの（枠の高さの半分以内）は同じ段とみなし、段の中は左から。
- 注意：小さすぎる（4% 未満）・大きすぎる（面積の 60% 超）。大きすぎても送れる。
- 指の操作：1本の指で、何もないところからなぞると新しい枠、枠の中なら動かす、角の取っ手なら大きさを変える。2本の指で拡大・移動（最大 4倍）。
- キーボード：枠は `button` にして Tab で選べる。矢印で 1%、Shift＋矢印で大きさを変える。「わくを ふやす」ボタンで真ん中に枠を足す。

## 4. かくすペン（redact.ts）

- 線は縮めた写真の座標で持つ（`{ points, width }[]`）。「もとにもどす」は最後の線を消す。
- 送るときに、縮めた写真を写したキャンバスに線を黒で描いてから切り抜く。元のキャンバスには描かない（もとにもどせるように）。画面の表示は、写真の上に重ねた線で見せる。

## 5. 送る（export.ts・analyze-queue.ts）

- 切り抜き：縮めた写真から、枠の範囲を `drawImage` で写す（長い辺 1600px を超えれば縮める）。`toBlob("image/jpeg", 0.85)`。2MB を超えたら品質を 0.7 → 0.55 と下げる。
- 描き直すので、撮影情報は付かない。
- 送る：`FormData`（image・grade・subject）。2つずつ並べ、残りは前が終わったら送る。時間切れ・混雑・上限のエラーは、その枠を「失敗」にして続ける。`limit`（1日の上限）のときは、残りを送らずに「きょうは もう よみとれないよ」と出す。
- オフラインなら送らない（`navigator.onLine`）。

## 6. 伏せ字（server/ai/pii.ts）

- `redactPii(text): { text, found: PiiKind[] }`。規則はスパイクのものをそのまま移し、問題文の登場人物・「名前を書きましょう」は伏せない（スパイクの見本でテスト）。
- `/api/ai/analyze` で、AI の結果の `question`・`childAnswer`・`correctAnswer`・`explanation` に当てる。見つけたら `piiDetected: true` にする。ログ（telemetry）には、見つけた種類の数だけを残す。

## 7. 登録

- `shared/battle.ts` の `Mistake.source` に `"photo"` を足す（IndexedDB の形は変えない。値が増えるだけ）。
- 1回の撮影の間違いを、いまの `createSheet` で作ったテストにまとめる（`battle-repo` に `registerMistakes(childId, sheet, drafts[])` を足し、1つのトランザクションで入れる）。

## 8. テスト

- `domain/capture/**` と `server/ai/pii.ts` は単体テスト（U3-TEST-1）。
- E2E：Playwright で、用意した見本の画像（自作の合成画像。本物の写真は使わない）を `setInputFiles` で選ぶ → 指の代わりにマウスで2つ囲む → かくすペンで塗る → 送る。`page.route` で `/api/ai/analyze` への通信を受け取り、画像の大きさが枠と同じこと・塗ったところが黒いことを確かめる。偽物の AI の結果で、1問ずつ確かめて登録 → ホームに2匹
