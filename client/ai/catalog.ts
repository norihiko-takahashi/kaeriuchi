import screen from "@/content/mistake-types/screen.json";
import { GRADES, type Grade } from "@/shared/constants";
import type { Subject } from "@/shared/problem";

/** 間違いのタイプと、仮のミスモン（名前と色・OQ6）。画面で使う */
export interface MistakeTypeInfo {
  id: string;
  subject: string;
  label: string;
  monster: string;
  color: string;
}

const OTHER: MistakeTypeInfo = {
  id: "other",
  subject: "",
  label: "そのほかの まちがい",
  monster: "ナゾノミスモン",
  color: "#888888",
};

/** 画面用の小さい一覧（scripts/mistake-types-screen.mjs で作る） */
const TYPES = (screen.types as string[][]).map(
  ([id, subject, grades, label, monster, color]) => ({
    id,
    subject,
    grades: grades.split(" "),
    label,
    monster,
    color,
  }),
);
const byId = new Map<string, MistakeTypeInfo>(TYPES.map((t) => [t.id, t]));

export function mistakeType(id: string): MistakeTypeInfo {
  return byId.get(id) ?? OTHER;
}

/**
 * 選び直すときの候補（S-21）。その教科の、学年と前後1学年のもの。いまのタイプは必ず入れる
 */
export function mistakeTypesFor(
  subject: Subject,
  grade?: Grade,
  current?: string,
): MistakeTypeInfo[] {
  const i = grade ? GRADES.indexOf(grade) : -1;
  const near =
    i >= 0 ? new Set<string>(GRADES.slice(Math.max(0, i - 1), i + 2)) : null;
  const list = TYPES.filter(
    (t) =>
      t.subject === subject &&
      (!near || t.grades.some((g) => near.has(g)) || t.id === current),
  );
  return [...list, OTHER];
}
