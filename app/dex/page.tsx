"use client";

import { useEffect, useState } from "react";
import { mistakeType } from "@/client/ai/catalog";
import { useWords } from "@/client/battle/words";
import { type GameSummary, gameSummary } from "@/client/store/game-repo";
import { Monster } from "@/components/battle/monster";
import { ChildGate } from "@/components/child-gate";
import { LinkButton, Loading, Page } from "@/components/ui";
import type { DexRank } from "@/domain/game/dex";
import type { ChildProfile } from "@/shared/schemas";

const KIDS_RANK: Record<DexRank, string> = {
  seen: "まだ たおしていない",
  bronze: "🥉 どう（げきは）",
  silver: "🥈 ぎん（さいらいも げきは）",
  gold: "🥇 きん（かんぜん げきは）",
};
const JUNIOR_RANK: Record<DexRank, string> = {
  seen: "未克服",
  bronze: "克服（1回目）",
  silver: "復習でも正解",
  gold: "定着",
};

function Dex({ child }: { child: ChildProfile }) {
  const w = useWords();
  const [game, setGame] = useState<GameSummary | null>(null);
  useEffect(() => {
    gameSummary(child.id).then(setGame);
  }, [child.id]);
  if (!game) return <Loading />;
  const junior = child.displayMode === "junior";
  const labels = junior ? JUNIOR_RANK : KIDS_RANK;
  const entries = [...game.dex.entries()];
  return (
    <Page
      title={`📖 ${w.dexTitle}`}
      footer={
        <LinkButton href="/home" variant="secondary">
          ホームに もどる
        </LinkButton>
      }
    >
      {entries.length === 0 ? (
        <p className="text-muted">まだ だれも いないよ</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {entries.map(([typeId, rank]) => {
            const t = mistakeType(typeId);
            return (
              <li
                key={typeId}
                className={`card flex flex-col items-center gap-1 p-3 text-center ${
                  rank === "gold" ? "border-4 border-[#d4a017]" : ""
                }`}
              >
                {junior ? null : (
                  <span
                    className={rank === "seen" ? "opacity-30 grayscale" : ""}
                  >
                    <Monster typeId={typeId} size={64} motion="none" />
                  </span>
                )}
                <span className="font-bold">
                  {junior ? t.label : t.monster}
                </span>
                {junior ? null : <span className="text-xs">{t.label}</span>}
                <span className="text-sm">{labels[rank]}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}

/** S-32 図鑑。中学生モードでは「弱点ノート」（BR-6-3・6-6） */
export default function DexPage() {
  return <ChildGate>{(child) => <Dex child={child} />}</ChildGate>;
}
