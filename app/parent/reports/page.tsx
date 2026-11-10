"use client";

import { useEffect, useState } from "react";
import { listReports } from "@/client/store/battle-repo";
import { ParentGuard } from "@/components/parent-guard";
import { LinkButton, Page } from "@/components/ui";
import { type ProblemReport, REPORT_REASON_LABELS } from "@/shared/battle";
import { SUBJECT_LABELS } from "@/shared/problem";

function ReportList() {
  const [reports, setReports] = useState<ProblemReport[] | null>(null);
  useEffect(() => {
    listReports().then(setReports);
  }, []);
  if (!reports) return <p className="text-muted">読み込み中…</p>;
  if (reports.length === 0)
    return <p className="text-muted">報告はまだありません。</p>;
  return (
    <ul className="flex flex-col gap-3">
      {reports.map((r) => (
        <li key={r.id} className="card flex flex-col gap-1 p-4 text-sm">
          <p className="font-bold">
            {REPORT_REASON_LABELS[r.reason]}
            {r.rescued ? "（その場で正解として扱いました）" : ""}
          </p>
          <p className="text-muted">
            {r.createdDay}・{SUBJECT_LABELS[r.mistake.subject]}・{r.provider} /{" "}
            {r.model}・{r.promptVersion}
          </p>
          <p>問題：{r.problem.prompt}</p>
          <p>正解とした答え：{r.problem.answer}</p>
          <p>子どもの答え：{r.childAnswer ?? "（まだ答えていない）"}</p>
          {r.freeText ? <p>コメント：{r.freeText}</p> : null}
          <details>
            <summary className="cursor-pointer">元の間違いと解説</summary>
            <p>元の問題：{r.mistake.question}</p>
            <p>
              子どもの答え：{r.mistake.childAnswer} ／ 正しい答え：
              {r.mistake.correctAnswer}
            </p>
            <p>解説：{r.problem.explanation}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}

/** 「あれ？おかしいかも」の報告の一覧（BR-45-8）。U8 で運用者に届くまで、端末にためておく */
export default function ReportsPage() {
  return (
    <ParentGuard>
      {() => (
        <Page
          title="問題の報告"
          footer={
            <LinkButton href="/parent" variant="secondary">
              保護者メニューへ
            </LinkButton>
          }
        >
          <p className="text-sm">
            お子さまが「あれ？おかしいかも」で知らせた問題です。いまはこの端末の中だけにあり、クラウドとの同期ができたら運用者に届きます。画像とニックネームは含みません。
          </p>
          <ReportList />
        </Page>
      )}
    </ParentGuard>
  );
}
