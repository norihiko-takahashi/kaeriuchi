"use client";

import { useId, useState } from "react";
import { RubyText } from "@/components/ruby-text";
import { Button } from "@/components/ui";
import type { ChildAnswer } from "@/domain/battle/grading";
import type { ProblemDraft, RubyEntry } from "@/shared/problem";

/** 子どもの答えを、教科と答え方に合った形で受け取る（US-4.4） */
export function AnswerInput({
  problem,
  disabled,
  onSubmit,
}: {
  problem: ProblemDraft;
  disabled?: boolean;
  /** text は報告と、あとで採点し直すときに使う、答えの文字 */
  onSubmit: (answer: ChildAnswer, text: string) => void;
}) {
  const f = problem.format;
  switch (f.kind) {
    case "numeric":
      return (
        <TextAnswer
          disabled={disabled}
          numeric
          extraKeys={
            f.condition === "mixed" ? ["/", "と", "."] : ["/", ".", "-"]
          }
          unit={f.unit}
          onSubmit={(v) => onSubmit({ kind: "text", value: v }, v)}
        />
      );
    case "text":
      return (
        <TextAnswer
          disabled={disabled}
          onSubmit={(v) => onSubmit({ kind: "text", value: v }, v)}
        />
      );
    case "choice":
      return (
        <fieldset className="flex flex-col gap-2" disabled={disabled}>
          <legend className="sr-only">こたえを えらぶ</legend>
          {f.options.map((o) => (
            <Button
              key={o}
              variant="secondary"
              className="text-xl"
              // 読み上げでは、ふりがなを重ねて読まないように、もとの文字で伝える
              aria-label={o}
              onClick={() => onSubmit({ kind: "text", value: o }, o)}
            >
              <RubyText text={o} ruby={problem.ruby} />
            </Button>
          ))}
        </fieldset>
      );
    case "ordering":
      return (
        <OrderingAnswer
          key={problem.prompt}
          tokens={f.tokens}
          ruby={problem.ruby}
          disabled={disabled}
          onSubmit={(words) =>
            onSubmit({ kind: "ordering", value: words }, words.join(" "))
          }
        />
      );
    case "self-check":
      return (
        <SelfCheck
          key={problem.prompt}
          model={f.model}
          disabled={disabled}
          onSubmit={(ok) =>
            onSubmit(
              { kind: "self-check", value: ok },
              ok ? "できた" : "もう一回",
            )
          }
        />
      );
  }
}

function TextAnswer({
  disabled,
  numeric,
  extraKeys = [],
  unit,
  onSubmit,
}: {
  disabled?: boolean;
  numeric?: boolean;
  extraKeys?: string[];
  unit?: string;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const id = useId();
  const submit = () => {
    if (!value.trim()) return;
    onSubmit(value.trim());
    setValue("");
  };
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="font-bold">
        きみの こたえ
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode={numeric ? "decimal" : "text"}
          autoComplete="off"
          maxLength={100}
          disabled={disabled}
          className="tap w-full rounded-[var(--radius)] border border-line bg-surface px-3 text-2xl"
        />
        {unit ? <span className="text-xl">{unit}</span> : null}
      </div>
      {numeric ? (
        <div className="flex gap-2">
          {extraKeys.map((k) => (
            <Button
              key={k}
              variant="secondary"
              disabled={disabled}
              aria-label={
                k === "/"
                  ? "ぶんすうの せん"
                  : k === "."
                    ? "しょうすうてん"
                    : k === "-"
                      ? "マイナス"
                      : k
              }
              onClick={() => setValue((v) => v + k)}
            >
              {k}
            </Button>
          ))}
          <Button
            variant="secondary"
            disabled={disabled || !value}
            className="whitespace-nowrap"
            onClick={() => setValue((v) => v.slice(0, -1))}
          >
            けす
          </Button>
        </div>
      ) : null}
      <Button
        type="submit"
        disabled={disabled || !value.trim()}
        className="text-xl"
      >
        こたえる
      </Button>
    </form>
  );
}

function OrderingAnswer({
  tokens,
  ruby,
  disabled,
  onSubmit,
}: {
  tokens: string[];
  ruby?: RubyEntry[];
  disabled?: boolean;
  onSubmit: (words: string[]) => void;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const rest = tokens
    .map((t, i) => ({ t, i }))
    .filter(({ i }) => !picked.includes(i));
  return (
    <div className="flex flex-col gap-3">
      <p className="font-bold">ことばを じゅんばんに タップしてね</p>
      <output aria-live="polite" className="card min-h-12 p-3 text-xl">
        {picked.map((i) => tokens[i]).join(" ") || "　"}
      </output>
      <div className="flex flex-wrap gap-2">
        {rest.map(({ t, i }) => (
          <Button
            key={i}
            variant="secondary"
            disabled={disabled}
            aria-label={t}
            onClick={() => setPicked((p) => [...p, i])}
          >
            <RubyText text={t} ruby={ruby} />
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={disabled || picked.length === 0}
          onClick={() => setPicked([])}
        >
          やりなおす
        </Button>
        <Button
          disabled={disabled || picked.length !== tokens.length}
          onClick={() => {
            onSubmit(picked.map((i) => tokens[i]));
            setPicked([]);
          }}
        >
          こたえる
        </Button>
      </div>
    </div>
  );
}

function SelfCheck({
  model,
  disabled,
  onSubmit,
}: {
  model: string;
  disabled?: boolean;
  onSubmit: (ok: boolean) => void;
}) {
  const [shown, setShown] = useState(false);
  if (!shown) {
    return (
      <div className="flex flex-col gap-2">
        <p>かみに かいてから、おてほんと くらべよう</p>
        <Button disabled={disabled} onClick={() => setShown(true)}>
          おてほんを みる
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="card px-8 py-4 text-6xl" lang="ja">
        {model}
      </p>
      <div className="flex gap-2">
        <Button
          disabled={disabled}
          onClick={() => {
            setShown(false);
            onSubmit(true);
          }}
        >
          できた
        </Button>
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() => {
            setShown(false);
            onSubmit(false);
          }}
        >
          もう一回
        </Button>
      </div>
    </div>
  );
}
