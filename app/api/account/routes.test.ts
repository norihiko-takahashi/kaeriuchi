import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as auth } from "@/app/api/auth/[action]/route";
import { POST as sync } from "@/app/api/sync/route";
import { resetAuthForTesting } from "@/server/auth/registry";
import { resetConfigForTesting } from "@/server/config";
import { resetSyncForTesting } from "@/server/sync/registry";
import { GET, POST } from "./[action]/route";

vi.mock("server-only", () => ({}));

const ORIGIN = "http://localhost:3000";

function req(method: string, path: string, body?: object, cookie?: string) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = (action: string) => ({ params: Promise.resolve({ action }) });
const cookieOf = (res: Response) =>
  (res.headers.get("set-cookie") ?? "").split(";")[0];

async function login(email = "a@example.com") {
  const sent = await auth(
    req("POST", "/api/auth/link", { email }),
    params("link"),
  );
  const { devLink } = await sent.json();
  return auth(
    req("POST", "/api/auth/verify", { token: devLink.split("#")[1] }),
    params("verify"),
  );
}

const kid = (guardianId: string) => ({
  id: "c1",
  guardianId,
  nickname: "きつね",
  grade: "e2",
  displayMode: "lower",
  displayModeOverridden: false,
  gradeSchoolYear: 2026,
  avatar: { face: 0, color: 0, accessory: 0 },
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  version: 1,
});

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  resetConfigForTesting();
  resetAuthForTesting();
  resetSyncForTesting();
});
afterEach(() => vi.restoreAllMocks());

describe("/api/account（U8 §5）", () => {
  it("子どもを消して戻す・書き出す・アカウントを消して取り消す", async () => {
    const res = await login();
    const cookie = cookieOf(res);
    const { guardianId } = await res.json();
    await sync(
      req(
        "POST",
        "/api/sync",
        {
          since: 0,
          changes: [
            {
              entity: "child",
              id: "c1",
              op: "upsert",
              payload: kid(guardianId),
            },
          ],
        },
        cookie,
      ),
    );

    const out = await GET(
      req("GET", "/api/account/export", undefined, cookie),
      params("export"),
    );
    expect(out.headers.get("content-disposition")).toContain("attachment");
    expect((await out.json()).children).toHaveLength(1);

    expect(
      (
        await POST(
          req("POST", "/api/account/delete-child", { childId: "c1" }, cookie),
          params("delete-child"),
        )
      ).status,
    ).toBe(200);
    const list = await GET(
      req("GET", "/api/account/deleted-children", undefined, cookie),
      params("deleted-children"),
    );
    expect(
      (await list.json()).children.map((c: { id: string }) => c.id),
    ).toEqual(["c1"]);
    expect(
      (
        await POST(
          req("POST", "/api/account/restore-child", { childId: "c1" }, cookie),
          params("restore-child"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await POST(
          req("POST", "/api/account/restore-child", { childId: "c1" }, cookie),
          params("restore-child"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          req("POST", "/api/account/delete-child", {}, cookie),
          params("delete-child"),
        )
      ).status,
    ).toBe(400);
    expect(
      (await POST(req("POST", "/api/account/x", {}, cookie), params("x")))
        .status,
    ).toBe(400);

    const del = await POST(
      req("POST", "/api/account/delete", {}, cookie),
      params("delete"),
    );
    expect(del.status).toBe(200);
    expect(del.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
    expect(
      (
        await GET(
          req("GET", "/api/account/export", undefined, cookie),
          params("export"),
        )
      ).status,
    ).toBe(401);

    // 同じメールでログインすると、取り消すかどうかを選べる
    const again = await (await login()).json();
    expect(again.restore.ticket).toBeTruthy();
    const back = await auth(
      req("POST", "/api/auth/restore", { token: again.restore.ticket }),
      params("restore"),
    );
    expect((await back.json()).guardianId).toBe(guardianId);
    const out2 = await GET(
      req("GET", "/api/account/export", undefined, cookieOf(back)),
      params("export"),
    );
    expect((await out2.json()).children).toHaveLength(1);
  });

  it("ログインしていなければ使えない", async () => {
    expect(
      (
        await GET(
          req("GET", "/api/account/deleted-children"),
          params("deleted-children"),
        )
      ).status,
    ).toBe(401);
  });
});
