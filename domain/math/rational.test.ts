import { describe, expect, it } from "vitest";
import {
  add,
  div,
  equals,
  fromDecimal,
  gcd,
  mul,
  neg,
  rat,
  ratToString,
  sub,
} from "./rational";

describe("rational", () => {
  it("約分して、分母をいつも正にする", () => {
    expect(rat(2n, 4n)).toEqual({ n: 1n, d: 2n });
    expect(rat(1n, -2n)).toEqual({ n: -1n, d: 2n });
    expect(rat(0n, 5n)).toEqual({ n: 0n, d: 1n });
    expect(() => rat(1n, 0n)).toThrow(RangeError);
  });

  it("四則の計算が正確", () => {
    expect(ratToString(add(rat(1n, 3n), rat(1n, 4n)))).toBe("7/12");
    expect(ratToString(sub(rat(1n, 2n), rat(1n, 3n)))).toBe("1/6");
    expect(ratToString(mul(rat(2n, 3n), rat(3n, 4n)))).toBe("1/2");
    expect(ratToString(div(rat(1n, 2n), rat(1n, 4n)))).toBe("2");
    expect(ratToString(neg(rat(1n, 2n)))).toBe("-1/2");
    expect(() => div(rat(1n), rat(0n))).toThrow(RangeError);
  });

  it("小数を誤差なく分数にする（0.1 + 0.2 = 0.3）", () => {
    expect(
      equals(add(fromDecimal("0.1"), fromDecimal("0.2")), fromDecimal("0.3")),
    ).toBe(true);
    expect(fromDecimal("-1.25")).toEqual({ n: -5n, d: 4n });
    expect(() => fromDecimal("1e3")).toThrow(SyntaxError);
  });

  it("最大公約数", () => {
    expect(gcd(12n, -18n)).toBe(6n);
    expect(gcd(0n, 0n)).toBe(0n);
  });
});
