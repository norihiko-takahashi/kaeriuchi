"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui";
import {
  REPORT_FREE_TEXT_MAX,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
} from "@/shared/battle";

/**
 * 「あれ？おかしいかも」（BR-45-8、US-4.6）。すべての問題と解説の画面に置く。
 * onSend は、子どもに見せるお礼の文を返す。
 */
export function ReportPanel({
  onSend,
}: {
  onSend: (reason: ReportReason, freeText?: string) => Promise<string>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("marked-wrong");
  const [text, setText] = useState("");
  const [thanks, setThanks] = useState<string>();
  const [sending, setSending] = useState(false);
  const name = useId();

  if (thanks) {
    return <output className="card p-3 text-sm">{thanks}</output>;
  }
  if (!open) {
    return (
      <Button
        variant="secondary"
        className="self-start text-sm"
        onClick={() => setOpen(true)}
      >
        🤔 あれ？おかしいかも
      </Button>
    );
  }
  return (
    <form
      className="card flex flex-col gap-2 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSending(true);
        try {
          setThanks(
            await onSend(
              reason,
              reason === "other" ? text.trim() || undefined : undefined,
            ),
          );
        } finally {
          setSending(false);
        }
      }}
    >
      <fieldset className="flex flex-col gap-1">
        <legend className="font-bold">どう おかしい？</legend>
        {REPORT_REASONS.map((r) => (
          <label key={r} className="tap flex items-center gap-2">
            <input
              type="radio"
              name={name}
              value={r}
              checked={reason === r}
              onChange={() => setReason(r)}
            />
            {REPORT_REASON_LABELS[r]}
          </label>
        ))}
      </fieldset>
      {reason === "other" ? (
        <label className="flex flex-col gap-1 text-sm">
          おしえてね（{REPORT_FREE_TEXT_MAX}もじ まで）
          <textarea
            value={text}
            maxLength={REPORT_FREE_TEXT_MAX}
            onChange={(e) => setText(e.target.value)}
            className="rounded-[var(--radius)] border border-line bg-surface p-2"
            rows={2}
          />
        </label>
      ) : null}
      <p className="text-xs text-muted">なまえや しゃしんは おくらないよ</p>
      <div className="flex gap-2">
        <Button type="submit" disabled={sending}>
          おくる
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          やめる
        </Button>
      </div>
    </form>
  );
}
