import type { MistakeAnalysis } from "./schemas";

/**
 * 読み取った文字から、個人を表すものを規則で見つけて伏せ字（〇〇）にする（US-3.3・U3-PRIV-3）。
 * 規則は課題 R1 のスパイク（spikes/r1/pii-text.ts）から移したもの。
 * 問題文の登場人物（「たろうくんは りんごを…」）や「名前を 書きましょう」は伏せない。
 * 伏せる前の文字は返さない・ログに残さない。
 */

export type PiiKind = "name-field" | "school" | "class" | "teacher" | "contact";

const RULES: { kind: PiiKind; re: RegExp }[] = [
  // 名前の欄：「なまえ」「名前」「氏名」のあとに、何か書いてある
  // （「名前を 書きましょう」のように、すぐあとに助詞が続くものは、問題の文なので外す）
  {
    kind: "name-field",
    re: /(なまえ|名前|氏名|おなまえ)(?![をはがにのもでと])\s*[:：）)]?\s*[^\s、。？?]{1,12}/u,
  },
  // 学校名：〇〇小学校・中学校・学園・小・中（「小学校で」のような一般の言葉は、前に固有の名前がないので外す）
  // ひらがなの学校名（ひかり小学校）は、文の途中の「近くの小学校」と区別するため、行の始めか空白のあとだけ
  {
    kind: "school",
    re: /([\p{Script=Han}\p{Script=Katakana}ー]{1,10}|(^|\s)[\p{Script=Hiragana}]{2,6})(小学校|中学校|学園|学院|附属小|附属中)/u,
  },
  // クラス：〇年〇組、〇-〇
  {
    kind: "class",
    re: /[1-6一二三四五六１-６]\s*年\s*[0-9０-９一二三四五六七八九十]{1,2}\s*組/u,
  },
  // 先生の名前：「〇〇先生」「せんせい 〇〇」（「先生が」のような一般の使い方は前に名前がないので外す）
  {
    kind: "teacher",
    re: /([\p{Script=Han}]{1,4}|[\p{Script=Hiragana}]{2,6})(先生|せんせい)(?!が|は|に|の話|と)/u,
  },
  // 連絡先
  {
    kind: "contact",
    re: /(?<!\d)0\d{1,4}-\d{1,4}-\d{3,4}(?!\d)|[\w.+-]+@[\w-]+\.[\w.-]+|〒\s*\d{3}-?\d{4}/u,
  },
];

export const MASK = "〇〇";

/** 見つけたものの種類（重なりなし） */
export function findPii(text: string): PiiKind[] {
  const t = text.normalize("NFKC");
  return RULES.filter((r) => r.re.test(t)).map((r) => r.kind);
}

/**
 * 見つけたところを伏せ字にする。何も見つからなければ、文字はそのまま返す（全角・半角も変えない）。
 * 学校名・先生・名前の欄は、目印の言葉（「小学校」「先生」「なまえ」）を残して、固有の部分だけを伏せる。
 */
export function redactPii(text: string): { text: string; found: PiiKind[] } {
  const found = findPii(text);
  if (found.length === 0) return { text, found };
  let t = text.normalize("NFKC");
  for (const r of RULES) {
    const g = new RegExp(r.re.source, `${r.re.flags.replace("g", "")}g`);
    // 置き換えの関数の引数は（一致した文字, グループ…, 位置, 元の文字）
    t = t.replace(g, (match, ...rest) =>
      keepLabel(r.kind, match, rest.slice(0, -2)),
    );
  }
  return { text: t, found };
}

function keepLabel(kind: PiiKind, match: string, groups: unknown[]): string {
  const g = groups.filter((x): x is string => typeof x === "string");
  switch (kind) {
    case "name-field": {
      // 「なまえ 山田」→「なまえ 〇〇」
      const label = g[0] ?? "";
      return `${label} ${MASK}`;
    }
    case "school": {
      // 先頭の空白は残し、「〇〇小学校」にする
      const lead = match.match(/^\s*/)?.[0] ?? "";
      return `${lead}${MASK}${g.at(-1) ?? ""}`;
    }
    case "teacher":
      return `${MASK}${g.at(-1) ?? ""}`;
    default:
      return MASK;
  }
}

/** 解析の結果の文字に当てる。見つけたら piiDetected を true にする */
export function redactAnalysis(a: MistakeAnalysis): {
  value: MistakeAnalysis;
  kinds: number;
} {
  const kinds = new Set<PiiKind>();
  const fix = (t: string) => {
    const r = redactPii(t);
    for (const k of r.found) kinds.add(k);
    return r.text;
  };
  const value = {
    ...a,
    question: fix(a.question),
    childAnswer: fix(a.childAnswer),
    correctAnswer: fix(a.correctAnswer),
    explanation: fix(a.explanation),
  };
  return {
    value: { ...value, piiDetected: a.piiDetected || kinds.size > 0 },
    kinds: kinds.size,
  };
}
