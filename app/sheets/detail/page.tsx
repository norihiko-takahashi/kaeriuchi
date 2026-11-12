"use client";

import { useEffect, useId, useState } from "react";
import { mistakeType } from "@/client/ai/catalog";
import { battleHref, startSheetRun } from "@/client/battle/sheet-run";
import { useWords } from "@/client/battle/words";
import { useHashId } from "@/client/pwa/hash-id";
import { useNav } from "@/client/pwa/navigate";
import {
  type GameSummary,
  gameSummary,
  renameSheet,
  SheetTitleError,
} from "@/client/store/game-repo";
import { Monster } from "@/components/battle/monster";
import { ChildGate } from "@/components/child-gate";
import { Button, ErrorText, LinkButton, Loading, Page } from "@/components/ui";
import { rankOf } from "@/domain/game/dex";
import { isMastered } from "@/domain/game/review";
import { SHEET_TITLE_MAX } from "@/shared/battle";
import type { ChildProfile } from "@/shared/schemas";

const RANK = { seen: "まだ", bronze: "🥉", silver: "🥈", gold: "🥇" };
const RANK_TEXT = {
  seen: "まだ",
  bronze: "どう",
  silver: "ぎん",
  gold: "きん",
};

function SheetDetail({ child, id }: { child: ChildProfile; id: string }) {
  const w = useWords();
  const router = useNav();
  const [game, setGame] = useState<GameSummary | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string>();
  const inputId = useId();

  useEffect(() => {
    gameSummary(child.id).then(setGame);
  }, [child.id]);

  if (!game) return <Loading />;
  const view = game.sheets.find((s) => s.sheet.id === id);
  if (!view) {
    return (
      <Page title="テストが みつからないよ">
        <LinkButton href="/sheets">テストの いちらんへ</LinkButton>
      </Page>
    );
  }
  const targets = view.mistakes.filter((m) => !isMastered(m.state));

  const save = async () => {
    try {
      await renameSheet(id, title);
      setEditing(false);
      setError(undefined);
      setGame(await gameSummary(child.id));
    } catch (e) {
      setError(
        e instanceof SheetTitleError
          ? `なまえは 1〜${SHEET_TITLE_MAX}もじ だよ`
          : "うまく いかなかったよ",
      );
    }
  };

  return (
    <Page
      title={`${view.progress.cleared ? "🏆 " : ""}${view.sheet.title}`}
      footer={
        <>
          {targets.length > 0 ? (
            <Button
              className="text-xl"
              onClick={() => {
                startSheetRun(id);
                router.push(battleHref(targets[0].mistake.id, id));
              }}
            >
              ⚔️ {w.sheetFight}（{targets.length}）
            </Button>
          ) : null}
          <LinkButton href="/sheets" variant="secondary">
            テストの いちらんへ
          </LinkButton>
        </>
      }
    >
      <p>
        {view.progress.defeated}/{view.progress.total} げきは
        {view.progress.cleared ? "・クリア！" : ""}
      </p>
      {editing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label htmlFor={inputId} className="font-bold">
            テストの なまえ
          </label>
          <input
            id={inputId}
            value={title}
            maxLength={SHEET_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            className="tap rounded-[var(--radius)] border border-line bg-surface px-3"
          />
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button type="submit">きめる</Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              やめる
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            setTitle(view.sheet.title);
            setEditing(true);
          }}
        >
          なまえを かえる
        </Button>
      )}
      <ul className="flex flex-col gap-2">
        {view.mistakes.map(({ mistake: m, state }) => (
          <li key={m.id} className="card flex items-center gap-3 p-3">
            <Monster typeId={m.mistakeTypeId} size={48} motion="none" />
            <span className="flex-1">
              {mistakeType(m.mistakeTypeId).monster}
              <span className="block text-xs text-muted">{m.question}</span>
            </span>
            <span>
              <span aria-hidden="true">{RANK[rankOf(state)]}</span>
              <span className="sr-only">カード {RANK_TEXT[rankOf(state)]}</span>
            </span>
          </li>
        ))}
      </ul>
    </Page>
  );
}

/** S-31 テスト（まとめて たたかう、なまえを かえる・BR-6-1） */
export default function SheetDetailPage() {
  const id = useHashId();
  return (
    <ChildGate>
      {(child) =>
        id === undefined ? (
          <Loading />
        ) : id ? (
          <SheetDetail child={child} id={id} />
        ) : (
          <Page title="テストが みつからないよ">
            <LinkButton href="/sheets">テストの いちらんへ</LinkButton>
          </Page>
        )
      }
    </ChildGate>
  );
}
