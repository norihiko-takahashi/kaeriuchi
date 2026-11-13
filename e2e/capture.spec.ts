import { deflateSync } from "node:zlib";
import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations, failOnCspViolations, toHome } from "./helpers";

/**
 * U3：写真を選ぶ → 指で囲む → かくすペン → 送る → 1問ずつ確かめる → まとめて登録（偽物の AI で動かす）。
 * 写真は、テストの中で作る合成画像（本物の写真は使わない）。
 * 送られた画像が枠の大きさで、写真全体ではないこと、塗ったところが黒いことを、通信の中身で確かめる（U3-TEST-2）。
 */

failOnCspViolations();

const W = 800;
const H = 1000;

/** 白い紙に、灰色の帯（問題の行）を描いた PNG */
function makePng(): Buffer {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const line = y % 100 > 30 && y % 100 < 60 && x > 60 && x < 740;
      const v = line ? 170 : 255;
      const o = y * (W * 3 + 1) + 1 + x * 3;
      raw[o] = v;
      raw[o + 1] = v;
      raw[o + 2] = v;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 写真の画素の位置を、画面の位置に直してなぞる */
async function drag(page: Page, from: [number, number], to: [number, number]) {
  // なぞる場所が画面に入るように、写真の上の端を画面の上に合わせる（スマホの幅では写真が画面より長い）
  await page
    .getByTestId("frame-editor")
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  const box = await page.getByTestId("frame-editor").boundingBox();
  if (!box) throw new Error("no editor");
  const at = ([x, y]: [number, number]) => [
    box.x + (x / W) * box.width,
    box.y + (y / H) * box.height,
  ];
  const [x0, y0] = at(from);
  const [x1, y1] = at(to);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 8 });
  await page.mouse.up();
}

test("テストの写真から、囲んだ2問をまとめて登録できる。送るのは枠の中だけで、塗ったところは黒い", async ({
  page,
}) => {
  // 送った画像を、ページの中で記録する（Chromium では multipart の中身を外から読めないため）
  await page.addInitScript(() => {
    const w = window as unknown as { __sent: Blob[] };
    w.__sent = [];
    const orig = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes("/api/ai/analyze") && init?.body instanceof FormData) {
        const image = init.body.get("image");
        if (image instanceof Blob) w.__sent.push(image);
      }
      return orig(input, init);
    };
  });

  await toHome(page);
  await page.getByRole("link", { name: "📷 ミスモンを よぶ" }).click();
  await expect(page).toHaveURL(/\/capture$/);
  await expect(
    page.getByRole("heading", { name: "なんの テスト？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "さんすう・すうがく" }).click();

  await page.getByTestId("pick-photo").setInputFiles({
    name: "test.png",
    mimeType: "image/png",
    buffer: makePng(),
  });
  await expect(
    page.getByRole("heading", { name: "まちがえた もんだいを かこもう" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /つぎへ/ })).toBeDisabled();

  // 2つ囲む（下の段を先に囲んでも、確認は上から）
  await drag(page, [100, 500], [500, 700]);
  await drag(page, [100, 100], [400, 300]);
  await expect(
    page.getByRole("button", { name: "つぎへ（2もん）" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: /1ばんの わく（うえの ほう/ }),
  ).toBeVisible();
  await expectNoA11yViolations(page);

  // かくすペンで、上の枠の左上を塗る
  await page.getByRole("button", { name: "つぎへ（2もん）" }).click();
  await expect(
    page.getByRole("heading", { name: "なまえを けそう" }),
  ).toBeVisible();
  await drag(page, [120, 120], [200, 130]);
  await page.getByRole("button", { name: "おくる（2もん）" }).click();

  // 1問ずつ確かめる（偽物の AI は、算数の「1/2 + 1/3」を返す）
  await expect(page.getByText("1 / 2もん")).toBeVisible();
  await expect(page.getByLabel("もんだい")).toHaveValue("1/2 + 1/3 = ?");
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "つぎの もんだいへ" }).click();
  await expect(page.getByText("2 / 2もん")).toBeVisible();
  await page.getByRole("button", { name: "これで とうろく する" }).click();

  await expect(
    page.getByRole("heading", { name: "ミスモンが 2ひき あらわれた！" }),
  ).toBeVisible();
  await expect(
    page.getByText(/さんすう .* の テスト」に まとめたよ/),
  ).toBeVisible();

  // 送られたのは2枚。写真全体ではなく、枠の大きさ（上の枠 300×200、下の枠 400×200 前後）
  const info = await page.evaluate(async () => {
    const out = [];
    for (const blob of (window as unknown as { __sent: Blob[] }).__sent) {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d");
      ctx?.drawImage(bmp, 0, 0);
      // 塗ったところ（枠の左上から 20〜100px、20〜30px）と、塗っていないところ（右上）
      const dark = ctx?.getImageData(60, 25, 1, 1).data[0] ?? -1;
      const light = ctx?.getImageData(bmp.width - 10, 10, 1, 1).data[0] ?? -1;
      out.push({ type: blob.type, w: bmp.width, h: bmp.height, dark, light });
    }
    return out;
  });
  expect(info).toHaveLength(2);
  expect(info.every((x) => x.type === "image/jpeg")).toBe(true);
  const sorted = [...info].sort((a, b) => a.w - b.w);
  for (const x of info) {
    expect(x.w).toBeLessThan(W);
    expect(x.h).toBeLessThan(H);
  }
  expect(Math.abs(sorted[0].w - 300)).toBeLessThanOrEqual(3);
  expect(Math.abs(sorted[0].h - 200)).toBeLessThanOrEqual(3);
  expect(Math.abs(sorted[1].w - 400)).toBeLessThanOrEqual(3);
  // 上の枠（小さいほう）は、塗ったところが黒い
  expect(sorted[0].dark).toBeLessThan(40);
  expect(sorted[0].light).toBeGreaterThan(200);
  // 下の枠は塗っていない
  expect(sorted[1].dark).toBeGreaterThan(150);

  // ホームに、2匹のミスモン
  await page.getByRole("link", { name: "ホームに もどる" }).click();
  await expect(
    page
      .locator("section")
      .filter({ hasText: "まだ たおしていない ミスモン" })
      .getByRole("listitem"),
  ).toHaveCount(2);
});

