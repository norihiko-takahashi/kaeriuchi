/**
 * 分数（有理数）。分子・分母を BigInt で持ち、小数の誤差を出さない（U45-Q-3）。
 * 検算（サーバー）と採点（端末）の両方で使う。
 */
export interface Rational {
  n: bigint;
  /** いつも正 */
  d: bigint;
}

const abs = (x: bigint) => (x < 0n ? -x : x);

export function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

export function rat(n: bigint, d: bigint = 1n): Rational {
  if (d === 0n) throw new RangeError("0 で割ることはできません");
  const sign = d < 0n ? -1n : 1n;
  const g = gcd(n, d) || 1n;
  return { n: (sign * n) / g, d: (sign * d) / g };
}

export const add = (a: Rational, b: Rational) =>
  rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Rational, b: Rational) =>
  rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Rational, b: Rational) => rat(a.n * b.n, a.d * b.d);
export const div = (a: Rational, b: Rational) => {
  if (b.n === 0n) throw new RangeError("0 で割ることはできません");
  return rat(a.n * b.d, a.d * b.n);
};
export const neg = (a: Rational) => rat(-a.n, a.d);
export const equals = (a: Rational, b: Rational) => a.n === b.n && a.d === b.d;

/** 小数の文字（"0.25"）を分数にする */
export function fromDecimal(text: string): Rational {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) throw new SyntaxError(`数ではありません: ${text}`);
  const frac = m[3] ?? "";
  const n = BigInt(m[2] + frac) * (m[1] ? -1n : 1n);
  return rat(n, 10n ** BigInt(frac.length));
}

export function ratToString(r: Rational): string {
  return r.d === 1n ? `${r.n}` : `${r.n}/${r.d}`;
}
