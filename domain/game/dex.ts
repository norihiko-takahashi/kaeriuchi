import { isMastered, type ReviewState } from "./review";

/** 図鑑のカード（BR-6-3）。強い方にだけ進む */
export type DexRank = "seen" | "bronze" | "silver" | "gold";
const ORDER: DexRank[] = ["seen", "bronze", "silver", "gold"];

export function rankOf(s: ReviewState): DexRank {
  if (isMastered(s)) return "gold";
  if (s.stage >= 2) return "silver";
  if (s.stage >= 1) return "bronze";
  return "seen";
}

export const higher = (a: DexRank, b: DexRank): DexRank =>
  ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;

/** 間違いのタイプごとの、いちばん強いカード */
export function dex(
  mistakes: { mistakeTypeId: string; state: ReviewState }[],
): Map<string, DexRank> {
  const out = new Map<string, DexRank>();
  for (const m of mistakes) {
    const r = rankOf(m.state);
    out.set(m.mistakeTypeId, higher(out.get(m.mistakeTypeId) ?? "seen", r));
  }
  return out;
}
