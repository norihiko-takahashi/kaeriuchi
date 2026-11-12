"use client";

import { useEffect, useState } from "react";
import { useWords } from "@/client/battle/words";
import { type GameSummary, gameSummary } from "@/client/store/game-repo";
import { ChildGate } from "@/components/child-gate";
import { LinkButton, Loading, Page } from "@/components/ui";
import { SUBJECT_LABELS } from "@/shared/problem";
import type { ChildProfile } from "@/shared/schemas";

function SheetList({ child }: { child: ChildProfile }) {
  const w = useWords();
  const [game, setGame] = useState<GameSummary | null>(null);
  useEffect(() => {
    gameSummary(child.id).then(setGame);
  }, [child.id]);
  if (!game) return <Loading />;
  return (
    <Page
      title={`📝 ${w.sheets}`}
      footer={
        <LinkButton href="/home" variant="secondary">
          ホームに もどる
        </LinkButton>
      }
    >
      {game.sheets.length === 0 ? (
        <p className="text-muted">
          まだ テストが ないよ。「てで いれる」で まちがえた もんだいを
          いれてね。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {game.sheets.map(({ sheet, progress }) => (
            <li key={sheet.id}>
              <a
                href={`/sheets/detail#${sheet.id}`}
                className="tap card flex flex-col gap-1 p-4"
              >
                <span className="font-bold">
                  {progress.cleared ? "🏆 " : ""}
                  {sheet.title}
                </span>
                <span className="text-sm text-muted">
                  {SUBJECT_LABELS[sheet.subject]}・{sheet.createdDay}・
                  {progress.defeated}/{progress.total} げきは
                  {progress.cleared ? "・クリア！" : ""}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

/** S-30 テストの一覧（BR-6-1、US-6.2） */
export default function SheetsPage() {
  return <ChildGate>{(child) => <SheetList child={child} />}</ChildGate>;
}
