import {
  equals,
  fromDecimal,
  gcd,
  type Rational,
  rat,
} from "@/domain/math/rational";

import type { NumericCondition } from "@/shared/problem";

export type { NumericCondition };

export type NumericForm = "integer" | "decimal" | "fraction" | "mixed";

export interface ParsedNumber {
  value: Rational;
  form: NumericForm;
  /** 分数の部分が約分されていて、帯分数なら真分数になっているか */
  reduced: boolean;
}

function fraction(
  sign: string,
  whole: string | undefined,
  num: string,
  den: string,
): ParsedNumber | null {
  const w = BigInt(whole ?? "0");
  const n = BigInt(num);
  const d = BigInt(den);
  if (d === 0n) return null;
  const s = sign ? -1n : 1n;
  const mixed = whole !== undefined;
  return {
    value: rat(s * (w * d + n), d),
    form: mixed ? "mixed" : "fraction",
    reduced: gcd(n, d) === 1n && (!mixed || n < d),
  };
}

const PATTERNS: [RegExp, (m: RegExpExecArray) => ParsedNumber | null][] = [
  [
    /^(-?)(\d+)$/,
    (m) => ({
      value: rat(BigInt(m[2]) * (m[1] ? -1n : 1n)),
      form: "integer",
      reduced: true,
    }),
  ],
  [
    /^(-?)(\d*)\.(\d+)$/,
    (m) => ({
      value: fromDecimal(`${m[1]}${m[2] || "0"}.${m[3]}`),
      form: "decimal",
      reduced: true,
    }),
  ],
  [/^(-?)(\d+)\/(\d+)$/, (m) => fraction(m[1], undefined, m[2], m[3])],
  [/^(-?)(\d+)分の(\d+)$/, (m) => fraction(m[1], undefined, m[3], m[2])],
  [
    /^(-?)(\d+)(?:と|\s+)(\d+)\/(\d+)$/,
    (m) => fraction(m[1], m[2], m[3], m[4]),
  ],
  [/^(-?)(\d+)と(\d+)分の(\d+)$/, (m) => fraction(m[1], m[2], m[4], m[3])],
];

/**
 * 子どもの数の答えを読む。読めなければ null。
 * 読める形：12、-3、0.5、3/4、2分の1、1と1/2、1 1/2、1と2分の1。単位が決まっていれば、付いていてもよい。
 */
export function parseNumber(raw: string, unit?: string): ParsedNumber | null {
  let s = raw
    .normalize("NFKC")
    .trim()
    .replace(/[−ー–]/g, "-")
    .replace(/,/g, "");
  if (unit) {
    const u = unit.normalize("NFKC");
    if (s.endsWith(u)) s = s.slice(0, -u.length).trim();
  }
  for (const [re, read] of PATTERNS) {
    const m = re.exec(s);
    if (m) return read(m);
  }
  return null;
}

function meets(p: ParsedNumber, condition?: NumericCondition): boolean {
  switch (condition) {
    case undefined:
      return true;
    case "reduced":
      return p.form !== "decimal" && p.reduced;
    case "decimal":
      return p.form === "decimal" || p.form === "integer";
    case "mixed": {
      if (p.form === "decimal" || !p.reduced) return false;
      const abs = p.value.n < 0n ? -p.value.n : p.value.n;
      // 1より大きい、整数でない数は、帯分数で答える
      if (p.value.d !== 1n && abs > p.value.d) return p.form === "mixed";
      return true;
    }
  }
}

/**
 * 数の答えを採点する。
 * 初期値は「値が同じなら正解」。条件があれば、その形かも確かめる（BR-45-7）。
 */
export function gradeNumber(
  answer: string,
  expected: string,
  opts: { unit?: string; condition?: NumericCondition } = {},
): boolean {
  const got = parseNumber(answer, opts.unit);
  const want = parseNumber(expected, opts.unit);
  if (!got || !want) return false;
  return equals(got.value, want.value) && meets(got, opts.condition);
}
