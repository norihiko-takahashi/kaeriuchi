"use client";

import { useEffect, useState } from "react";
import { mistakeType } from "@/client/ai/catalog";
import { flushRegrades } from "@/client/ai/regrade";
import { openMistakes } from "@/client/store/battle-repo";
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
import type { Mistake } from "@/shared/battle";
import type { ChildProfile } from "@/shared/schemas";

function HomeBody({ child }: { child: ChildProfile }) {
  const { setView } = useAppState();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [open, setOpen] = useState<Mistake[]>([]);

  useEffect(() => {
    setView({ grade: child.grade, mode: child.displayMode });
    getRules(child.id).then((rules) =>
      setAllowed(isWithinAllowedHours(rules, new Date())),
    );
    openMistakes(child.id).then(setOpen);
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
      <section className="card flex flex-col gap-2 p-4">
        <h2 className="font-bold">まだ たおしていない ミスモン</h2>
        {open.length === 0 ? (
          <p className="text-muted">いまは いないよ</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <Monster typeId={m.mistakeTypeId} size={48} motion="none" />
                <span className="flex-1">
                  {mistakeType(m.mistakeTypeId).monster}
                  {m.status === "almost" ? "（あと いっぽ）" : ""}
                </span>
                <LinkButton href={`/battle#${m.id}`}>たたかう</LinkButton>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card p-4">
        <h2 className="font-bold">
          <R k="今日" r="きょう" />の さいらい ミスモン
        </h2>
        <p className="text-muted">まだ いないよ</p>
      </section>
    </Page>
  );
}

/** S-08 ホーム。撮影（U3）と再来（U6）は、まだ準備中 */
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
