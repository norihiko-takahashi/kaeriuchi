"use client";

import { useEffect, useState } from "react";
import { getRules, setRules } from "@/client/store/repo";
import { ParentGuard } from "@/components/parent-guard";
import { Button, ErrorText, LinkButton, Page } from "@/components/ui";
import {
  clampDailyLimit,
  DAILY_LIMIT_MAX,
  DAILY_LIMIT_MIN,
  isValidTime,
} from "@/domain/parent/rules";
import type { ChildProfile, UsageRules } from "@/shared/schemas";

function RulesEditor({ child }: { child: ChildProfile }) {
  const [rules, setLocal] = useState<UsageRules | null>(null);
  const [limitHours, setLimitHours] = useState(false);
  const [start, setStart] = useState("16:00");
  const [end, setEnd] = useState("20:00");
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getRules(child.id).then((r) => {
      setLocal(r);
      if (r.allowedHours) {
        setLimitHours(true);
        setStart(r.allowedHours[0]);
        setEnd(r.allowedHours[1]);
      }
    });
  }, [child.id]);

  if (!rules) return null;

  const save = async () => {
    if (limitHours && (!isValidTime(start) || !isValidTime(end))) {
      return setError("時刻を正しく入力してください");
    }
    setError(undefined);
    await setRules(child.id, {
      dailyMistakeLimit: clampDailyLimit(rules.dailyMistakeLimit),
      notifications: rules.notifications,
      ...(limitHours ? { allowedHours: [start, end] as [string, string] } : {}),
    });
    setSaved(true);
  };

  return (
    <section
      className="card flex flex-col gap-3 p-4"
      aria-label={`${child.nickname} のルール`}
    >
      <h2 className="text-lg font-bold">{child.nickname}</h2>
      <label className="flex flex-col gap-1 font-bold">
        1日に登録できる間違いの数（{DAILY_LIMIT_MIN}〜{DAILY_LIMIT_MAX}問）
        <input
          type="number"
          min={DAILY_LIMIT_MIN}
          max={DAILY_LIMIT_MAX}
          value={rules.dailyMistakeLimit}
          onChange={(e) =>
            setLocal({ ...rules, dailyMistakeLimit: Number(e.target.value) })
          }
          className="tap w-32 rounded-[var(--radius)] border border-line bg-surface px-3 font-normal"
        />
      </label>
      <label className="tap flex items-center gap-3 font-bold">
        <input
          type="checkbox"
          className="h-6 w-6"
          checked={limitHours}
          onChange={(e) => setLimitHours(e.target.checked)}
        />
        使える時間帯を決める
      </label>
      {limitHours ? (
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`start-${child.id}`}>
            開始
          </label>
          <input
            id={`start-${child.id}`}
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="tap rounded-[var(--radius)] border border-line bg-surface px-3"
          />
          〜
          <label className="sr-only" htmlFor={`end-${child.id}`}>
            終了
          </label>
          <input
            id={`end-${child.id}`}
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="tap rounded-[var(--radius)] border border-line bg-surface px-3"
          />
        </div>
      ) : null}
      <label className="tap flex items-center gap-3 font-bold">
        <input
          type="checkbox"
          className="h-6 w-6"
          checked={rules.notifications}
          onChange={(e) =>
            setLocal({ ...rules, notifications: e.target.checked })
          }
        />
        通知（再来ミスモンのお知らせ）
      </label>
      <ErrorText>{error}</ErrorText>
      {saved ? (
        <output className="text-sm text-accent">保存しました</output>
      ) : null}
      <Button onClick={save}>保存</Button>
    </section>
  );
}

/** S-11 使い方のルール（BR-3） */
export default function Rules() {
  return (
    <ParentGuard>
      {({ children }) => (
        <Page
          title="使い方のルール"
          footer={
            <LinkButton href="/parent" variant="secondary">
              保護者メニューへ
            </LinkButton>
          }
        >
          {children.length === 0 ? <p>プロフィールがありません</p> : null}
          {children.map((c) => (
            <RulesEditor key={c.id} child={c} />
          ))}
        </Page>
      )}
    </ParentGuard>
  );
}
