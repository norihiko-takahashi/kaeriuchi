import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuthForTesting } from "@/server/auth/registry";
import { resetConfigForTesting } from "@/server/config";
import { DELETE, GET, POST } from "./[action]/route";

vi.mock("server-only", () => ({}));

const ORIGIN = "http://localhost:3000";

function req(
  method: string,
  action: string,
  body?: unknown,
  opts: { cookie?: string; origin?: string | null; ip?: string } = {},
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (opts.cookie) headers.cookie = opts.cookie;
  headers["x-forwarded-for"] = opts.ip ?? "203.0.113.1";
  headers["user-agent"] = "Mozilla/5.0 (iPad) Version/18.0 Safari/604.1";
  const request = new Request(`${ORIGIN}/api/auth/${action}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return [request, { params: Promise.resolve({ action }) }] as const;
}

const cookieOf = (res: Response) =>
  (res.headers.get("set-cookie") ?? "").split(";")[0];

async function login(email = "parent@example.com") {
  const sent = await POST(...req("POST", "link", { email }));
  const { devLink } = await sent.json();
  const token = devLink.split("#")[1];
  const res = await POST(...req("POST", "verify", { token }));
  return { res, cookie: cookieOf(res), json: await res.json() };
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  resetConfigForTesting();
  resetAuthForTesting();
});
afterEach(() => vi.restoreAllMocks());

describe("/api/auth（U8）", () => {
  it("リンクでログイン → Cookie（HttpOnly）→ いまのログイン → ログアウト", async () => {
    const { res, cookie, json } = await login();
    expect(res.status).toBe(200);
    expect(json.email).toBe("parent@example.com");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    const s = await GET(...req("GET", "session", undefined, { cookie }));
    expect(await s.json()).toMatchObject({
      guardianId: json.guardianId,
      hasPasskey: false,
      recentAuth: true,
    });
    await POST(...req("POST", "logout", {}, { cookie }));
    const after = await GET(...req("GET", "session", undefined, { cookie }));
    expect(after.status).toBe(401);
  });

  it("ほかの出どころからの書き込みは受け付けない（CSRF 対策）", async () => {
    const a = await POST(
      ...req(
        "POST",
        "link",
        { email: "a@example.com" },
        { origin: "https://evil.example" },
      ),
    );
    expect(a.status).toBe(400);
    const b = await POST(
      ...req("POST", "link", { email: "a@example.com" }, { origin: null }),
    );
    expect(b.status).toBe(400);
  });

  it("番号で2つ目の端末をつなぎ、一覧に出て、ログアウトさせられる", async () => {
    const parent = await login();
    const c = await POST(...req("POST", "code", {}, { cookie: parent.cookie }));
    const { code } = await c.json();
    expect(code).toMatch(/^\d{8}$/);
    const tablet = await POST(
      ...req("POST", "redeem", { code }, { ip: "203.0.113.9" }),
    );
    const tabletJson = await tablet.json();
    expect(tabletJson.guardianId).toBe(parent.json.guardianId);
    const list = await (
      await GET(...req("GET", "devices", undefined, { cookie: parent.cookie }))
    ).json();
    expect(list.devices).toHaveLength(2);
    await DELETE(
      ...req(
        "DELETE",
        "devices",
        { deviceId: tabletJson.deviceId },
        { cookie: parent.cookie },
      ),
    );
    const s = await GET(
      ...req("GET", "session", undefined, { cookie: cookieOf(tablet) }),
    );
    expect(s.status).toBe(401);
  });

  it("ログインしていなければ、番号は出せない。知らない操作・形のおかしい中身は断る", async () => {
    expect((await POST(...req("POST", "code", {}))).status).toBe(401);
    expect((await POST(...req("POST", "nope", {}))).status).toBe(400);
    expect((await POST(...req("POST", "verify", { token: 1 }))).status).toBe(
      400,
    );
    const bad = await POST(...req("POST", "verify", { token: "x".repeat(43) }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("invalid");
  });

  it("パスキーの準備の値を返す", async () => {
    const { cookie } = await login();
    const r = await POST(
      ...req("POST", "passkey-register-options", {}, { cookie }),
    );
    expect((await r.json()).rp.id).toBe("localhost");
    const l = await POST(...req("POST", "passkey-login-options", {}));
    expect((await l.json()).challengeId).toBeTruthy();
  });
});
