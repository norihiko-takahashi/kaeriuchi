import seed from "@/content/mistake-types/seed.json";
import type { MistakeTypeSummary, Subject } from "./schemas";

/** 間違いのタイプの候補。教科がわかっていれば、その教科のものだけを渡す */
export function mistakeTypeCatalog(subject?: Subject): MistakeTypeSummary[] {
  return seed.types
    .filter((t) => !subject || t.subject === subject)
    .map(({ id, label }) => ({ id, label }));
}
