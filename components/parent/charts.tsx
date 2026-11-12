"use client";

import { useState } from "react";

/**
 * 保護者向けの小さなグラフ（U7）。ライブラリは使わず、SVG で描く（画面の大きさを増やさない）。
 * - 1つのグラフに1つの値だけ（2つの軸を持つグラフは作らない）
 * - 色は1色（アプリの主の色）。値は文字でも出し、表でも見られる（色だけで伝えない）
 * - なぞる・フォーカスすると、その週の値を出す
 */

const W = 320;
const H = 150;
const PAD = { l: 34, r: 8, t: 14, b: 24 };
const plotW = W - PAD.l - PAD.r;
const plotH = H - PAD.t - PAD.b;

export interface WeekPoint {
  label: string;
  value: number | null;
  detail: string;
}

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step) * step;
}

function Tip({ x, text }: { x: number; text: string }) {
  const w = Math.max(60, text.length * 11 + 12);
  const tx = Math.min(Math.max(x - w / 2, 2), W - w - 2);
  return (
    <g pointerEvents="none">
      <rect
        x={tx}
        y={0}
        width={w}
        height={20}
        rx={4}
        className="fill-[var(--text)]"
      />
      <text
        x={tx + w / 2}
        y={14}
        textAnchor="middle"
        className="fill-[var(--surface)] text-[11px]"
      >
        {text}
      </text>
    </g>
  );
}

/** 週ごとの数（たての棒） */
export function WeeklyBars({
  points,
  unit,
}: {
  points: WeekPoint[];
  unit: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...points.map((p) => p.value ?? 0)));
  const slot = plotW / points.length;
  const bw = Math.min(22, slot * 0.6);
  const y = (v: number) => PAD.t + plotH - (v / max) * plotH;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`週ごとの${unit}`}
    >
      {[0, max / 2, max].map((g) => (
        <g key={g}>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(g)}
            y2={y(g)}
            className="stroke-[var(--border)]"
            strokeWidth={1}
          />
          <text
            x={PAD.l - 6}
            y={y(g) + 4}
            textAnchor="end"
            className="fill-[var(--text-muted)] text-[10px] tabular-nums"
          >
            {g}
          </text>
        </g>
      ))}
      {points.map((p, i) => {
        const cx = PAD.l + slot * i + slot / 2;
        const v = p.value ?? 0;
        const top = y(v);
        const h = Math.max(0, PAD.t + plotH - top);
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: 値は下の表でも読める。なぞったときの補助
          <g
            key={p.label}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            tabIndex={0}
            aria-label={`${p.label}：${p.detail}`}
          >
            <rect
              x={PAD.l + slot * i}
              y={PAD.t}
              width={slot}
              height={plotH}
              fill="transparent"
            />
            {h > 0 ? (
              <path
                d={`M${cx - bw / 2},${PAD.t + plotH} V${top + Math.min(4, h)} Q${cx - bw / 2},${top} ${cx - bw / 2 + Math.min(4, h)},${top} H${cx + bw / 2 - Math.min(4, h)} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + Math.min(4, h)} V${PAD.t + plotH} Z`}
                className="fill-[var(--primary)]"
                opacity={hover === null || hover === i ? 1 : 0.45}
              />
            ) : null}
            <text
              x={cx}
              y={H - 6}
              textAnchor="middle"
              className="fill-[var(--text-muted)] text-[10px] tabular-nums"
            >
              {p.label}
            </text>
          </g>
        );
      })}
      {hover !== null ? (
        <Tip x={PAD.l + slot * hover + slot / 2} text={points[hover].detail} />
      ) : null}
    </svg>
  );
}

/** 週ごとの割合（折れ線）。目安の線つき。記録のない週は点を打たず、線も切る */
export function WeeklyRate({
  points,
  target,
}: {
  points: WeekPoint[];
  target: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const slot = plotW / points.length;
  const x = (i: number) => PAD.l + slot * i + slot / 2;
  const y = (v: number) => PAD.t + plotH - v * plotH;
  const segments: string[] = [];
  let cur = "";
  points.forEach((p, i) => {
    if (p.value === null) {
      if (cur) segments.push(cur);
      cur = "";
      return;
    }
    cur += `${cur ? "L" : "M"}${x(i)},${y(p.value)} `;
  });
  if (cur) segments.push(cur);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="週ごとの再来の撃破率"
    >
      {[0, 0.5, 1].map((g) => (
        <g key={g}>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(g)}
            y2={y(g)}
            className="stroke-[var(--border)]"
            strokeWidth={1}
          />
          <text
            x={PAD.l - 6}
            y={y(g) + 4}
            textAnchor="end"
            className="fill-[var(--text-muted)] text-[10px] tabular-nums"
          >
            {Math.round(g * 100)}%
          </text>
        </g>
      ))}
      <line
        x1={PAD.l}
        x2={W - PAD.r}
        y1={y(target)}
        y2={y(target)}
        className="stroke-[var(--text-muted)]"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <text
        x={W - PAD.r}
        y={y(target) - 4}
        textAnchor="end"
        className="fill-[var(--text-muted)] text-[10px]"
      >
        目安 {Math.round(target * 100)}%
      </text>
      {segments.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          className="stroke-[var(--primary)]"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      ))}
      {points.map((p, i) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: 値は下の表でも読める。なぞったときの補助
        <g
          key={p.label}
          onPointerEnter={() => setHover(i)}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
          tabIndex={0}
          aria-label={`${p.label}：${p.detail}`}
        >
          <rect
            x={PAD.l + slot * i}
            y={PAD.t}
            width={slot}
            height={plotH}
            fill="transparent"
          />
          {p.value !== null ? (
            <circle
              cx={x(i)}
              cy={y(p.value)}
              r={hover === i ? 5 : 4}
              className="fill-[var(--primary)] stroke-[var(--surface)]"
              strokeWidth={2}
            />
          ) : null}
          <text
            x={x(i)}
            y={H - 6}
            textAnchor="middle"
            className="fill-[var(--text-muted)] text-[10px] tabular-nums"
          >
            {p.label}
          </text>
        </g>
      ))}
      {hover !== null ? <Tip x={x(hover)} text={points[hover].detail} /> : null}
    </svg>
  );
}

/** 横の棒の一覧（教科ごと・TOP5）。数は文字でも出す */
export function BarList({
  rows,
}: {
  rows: {
    key: string;
    label: string;
    sub?: string;
    value: number;
    note: string;
  }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 font-bold">{r.label}</span>
            <span className="shrink-0 text-sm tabular-nums">{r.note}</span>
          </div>
          {r.sub ? <span className="text-xs text-muted">{r.sub}</span> : null}
          <div className="h-2.5 w-full rounded-full bg-bg" aria-hidden="true">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
