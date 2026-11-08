# 要件確認の質問（回答済み）

## Q1. 今回どこまで進めるか
- A) Inception と MVP の実装
- B) Inception のみ

[Answer]: B — Inception のみ（レビューしてから実装に入る）

## Q2. 主な対象ユーザーと教科
- A) 小学生・算数が中心
- B) 小中学生・全教科
- C) 中学生・数学と英語

[Answer]: B — 小中学生・全教科

## Q3. プラットフォームと技術スタック
- A) PWA（Next.js + TypeScript）
- B) React Native（Expo）
- C) Flutter

[Answer]: A — PWA（Next.js + TypeScript）

## Q4. 画像の解析と問題の生成に使う AI
- A) Claude API
- B) Amazon Bedrock 経由の Claude
- C) 未定（差し替えられるようにする）

[Answer]: C — 未定。`AIProvider` インターフェースで差し替えられるようにし、モックで全機能が動くようにする
