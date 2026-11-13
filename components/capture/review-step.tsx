"use client";

import { useEffect, useId, useState } from "react";
import { mistakeTypesFor } from "@/client/ai/catalog";
import { Button } from "@/components/ui";
import { LOW_CONFIDENCE, type MistakeAnalysis } from "@/shared/capture";
import type { Grade } from "@/shared/constants";
import { SUBJECT_LABELS, type Subject } from "@/shared/problem";

/**
 * 1問の確認（FR-3.2・3.3、US-3.1〜3.3）。切り抜いた画像と、読み取った結果を並べ、直せるようにする。
 * 信頼度の低い項目は「たしかめてね」にして、「あってる」を押すまで次へ進めない。
 */

/** 子どもが確かめたあとの1問 */
export interface ReviewedItem {
  subject: Subject;
  question: string;
  childAnswer: string;
  correctAnswer: string;
  /** 読み取ったタイプ。手で入れたときは undefined（登録の前に判定する） */
  mistakeTypeId?: string;
}

type FieldKey = "question" | "childAnswer" | "correctAnswer";
const FIELDS: { key: FieldKey; label: string; max: number }[] = [
  { key: "question", label: "もんだい", max: 200 },
  { key: "childAnswer", label: "きみの こたえ", max: 100 },
  { key: "correctAnswer", label: "せいかい", max: 100 },
];
const SUBJECTS = Object.keys(SUBJECT_LABELS) as Subject[];

export function ReviewStep({
  index,
  total,
  imageUrl,
  analysis,
  failed,
  grade,
  subject: chosenSubject,
  onRetry,
  onDone,
  onSkip,
}: {
  index: number;
  total: number;
  imageUrl: string;
  analysis?: MistakeAnalysis;
  /** 読み取れなかったときの、子どもに見せる文 */
  failed?: string;
  grade: Grade;
  subject?: Subject;
  onRetry: () => void;
  onDone: (item: ReviewedItem) => void;
  onSkip: () => void;
}) {
  const ids = useId();
  const [manual, setManual] = useState(false);
  const [subject, setSubject] = useState<Subject>(
    analysis?.subject ?? chosenSubject ?? "math",
  );
  const [values, setValues] = useState<Record<FieldKey, string>>({
    question: analysis?.question ?? "",
    childAnswer: analysis?.childAnswer ?? "",
    correctAnswer: analysis?.correctAnswer ?? "",
  });
  const [typeId, setTypeId] = useState(analysis?.mistakeTypeId);
  const low = (k: FieldKey) =>
    !manual && !!analysis && analysis.confidence[k] < LOW_CONFIDENCE;
  const [confirmed, setConfirmed] = useState<Record<FieldKey, boolean>>({
    question: false,
    childAnswer: false,
    correctAnswer: false,
  });

  // 次の問題に移ったら、入れた内容を入れ直す
  useEffect(() => {
    setManual(false);
    setSubject(analysis?.subject ?? chosenSubject ?? "math");
    setValues({
      question: analysis?.question ?? "",
      childAnswer: analysis?.childAnswer ?? "",
      correctAnswer: analysis?.correctAnswer ?? "",
    });
    setTypeId(analysis?.mistakeTypeId);
    setConfirmed({ question: false, childAnswer: false, correctAnswer: false });
  }, [analysis, chosenSubject]);

  const editing = !!analysis || manual;
  const filled = FIELDS.every((f) => values[f.key].trim());
  const pending = FIELDS.filter((f) => low(f.key) && !confirmed[f.key]);
  const ready = editing && filled && pending.length === 0;
  const types = mistakeTypesFor(subject, grade, typeId);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center font-bold" aria-live="polite">
        {index + 1} / {total}もん
      </p>
      {/* biome-ignore lint/performance/noImgElement: 端末の中だけの blob の画像（next/image では扱えない） */}
      <img
        src={imageUrl}
        alt={`${index + 1}ばんめに かこんだ ところ`}
        className="max-h-64 w-full rounded-[var(--radius)] border border-line bg-surface object-contain"
      />

      {analysis?.piiDetected ? (
        <output className="block card border-2 border-accent p-3 text-sm">
          なまえが うつっていたかも。〇〇に かえておいたよ。つぎは かくすペンで
          けしてね。
        </output>
      ) : null}

      {!editing ? (
        <div className="card flex flex-col gap-3 p-4">
          <p className="font-bold">よみとれなかったよ</p>
          {failed ? <p className="text-sm">{failed}</p> : null}
          <Button onClick={onRetry}>もういちど よみとる</Button>
          <Button variant="secondary" onClick={() => setManual(true)}>
            じぶんで いれる
          </Button>
          <Button variant="secondary" onClick={onSkip}>
            この もんだいは やめる
          </Button>
        </div>
      ) : (
        <>
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
                    name={`${ids}-subject`}
                    className="sr-only"
                    checked={subject === s}
                    onChange={() => {
                      setSubject(s);
                      setTypeId(undefined);
                    }}
                  />
                  {SUBJECT_LABELS[s]}
                </label>
              ))}
            </div>
          </fieldset>
          {FIELDS.map((f) => {
            const id = `${ids}-${f.key}`;
            const warn = low(f.key) && !confirmed[f.key];
            return (
              <div key={f.key} className="flex flex-col gap-1">
                <label htmlFor={id} className="font-bold">
                  {f.label}
                  {warn ? (
                    <span className="ml-2 rounded-full bg-[#fef3c7] px-2 text-sm text-[#92400e]">
                      たしかめてね
                    </span>
                  ) : null}
                </label>
                <textarea
                  id={id}
                  rows={f.key === "question" ? 3 : 1}
                  maxLength={f.max}
                  value={values[f.key]}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                  className={`w-full rounded-[var(--radius)] border bg-surface p-3 text-lg ${
                    warn ? "border-2 border-[#d97706]" : "border-line"
                  }`}
                />
                {warn ? (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setConfirmed({ ...confirmed, [f.key]: true })
                    }
                  >
                    {f.label}は これで あってる
                  </Button>
                ) : null}
              </div>
            );
          })}
          {typeId !== undefined || types.length > 1 ? (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-type`} className="font-bold">
                まちがいの タイプ
              </label>
              <select
                id={`${ids}-type`}
                value={typeId ?? ""}
                onChange={(e) => setTypeId(e.target.value || undefined)}
                className="tap w-full rounded-[var(--radius)] border border-line bg-surface p-3"
              >
                <option value="">AI に きめてもらう</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {pending.length > 0 ? (
            <output className="block text-sm">
              「たしかめてね」の ところを みてから すすんでね
            </output>
          ) : null}
          <Button
            disabled={!ready}
            onClick={() =>
              onDone({
                subject,
                question: values.question.trim(),
                childAnswer: values.childAnswer.trim(),
                correctAnswer: values.correctAnswer.trim(),
                mistakeTypeId: typeId,
              })
            }
          >
            {index + 1 === total ? "これで とうろく する" : "つぎの もんだいへ"}
          </Button>
          <Button variant="secondary" onClick={onSkip}>
            この もんだいは やめる
          </Button>
        </>
      )}
    </div>
  );
}
