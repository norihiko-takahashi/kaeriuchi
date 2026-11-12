"use client";

import { useEffect, useId, useState } from "react";
import { ApiError, classify } from "@/client/ai/api";
import { useNav } from "@/client/pwa/navigate";
import {
  createMistake,
  DailyLimitError,
  mistakesToday,
  SheetFullError,
} from "@/client/store/battle-repo";
import { createSheet, listSheets } from "@/client/store/game-repo";
import { ChildGate } from "@/components/child-gate";
import { ReadAloud } from "@/components/read-aloud";
import { R } from "@/components/ruby";
import { Button, ErrorText, LinkButton, Page } from "@/components/ui";
import type { Sheet } from "@/shared/battle";
import { SUBJECT_LABELS, type Subject } from "@/shared/problem";
import type { ChildProfile } from "@/shared/schemas";

/** 続けて入れるときに、前に選んだテストを最初から選んでおく（BR-6-1） */
const LAST_SHEET_KEY = "kaeriuchi:last-sheet";
function readLastSheet(): string | null {
  try {
    return sessionStorage.getItem(LAST_SHEET_KEY);
  } catch {
    return null;
  }
}
function writeLastSheet(id: string) {
  try {
    sessionStorage.setItem(LAST_SHEET_KEY, id);
  } catch {
    // 使えなくても動く
  }
}

/** 入力の上限（BR-45-1） */
const LIMITS = { question: 200, answer: 100 } as const;
const SUBJECTS = Object.keys(SUBJECT_LABELS) as Subject[];

function Field({
  label,
  value,
  onChange,
  max,
  multiline,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  max: number;
  multiline?: boolean;
}) {
  const id = useId();
  const common = {
    id,
    value,
    maxLength: max,
    required: true,
    autoComplete: "off",
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    className:
      "w-full rounded-[var(--radius)] border border-line bg-surface p-3 text-lg",
  };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-bold">
        {label}
      </label>
      {multiline ? (
        <textarea rows={3} {...common} />
      ) : (
        <input {...common} className={`tap ${common.className}`} />
      )}
      <p className="text-right text-xs text-muted" aria-live="polite">
        {value.length} / {max}
      </p>
    </div>
  );
}

