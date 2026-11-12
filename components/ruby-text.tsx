"use client";

import { Fragment } from "react";
import { needsRuby } from "@/domain/ruby/kanji-grade";
import type { RubyEntry } from "@/shared/problem";
import { useAppState } from "./app-state";

/**
 * AI が作った文に、ふりがなを付けて表示する（BR-6-7）。
 * その学年までに習っていない漢字を含む語にだけ付ける（U1 と同じ基準）。長い語から先に当てる。
 */
export function RubyText({ text, ruby }: { text: string; ruby?: RubyEntry[] }) {
  const { grade, mode } = useAppState();
  const entries = (ruby ?? [])
    .filter((r) => needsRuby(r.word, grade, mode))
    .sort((a, b) => b.word.length - a.word.length);
  if (entries.length === 0) return <>{text}</>;

  const parts: (string | RubyEntry)[] = [];
  let rest = text;
  while (rest) {
    let best: { at: number; entry: RubyEntry } | null = null;
    for (const e of entries) {
      const at = rest.indexOf(e.word);
      if (at >= 0 && (!best || at < best.at)) best = { at, entry: e };
    }
    if (!best) {
      parts.push(rest);
      break;
    }
    if (best.at > 0) parts.push(rest.slice(0, best.at));
    parts.push(best.entry);
    rest = rest.slice(best.at + best.entry.word.length);
  }
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: 同じ文を分けたものなので、並びは変わらない
          <Fragment key={i}>{p}</Fragment>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: 同上
          <ruby key={i}>
            {p.word}
            <rp>（</rp>
            <rt>{p.reading}</rt>
            <rp>）</rp>
          </ruby>
        ),
      )}
    </>
  );
}
