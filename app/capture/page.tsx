"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, analyzeImage, classify } from "@/client/ai/api";
import { mistakeType } from "@/client/ai/catalog";
import { type Crop, exportFrame } from "@/client/capture/export";
import {
  discardPhoto,
  loadPhoto,
  type Photo,
  PhotoError,
} from "@/client/capture/photo";
import { runLimited } from "@/client/capture/queue";
import type { Stroke } from "@/client/capture/redact";
import {
  DailyLimitError,
  mistakesToday,
  registerPhotoMistakes,
} from "@/client/store/battle-repo";
import { Monster } from "@/components/battle/monster";
import {
  type EditorMode,
  FrameEditor,
} from "@/components/capture/frame-editor";
import {
  type ReviewedItem,
  ReviewStep,
} from "@/components/capture/review-step";
import { ChildGate } from "@/components/child-gate";
import { ReadAloud } from "@/components/read-aloud";
import { Button, ErrorText, LinkButton, Page } from "@/components/ui";
import {
  centerRect,
  type Frame,
  frameWarning,
  MAX_FRAMES,
  minSide,
  sortFrames,
} from "@/domain/capture/geometry";
import type { Mistake, Sheet } from "@/shared/battle";
import type { AnalyzeResponse } from "@/shared/capture";
import { SUBJECT_LABELS, type Subject } from "@/shared/problem";
import type { ChildProfile } from "@/shared/schemas";

/**
 * 撮影・切り抜き・解析（U3、functional-design.md）。
 * ① 教科 → ② 撮る・選ぶ → ③ 囲む → ④ かくすペン → ⑤ 送る → ⑥ 1問ずつ確かめる → ⑦ 登録
 * 写真は画面を開いている間だけメモリに置く（U3-PRIV-1）。送るのは枠の中だけ（U3-PRIV-2）。
 */

/** 裏に回ってからこれだけたったら、写真を捨てる（U3-PRIV-1） */
const BACKGROUND_LIMIT_MS = 10 * 60 * 1000;
const SUBJECTS = Object.keys(SUBJECT_LABELS) as Subject[];

type Step =
  | "subject"
  | "pick"
  | "frame"
  | "pen"
  | "sending"
  | "review"
  | "saving"
  | "done";

interface Item {
  frame: Frame;
  crop: Crop;
  url: string;
  result?: AnalyzeResponse;
  error?: string;
  reviewed?: ReviewedItem | "skipped";
}

