"use client";

import { completeRegrade, pendingRegrades } from "../store/battle-repo";
import { gradeFreeText } from "./api";

let running = false;

/**
 * 通信が切れていたときに「おなじ？」で答えた分を、AI で採点し直して記録する（U45-OFF-2）。
 * 子どもの結果は変えない。通信できるときに、ホームやバトルの画面から呼ぶ。
 */
export async function flushRegrades(): Promise<void> {
  if (running || (typeof navigator !== "undefined" && !navigator.onLine))
    return;
  running = true;
  try {
    for (const r of await pendingRegrades()) {
      try {
        const correct = await gradeFreeText({
          problem: { ...r.problem },
          answer: r.answer,
          grade: r.grade,
        });
        await completeRegrade(r, correct);
      } catch {
        return; // また次の機会に
      }
    }
  } finally {
    running = false;
  }
}
