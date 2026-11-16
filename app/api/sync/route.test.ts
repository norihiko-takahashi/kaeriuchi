import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as auth } from "@/app/api/auth/[action]/route";
import { resetAuthForTesting } from "@/server/auth/registry";
import { resetConfigForTesting } from "@/server/config";
import { resetSyncForTesting } from "@/server/sync/registry";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

const ORIGIN = "http://localhost:3000";

function req(body: string | object, cookie?: string, origin = ORIGIN) {
  return new Request(`${ORIGIN}/api/sync`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-forwarded-for": "203.0.113.9",
      ...(cookie ? { cookie } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function login(email: string) {
  const call = (action: string, body: object) =>
    auth(
      new Request(`${ORIGIN}/api/auth/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ action }) },
    );
  const { devLink } = await (await call("link", { email })).json();
  const res = await call("verify", { token: devLink.split("#")[1] });
  return {
    cookie: (res.headers.get("set-cookie") ?? "").split(";")[0],
    guardianId: (await res.json()).guardianId as string,
  };
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  resetConfigForTesting();
  resetAuthForTesting();
  resetSyncForTesting();
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/sync（U8）", () => {
  it("ログインした保護者の記録だけを、送って受け取る", async () => {
    const a = await login("a@example.com");
    const b = await login("b@example.com");
    const kid = {
      id: "c1",
      guardianId: a.guardianId,
      nickname: "きつね",
      grade: "e2",
      displayMode: "lower",
      displayModeOverridden: false,
      gradeSchoolYear: 2026,
      avatar: { face: 0, color: 0, accessory: 0 },
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      version: 1,
    };
    const res = await POST(
      req(
        {
          since: 0,
          changes: [{ entity: "child", id: "c1", op: "upsert", payload: kid }],
        },
        a.cookie,
      ),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).changes).toHaveLength(1);
    const other = await POST(req({ since: 0, changes: [] }, b.cookie));
    expect((await other.json()).changes).toEqual([]);
  });

  it("ログインしていない・ほかの出どころ・形のちがう・大きすぎる呼び出しは受けない", async () => {
    const a = await login("a@example.com");
    expect((await POST(req({ since: 0, changes: [] }))).status).toBe(401);
    expect(
      (
        await POST(
          req({ since: 0, changes: [] }, a.cookie, "https://evil.example"),
        )
      ).status,
    ).toBe(400);
    expect((await POST(req("{", a.cookie))).status).toBe(400);
    expect((await POST(req({ since: -1, changes: [] }, a.cookie))).status).toBe(
      400,
    );
    expect(
      (
        await POST(
          req({ since: 0, changes: ["x".repeat(1_100_000)] }, a.cookie),
        )
      ).status,
    ).toBe(413);
  });
});
