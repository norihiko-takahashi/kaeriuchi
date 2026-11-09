# AI-DLC ステート

- **プロジェクト**: かえりうち
- **プロジェクト種別**: Greenfield（新規）
- **開始日**: 2026-11-08
- **現在のフェーズ**: 🟢 CONSTRUCTION — U2（AI 基盤）の NFR とインフラ設計（レビュー中）
- **Inception の承認**: 2026-11-08（課題 R1・R2 は Construction の中で検証する）

## INCEPTION フェーズ

| ステージ | 状態 | 成果物 |
|---|---|---|
| Workspace Detection | ✅ 完了 | 空のリポジトリ（Greenfield） |
| Reverse Engineering | ⏭ スキップ | 既存コードがないため不要 |
| Requirements Analysis | ✅ 完了（承認済み） | `inception/requirements/` |
| User Stories | ✅ 完了（承認済み） | `inception/user-stories/` |
| Workflow Planning | ✅ 完了（承認済み） | `inception/plans/execution-plan.md` |
| Application Design | ✅ 完了（承認済み） | `inception/application-design/` |
| Units Generation | ✅ 完了（承認済み） | `inception/units/unit-of-work.md`（U1〜U8） |

## CONSTRUCTION フェーズ

| ユニット | Functional Design | NFR | Infrastructure | Code | Build & Test |
|---|---|---|---|---|---|
| U1 基盤・プロフィール | ✅ 承認済み | ✅ 承認済み | ✅ 承認済み | ✅ 承認済み（`construction/u1-foundation/code/code-summary.md`） | ✅ CI ですべて成功（7c2f042。WebKit のオフラインでの移動は実機で確認する） |
| U2 AI 基盤 | ✅ 承認済み | 🟡 レビュー中 | 🟡 レビュー中 | ⬜ | ⬜ |
| U3〜U8 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |


ユニットごとに次の順で進めます：Functional Design → NFR Requirements → NFR Design → Infrastructure Design → Code Generation → Build & Test。
進める順番は `inception/plans/execution-plan.md` に書いています。

## OPERATIONS フェーズ（未着手）