test.describe("読み取りの失敗", () => {
  // WebKit では、Service Worker を通った通信を page.route で差し替えられないため、止めておく
  test.use({ serviceWorkers: "block" });

  test("読み取れなかった問題は、じぶんで いれて登録できる", async ({
    page,
  }) => {
    let calls = 0;
    await page.route("**/api/ai/analyze", async (route) => {
      calls++;
      await route.fulfill({
        status: 504,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "timeout",
            message: "じかんが かかりすぎちゃった。もう一回 ためしてね",
            requestId: "r",
          },
        }),
      });
    });
    await toHome(page);
    await page.getByRole("link", { name: "📷 ミスモンを よぶ" }).click();
    await page.getByRole("button", { name: "わからない" }).click();
    await page.getByTestId("pick-photo").setInputFiles({
      name: "test.png",
      mimeType: "image/png",
      buffer: makePng(),
    });
    await drag(page, [100, 100], [400, 300]);
    await page.getByRole("button", { name: "つぎへ（1もん）" }).click();
    await page.getByRole("button", { name: "おくる（1もん）" }).click();

    await expect(page.getByText("よみとれなかったよ")).toBeVisible();
    await expect(page.getByText("じかんが かかりすぎちゃった")).toBeVisible();
    await page.getByRole("button", { name: "じぶんで いれる" }).click();
    await page.getByLabel("もんだい").fill("3 + 4 = ?");
    await page.getByLabel("きみの こたえ").fill("8");
    await page.getByLabel("せいかい").fill("7");
    await page.getByRole("button", { name: "これで とうろく する" }).click();
    await expect(
      page.getByRole("heading", { name: "ミスモンが 1ひき あらわれた！" }),
    ).toBeVisible();
    expect(calls).toBe(1);
  });
});
