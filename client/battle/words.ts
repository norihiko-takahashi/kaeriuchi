"use client";

import { useAppState } from "@/components/app-state";

/**
 * 画面の言葉。中学生モードでは、漢字まじりで落ち着いた言い方にする（BR-6-6）。
 */
const KIDS = {
  fight: "⚔️ たたかう",
  fightLater: "あとで たたかう",
  defeated: "げきは！",
  almost: "あと いっぽ！",
  appeared: "ミスモンが あらわれた！",
  dex: "ずかん",
  dexTitle: "ミスモン ずかん",
  sheets: "テスト",
  revisitTitle: "きょうの さいらい ミスモン",
  revisitDone: "きょうの さいらいは ぜんぶ たおした！",
  open: "まだ たおしていない ミスモン",
  streak: "れんぞく",
  level: "レベル",
  sheetFight: "まとめて たたかう",
  next: "つぎの ミスモンへ",
};

const JUNIOR: typeof KIDS = {
  fight: "解く",
  fightLater: "あとで解く",
  defeated: "撃破",
  almost: "あと一歩",
  appeared: "弱点が見つかりました",
  dex: "弱点ノート",
  dexTitle: "弱点ノート",
  sheets: "テスト",
  revisitTitle: "今日の復習",
  revisitDone: "今日の復習は完了です",
  open: "まだ解いていない弱点",
  streak: "連続",
  level: "レベル",
  sheetFight: "まとめて解く",
  next: "次の問題へ",
};

export type Words = typeof KIDS;

export function useWords(): Words {
  const { mode } = useAppState();
  return mode === "junior" ? JUNIOR : KIDS;
}
