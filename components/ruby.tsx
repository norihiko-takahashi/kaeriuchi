"use client";

import { needsRuby } from "@/domain/ruby/kanji-grade";
import { useAppState } from "./app-state";

/**
 * ふりがな。その学年までに習っていない漢字が入っていれば付ける。
 * 例：<R k="名前" r="なまえ" />
 */
export function R({ k, r }: { k: string; r: string }) {
  const { grade, mode } = useAppState();
  if (!needsRuby(k, grade, mode)) return <>{k}</>;
  return (
    <ruby>
      {k}
      <rp>（</rp>
      <rt>{r}</rt>
      <rp>）</rp>
    </ruby>
  );
}
