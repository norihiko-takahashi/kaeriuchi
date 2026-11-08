import { describe, expect, it } from "vitest";
import { buildCsp, createNonce } from "./csp";

describe("CSP（U1-SEC-2）", () => {
  const csp = buildCsp("abc123", false);

  it("スクリプトは nonce が付いたものだけ。'unsafe-inline' を使わない", () => {
    const script = csp.split("; ").find((d) => d.startsWith("script-src"));
    expect(script).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(script).not.toContain("unsafe-inline");
    expect(script).not.toContain("unsafe-eval");
  });

  it("外部のドメインを1つも許可しない", () => {
    expect(csp).not.toMatch(/https?:|\*/);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("開発のときだけ 'unsafe-eval' を足す（React のデバッグ用）", () => {
    expect(buildCsp("n", true)).toContain("'unsafe-eval'");
  });

  it("nonce は毎回ちがう、推測できない値", () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(atob(a)).toHaveLength(16);
  });
});
