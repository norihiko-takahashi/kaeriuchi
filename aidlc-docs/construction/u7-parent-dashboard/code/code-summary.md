# U7 コードの作成：まとめ

| 場所 | 内容 |
|---|---|
| `domain/parent/insights.ts` | 集計（まとめ・教科ごと・TOP5・週ごとの推移）。単体テストつき |
| `client/store/game-repo.ts` | `insightsFor(childId)` |
| `components/parent/charts.tsx` | 横の棒・たての棒・折れ線（SVG）。なぞる・フォーカスで値を出す |
| `app/parent/insights/page.tsx` | 「学習のようす」。保護者メニューに入り口を足した |

## 確かめたこと（ローカル）
- 単体テスト 339件成功
- E2E：撃破 → 翌日の再来のあとに「学習のようす」を開き、数・TOP5・表（1/1・100%）を確かめる。axe と CSP の違反なし
- 見本の記録（8週分）を入れた画面を、スマホの幅で目で確かめた

## まだできていないこと
- ほかの端末の記録を合わせて見る（U8）
- AI による傾向のまとめ（MVP に入れない）
