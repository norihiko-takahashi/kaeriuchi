import seed from "@/content/mistake-types/seed.json";
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

export function mistakeType(id: string): MistakeTypeInfo {
  return seed.types.find((t) => t.id === id) ?? OTHER;
}

export function mistakeTypesFor(subject: Subject): MistakeTypeInfo[] {
  return [...seed.types.filter((t) => t.subject === subject), OTHER];
}
