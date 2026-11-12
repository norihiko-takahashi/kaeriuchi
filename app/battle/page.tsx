"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, generate, gradeFreeText } from "@/client/ai/api";
import { mistakeType } from "@/client/ai/catalog";
import { flushRegrades } from "@/client/ai/regrade";
import {
  battleHref,
  markSheetRun,
  nextInSheetRun,
  parseBattleHash,
} from "@/client/battle/sheet-run";
import { useWords } from "@/client/battle/words";
import { useHashId } from "@/client/pwa/hash-id";
import {
  abandonBattle,
  activeBattle,
  addRegrade,
  addReport,
  appendProblem,
  createBattle,
  finishBattle,
  finishedBattles,
  getMistake,
  saveBattle,
} from "@/client/store/battle-repo";
import { currentDay } from "@/client/store/clock";
import {
  type BattleOutcome,
  battleOutcome,
  gameSummary,
} from "@/client/store/game-repo";
import { toRecord } from "@/client/store/records";
import { AnswerInput } from "@/components/battle/answer-input";
import { HpBar } from "@/components/battle/hp-bar";
import { Monster } from "@/components/battle/monster";
import { ReportPanel } from "@/components/battle/report-panel";
import { ChildGate } from "@/components/child-gate";
import { ReadAloud } from "@/components/read-aloud";
import { RubyText } from "@/components/ruby-text";
import { Button, LinkButton, Loading, Page } from "@/components/ui";
import { type ChildAnswer, gradeLocally } from "@/domain/battle/grading";
import {
  answer,
  type BattleState,
  canRescue,
  hp,
  maxHp,
  next,
  rescue,
  showHint,
} from "@/domain/battle/state";
import { isMastered, nextMode, reviewState } from "@/domain/game/review";
import type { BattleMode } from "@/domain/game/types";
import type { XpPart } from "@/domain/game/xp";
import type { Battle, Mistake, ReportReason } from "@/shared/battle";
import { MIN_BATTLE_PROBLEMS } from "@/shared/problem";
import type { ChildProfile } from "@/shared/schemas";

type Load =
  | { kind: "loading" }
  | { kind: "generating" }
  | { kind: "failed"; message: string }
  | { kind: "ready" };

const FAILED = "うまく つくれなかったよ。あとで もう一回 ためしてね";

