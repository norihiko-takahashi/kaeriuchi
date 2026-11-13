import { MASTERED_COLOR } from "./labels";

/** 前と後（問題・子どもの答え → 正しい答え）。読み上げでも分かるように言葉を足す */
export function BeforeAfter({
  question,
  wrong,
  right,
}: {
  question?: string;
  wrong?: string;
  right?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-lg border border-line bg-surface px-2.5 py-1">
        {question ? `${question} ` : ""}
        <span className="sr-only">子どもの答え</span>
        <s>{wrong}</s>
      </span>
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M4 10h12M11 5l5 5-5 5"
          fill="none"
          stroke={MASTERED_COLOR}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="rounded-lg bg-surface px-2.5 py-1 font-bold"
        style={{ border: `1.5px solid ${MASTERED_COLOR}` }}
      >
        <span className="sr-only">正しい答え</span>
        {right}
      </span>
    </div>
  );
}