function Capture({ child }: { child: ChildProfile }) {
  const [step, setStep] = useState<Step>("subject");
  /** undefined は「わからない」 */
  const [subject, setSubject] = useState<Subject | undefined>();
  const [left, setLeft] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const photo = useRef<Photo | null>(null);
  const [photoVer, setPhotoVer] = useState(0);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [thick, setThick] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState(0);
  const [saved, setSaved] = useState<{ sheet: Sheet; mistakes: Mistake[] }>();
  const idSeq = useRef(0);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    mistakesToday(child.id).then(({ used, limit }) =>
      setLeft(Math.max(0, limit - used)),
    );
  }, [child.id]);

  /** 写真と切り抜いた画像を捨てる */
  const discardAll = useCallback(() => {
    discardPhoto(photo.current);
    photo.current = null;
    setItems((xs) => {
      for (const x of xs) URL.revokeObjectURL(x.url);
      return [];
    });
    setFrames([]);
    setStrokes([]);
    setSelected(null);
  }, []);

  // 画面を離れるときに捨てる
  useEffect(() => discardAll, [discardAll]);

  // 裏に回って 10分たったら捨てる
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const at = hiddenAt.current;
      hiddenAt.current = null;
      if (at && Date.now() - at > BACKGROUND_LIMIT_MS && photo.current) {
        discardAll();
        setStep("pick");
        setError(
          "じかんが たったので しゃしんを けしたよ。もういちど とってね",
        );
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [discardAll]);

  const maxFrames = Math.min(MAX_FRAMES, left ?? 0);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(undefined);
    discardAll();
    try {
      photo.current = await loadPhoto(file);
      setPhotoVer((v) => v + 1);
      setStep("frame");
    } catch (e) {
      setError(
        e instanceof PhotoError
          ? "この しゃしんは よめなかったよ。とりなおすか、てで いれてね"
          : "うまく いかなかったよ。もう一回 ためしてね",
      );
    }
  };

  const send = async () => {
    const p = photo.current;
    if (!p || frames.length === 0) return;
    if (!navigator.onLine) {
      setError("インターネットに つながってから おくってね");
      return;
    }
    setError(undefined);
    setStep("sending");
    setProgress(0);
    const ordered = sortFrames(frames);
    const made: Item[] = [];
    for (const frame of ordered) {
      const crop = await exportFrame(p, frame, strokes);
      made.push({ frame, crop, url: URL.createObjectURL(crop.blob) });
    }
    setItems(made);
    let stopped = false;
    const results = [...made];
    await runLimited(
      made,
      2,
      (it) =>
        analyzeImage({ image: it.crop.blob, grade: child.grade, subject }),
      (i, r) => {
        if (r.status === "fulfilled")
          results[i] = { ...results[i], result: r.value };
        else {
          const e = r.reason;
          if (e instanceof ApiError && e.code === "rate_limited")
            stopped = true;
          results[i] = {
            ...results[i],
            error:
              e instanceof ApiError
                ? e.childMessage
                : "うまく よみとれなかったよ",
          };
        }
        setProgress((n) => n + 1);
      },
      () => stopped,
    );
    if (stopped)
      for (let i = 0; i < results.length; i++)
        if (!results[i].result && !results[i].error)
          results[i] = { ...results[i], error: "きょうは もう よみとれないよ" };
    setItems(results);
    setCurrent(0);
    setStep("review");
  };

  const retry = async (i: number) => {
    const it = items[i];
    try {
      const result = await analyzeImage({
        image: it.crop.blob,
        grade: child.grade,
        subject,
      });
      setItems((xs) =>
        xs.map((x, k) => (k === i ? { ...x, result, error: undefined } : x)),
      );
    } catch (e) {
      setItems((xs) =>
        xs.map((x, k) =>
          k === i
            ? {
                ...x,
                error:
                  e instanceof ApiError
                    ? e.childMessage
                    : "うまく よみとれなかったよ",
              }
            : x,
        ),
      );
    }
  };

  const finishReview = async (all: Item[]) => {
    const chosen = all.filter(
      (x): x is Item & { reviewed: ReviewedItem } =>
        !!x.reviewed && x.reviewed !== "skipped",
    );
    if (chosen.length === 0) {
      discardAll();
      setStep("pick");
      setError("とうろく する もんだいが なかったよ");
      return;
    }
    setStep("saving");
    try {
      const mistakes = await Promise.all(
        chosen.map(async (x) => {
          const r = x.reviewed as ReviewedItem;
          const a = x.result?.analysis;
          // 手で入れた・タイプを AI に決めてもらうものは、ここで判定する
          if (!a || !r.mistakeTypeId) {
            const res = await classify({ ...r, grade: child.grade });
            return {
              ...r,
              classified: res.result,
              classifiedBy: res.meta,
            };
          }
          const meta = x.result?.meta;
          return {
            ...r,
            classified: {
              mistakeTypeId: r.mistakeTypeId,
              unit: a.unit,
              explanation: a.explanation,
            },
            classifiedBy: {
              provider: meta?.provider ?? "",
              model: meta?.model ?? "",
              promptVersion: meta?.promptVersion ?? "",
            },
          };
        }),
      );
      const result = await registerPhotoMistakes({
        childId: child.id,
        grade: child.grade,
        subject,
        mistakes,
      });
      discardAll();
      setSaved(result);
      setStep("done");
    } catch (e) {
      setStep("review");
      setCurrent(all.length - 1);
      if (e instanceof DailyLimitError)
        return setError("きょうは もう とうろく できないよ。また あしたね");
      if (e instanceof ApiError) return setError(e.childMessage);
      setError("うまく いかなかったよ。もう一回 ためしてね");
    }
  };

  const decide = (i: number, reviewed: ReviewedItem | "skipped") => {
    const next = items.map((x, k) => (k === i ? { ...x, reviewed } : x));
    setItems(next);
    if (i + 1 < next.length) setCurrent(i + 1);
    else finishReview(next);
  };

  const quit = (
    <LinkButton href="/home" variant="secondary" className="w-full">
      やめる
    </LinkButton>
  );

  if (left === 0 && step !== "done") {
    return (
      <Page title="きょうは ここまで">
        <p>
          きょう とうろく できる ミスモンは もう いっぱいだよ。また あしたね！
        </p>
        <LinkButton href="/home" variant="secondary">
          ホームに もどる
        </LinkButton>
      </Page>
    );
  }

  if (step === "subject")
    return (
      <Page title="なんの テスト？" footer={quit}>
        <ReadAloud text="なんの テストか えらんでね。わからなかったら わからない を おしてね。" />
        <div className="grid grid-cols-2 gap-3">
          {SUBJECTS.map((s) => (
            <Button
              key={s}
              variant="secondary"
              className="text-lg"
              onClick={() => {
                setSubject(s);
                setStep("pick");
              }}
            >
              {SUBJECT_LABELS[s]}
            </Button>
          ))}
          <Button
            variant="secondary"
            className="text-lg"
            onClick={() => {
              setSubject(undefined);
              setStep("pick");
            }}
          >
            わからない
          </Button>
        </div>
      </Page>
    );

  if (step === "pick")
    return (
      <Page
        title="テストの しゃしんを とろう"
        footer={
          <>
            <LinkButton href="/mistakes/new" variant="secondary">
              ✏️ てで いれる
            </LinkButton>
            {quit}
          </>
        }
      >
        <ReadAloud text="まるつけした テストを まっすぐ とってね。なまえは あとで けせるよ。" />
        <p className="text-sm text-muted">
          {subject ? SUBJECT_LABELS[subject] : "きょうか わからない"}・きょうは
          あと {left ?? "…"}もん とうろく できるよ
        </p>
        <ul className="card flex flex-col gap-1 p-4 text-sm">
          <li>・あかるい ところで、テストを まっすぐ とってね</li>
          <li>・まちがえた もんだいが ぜんぶ うつるように してね</li>
        </ul>
        <label className="tap flex cursor-pointer items-center justify-center rounded-[var(--radius)] bg-primary px-6 py-4 text-xl font-bold text-on-primary">
          📷 しゃしんを とる
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <label className="tap flex cursor-pointer items-center justify-center rounded-[var(--radius)] border border-line bg-surface px-6 font-bold">
          🖼️ しゃしんを えらぶ
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            data-testid="pick-photo"
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <ErrorText>{error}</ErrorText>
      </Page>
    );

  const p = photo.current;
  if ((step === "frame" || step === "pen") && p) {
    const mode: EditorMode = step === "pen" ? "pen" : "frame";
    const sel = frames.find((f) => f.id === selected);
    const warnings = sortFrames(frames)
      .map((f, i) => ({ i, w: frameWarning(f, p) }))
      .filter((x) => x.w);
    return (
      <Page
        title={
          step === "frame"
            ? "まちがえた もんだいを かこもう"
            : "なまえを けそう"
        }
        footer={
          <>
            {step === "frame" ? (
              <Button
                disabled={frames.length === 0}
                onClick={() => {
                  setSelected(null);
                  setStep("pen");
                }}
              >
                つぎへ（{frames.length}もん）
              </Button>
            ) : (
              <>
                <Button onClick={send}>おくる（{frames.length}もん）</Button>
                <Button variant="secondary" onClick={() => setStep("frame")}>
                  わくに もどる
                </Button>
              </>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                discardAll();
                setStep("pick");
              }}
            >
              とりなおす
            </Button>
          </>
        }
      >
        <ReadAloud
          text={
            step === "frame"
              ? "まちがえた もんだいを ゆびで なぞって しかくで かこんでね。なんもんでも いいよ。"
              : "なまえや がっこうの なまえが わくの なかに あったら、かくすペンで ぬってね。なければ そのまま おくってね。"
          }
        />
        <p className="text-sm">
          {step === "frame"
            ? `ゆびで なぞると わくが できるよ。2ほんの ゆびで おおきく できるよ（${frames.length} / ${maxFrames}）`
            : "ぬった ところは くろく なって、おくられないよ"}
        </p>
        <FrameEditor
          key={photoVer}
          photo={p}
          mode={mode}
          frames={frames}
          onFrames={setFrames}
          selectedId={selected}
          onSelect={setSelected}
          strokes={strokes}
          onStrokes={setStrokes}
          penWidth={Math.max(4, minSide(p) * (thick ? 0.8 : 0.35))}
          canAdd={frames.length < maxFrames}
          newId={() => `f${++idSeq.current}`}
        />
        {step === "frame" ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={frames.length >= maxFrames}
              onClick={() => {
                const f = { id: `f${++idSeq.current}`, ...centerRect(p) };
                setFrames([...frames, f]);
                setSelected(f.id);
              }}
            >
              わくを ふやす
            </Button>
            <Button
              variant="secondary"
              disabled={!sel}
              onClick={() => {
                setFrames(frames.filter((f) => f.id !== selected));
                setSelected(null);
              }}
            >
              えらんだ わくを けす
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setThick(!thick)}>
              ペン：{thick ? "ふとい" : "ほそい"}
            </Button>
            <Button
              variant="secondary"
              disabled={strokes.length === 0}
              onClick={() => setStrokes(strokes.slice(0, -1))}
            >
              もとに もどす
            </Button>
          </div>
        )}
        {frames.length >= maxFrames ? (
          <output className="block text-sm">
            {maxFrames < MAX_FRAMES
              ? "きょう とうろく できるのは ここまでだよ"
              : `いちどに かこめるのは ${MAX_FRAMES}もん までだよ`}
          </output>
        ) : null}
        <ul className="flex flex-col gap-1 text-sm" aria-live="polite">
          {warnings.map(({ i, w }) => (
            <li key={i}>
              {i + 1}ばんの わく：
              {w === "tooSmall"
                ? "ちいさすぎるよ。もんだいが ぜんぶ はいるように ひろげてね"
                : "おおきいよ。なまえが はいっていないか たしかめてね"}
            </li>
          ))}
        </ul>
        <ErrorText>{error}</ErrorText>
      </Page>
    );
  }

  if (step === "sending")
    return (
      <Page title="よみとりちゅう…">
        <p className="text-center text-xl font-bold" aria-live="polite">
          {Math.min(progress + 1, items.length || frames.length)} /{" "}
          {items.length || frames.length} よみとりちゅう…
        </p>
      </Page>
    );

  if (step === "review" && items[current]) {
    const it = items[current];
    return (
      <Page title="よみとった ないようを たしかめよう" footer={quit}>
        <ReviewStep
          index={current}
          total={items.length}
          imageUrl={it.url}
          analysis={it.result?.analysis}
          failed={it.error}
          grade={child.grade}
          subject={subject}
          onRetry={() => retry(current)}
          onDone={(r) => decide(current, r)}
          onSkip={() => decide(current, "skipped")}
        />
        <ErrorText>{error}</ErrorText>
      </Page>
    );
  }

  if (step === "saving")
    return (
      <Page title="とうろく ちゅう…">
        <p aria-live="polite">ミスモンを よびだして いるよ…</p>
      </Page>
    );

  if (step === "done" && saved)
    return (
      <Page
        title={`ミスモンが ${saved.mistakes.length}ひき あらわれた！`}
        footer={
          <>
            <LinkButton
              href={`/sheets/detail#${saved.sheet.id}`}
              className="text-xl"
            >
              ⚔️ たたかう
            </LinkButton>
            <LinkButton href="/home" variant="secondary">
              ホームに もどる
            </LinkButton>
          </>
        }
      >
        <p className="text-sm text-muted">
          「{saved.sheet.title}」に まとめたよ
        </p>
        <ul className="grid grid-cols-2 gap-3">
          {saved.mistakes.map((m) => {
            const t = mistakeType(m.mistakeTypeId);
            return (
              <li
                key={m.id}
                className="card flex flex-col items-center gap-1 p-3 text-center"
              >
                <Monster typeId={t.id} size={96} motion="appear" />
                <span className="font-bold">{t.monster}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted">しゃしんは もう けしたよ</p>
      </Page>
    );

  return (
    <Page title="もういちど とってね">
      <Button onClick={() => setStep("pick")}>しゃしんを とる</Button>
      {quit}
    </Page>
  );
}

/** 撮影（U3）：テストを撮って、間違いをまとめてミスモンにする（US-2.1〜2.4・3.1〜3.3） */
export default function CapturePage() {
  return <ChildGate>{(child) => <Capture child={child} />}</ChildGate>;
}
