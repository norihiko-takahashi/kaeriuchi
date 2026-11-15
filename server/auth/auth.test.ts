import { describe, expect, it } from "vitest";
import { authSuite } from "./auth-suite";
import { DevMailer } from "./mail";
import { MemoryAuthStore } from "./memory";
import { type AuthError, AuthService } from "./service";
import {
  deviceNameFrom,
  hashToken,
  normalizeCode,
  randomCode,
  randomToken,
} from "./tokens";

const UA_IPAD =
  "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const code = (e: unknown) => (e as AuthError).code;

authSuite("メモリ", async () => new MemoryAuthStore());

describe("値の作り方（U8-SEC-1）", () => {
  it("トークンは推測できない長さ、番号は8けた、保存するのはハッシュ", () => {
    expect(randomToken()).toMatch(/^[\w-]{43}$/);
    expect(randomToken()).not.toBe(randomToken());
    expect(randomCode()).toMatch(/^\d{8}$/);
    expect(hashToken("a")).toHaveLength(64);
    expect(normalizeCode("1234-5678 ")).toBe("12345678");
  });

  it("端末の名前", () => {
    expect(deviceNameFrom(UA_IPAD)).toBe("iPad（Safari）");
    expect(
      deviceNameFrom(
        "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
      ),
    ).toBe("Android のスマホ（Chrome）");
    expect(deviceNameFrom("curl/8")).toBe("たんまつ");
  });
});

describe("回数の上限の倍率", () => {
  it("開発用のログインだけ、上限をゆるめられる（初期値は1倍）", async () => {
    const auth = new AuthService({
      store: new MemoryAuthStore(),
      mailer: new DevMailer(() => {}),
      appUrl: "http://localhost:3000",
      limitScale: 2,
    });
    for (let i = 0; i < 40; i++)
      await auth.requestLoginLink(`u${i}@example.com`, "1.2.3.4");
    await expect(
      auth.requestLoginLink("x@example.com", "1.2.3.4"),
    ).rejects.toSatisfy((e) => code(e) === "rate_limited");
  });
});