function BattleBody({
  child,
  mistake,
  mode,
  sheetId,
}: {
  child: ChildProfile;
  mistake: Mistake;
  /** 新しく始めるときのバトルの種類（続きから再開するときは、保存した種類を使う） */
  mode: BattleMode;
  sheetId?: string;
}) {
  const [battle, setBattleState] = useState<Battle | null>(null);
  const battleRef = useRef<Battle | null>(null);
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [streamDone, setStreamDone] = useState(false);
  /** 通信が切れていて「おなじ？」と聞いている答え */
  const [askSame, setAskSame] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState("");
  const started = useRef(false);
  const finished = useRef(false);

  const setBattle = useCallback((b: Battle) => {
    battleRef.current = b;
    setBattleState(b);
  }, []);

  /** 問題を作る（または、続きから再開する） */
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const ctrl = new AbortController();
    (async () => {
      flushRegrades();
      const existing = await activeBattle(mistake.id);
      if (existing && existing.problems.length >= MIN_BATTLE_PROBLEMS) {
        setBattle(existing);
        setStreamDone(true);
        setLoad({ kind: "ready" });
        return;
      }
      // 作っている途中でアプリを閉じたなど、問題がそろっていないものは作り直す
      if (existing) await abandonBattle(existing.id);
      setLoad({ kind: "generating" });
      // 1問ずつ順番に保存する（届く順と保存の順がずれないように）
      let chain = Promise.resolve();
      const onProblem = (p: Parameters<typeof appendProblem>[1]) => {
        chain = chain.then(async () => {
          const cur = battleRef.current;
          const b = cur
            ? await appendProblem(cur, p)
            : await createBattle(mistake, [p], mode);
          setBattle(b);
          setLoad({ kind: "ready" });
        });
        return chain;
      };
      try {
        await generate(
          {
            analysis: {
              subject: mistake.subject,
              unit: mistake.unit,
              question: mistake.question,
              childAnswer: mistake.childAnswer,
              correctAnswer: mistake.correctAnswer,
              mistakeTypeId: mistake.mistakeTypeId,
              explanation: mistake.explanation,
              confidence: { question: 1, childAnswer: 1, correctAnswer: 1 },
              piiDetected: false,
              gradingMarksFound: false,
            },
            grade: child.grade,
            // 再来とれんしゅうは、前とは違う問題を2問（BR-45-3）
            mode: mode === "first" ? "first" : "revisit",
            avoid: mistake.usedPrompts,
          },
          onProblem,
          ctrl.signal,
        );
        await chain;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        await chain;
        if (!battleRef.current) {
          setLoad({
            kind: "failed",
            message: e instanceof ApiError ? e.childMessage : FAILED,
          });
          return;
        }
      }
      const b = battleRef.current;
      if (!b || b.problems.length < MIN_BATTLE_PROBLEMS) {
        // 2問そろわなければ戦わない。ミスモンは残す（BR-45-2）
        if (b) await abandonBattle(b.id);
        battleRef.current = null;
        setBattleState(null);
        setLoad({ kind: "failed", message: FAILED });
        return;
      }
      setStreamDone(true);
    })();
    return () => ctrl.abort();
  }, [mistake, child.grade, setBattle, mode]);

  const update = useCallback(
    async (state: BattleState, lastAnswer?: string) => {
      const b = battleRef.current;
      if (!b) return;
      const lastAnswers = [...b.lastAnswers];
      if (lastAnswer !== undefined) lastAnswers[b.state.index] = lastAnswer;
      let saved = await saveBattle({ ...b, state, lastAnswers });
      if (state.phase === "finished" && !finished.current) {
        finished.current = true;
        saved = await finishBattle(saved);
        if (sheetId) markSheetRun(sheetId, saved.mistakeId);
      }
      setBattle(saved);
    },
    [setBattle, sheetId],
  );

  if (load.kind === "loading") return <Loading />;
  if (load.kind === "failed") {
    return (
      <Page title="ざんねん…">
        <p role="alert">{load.message}</p>
        <LinkButton href="/home">ホームに もどる</LinkButton>
      </Page>
    );
  }
  if (load.kind === "generating" || !battle) {
    return (
      <Page title="ミスモンが かまえている…">
        <div className="flex flex-col items-center gap-3" aria-busy="true">
          <Monster typeId={mistake.mistakeTypeId} />
          <output>かえりうち もんだいを つくっているよ…</output>
        </div>
      </Page>
    );
  }

  const s = battle.state;
  const t = mistakeType(mistake.mistakeTypeId);

  if (s.phase === "finished") {
    return (
      <Result
        battle={battle}
        mistake={mistake}
        child={child}
        sheetId={sheetId}
      />
    );
  }

  const p = battle.problems[s.index];
  const progress = s.problems[s.index];
  const isLast = s.index + 1 >= battle.problems.length;
  const waitingNext = isLast && !streamDone;

  const apply = async (correct: boolean, text: string, selfJudged = false) => {
    const nextState = answer(s, correct, { selfJudged });
    await update(nextState, text);
    const q = nextState.problems[s.index];
    setAnnounce(
      correct
        ? `せいかい！ ダメージ ${q.damage}。のこり HP ${hp(nextState)}`
        : nextState.phase === "revealed"
          ? `こたえは ${p.answer} だよ`
          : "おしい！ ヒントを みてね",
    );
  };

  const onAnswer = async (ans: ChildAnswer, text: string) => {
    setBusy(true);
    try {
      const verdict = gradeLocally(p, ans);
      if (verdict !== "unsure") return await apply(verdict === "correct", text);
      // 一覧にはないが似ている：通信できれば AI、できなければ「おなじ？」（U45-OFF-2）
      if (navigator.onLine) {
        try {
          const correct = await gradeFreeText({
            problem: p,
            answer: text,
            grade: child.grade,
          });
          return await apply(correct, text);
        } catch {
          // 下の「おなじ？」に進む
        }
      }
      setAskSame(text);
    } finally {
      setBusy(false);
    }
  };

  const onSame = async (same: boolean) => {
    const text = askSame ?? "";
    setAskSame(null);
    const { verification: _v, ...problem } = p;
    await addRegrade({
      problem,
      answer: text,
      grade: child.grade,
      childSaidSame: same,
    });
    await apply(same, text, same);
  };

  const onReport = async (reason: ReportReason, freeText?: string) => {
    const rescuing = reason === "marked-wrong" && canRescue(s);
    const { verification, ...problem } = p;
    await addReport({
      reason,
      freeText,
      problem,
      childAnswer: battle.lastAnswers[s.index],
      mistake: {
        subject: mistake.subject,
        grade: mistake.grade,
        question: mistake.question,
        childAnswer: mistake.childAnswer,
        correctAnswer: mistake.correctAnswer,
        mistakeTypeId: mistake.mistakeTypeId,
      },
      rescued: rescuing,
      ...verification,
    });
    if (rescuing) {
      const nextState = rescue(s);
      await update(nextState);
      setAnnounce(
        `せいかいに したよ。ダメージ 100。のこり HP ${hp(nextState)}`,
      );
      return "せいかいに したよ！ おしえてくれて ありがとう。しらべておくね";
    }
    if (reason === "marked-wrong" && s.rescueUsed) {
      return "おしえてくれて ありがとう。しらべておくね（せいかいに できるのは、1かいの バトルで 1もん までだよ）";
    }
    return "おしえてくれて ありがとう。しらべておくね";
  };

  return (
    <Page
      title={
        child.displayMode === "junior"
          ? t.label
          : `${t.monster}と たたかう${battle.mode === "practice" ? "（れんしゅう）" : battle.mode === "revisit" ? "（さいらい）" : ""}`
      }
      footer={
        <LinkButton href="/home" variant="secondary">
          やめる（つづきから できるよ）
        </LinkButton>
      }
    >
      <div className="flex flex-col items-center gap-2">
        <Monster
          key={`${s.index}-${s.phase}`}
          typeId={mistake.mistakeTypeId}
          size={120}
          motion={s.phase === "hit" ? "hit" : "idle"}
        />
        <HpBar hp={hp(s)} max={maxHp(s)} />
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <section
        className="card flex flex-col gap-3 p-4"
        aria-labelledby="q-title"
      >
        <h2 id="q-title" className="text-sm font-bold text-muted">
          {s.index + 1}もんめ
          {streamDone ? ` / ${battle.problems.length}もん` : ""}
        </h2>
        <p className="whitespace-pre-wrap text-2xl">
          <RubyText text={p.prompt} ruby={p.ruby} />
        </p>
        <ReadAloud text={p.prompt} />

        {p.hints.slice(0, progress.hints).map((h, i) => (
          <p key={h} className="rounded-[var(--radius)] bg-bg p-2">
            💡 ヒント{i + 1}：<RubyText text={h} ruby={p.ruby} />
          </p>
        ))}

        {s.phase === "asking" && askSame === null ? (
          <>
            {s.lastWrong ? (
              <p role="alert" className="font-bold text-danger">
                おしい！ もう一回 やってみよう
              </p>
            ) : null}
            <AnswerInput problem={p} disabled={busy} onSubmit={onAnswer} />
            {progress.hints < Math.min(2, p.hints.length) ? (
              <Button
                variant="secondary"
                className="self-start"
                onClick={() => update(showHint(s))}
              >
                ヒントを みる
              </Button>
            ) : null}
          </>
        ) : null}

        {askSame !== null ? (
          <div className="flex flex-col gap-2">
            <p>
              いまは インターネットに つながっていないよ。せいかいは「{p.answer}
              」。きみの こたえ「{askSame}」と おなじ？
            </p>
            <div className="flex gap-2">
              <Button onClick={() => onSame(true)}>おなじ</Button>
              <Button variant="secondary" onClick={() => onSame(false)}>
                ちがう
              </Button>
            </div>
          </div>
        ) : null}

        {s.phase === "hit" ? (
          <div className="flex flex-col gap-2">
            <p className="text-2xl font-bold text-primary">
              {progress.rescued ? "せいかいに したよ！" : "せいかい！"} ダメージ{" "}
              {progress.damage}！
            </p>
            <Button disabled={waitingNext} onClick={() => update(next(s))}>
              {waitingNext
                ? "つぎの もんだいを まっているよ…"
                : isLast
                  ? "けっかを みる"
                  : "つぎへ"}
            </Button>
          </div>
        ) : null}

        {s.phase === "revealed" ? (
          <div className="flex flex-col gap-2">
            <p className="font-bold">こたえは「{p.answer}」だよ</p>
            <p>
              <RubyText text={p.explanation} ruby={p.ruby} />
            </p>
            <Button disabled={waitingNext} onClick={() => update(next(s))}>
              {waitingNext
                ? "つぎの もんだいを まっているよ…"
                : isLast
                  ? "けっかを みる"
                  : "つぎへ"}
            </Button>
          </div>
        ) : null}
      </section>
      <ReportPanel
        key={`${s.index}-${s.phase}-${progress.wrong}`}
        onSend={onReport}
      />
    </Page>
  );
}

