"use client";

import { useEffect, useState } from "react";
import { useAppState } from "./app-state";

/**
 * 読み上げボタン（ブラウザの音声合成）。
 * 低学年・高学年モードで表示する。中学生モードでは出さない。
 */
export function ReadAloud({ text }: { text: string }) {
  const { mode } = useAppState();
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported("speechSynthesis" in window);
  }, []);

  if (!supported || mode === "junior") return null;

  const speak = () => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  };

  return (
    <button
      type="button"
      onClick={speak}
      className="tap inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 text-sm text-muted"
      aria-label="よみあげる"
    >
      <span aria-hidden="true">🔊</span>
      よみあげ
    </button>
  );
}
