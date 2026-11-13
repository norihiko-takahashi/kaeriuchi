"use client";

import { type ReactNode, useEffect, useState } from "react";
import { mistakeType } from "@/client/ai/catalog";
import { insightsFor } from "@/client/store/game-repo";
import { BeforeAfter } from "@/components/parent/before-after";
import {
  BarList,
  WeeklyBars,
  WeeklyRate,
  type WeekPoint,
} from "@/components/parent/charts";
import { Footprints } from "@/components/parent/footprints";
import {
  MASTERED_COLOR,
  monthDay,
  pct,
  STAGES,
  SUBJECTS,
  shortDay,
  weekRange,
} from "@/components/parent/labels";
import { ParentGuard } from "@/components/parent-guard";
import { LinkButton, Page } from "@/components/ui";
import type { Insights } from "@/domain/parent/insights";
import type { ChildProfile } from "@/shared/schemas";

/**
 * 保護者メニュー：学習のようす（U7、US-7.1）。
 * 親の問いごとに区画を分け、どの数字も1回しか出さない（functional-design.md、デザイン案 E）
 */

const card = "rounded-[20px] border border-line bg-surface";

/** 今週（青い帯）。決まった文の型に数字を入れる。先週とは数を並べるだけ */
function ThisWeek({ w }: { w: Insights["thisWeek"] }) {
  const range = weekRange(w.start, w.end);
  return (
    <section
      aria-label="今週"
      className="flex flex-col gap-1 rounded-[20px] bg-primary px-5 py-4 text-on-primary"
    >
      <p className="text-sm">今週（{range}）</p>
      {w.battles === 0 ? (
        <p className="text-lg font-bold">今週はまだバトルがありません。</p>
      ) : (
        <p className="text-lg leading-normal font-bold">
          {w.battles}回バトルして、{w.defeated}問を撃破しました。
          {w.lastWeekDefeated !== null ? (
            <span className="text-sm font-normal">
              （先週は {w.lastWeekDefeated}問）
            </span>
          ) : null}
        </p>
      )}
      {w.revisitBattles > 0 ? (
        <p className="text-sm">
          再来は {w.revisitBattles}回のうち {w.revisitDefeated}
          回、もう一度撃破しました。
        </p>
      ) : w.defeated > 0 ? (
        <p className="text-sm">
          撃破した間違いは、次の日から「再来」で出てきます。
        </p>
      ) : null}
    </section>
  );
}