/** S-23 結果（撃破・あと一歩）。解説をもう一度見られる。解説の画面からも報告できる */
function Result({
  battle,
  mistake,
  child,
  sheetId,
}: {
  battle: Battle;
  mistake: Mistake;
  child: ChildProfile;
  sheetId?: string;
}) {
  const w = useWords();
  const won = battle.state.result === "defeated";
  const t = mistakeType(mistake.mistakeTypeId);
  const [outcome, setOutcome] = useState<BattleOutcome | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);
  useEffect(() => {
    battleOutcome(child.id, battle.id).then((o) => setOutcome(o ?? null));
    if (!sheetId) return;
    gameSummary(child.id).then((g) => {
      const sheet = g.sheets.find((x) => x.sheet.id === sheetId);
      const candidates = (sheet?.mistakes ?? [])
        .filter((v) => !isMastered(v.state))
        .map((v) => v.mistake.id);
      setNextId(nextInSheetRun(sheetId, candidates) ?? null);
    });
  }, [child.id, battle.id, sheetId]);
  return (
    <Page
      title={won ? w.defeated : w.almost}
      footer={
        <>
          {sheetId && nextId ? (
            <LinkButton href={battleHref(nextId, sheetId)}>{w.next}</LinkButton>
          ) : null}
          {sheetId ? (
            <LinkButton href={`/sheets/detail#${sheetId}`} variant="secondary">
              テストに もどる
            </LinkButton>
          ) : null}
          <LinkButton href="/home" variant={sheetId ? "secondary" : "primary"}>
            ホームに もどる
          </LinkButton>
        </>
      }
    >
      <div className="flex flex-col items-center gap-2">
        <Monster typeId={mistake.mistakeTypeId} size={120} motion="none" />
        <output className="text-center text-lg font-bold">
          {won
            ? `${t.monster}を かえりうちに した！`
            : `${t.monster}は にげた… あした また でてくるよ`}
        </output>
      </div>
      {outcome ? <Rewards outcome={outcome} /> : null}
      <section className="card flex flex-col gap-1 p-4">
        <h2 className="font-bold">さいしょの まちがい</h2>
        <p>{mistake.question}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3">
          <dt className="font-bold">きみの こたえ</dt>
          <dd>{mistake.childAnswer}</dd>
          <dt className="font-bold">せいかい</dt>
          <dd>{mistake.correctAnswer}</dd>
        </dl>
        <p className="text-sm">{mistake.explanation}</p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-bold">かいせつを みる</h2>
        {battle.problems.map((p, i) => (
          <details key={p.prompt} className="card p-3">
            <summary className="tap cursor-pointer">
              {i + 1}もんめ{" "}
              {battle.state.problems[i].outcome === "cleared" ? "⭕" : "△"}
            </summary>
            <p className="mt-2 whitespace-pre-wrap">
              <RubyText text={p.prompt} ruby={p.ruby} />
            </p>
            <p className="font-bold">こたえ：{p.answer}</p>
            {battle.lastAnswers[i] ? (
              <p>きみの こたえ：{battle.lastAnswers[i]}</p>
            ) : null}
            <p>
              <RubyText text={p.explanation} ruby={p.ruby} />
            </p>
            <ReportPanel
              onSend={async (reason, freeText) => {
                const { verification, ...problem } = p;
                await addReport({
                  reason,
                  freeText,
                  problem,
                  childAnswer: battle.lastAnswers[i],
                  mistake: {
                    subject: mistake.subject,
                    grade: mistake.grade,
                    question: mistake.question,
                    childAnswer: mistake.childAnswer,
                    correctAnswer: mistake.correctAnswer,
                    mistakeTypeId: mistake.mistakeTypeId,
                  },
                  rescued: false,
                  ...verification,
                });
                return "おしえてくれて ありがとう。しらべておくね";
              }}
            />
          </details>
        ))}
      </section>
    </Page>
  );
}

