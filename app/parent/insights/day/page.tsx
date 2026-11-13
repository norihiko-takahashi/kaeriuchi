"use client";

import { useEffect, useState } from "react";
import { mistakeType } from "@/client/ai/catalog";
import { useHashId } from "@/client/pwa/hash-id";
import { dayDetailFor } from "@/client/store/game-repo";
import { Monster } from "@/components/battle/monster";
import { BeforeAfter } from "@/components/parent/before-after";
import {
  battleResult,
  dayHref,
  dayLabel,
  MASTERED_COLOR,
  monthDay,
  SUBJECTS,
  yearOf,
} from "@/components/parent/labels";
import { ParentGuard } from "@/components/parent-guard";
import { LinkButton, Page } from "@/components/ui";
import type { DayDetail } from "@/domain/parent/insights";
import type { ChildProfile } from "@/shared/schemas";

/**
 * 学習のようす：日の詳細（U7）。カレンダーのマスから開く。
 * # のあとに「子どもの ID/日付」が入る（例：/parent/insights/day#<id>/2026-11-12）。
 * ミスモン（ゲームの見た目）は、最初の画面をごちゃつかせないよう、ここにだけ出す
 */

const card = "rounded-[20px] border border-line bg-surface";
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function parseHash(hash: string): { childId: string; day: string } | null {
  const at = hash.lastIndexOf("/");
  if (at < 1) return null;
  const childId = hash.slice(0, at);
  const day = hash.slice(at + 1);
  return DAY.test(day) ? { childId, day } : null;
}

function DayNav({
  childId,
  day,
  label,
}: {
  childId: string;
  day: string | null;
  label: "前" | "次";
}) {
  if (!day) return <span className="h-11 w-11 shrink-0" />;
  const href = dayHref(childId, day);
  return (
    // 同じ画面の中で # だけを変える。ふつうのリンクにして hashchange を起こす（Next.js の移動では起きない）
    <a
      href={href}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface"
    >
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
        <path
          d={label === "前" ? "M12 4l-6 6 6 6" : "M8 4l6 6-6 6"}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="sr-only">{`${label}の記録の日（${yearOf(day)}年${monthDay(day)}）`}</span>
    </a>
  );
}

function DayView({ child, day }: { child: ChildProfile; day: string }) {
  const [data, setData] = useState<DayDetail | null>(null);
  useEffect(() => {
    setData(null);
    dayDetailFor(child.id, day).then(setData);
  }, [child.id, day]);
  if (!data) return <p className="text-muted">読み込み中…</p>;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-2">
        <DayNav childId={child.id} day={data.prev} label="前" />
        <div className="text-center">
          <p className="text-xs text-muted">
            {yearOf(day)}年{data.today ? "・今日" : ""}
          </p>
          <h2 className="text-xl leading-snug font-bold">{dayLabel(day)}</h2>
          <p className="text-sm text-muted">
            バトル {data.battles.length}回・登録 {data.registered.length}問
          </p>
        </div>
        <DayNav childId={child.id} day={data.next} label="次" />
      </div>

      {data.battles.length === 0 && data.registered.length === 0 ? (
        <p className={`${card} p-4`}>この日の記録はありません。</p>
      ) : null}

      {data.battles.length > 0 ? (
        <section
          aria-labelledby="h-battles"
          className={`${card} flex flex-col gap-3 p-4`}
        >
          <h3 id="h-battles" className="font-bold">
            この日に戦ったミスモン（{data.battles.length}匹）
          </h3>
          <ul className="flex flex-col">
            {data.battles.map((b) => {
              const type = mistakeType(b.mistake.mistakeTypeId);
              return (
                <li
                  key={b.battleId}
                  className="flex flex-col gap-2 border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="shrink-0">
                      <Monster typeId={type.id} size={72} motion="none" />
                    </span>
                    <div className="flex min-w-0 flex-col leading-snug">
                      <span className="font-bold">{type.monster}</span>
                      <span className="text-xs text-muted">{type.label}</span>
                      <span
                        className="text-sm font-bold"
                        style={{ color: b.won ? MASTERED_COLOR : undefined }}
                      >
                        {battleResult(b)}
                      </span>
                    </div>
                  </div>
                  {b.masteredNow ? (
                    <div
                      className="ml-[60px] flex flex-col gap-1.5 rounded-xl bg-[#eff4ff] px-3 py-2.5 text-sm"
                      style={{ border: `1.5px solid ${MASTERED_COLOR}` }}
                    >
                      <span
                        className="text-xs font-bold"
                        style={{ color: MASTERED_COLOR }}
                      >
                        この日に「覚えた」になりました（
                        {monthDay(b.mistake.createdDay)}に登録）
                      </span>
                      <BeforeAfter
                        question={b.mistake.question}
                        wrong={b.mistake.childAnswer}
                        right={b.mistake.correctAnswer}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {data.registered.length > 0 ? (
        <section
          aria-labelledby="h-registered"
          className={`${card} flex flex-col gap-3 p-4`}
        >
          <h3 id="h-registered" className="font-bold">
            この日に登録した間違い（{data.registered.length}問）
          </h3>
          <ul className="flex flex-col gap-3">
            {data.registered.map((m) => (
              <li key={m.id} className="flex flex-col gap-1">
                <span className="text-xs text-muted">
                  {SUBJECTS[m.subject] ?? ""}・
                  {mistakeType(m.mistakeTypeId).label}
                </span>
                <BeforeAfter
                  question={m.question}
                  wrong={m.childAnswer}
                  right={m.correctAnswer}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export default function InsightsDayPage() {
  const hash = useHashId();
  return (
    <ParentGuard>
      {({ children }) => {
        const parsed = hash ? parseHash(hash) : null;
        const child = parsed
          ? children.find((k) => k.id === parsed.childId)
          : undefined;
        return (
          <Page
            title="学習のようす"
            footer={
              <LinkButton href="/parent/insights" variant="secondary">
                学習のようすへ
              </LinkButton>
            }
          >
            {hash === undefined ? (
              <p className="text-muted">読み込み中…</p>
            ) : parsed && child ? (
              <DayView child={child} day={parsed.day} />
            ) : (
              <p>この日の記録が見つかりません。</p>
            )}
          </Page>
        );
      }}
    </ParentGuard>
  );
}
