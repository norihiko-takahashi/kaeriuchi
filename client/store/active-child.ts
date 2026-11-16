/** いま使っている子どもの ID（タブを閉じるまで覚える。画面の状態と AI の回数の数え方で使う） */
export const ACTIVE_CHILD_KEY = "kaeriuchi:active-child";

export function readActiveChild(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_CHILD_KEY);
  } catch {
    return null;
  }
}