function NewMistake({ child }: { child: ChildProfile }) {
  const router = useNav();
  const [subject, setSubject] = useState<Subject>();
  const [question, setQuestion] = useState("");
  const [childAnswer, setChildAnswer] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  /** "new" はあたらしいテスト */
  const [sheetChoice, setSheetChoice] = useState<string>("new");

  useEffect(() => {
    mistakesToday(child.id).then(({ used, limit }) =>
      setLeft(Math.max(0, limit - used)),
    );
    listSheets(child.id).then((all) => {
      setSheets(all);
      const last = readLastSheet();
      const lastSheet = all.find((x) => x.id === last);
      if (lastSheet) {
        setSheetChoice(lastSheet.id);
        setSubject(lastSheet.subject);
      }
    });
  }, [child.id]);

  // 選んだ教科のテストだけを出す（新しいもの 5つまで）
  const sheetOptions = sheets.filter((x) => x.subject === subject).slice(0, 5);
  const chooseSubject = (s: Subject) => {
    setSubject(s);
    if (!sheets.some((x) => x.id === sheetChoice && x.subject === s))
      setSheetChoice("new");
  };

  const ready =
    !!subject &&
    !!question.trim() &&
    !!childAnswer.trim() &&
    !!correctAnswer.trim();

  const send = async () => {
    if (!subject || !ready) return;
    setBusy(true);
    setError(undefined);
    try {
      // 上限に達していたら、AI を呼ぶ前に止める
      const { used, limit } = await mistakesToday(child.id);
      if (used >= limit) throw new DailyLimitError(limit);
      const input = {
        subject,
        grade: child.grade,
        question: question.trim(),
        childAnswer: childAnswer.trim(),
        correctAnswer: correctAnswer.trim(),
      };
      const res = await classify(input);
      // テストは、判定がうまくいってから作る（空のテストを残さない）
      const sheetId =
        sheetChoice === "new"
          ? (await createSheet(child.id, subject)).id
          : sheetChoice;
      const m = await createMistake({
        ...input,
        childId: child.id,
        sheetId,
        classified: res.result,
        classifiedBy: res.meta,
      });
      writeLastSheet(sheetId);
      router.push(`/mistakes/found#${m.id}`);
    } catch (e) {
      setBusy(false);
      if (e instanceof DailyLimitError)
        return setError("きょうは もう とうろく できないよ。また あしたね");
      if (e instanceof SheetFullError)
        return setError(
          `この テストには もう いれられないよ（${e.max}もん まで）。あたらしい テストに してね`,
        );
      if (e instanceof ApiError) return setError(e.childMessage);
      setError("うまく いかなかったよ。もう一回 ためしてね");
    }
  };

  if (left === 0) {
    return (
      <Page title="きょうは ここまで">
        <p>
          きょう とうろく できる ミスモンは もう いっぱいだよ。また あしたね！
        </p>
        <LinkButton href="/home" variant="secondary">
          ホームに もどる
        </LinkButton>
      </Page>
    );
  }

  return (
    <Page
      title={
        <>
          まちがえた もんだいを <R k="入" r="い" />
          れる
        </>
      }
      footer={
        <LinkButton href="/home" variant="secondary">
          もどる
        </LinkButton>
      }
    >
      <ReadAloud text="まちがえた もんだいを いれてね。おうちの ひとと いっしょでも いいよ。" />
      <p className="text-sm text-muted">
        なまえや がっこうの なまえは かかないでね。
        {left !== null
          ? ` きょうは あと ${left}もん とうろく できるよ。`
          : null}
      </p>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-bold">きょうか</legend>
        <div className="flex flex-wrap gap-2">
          {SUBJECTS.map((s) => (
            <label
              key={s}
              className={`tap card flex cursor-pointer items-center px-3 ${
                subject === s ? "border-4 border-primary" : ""
              }`}
            >
              <input
                type="radio"
                name="subject"
                className="sr-only"
                checked={subject === s}
                onChange={() => chooseSubject(s)}
              />
              {SUBJECT_LABELS[s]}
            </label>
          ))}
        </div>
      </fieldset>
      {subject ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-bold">どの テスト？</legend>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "new", title: "あたらしい テスト" },
              ...sheetOptions.map((x) => ({ id: x.id, title: x.title })),
            ].map((o) => (
              <label
                key={o.id}
                className={`tap card flex cursor-pointer items-center px-3 ${
                  sheetChoice === o.id ? "border-4 border-primary" : ""
                }`}
              >
                <input
                  type="radio"
                  name="sheet"
                  className="sr-only"
                  checked={sheetChoice === o.id}
                  onChange={() => setSheetChoice(o.id)}
                />
                {o.title}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <Field
        label="もんだい"
        value={question}
        onChange={setQuestion}
        max={LIMITS.question}
        multiline
      />
      <Field
        label="きみの こたえ"
        value={childAnswer}
        onChange={setChildAnswer}
        max={LIMITS.answer}
      />
      <Field
        label={
          <>
            <R k="正" r="ただ" />
            しい こたえ
          </>
        }
        value={correctAnswer}
        onChange={setCorrectAnswer}
        max={LIMITS.answer}
      />
      <ErrorText>{error}</ErrorText>
      <Button className="text-xl" disabled={!ready || busy} onClick={send}>
        {busy ? "ミスモンを さがしているよ…" : "おくる"}
      </Button>
    </Page>
  );
}

/** S-20 間違えた問題を手で入れる（BR-45-1） */
export default function NewMistakePage() {
  return <ChildGate>{(child) => <NewMistake child={child} />}</ChildGate>;
}
