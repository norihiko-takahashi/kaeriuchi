import { describe, expect, it } from "vitest";
import { DevMailer } from "./mail";
import { MemoryAuthStore } from "./memory";
import { type AuthError, AuthService, jstDay } from "./service";
import {
  DAY,
  deviceNameFrom,
  hashToken,
  MINUTE,
  normalizeCode,
  randomCode,
  randomToken,
} from "./tokens";

const UA_IPAD =
  "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function setup() {
  let now = Date.UTC(2026, 10, 15, 3, 0, 0);
  const lines: string[] = [];
  const store = new MemoryAuthStore();
  const auth = new AuthService({
    store,
    mailer: new DevMailer((l) => lines.push(l)),
    appUrl: "https://kaeriuchi.example.jp",
    now: () => now,
  });
  const tick = (ms: number) => {
    now += ms;
  };
  const linkToken = (devLink?: string) => devLink?.split("#")[1] ?? "";
  return { auth, store, lines, tick, linkToken };
}

const code = (e: unknown) => (e as AuthError).code;

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

describe("メールのリンク（U8・FR-1.0）", () => {
  it("リンクを開くとログインできる。初めてのアドレスなら、そのリンクでアカウントを作る", async () => {
    const { auth, lines, linkToken } = setup();
    const r = await auth.requestLoginLink(" Parent@Example.com ", "1.1.1.1");
    expect(r.devLink).toMatch(
      /^https:\/\/kaeriuchi\.example\.jp\/login\/verify#/,
    );
    // ログインにメールアドレスは出さない（U8-PRIV-1）
    expect(lines.join("\n")).not.toContain('example.com"');
    expect(lines.join("\n")).not.toMatch(/parent@/i);
    const s = await auth.verifyLoginLink(
      linkToken(r.devLink),
      "1.1.1.1",
      UA_IPAD,
    );
    expect(s.email).toBe("parent@example.com");
    expect(s.session.deviceName).toBe("iPad（Safari）");
    // 同じアドレスなら、同じアカウント
    const r2 = await auth.requestLoginLink("parent@example.com", "1.1.1.1");
    const s2 = await auth.verifyLoginLink(
      linkToken(r2.devLink),
      "1.1.1.1",
      UA_IPAD,
    );
    expect(s2.session.guardianId).toBe(s.session.guardianId);
    expect(await auth.getSession(s.token)).toMatchObject({
      guardianId: s.session.guardianId,
    });
  });

  it("リンクは1回きり、15分で使えなくなる", async () => {
    const { auth, tick, linkToken } = setup();
    const r = await auth.requestLoginLink("a@example.com", "1.1.1.1");
    await auth.verifyLoginLink(linkToken(r.devLink), "1.1.1.1", "");
    await expect(
      auth.verifyLoginLink(linkToken(r.devLink), "1.1.1.1", ""),
    ).rejects.toSatisfy((e) => code(e) === "invalid");
    const r2 = await auth.requestLoginLink("a@example.com", "1.1.1.1");
    tick(15 * MINUTE);
    await expect(
      auth.verifyLoginLink(linkToken(r2.devLink), "1.1.1.1", ""),
    ).rejects.toSatisfy((e) => code(e) === "invalid");
  });

  it("形のおかしいアドレスは受け付けない。同じアドレスへは1時間に5回まで", async () => {
    const { auth, tick } = setup();
    await expect(auth.requestLoginLink("nope", "1.1.1.1")).rejects.toSatisfy(
      (e) => code(e) === "bad_request",
    );
    for (let i = 0; i < 5; i++)
      await auth.requestLoginLink("a@example.com", `2.2.2.${i}`);
    await expect(
      auth.requestLoginLink("A@example.com", "3.3.3.3"),
    ).rejects.toSatisfy((e) => code(e) === "rate_limited");
    tick(61 * MINUTE);
    await expect(
      auth.requestLoginLink("a@example.com", "3.3.3.3"),
    ).resolves.toBeDefined();
  });

  it("同じ接続元からは1時間に20回まで", async () => {
    const { auth } = setup();
    for (let i = 0; i < 20; i++)
      await auth.requestLoginLink(`u${i}@example.com`, "9.9.9.9");
    await expect(
      auth.requestLoginLink("x@example.com", "9.9.9.9"),
    ).rejects.toSatisfy((e) => code(e) === "rate_limited");
  });
});

describe("セッション（U8-SEC-2）", () => {
  it("30日続き、使うたびに延びる。ログアウトで使えなくなる", async () => {
    const { auth, tick, linkToken } = setup();
    const r = await auth.requestLoginLink("a@example.com", "1.1.1.1");
    const s = await auth.verifyLoginLink(linkToken(r.devLink), "1.1.1.1", "");
    tick(20 * DAY);
    const used = await auth.getSession(s.token);
    expect(used?.lastSeenDay).toBe(jstDay(Date.UTC(2026, 11, 5, 3)));
    tick(20 * DAY); // 最後に使ってから 20日：まだ使える
    expect(await auth.getSession(s.token)).toBeDefined();
    tick(31 * DAY);
    expect(await auth.getSession(s.token)).toBeUndefined();
    expect(await auth.getSession(undefined)).toBeUndefined();

    const r2 = await auth.requestLoginLink("a@example.com", "1.1.1.1");
    const s2 = await auth.verifyLoginLink(linkToken(r2.devLink), "1.1.1.1", "");
    await auth.signOut(s2.token);
    expect(await auth.getSession(s2.token)).toBeUndefined();
  });

  it("ログインし直してから10分以内だけ、削除・書き出しができる（U8-SEC-7）", async () => {
    const { auth, tick, linkToken } = setup();
    const r = await auth.requestLoginLink("a@example.com", "1.1.1.1");
    const s = await auth.verifyLoginLink(linkToken(r.devLink), "1.1.1.1", "");
    expect(auth.isRecentAuth(s.session)).toBe(true);
    tick(11 * MINUTE);
    expect(auth.isRecentAuth(s.session)).toBe(false);
  });
});

