import english from "./english.json";
import japanese from "./japanese.json";
import math from "./math.json";
import science from "./science.json";
import social from "./social.json";

/**
 * 間違いのタイプの一覧（content-data-plan.md の A）。教科ごとのファイルを1つにまとめる。
 * 形は mistake-types.test.ts で確かめる。
 */
export interface MistakeTypeEntry {
  id: string;
  subject: string;
  unit: string;
  grades: string[];
  label: string;
  example: { question: string; wrong: string; correct: string };
  monster: string;
  color: string;
  /** ai-draft（AI の下書き）／ nier-<年>（全国学力・学習状況調査）／ curriculum ／ usage */
  source: string;
  reviewedBy: string | null;
  reviewedOn: string | null;
}

export const MISTAKE_TYPES: MistakeTypeEntry[] = [
  ...math.types,
  ...japanese.types,
  ...english.types,
  ...science.types,
  ...social.types,
];
