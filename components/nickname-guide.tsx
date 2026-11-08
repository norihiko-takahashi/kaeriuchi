"use client";

import { ReadAloud } from "./read-aloud";
import { R } from "./ruby";

/* 絵は仮の SVG（OQ6）。怖くなりすぎない絵柄にする */

function TreasureArt() {
  return (
    <svg viewBox="0 0 160 100" className="h-28 w-full" aria-hidden="true">
      <rect x="45" y="40" width="70" height="45" rx="6" fill="#b45309" />
      <rect x="45" y="30" width="70" height="20" rx="6" fill="#d97706" />
      <rect x="72" y="48" width="16" height="14" rx="3" fill="#fde68a" />
      <text x="80" y="76" textAnchor="middle" fontSize="11" fill="#fff">
        なまえ
      </text>
      <circle cx="28" cy="62" r="16" fill="#22c55e" />
      <circle cx="23" cy="58" r="3" fill="#111" />
      <circle cx="33" cy="58" r="3" fill="#111" />
      <path d="M22 67 q6 5 12 0" stroke="#111" strokeWidth="2" fill="none" />
    </svg>
  );
}

function ShadowArt() {
  return (
    <svg viewBox="0 0 160 100" className="h-28 w-full" aria-hidden="true">
      <rect
        x="20"
        y="15"
        width="80"
        height="60"
        rx="8"
        fill="#e0f2fe"
        stroke="#0369a1"
        strokeWidth="3"
      />
      <circle cx="60" cy="45" r="14" fill="#94a3b8" />
      <text x="60" y="49" textAnchor="middle" fontSize="12" fill="#fff">
        ？
      </text>
      <rect x="110" y="45" width="34" height="22" rx="4" fill="#fde68a" />
      <text x="127" y="60" textAnchor="middle" fontSize="9" fill="#92400e">
        なまえ
      </text>
    </svg>
  );
}

function TogetherArt() {
  return (
    <svg viewBox="0 0 160 100" className="h-28 w-full" aria-hidden="true">
      <circle
        cx="55"
        cy="40"
        r="18"
        fill="#fde7d4"
        stroke="#c2410c"
        strokeWidth="3"
      />
      <circle
        cx="105"
        cy="50"
        r="13"
        fill="#fde7d4"
        stroke="#0f766e"
        strokeWidth="3"
      />
      <path
        d="M30 95 q25 -35 50 0 M88 95 q17 -25 34 0"
        fill="#c2410c"
        opacity="0.4"
      />
      <text x="80" y="18" textAnchor="middle" fontSize="16">
        💡
      </text>
    </svg>
  );
}

/** S-05 名前の説明の3コマ（data-inventory.md §3） */
export function NicknameGuide() {
  return (
    <ol className="flex flex-col gap-4">
      <li className="card flex flex-col gap-2 p-4">
        <TreasureArt />
        <h2 className="text-lg font-bold">なまえは きみの たいせつな ひみつ</h2>
        <p>
          ほんとうの なまえは、きみが だれなのかが わかる だいじな
          じょうほうだよ。
        </p>
        <ReadAloud text="なまえは きみの たいせつな ひみつ。ほんとうの なまえは、きみが だれなのかが わかる だいじな じょうほうだよ。" />
      </li>
      <li className="card flex flex-col gap-2 p-4">
        <ShadowArt />
        <h2 className="text-lg font-bold">しらない ひとに しられると…</h2>
        <p>
          なまえと がくねんが わかると、しらない ひとが きみを さがせて
          しまうことが あるんだ。
        </p>
        <ReadAloud text="しらない ひとに しられると。なまえと がくねんが わかると、しらない ひとが きみを さがせて しまうことが あるんだ。" />
      </li>
      <li className="card flex flex-col gap-2 p-4">
        <TogetherArt />
        <h2 className="text-lg font-bold">かえりうちネームを つけよう！</h2>
        <p>
          すきな もの・どうぶつ・ひっさつわざ なんでも OK！ おうちの ひとと
          いっしょに かんがえてね。
        </p>
        <p className="text-sm text-muted">
          れい：「ほのおのきつね」「さんすうマスター」
        </p>
        <ReadAloud text="かえりうちネームを つけよう。すきな もの、どうぶつ、ひっさつわざ、なんでも オーケー。おうちの ひとと いっしょに かんがえてね。" />
      </li>
      <li className="rounded-[var(--radius)] border border-line p-4 text-sm">
        <strong>
          <R k="保護者" r="ほごしゃ" />の<R k="方" r="かた" />
          へ：
        </strong>
        ニックネームは画面の表示に使い、クラウドにも保存します。本名や、学校で使っているあだ名は避けてください。
      </li>
    </ol>
  );
}
