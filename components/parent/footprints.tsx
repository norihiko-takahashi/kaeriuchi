"use client";

import Link from "next/link";
import { type KeyboardEvent, useRef } from "react";
import type { CalendarDay } from "@/domain/parent/insights";
import { dayHref, dayLabel, monthOf } from "./labels";

/**
 * 学習の足あと（U7）。1マス1日、たてが月〜日、よこが週。
 * - 濃さはその日のバトルの回数（1回・2回・3回以上）。登録だけの日は点、お休みチケットの日は点線
 * - 記録のある日だけ押せる（日の詳細へ）。未来の日は描かない
 * - キーボード：カレンダーに1回で入り（いちばん新しい記録の日）、矢印キーで記録のある日を移る
 */

/** バトルの回数ごとの色（1回でも白との差が 3:1 以上） */
export const LEVELS = ["#ea580c", "#b8400c", "#6b2408"];
const DOT = "#c2410c";
const EMPTY_LINE = "#cbd5e1";
const TICKET_LINE = "#64748b";

const ROW = ["月", "", "水", "", "金", "", "日"];

function describe(d: CalendarDay): string {
  const parts = [dayLabel(d.day) + (d.today ? "（今日）" : "")];
  if (d.battles) parts.push(`バトル ${d.battles}回`);
  if (d.registered) parts.push(`登録 ${d.registered}問`);
  if (!d.battles && d.ticket) parts.push("お休みチケット");
  if (!d.battles && !d.registered && !d.ticket) parts.push("記録なし");
  return parts.join("　");
}

export function Footprints({
  childId,
  days,
}: {
  childId: string;
  days: CalendarDay[];
}) {
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const open = days
    .map((d, i) => (d.battles || d.registered ? i : -1))
    .filter((i) => i >= 0);
  const entry = open.at(-1);

  const onKey = (e: KeyboardEvent, i: number) => {
    const at = open.indexOf(i);
    const to =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? open[at + 1]
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? open[at - 1]
          : e.key === "Home"
            ? open[0]
            : e.key === "End"
              ? open.at(-1)
              : undefined;
    if (to === undefined) return;
    e.preventDefault();
    refs.current[to]?.focus();
  };

  const weeks = Math.ceil(days.length / 7);
  // 月の名前：その月の1日がある週（と、最初の週）に出す
  const months = Array.from({ length: weeks }, (_, w) => {
    const week = days.slice(w * 7, w * 7 + 7);
    const first = week.find((d) => d.day.endsWith("-01"));
    if (w === 0) return `${monthOf(week[0].day)}月`;
    return first ? `${monthOf(first.day)}月` : "";
  });

  return (
    <div className="flex flex-col gap-2">
      <div
        className="grid gap-[5px] pl-[21px] text-xs text-muted"
        style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 40px))` }}
        aria-hidden="true"
      >
        {months.map((m, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 週の並びは変わらない
          <span key={i} className="whitespace-nowrap">
            {m}
          </span>
        ))}
      </div>
      <div className="flex gap-[5px]">
        <div
          className="grid w-4 grid-rows-[repeat(7,28px)] items-center gap-[5px] text-xs text-muted"
          aria-hidden="true"
        >
          {ROW.map((r, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 曜日の並びは変わらない
            <span key={i}>{r}</span>
          ))}
        </div>
        <ul
          className="grid flex-1 grid-flow-col grid-rows-[repeat(7,28px)] gap-[5px]"
          style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 40px))` }}
          aria-label="学習の足あと（矢印キーで記録のある日を移れます）"
        >
          {days.map((d, i) => {
            if (d.future) return <li key={d.day} aria-hidden="true" />;
            const ring = d.today
              ? "0 0 0 2px var(--surface), 0 0 0 4px var(--text)"
              : undefined;
            const bg = d.battles
              ? LEVELS[Math.min(d.battles, 3) - 1]
              : "var(--surface)";
            const border = d.battles
              ? "none"
              : d.ticket
                ? `1.5px dashed ${TICKET_LINE}`
                : `1.5px solid ${EMPTY_LINE}`;
            const style = {
              background: bg,
              border,
              boxShadow: ring,
            } as const;
            const dot =
              !d.battles && d.registered ? (
                <span
                  className="block h-1.5 w-1.5 rounded-full"
                  style={{ background: DOT }}
                />
              ) : null;
            const cls =
              "flex h-full w-full items-center justify-center rounded-md";
            const href = dayHref(childId, d.day);
            return (
              <li key={d.day} className="flex">
                {open.includes(i) ? (
                  <Link
                    href={href}
                    ref={(el) => {
                      refs.current[i] = el;
                    }}
                    tabIndex={i === entry ? 0 : -1}
                    aria-label={describe(d)}
                    onKeyDown={(e) => onKey(e, i)}
                    onClick={(e) => {
                      if (!navigator.onLine) {
                        e.preventDefault();
                        window.location.assign(href);
                      }
                    }}
                    className={`${cls} focus-visible:outline-2 focus-visible:outline-offset-2`}
                    style={style}
                  >
                    {dot}
                  </Link>
                ) : (
                  <span
                    role="img"
                    aria-label={describe(d)}
                    className={cls}
                    style={style}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {["1回", "2回", "3回以上"].map((t, i) => (
          <span key={t} className="flex items-center gap-1">
            <span
              className="block h-3 w-3 rounded-sm"
              style={{ background: LEVELS[i] }}
            />
            {t}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span
            className="flex h-3 w-3 items-center justify-center rounded-sm"
            style={{ border: `1.5px solid ${EMPTY_LINE}` }}
          >
            <span
              className="block h-1 w-1 rounded-full"
              style={{ background: DOT }}
            />
          </span>
          登録だけ
        </span>
        <span className="flex items-center gap-1">
          <span
            className="block h-3 w-3 rounded-sm"
            style={{ border: `1.5px dashed ${TICKET_LINE}` }}
          />
          お休みチケット
        </span>
      </div>
      <p className="text-xs text-muted">
        マスを押すと、その日のことが見られます。
      </p>
    </div>
  );
}
