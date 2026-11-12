"use client";

import { useEffect, useState } from "react";
import { mistakeType } from "@/client/ai/catalog";
import { insightsFor } from "@/client/store/game-repo";
import {
  BarList,
  WeeklyBars,
  WeeklyRate,
  type WeekPoint,
} from "@/components/parent/charts";
import { ParentGuard } from "@/components/parent-guard";
import { LinkButton, Page } from "@/components/ui";
import type { Insights } from "@/domain/parent/insights";
import type { ChildProfile } from "@/shared/schemas";

/** 保護者向けの教科の名前（子どもの画面はひらがな） */
const SUBJECTS: Record<string, string> = {
  math: "算数・数学",
  japanese: "国語",
  english: "英語",
  science: "理科",
  social: "社会",
};

/** 再来の撃破率の目安（要件の「成功の目安」） */
const TARGET = 0.6;

const pct = (v: number | null) =>
  v === null ? "まだなし" : `${Math.round(v * 100)}%`;
const md = (day: string) => {
  const [, m, d] = day.split("-").map(Number);
  return `${m}/${d}`;
};

function Stat({
  value,
  label,
  note,
}: {
  value: string;
  label: string;
  note?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-sm">{label}</span>
      {note ? <span className="text-xs text-muted">{note}</span> : null}
    </div>
  );
}

function ChildInsights({ child }: { child: ChildProfile }) {
  const [data, setData] = useState<Insights | null>(null);
  useEffect(() => {
    setData(null);
    insightsFor(child.id).then(setData);
  }, [child.id]);
  if (!data) return <p className="text-muted">読み込み中…</p>;
  const t = data.totals;
  if (t.mistakes === 0)
    return (
      <p className="card p-4">
        まだ記録がありません。お子さまが「てで
        いれる」で間違えた問題を登録すると、ここに集計が出ます。
      </p>
    );

  const registered: WeekPoint[] = data.weekly.map((w) => ({
    label: md(w.weekStart),
    value: w.registered,
    detail: `${md(w.weekStart)}の週 ${w.registered}問`,
  }));
  const rate: WeekPoint[] = data.weekly.map((w) => ({
    label: md(w.weekStart),
    value: w.revisitRate,
    detail:
      w.revisitRate === null
        ? `${md(w.weekStart)}の週 再来なし`
        : `${md(w.weekStart)}の週 ${w.revisitDefeated}/${w.revisitBattles}（${pct(w.revisitRate)}）`,
  }));

  return (
    <div className="flex flex-col gap-4">
      <section className="card grid grid-cols-2 gap-4 p-4" aria-label="まとめ">
        <Stat value={`${t.mistakes}`} label="登録した間違い" />
        <Stat
          value={`${t.defeated}`}
          label="撃破した数"
          note={`${Math.round((t.defeated / t.mistakes) * 100)}%`}
        />
        <Stat
          value={pct(t.revisitRate)}
          label="再来の撃破率"
          note={`目安 ${Math.round(TARGET * 100)}%・再来 ${t.revisitBattles}回`}
        />
        <Stat
          value={`${t.streak}日`}
          label="連続記録"
          note={`いちばん長い記録 ${t.bestStreak}日`}
        />
      </section>
      <p className="text-xs text-muted">
        「再来の撃破率」は、撃破したミスモンが日をおいて再び出てきたときに、もう一度正解できた割合です（れんしゅうは含みません）。
      </p>

      <section
        className="card flex flex-col gap-3 p-4"
        aria-labelledby="h-subject"
      >
        <h2 id="h-subject" className="font-bold">
          教科ごと
        </h2>
        <BarList
          rows={data.bySubject.map((s) => ({
            key: s.subject,
            label: SUBJECTS[s.subject] ?? s.subject,
            value: s.total,
            note: `${s.total}問・撃破 ${s.defeated}`,
          }))}
        />
      </section>

      <section className="card flex flex-col gap-3 p-4" aria-labelledby="h-top">
        <h2 id="h-top" className="font-bold">
          よくある間違い TOP5
        </h2>
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
      </section>

      <section
        className="card flex flex-col gap-2 p-4"
        aria-labelledby="h-week"
      >
        <h2 id="h-week" className="font-bold">
          週ごとの登録した数（直近8週）
        </h2>
        <WeeklyBars points={registered} unit="登録した数" />
        <h2 className="mt-2 font-bold">週ごとの再来の撃破率</h2>
        <WeeklyRate points={rate} target={TARGET} />
        <details className="text-sm">
          <summary className="tap cursor-pointer">表で見る</summary>
          <div className="overflow-x-auto">
            <table className="w-full text-left tabular-nums">
              <thead>
                <tr>
                  <th className="pr-3">週（月曜から）</th>
                  <th className="pr-3">登録</th>
                  <th>再来の撃破</th>
                </tr>
              </thead>
              <tbody>
                {data.weekly.map((w) => (
                  <tr key={w.weekStart}>
                    <td className="pr-3">{md(w.weekStart)}</td>
                    <td className="pr-3">{w.registered}</td>
                    <td>
                      {w.revisitBattles
                        ? `${w.revisitDefeated}/${w.revisitBattles}（${pct(w.revisitRate)}）`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </div>
  );
}

function InsightsView({ kids }: { kids: ChildProfile[] }) {
  const [childId, setChildId] = useState(kids[0]?.id);
  const child = kids.find((k) => k.id === childId) ?? kids[0];
  return (
    <>
      <p className="text-sm">
        この端末に記録されている内容を集計しています。ほかの端末の記録は、クラウドとの同期ができてから合わせて表示します。
      </p>
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
    </>
  );
}

/** 保護者メニュー：学習のようす（U7、US-7.1） */
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
