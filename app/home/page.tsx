"use client";

import { useEffect, useState } from "react";
import { mistakeType } from "@/client/ai/catalog";
import { flushRegrades } from "@/client/ai/regrade";
import { battleHref } from "@/client/battle/sheet-run";
import { useWords } from "@/client/battle/words";
import type { MistakeView } from "@/client/store/game-repo";
import { type GameSummary, gameSummary } from "@/client/store/game-repo";
import { getRules } from "@/client/store/repo";
import { useAppState } from "@/components/app-state";
import { Avatar } from "@/components/avatar";
import { Monster } from "@/components/battle/monster";
import { Gate } from "@/components/gate";
import { ReadAloud } from "@/components/read-aloud";
import { R } from "@/components/ruby";
import { LinkButton, Page } from "@/components/ui";
import { isWithinAllowedHours } from "@/domain/parent/rules";
import { isGraduated } from "@/domain/profile/grade";
import type { ChildProfile } from "@/shared/schemas";

function HomeBody({ child }: { child: ChildProfile }) {
  const { setView } = useAppState();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [game, setGame] = useState<GameSummary | null>(null);
  const w = useWords();

  useEffect(() => {
    setView({ grade: child.grade, mode: child.displayMode });
    getRules(child.id).then((rules) =>
      setAllowed(isWithinAllowedHours(rules, new Date())),
    );
    gameSummary(child.id).then(setGame);
    flushRegrades();
  }, [child, setView]);

  if (allowed === false) {
    return (
      <Page title="きょうは おしまい">
        <p className="text-xl">また あしたね！</p>
        <ReadAloud text="きょうは おしまい。また あしたね。" />
        <LinkButton href="/profiles" variant="secondary">
          もどる
        </LinkButton>
      </Page>
    );
  }

  return (
    <Page
      title={
        <span className="flex items-center gap-3">
          <Avatar config={child.avatar} size={56} />
          {child.nickname}
        </span>
      }
      footer={
        <LinkButton href="/profiles" variant="secondary">
          プロフィールを かえる
        </LinkButton>
      }
    >
      {isGraduated(child, new Date()) ? (
        <p className="card p-3">
          🎓 <R k="中学" r="ちゅうがく" />3<R k="年生" r="ねんせい" />を
          <R k="卒業" r="そつぎょう" />
          ！これまでの ミスモンは そのまま つかえるよ。
        </p>
      ) : null}
      <section className="card flex flex-col items-center gap-4 p-6 text-center">
        <p className="text-lg font-bold">
          まちがえた もんだいを とって、ミスモンを かえりうちに しよう！
        </p>
        <button
          type="button"
          disabled
          className="tap rounded-[var(--radius)] bg-primary px-8 py-4 text-xl font-bold text-on-primary opacity-60"
          aria-describedby="capture-soon"
        >
          📷 ミスモンを よぶ
        </button>
        <p id="capture-soon" className="text-sm text-muted">
          じゅんびちゅう（もうすぐ つかえるように なるよ）
        </p>
        <LinkButton href="/mistakes/new" className="text-xl">
          ✏️ てで いれる
        </LinkButton>
      </section>
      {game ? (
        <>
          <section
            className="card flex flex-col gap-2 p-4"
            aria-labelledby="lv"
          >
            <h2 id="lv" className="flex justify-between font-bold">
              <span>
                {w.level} {game.level.level}
              </span>
              <span>
                🔥 {w.streak} {game.streak.current}にち
              </span>
            </h2>
            <div
              role="progressbar"
              aria-label="つぎの レベルまで"
              aria-valuemin={0}
              aria-valuemax={game.level.need}
              aria-valuenow={game.level.into}
              aria-valuetext={`XP ${game.level.into} / ${game.level.need}`}
              className="h-3 w-full overflow-hidden rounded-full border border-line"
            >
              <div
                className="h-full bg-primary"
                style={{
                  width: `${Math.round((game.level.into / game.level.need) * 100)}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted">
              つぎの {w.level}まで あと {game.level.need - game.level.into} XP
              {game.streak.tickets > 0 ? "・おやすみチケット 1まい" : ""}
              {game.streak.best > game.streak.current
                ? `・いちばん ながい きろく ${game.streak.best}にち`
                : ""}
            </p>
          </section>
          {game.clockBack ? (
            <p className="card p-3 text-sm">
              たんまつの ひづけが もどっているみたい。きょうは れんぞくと
              さいらいが すすまないよ。
            </p>
          ) : null}
          <MistakeList
            title={w.revisitTitle}
            items={game.revisits.list}
            empty={
              game.revisits.doneForToday ? w.revisitDone : "いまは いないよ"
            }
          />
          <MistakeList
            title={w.open}
            items={game.open}
            empty="いまは いないよ"
            almost
          />
          <nav className="grid grid-cols-2 gap-3">
            <LinkButton href="/sheets" variant="secondary">
              📝 {w.sheets}
            </LinkButton>
            <LinkButton href="/dex" variant="secondary">
              📖 {w.dex}
            </LinkButton>
          </nav>
        </>
      ) : null}
    </Page>
  );
}

function MistakeList({
  title,
  items,
  empty,
  almost,
}: {
  title: string;
  items: MistakeView[];
  empty: string;
  almost?: boolean;
}) {
  const w = useWords();
  return (
    <section className="card flex flex-col gap-2 p-4">
      <h2 className="font-bold">
        {title}
        {items.length ? `（${items.length}）` : ""}
      </h2>
      {items.length === 0 ? (
        <p className="text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map(({ mistake: m }) => (
            <li key={m.id} className="flex items-center gap-3">
              <Monster typeId={m.mistakeTypeId} size={48} motion="none" />
              <span className="flex-1">
                {mistakeType(m.mistakeTypeId).monster}
                {almost && m.status === "almost" ? "（あと いっぽ）" : ""}
              </span>
              <LinkButton href={battleHref(m.id)}>
                {w.fight.replace("⚔️ ", "")}
              </LinkButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** S-08 ホーム。撮影（U3）は、まだ準備中 */
export default function Home() {
  const { activeChildId } = useAppState();
  return (
    <Gate level="child">
      {({ children }) => {
        const child = children.find((c) => c.id === activeChildId);
        return child ? <HomeBody child={child} /> : null;
      }}
    </Gate>
  );
}