/** これまで：4つの段階と、再来の撃破率 */
function SoFar({ data }: { data: Insights }) {
  const total = data.total;
  const desc = STAGES.map((s) => `${s.label} ${data.stages[s.key]}問`).join(
    "、",
  );
  return (
    <section
      aria-labelledby="h-sofar"
      className={`${card} flex flex-col gap-3 px-5 py-4`}
    >
      <h2 id="h-sofar" className="font-bold">
        これまで
        {data.since ? (
          <span className="text-xs font-normal text-muted">
            （{monthDay(data.since)}から）
          </span>
        ) : null}
      </h2>
      <div className="flex flex-col gap-2">
        <p className="text-sm">
          登録した間違い <b className="text-base">{total}問</b>
        </p>
        <div
          role="img"
          aria-label={`${total}問のうち、${desc}`}
          className="flex h-4 gap-0.5 overflow-hidden rounded-full"
        >
          {STAGES.map((s) =>
            data.stages[s.key] ? (
              <div
                key={s.key}
                style={{
                  flex: data.stages[s.key],
                  background: s.fill,
                  border:
                    s.key === "notYet" ? "1.5px solid #94a3b8" : undefined,
                }}
                className="box-border last:rounded-r-full"
              />
            ) : null,
          )}
        </div>
        <ul className="grid grid-cols-4 gap-1" aria-hidden="true">
          {STAGES.map((s) => (
            <li key={s.key} className="flex flex-col text-xs text-muted">
              <span className="flex items-center gap-1">
                <span
                  className="box-border block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    background: s.fill,
                    border: `1.5px solid ${s.key === "notYet" ? "#94a3b8" : s.fill}`,
                  }}
                />
                {s.label}
              </span>
              <b className="text-base text-text tabular-nums">
                {data.stages[s.key]}問
              </b>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-baseline justify-between gap-2 border-t border-line pt-3">
        <span className="text-sm">再来の撃破率</span>
        {data.revisit.rate === null ? (
          <span className="text-sm text-muted">— まだ再来はありません</span>
        ) : (
          <span className="tabular-nums">
            <b className="text-2xl">{pct(data.revisit.rate)}</b>
            <span className="text-xs text-muted">
              （{data.revisit.battles}回のうち {data.revisit.defeated}回）
            </span>
          </span>
        )}
      </div>
    </section>
  );
}

function FootprintsCard({
  data,
  childId,
}: {
  data: Insights;
  childId: string;
}) {
  const weeks = data.calendar.days.length / 7;
  const s = data.streak;
  return (
    <section
      aria-labelledby="h-foot"
      className={`${card} flex flex-col gap-2 px-4 py-4`}
    >
      <div>
        <h2 id="h-foot" className="font-bold">
          学習の足あと
        </h2>
        <p className="text-sm text-muted">
          {s.current > 0 ? (
            <>
              今日まで <b className="text-text">{s.current}日</b> つづけて・
            </>
          ) : null}
          {weeks === 8 ? "直近8週" : `${weeks}週`}で {data.calendar.activeDays}
          日（いちばん長い記録 {s.best}日）
        </p>
      </div>
      <Footprints childId={childId} days={data.calendar.days} />
    </section>
  );
}

function RecentMastered({ r }: { r: NonNullable<Insights["recentMastered"]> }) {
  const m = r.mistake;
  return (
    <section
      aria-labelledby="h-mastered"
      className="flex flex-col gap-2 rounded-[20px] bg-[#eff4ff] px-4 py-4"
      style={{ border: `1.5px solid ${MASTERED_COLOR}` }}
    >
      <h2
        id="h-mastered"
        className="font-bold"
        style={{ color: MASTERED_COLOR }}
      >
        最近「覚えた」になった間違い
      </h2>
      <p className="text-xs text-muted">
        {SUBJECTS[m.subject] ?? ""}　{monthDay(m.createdDay)}に登録 →{" "}
        {monthDay(r.day)}に覚えた
      </p>
      <p className="font-bold">{mistakeType(m.mistakeTypeId).label}</p>
      <BeforeAfter
        question={m.question}
        wrong={m.childAnswer}
        right={m.correctAnswer}
      />
    </section>
  );
}

function More({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <details className="group border-b border-line last:border-b-0">
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-1 flex-col leading-snug">
          <span className="font-bold">{title}</span>
          <span className="text-xs text-muted">{sub}</span>
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="group-open:rotate-180"
        >
          <path
            d="M5 8l5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div className="flex flex-col gap-3 pb-4">{children}</div>
    </details>
  );
}

function Details({ data }: { data: Insights }) {
  const label = (w: { weekStart: string }) => shortDay(w.weekStart);
  const registered: WeekPoint[] = data.weekly.map((w) => ({
    label: label(w),
    value: w.registered,
    detail: `${label(w)}の週 登録 ${w.registered}問`,
  }));
  const defeated: WeekPoint[] = data.weekly.map((w) => ({
    label: label(w),
    value: w.defeated,
    detail: `${label(w)}の週 撃破 ${w.defeated}問`,
  }));
  const rate: WeekPoint[] = data.weekly.map((w) => ({
    label: label(w),
    value: w.revisitRate,
    detail:
      w.revisitRate === null
        ? `${label(w)}の週 再来なし`
        : `${label(w)}の週 ${w.revisitDefeated}/${w.revisitBattles}（${pct(w.revisitRate)}）`,
  }));
  return (
    <section aria-label="くわしく見る" className={`${card} flex flex-col px-4`}>
      <More
        title="教科ごとの登録数"
        sub={`これまで・${data.bySubject.length}教科`}
      >
        <BarList
          rows={data.bySubject.map((s) => ({
            key: s.subject,
            label: SUBJECTS[s.subject] ?? s.subject,
            value: s.total,
            note: `${s.total}問・撃破 ${s.defeated}`,
          }))}
        />
      </More>
      <More
        title="登録の多い間違い"
        sub="これまで・多い順に5つ（件数と撃破した数）"
      >
        <BarList
          rows={data.topTypes.map((x) => {
            const type = mistakeType(x.mistakeTypeId);
            return {
              key: x.mistakeTypeId,
              label: type.label,
              sub: SUBJECTS[type.subject] ?? "",
              value: x.total,
              note: `${x.total}問・撃破 ${x.defeated}`,
            };
          })}
        />
      </More>
      <More
        title="週ごとの推移"
        sub={`直近${data.weekly.length}週の登録数・撃破数・再来の撃破率（グラフと表）`}
      >
        <h3 className="text-sm font-bold">登録した数</h3>
        <WeeklyBars points={registered} unit="登録した数" />
        <h3 className="text-sm font-bold">撃破した数</h3>
        <WeeklyBars points={defeated} unit="撃破した数" />
        <h3 className="text-sm font-bold">再来の撃破率</h3>
        <WeeklyRate points={rate} />
        <div className="overflow-x-auto text-sm">
          <table className="w-full text-left tabular-nums">
            <caption className="sr-only">週ごとの推移の表</caption>
            <thead>
              <tr>
                <th className="pr-3">週（月曜から）</th>
                <th className="pr-3">登録</th>
                <th className="pr-3">撃破</th>
                <th>再来の撃破</th>
              </tr>
            </thead>
            <tbody>
              {data.weekly.map((w) => (
                <tr key={w.weekStart}>
                  <td className="pr-3">{label(w)}</td>
                  <td className="pr-3">{w.registered}</td>
                  <td className="pr-3">{w.defeated}</td>
                  <td>
                    {w.revisitRate !== null
                      ? `${w.revisitDefeated}/${w.revisitBattles}（${pct(w.revisitRate)}）`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </More>
    </section>
  );
}

function ChildInsights({ child }: { child: ChildProfile }) {
  const [data, setData] = useState<Insights | null>(null);
  useEffect(() => {
    setData(null);
    insightsFor(child.id).then(setData);
  }, [child.id]);
  if (!data) return <p className="text-muted">読み込み中…</p>;
  if (data.total === 0)
    return (
      <p className={`${card} p-4`}>
        まだ記録がありません。お子さまが間違えた問題を登録すると、ここに出てきます。
      </p>
    );
  return (
    <div className="flex flex-col gap-3.5">
      <ThisWeek w={data.thisWeek} />
      <SoFar data={data} />
      <FootprintsCard data={data} childId={child.id} />
      {data.recentMastered ? <RecentMastered r={data.recentMastered} /> : null}
      <Details data={data} />
    </div>
  );
}

function InsightsView({ kids }: { kids: ChildProfile[] }) {
  const [childId, setChildId] = useState(kids[0]?.id);
  const child = kids.find((k) => k.id === childId) ?? kids[0];
  return (
    <>
      {kids.length > 1 ? (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 text-sm font-bold">お子さま</legend>
          {kids.map((k) => (
            <label
              key={k.id}
              className={`tap card flex cursor-pointer items-center px-3 ${k.id === child?.id ? "border-4 border-primary" : ""}`}
            >
              <input
                type="radio"
                name="child"
                className="sr-only"
                checked={k.id === child?.id}
                onChange={() => setChildId(k.id)}
              />
              {k.nickname}
            </label>
          ))}
        </fieldset>
      ) : null}
      {child ? (
        <ChildInsights child={child} />
      ) : (
        <p>プロフィールがありません。</p>
      )}
      <p className="text-xs text-muted">
        この端末に記録されている内容を集計しています。端末を替えたりアプリを消したりすると、記録は見られなくなります（クラウドとの同期ができるまで）。
      </p>
    </>
  );
}

export default function InsightsPage() {
  return (
    <ParentGuard>
      {({ children }) => (
        <Page
          title="学習のようす"
          footer={
            <LinkButton href="/parent" variant="secondary">
              保護者メニューへ
            </LinkButton>
          }
        >
          <InsightsView kids={children} />
        </Page>
      )}
    </ParentGuard>
  );
}