function BattleLoader({ child, hash }: { child: ChildProfile; hash: string }) {
  const { mistakeId: id, sheetId } = parseBattleHash(hash);
  const [mistake, setMistake] = useState<Mistake | null>();
  const [mode, setMode] = useState<BattleMode>("first");
  useEffect(() => {
    (async () => {
      const m = await getMistake(id);
      if (!m || m.childId !== child.id) return setMistake(null);
      // 記録から、再来の日が来ているかを決める（BR-6-2）
      const records = (await finishedBattles(m.id)).flatMap((b) => {
        const r = toRecord(b);
        return r ? [r] : [];
      });
      const { today } = await currentDay();
      setMode(nextMode(reviewState(records), today));
      setMistake(m);
    })();
  }, [id, child.id]);
  if (mistake === undefined) return <Loading />;
  if (mistake === null)
    return (
      <Page title="ミスモンが みつからないよ">
        <LinkButton href="/home">ホームに もどる</LinkButton>
      </Page>
    );
  return (
    <BattleBody child={child} mistake={mistake} mode={mode} sheetId={sheetId} />
  );
}

const XP_LABELS: Record<XpPart["kind"], string> = {
  firstDefeat: "げきは",
  revisitDefeat: "さいらいを げきは",
  mastered: "かんぜん げきは！",
  noHintBonus: "ヒントなしで ぜんもん せいかい",
  hints: "ヒント",
  almost: "さいごまで がんばった",
  practice: "れんしゅう",
};

