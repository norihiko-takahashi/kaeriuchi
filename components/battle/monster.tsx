"use client";

import { mistakeType } from "@/client/ai/catalog";

/** 仮のミスモン（SVG）。絵は後から差し替える（OQ6）。名前は画面の文字で伝え、絵は飾り */
export function Monster({
  typeId,
  size = 160,
  motion = "idle",
}: {
  typeId: string;
  size?: number;
  motion?: "appear" | "idle" | "hit" | "none";
}) {
  const t = mistakeType(typeId);
  const cls =
    motion === "none"
      ? ""
      : motion === "appear"
        ? "monster-appear"
        : motion === "hit"
          ? "monster-hit"
          : "monster-idle";
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      className={cls}
    >
      <path
        d="M20 95 Q10 40 60 18 Q110 40 100 95 Q90 108 80 98 Q70 110 60 98 Q50 110 40 98 Q30 108 20 95 Z"
        fill={t.color}
        stroke="#333"
        strokeWidth="3"
      />
      <circle
        cx="45"
        cy="55"
        r="11"
        fill="#fff"
        stroke="#333"
        strokeWidth="2"
      />
      <circle
        cx="75"
        cy="55"
        r="11"
        fill="#fff"
        stroke="#333"
        strokeWidth="2"
      />
      <circle cx="48" cy="57" r="5" fill="#333" />
      <circle cx="72" cy="57" r="5" fill="#333" />
      <path
        d="M45 78 Q60 70 75 78"
        fill="none"
        stroke="#333"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <text
        x="60"
        y="16"
        textAnchor="middle"
        fontSize="16"
        fontWeight="bold"
        fill="#c00"
      >
        ✗
      </text>
    </svg>
  );
}
