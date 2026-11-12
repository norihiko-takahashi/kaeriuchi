"use client";

import { useEffect, useState } from "react";
import { mistakeType, mistakeTypesFor } from "@/client/ai/catalog";
import { battleHref } from "@/client/battle/sheet-run";
import { useWords } from "@/client/battle/words";
import { useHashId } from "@/client/pwa/hash-id";
import { changeMistakeType, getMistake } from "@/client/store/battle-repo";
import { Monster } from "@/components/battle/monster";
import { ChildGate } from "@/components/child-gate";
import { ReadAloud } from "@/components/read-aloud";
import { Button, LinkButton, Loading, Page } from "@/components/ui";
import type { Mistake } from "@/shared/battle";

function Found({ id }: { id: string }) {
  const w = useWords();
  const [mistake, setMistake] = useState<Mistake | null>();
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    getMistake(id).then((m) => setMistake(m ?? null));
  }, [id]);

  if (mistake === undefined) return <Loading />;
  if (mistake === null) {
    return (
      <Page title="ミスモンが みつからないよ">
        <LinkButton href="/home">ホームに もどる</LinkButton>
      </Page>
    );
  }
  const t = mistakeType(mistake.mistakeTypeId);

  return (
    <Page
      title={w.appeared}
      footer={
        <>
          <LinkButton href={battleHref(mistake.id)} className="text-xl">
            {w.fight}
          </LinkButton>
          <LinkButton href="/home" variant="secondary">
            {w.fightLater}
          </LinkButton>
        </>
      }
    >
      <div className="flex flex-col items-center gap-2">
        <Monster typeId={mistake.mistakeTypeId} motion="appear" />
        <p className="text-2xl font-bold">{t.monster}</p>
      </div>
      <ReadAloud
        text={`ミスモンが あらわれた。${t.monster}。${mistake.explanation}`}
      />
      <section className="card flex flex-col gap-2 p-4">
        <h2 className="font-bold">まちがいの タイプ</h2>
        <p>{t.label}</p>
        <p className="text-sm text-muted">{mistake.explanation}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
          <dt className="font-bold">きみの こたえ</dt>
          <dd>{mistake.childAnswer}</dd>
          <dt className="font-bold">せいかい</dt>
          <dd>{mistake.correctAnswer}</dd>
        </dl>
      </section>
      {choosing ? (
        <fieldset className="card flex flex-col gap-2 p-4">
          <legend className="font-bold">どの まちがいかな？</legend>
          {mistakeTypesFor(mistake.subject).map((o) => (
            <Button
              key={o.id}
              variant={o.id === mistake.mistakeTypeId ? "primary" : "secondary"}
              onClick={async () => {
                setMistake(await changeMistakeType(mistake.id, o.id));
                setChoosing(false);
              }}
            >
              {o.label}
            </Button>
          ))}
        </fieldset>
      ) : (
        <Button variant="secondary" onClick={() => setChoosing(true)}>
          タイプが ちがう？
        </Button>
      )}
    </Page>
  );
}

/** S-21 ミスモンが あらわれた！（判定が違えば、タイプを選び直せる） */
export default function FoundPage() {
  const id = useHashId();
  return (
    <ChildGate>
      {() =>
        id === undefined ? (
          <Loading />
        ) : id ? (
          <Found id={id} />
        ) : (
          <Page title="ミスモンが みつからないよ">
            <LinkButton href="/home">ホームに もどる</LinkButton>
          </Page>
        )
      }
    </ChildGate>
  );
}