const DEX_LABELS = { seen: "", bronze: "どう", silver: "ぎん", gold: "きん" };

/** もらった XP・レベルアップ・図鑑・連続記録（BR-6-3〜6-5） */
function Rewards({ outcome }: { outcome: BattleOutcome }) {
  const w = useWords();
  const levelUp = outcome.levelAfter.level > outcome.levelBefore.level;
  const dexUp =
    outcome.dexAfter !== outcome.dexBefore && outcome.dexAfter !== "seen";
  return (
    <section className="card flex flex-col gap-2 p-4" aria-labelledby="rewards">
      <h2 id="rewards" className="font-bold">
        もらった XP：{outcome.xpGained}
      </h2>
      <ul className="text-sm">
        {outcome.xpParts.map((p) => (
          <li key={p.kind}>
            {XP_LABELS[p.kind]} {p.xp > 0 ? `+${p.xp}` : p.xp}
          </li>
        ))}
      </ul>
      {levelUp ? (
        <p className="text-lg font-bold text-primary">
          🎉 {w.level} {outcome.levelAfter.level} に あがった！
        </p>
      ) : null}
      {dexUp ? (
        <p className="font-bold">
          📖 {w.dex}の カードが「{DEX_LABELS[outcome.dexAfter]}」に なった！
        </p>
      ) : null}
      <p className="text-sm">
        🔥 {w.streak} {outcome.streak.current}にち
        {outcome.streak.current > 0 &&
        outcome.streak.current === outcome.streak.best
          ? "（いちばん ながい きろく！）"
          : ""}
      </p>
    </section>
  );
}

/** S-22 バトル（U5）。再来・れんしゅう・テストのまとめての復習（U6） */
export default function BattlePage() {
  const id = useHashId();
  return (
    <ChildGate>
      {(child) =>
        id === undefined ? (
          <Loading />
        ) : id ? (
          <BattleLoader child={child} hash={id} />
        ) : (
          <Page title="ミスモンが みつからないよ">
            <LinkButton href="/home">ホームに もどる</LinkButton>
          </Page>
        )
      }
    </ChildGate>
  );
}