describe("端末をつなぐ番号と、端末の一覧（決定 3・FR-1.6）", () => {
  async function loggedIn() {
    const t = setup();
    const r = await t.auth.requestLoginLink("a@example.com", "1.1.1.1");
    const parent = await t.auth.verifyLoginLink(
      t.linkToken(r.devLink),
      "1.1.1.1",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Version/18.0 Mobile Safari/604.1",
    );
    return { ...t, parent };
  }

  it("番号を入れた端末が同じアカウントにつながる。1回きり、10分で切れる、出し直すと前の番号は使えない", async () => {
    const { auth, parent, tick } = await loggedIn();
    const { code: c } = await auth.createLinkCode(parent.session);
    const tablet = await auth.redeemLinkCode(
      `${c.slice(0, 4)}-${c.slice(4)}`,
      "5.5.5.5",
      UA_IPAD,
    );
    expect(tablet.session.guardianId).toBe(parent.session.guardianId);
    await expect(auth.redeemLinkCode(c, "5.5.5.5", "")).rejects.toSatisfy(
      (e) => code(e) === "invalid",
    );
    const first = await auth.createLinkCode(parent.session);
    const second = await auth.createLinkCode(parent.session);
    await expect(
      auth.redeemLinkCode(first.code, "6.6.6.6", ""),
    ).rejects.toSatisfy((e) => code(e) === "invalid");
    tick(10 * MINUTE);
    await expect(
      auth.redeemLinkCode(second.code, "6.6.6.7", ""),
    ).rejects.toSatisfy((e) => code(e) === "invalid");
  });

  it("同じ接続元から10分に5回まちがえたら、正しい番号でも入れない", async () => {
    const { auth, parent, tick } = await loggedIn();
    for (let i = 0; i < 5; i++)
      await expect(
        auth.redeemLinkCode("00000000", "7.7.7.7", ""),
      ).rejects.toSatisfy((e) => code(e) === "invalid");
    const { code: c } = await auth.createLinkCode(parent.session);
    await expect(auth.redeemLinkCode(c, "7.7.7.7", "")).rejects.toSatisfy(
      (e) => code(e) === "rate_limited",
    );
    // ほかの接続元からは入れる。10分たてば、同じ接続元からも入れる
    await expect(auth.redeemLinkCode(c, "8.8.8.8", "")).resolves.toBeDefined();
    tick(10 * MINUTE + 1);
    const again = await auth.createLinkCode(parent.session);
    await expect(
      auth.redeemLinkCode(again.code, "7.7.7.7", ""),
    ).resolves.toBeDefined();
  });

  it("端末の一覧・名前の変更・ほかの端末のログアウト", async () => {
    const { auth, parent, tick } = await loggedIn();
    tick(1000);
    const { code: c } = await auth.createLinkCode(parent.session);
    const tablet = await auth.redeemLinkCode(c, "5.5.5.5", UA_IPAD);
    const list = await auth.listDevices(parent.session);
    expect(list.map((d) => [d.deviceName, d.current])).toEqual([
      ["iPad（Safari）", false],
      ["iPhone（Safari）", true],
    ]);
    await auth.renameDevice(
      parent.session,
      tablet.session.deviceId,
      " こどもの iPad ",
    );
    expect((await auth.listDevices(parent.session))[0].deviceName).toBe(
      "こどもの iPad",
    );
    await expect(
      auth.renameDevice(parent.session, "nope", "x"),
    ).rejects.toSatisfy((e) => code(e) === "invalid");
    await expect(
      auth.renameDevice(parent.session, tablet.session.deviceId, " "),
    ).rejects.toSatisfy((e) => code(e) === "bad_request");
    await auth.revokeDevice(parent.session, tablet.session.deviceId);
    expect(await auth.getSession(tablet.token)).toBeUndefined();
    expect(await auth.getSession(parent.token)).toBeDefined();
  });
});

describe("パスキーの準備（WebAuthn）", () => {
  it("登録とログインのための値を出し、使う値は1回きり。パスキーがなければ確かめられない", async () => {
    const { auth, linkToken } = setup();
    const r = await auth.requestLoginLink("a@example.com", "1.1.1.1");
    const s = await auth.verifyLoginLink(linkToken(r.devLink), "1.1.1.1", "");
    const reg = await auth.passkeyRegistrationOptions(s.session);
    expect(reg.rp).toEqual({ name: "かえりうち", id: "kaeriuchi.example.jp" });
    expect(reg.authenticatorSelection?.residentKey).toBe("required");
    expect(await auth.hasPasskey(s.session)).toBe(false);
    const login = await auth.passkeyAuthenticationOptions("1.1.1.1");
    expect(login.options.rpId).toBe("kaeriuchi.example.jp");
    // 登録されていない資格情報では入れない
    await expect(
      auth.verifyPasskeyAuthentication(
        login.challengeId,
        {
          id: "unknown",
          rawId: "unknown",
          type: "public-key",
          response: {},
        } as never,
        "",
      ),
    ).rejects.toSatisfy((e) => code(e) === "invalid");
    // 使った値はもう使えない
    await expect(
      auth.verifyPasskeyAuthentication(
        login.challengeId,
        { id: "x" } as never,
        "",
      ),
    ).rejects.toSatisfy((e) => code(e) === "invalid");
    // 登録の値なしに、登録の確かめはできない
    await auth
      .verifyPasskeyRegistration(s.session, {} as never)
      .catch((e) => expect(code(e)).toBe("invalid"));
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
