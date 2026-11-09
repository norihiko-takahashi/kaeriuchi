import { describe, expect, it } from "vitest";
import { checkImage, MAX_IMAGE_BYTES } from "./image";

/* ---------- テスト用の、最小の JPEG・PNG を組み立てる ---------- */

function segment(marker: number, payload: number[]): number[] {
  const len = payload.length + 2;
  return [0xff, marker, len >> 8, len & 0xff, ...payload];
}

function jpeg(
  opts: { width?: number; height?: number; extra?: number[][] } = {},
) {
  const { width = 640, height = 480, extra = [] } = opts;
  const app0 = segment(
    0xe0,
    [0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0],
  );
  const sof0 = segment(0xc0, [
    8,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    1,
    1,
    0x11,
    0,
  ]);
  const sos = [0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0];
  return new Uint8Array([
    0xff,
    0xd8,
    ...app0,
    ...extra.flat(),
    ...sof0,
    ...sos,
    0x00,
    0xff,
    0xd9,
  ]);
}

function chunk(type: string, data: number[]): number[] {
  const len = data.length;
  return [
    (len >>> 24) & 0xff,
    (len >>> 16) & 0xff,
    (len >>> 8) & 0xff,
    len & 0xff,
    ...[...type].map((c) => c.charCodeAt(0)),
    ...data,
    0,
    0,
    0,
    0, // CRC（この検証では見ない）
  ];
}

function u32(n: number) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function png(
  opts: { width?: number; height?: number; extra?: number[][] } = {},
) {
  const { width = 100, height = 50, extra = [] } = opts;
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk("IHDR", [...u32(width), ...u32(height), 8, 2, 0, 0, 0]),
    ...extra.flat(),
    ...chunk("IDAT", [0]),
    ...chunk("IEND", []),
  ]);
}

describe("checkImage（U2-SEC-3）", () => {
  it("JPEG の大きさを読む", () => {
    expect(checkImage(jpeg({ width: 800, height: 600 }))).toEqual({
      ok: true,
      mime: "image/jpeg",
      width: 800,
      height: 600,
    });
  });

  it("PNG の大きさを読む", () => {
    expect(checkImage(png({ width: 120, height: 80 }))).toEqual({
      ok: true,
      mime: "image/png",
      width: 120,
      height: 80,
    });
  });

  it("JPEG でも PNG でもないものは受け付けない（Content-Type は信じない）", () => {
    expect(checkImage(new TextEncoder().encode("GIF89a..."))).toMatchObject({
      ok: false,
      error: "unsupported_format",
    });
  });

  it("2MB を超えるものは受け付けない", () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(checkImage(big)).toMatchObject({ ok: false, error: "too_large" });
  });

  it("縦横 4096px を超えるものは受け付けない", () => {
    expect(checkImage(jpeg({ width: 5000, height: 100 }))).toMatchObject({
      ok: false,
      error: "too_many_pixels",
    });
    expect(checkImage(png({ width: 0, height: 10 }))).toMatchObject({
      ok: false,
      error: "too_many_pixels",
    });
  });

  it("壊れた JPEG は受け付けない", () => {
    expect(
      checkImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00])),
    ).toMatchObject({
      ok: false,
      error: "corrupt",
    });
    expect(checkImage(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toMatchObject({
      ok: false,
    });
  });

  it("壊れた PNG は受け付けない", () => {
    const b = png();
    expect(checkImage(b.slice(0, 20))).toMatchObject({
      ok: false,
      error: "corrupt",
    });
  });
});

describe("位置情報などのメタデータ（U2-PRIV-1）", () => {
  it("JPEG に Exif（APP1）があれば受け付けない", () => {
    const exif = segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, 1, 2, 3]);
    expect(checkImage(jpeg({ extra: [exif] }))).toMatchObject({
      ok: false,
      error: "metadata",
    });
  });

  it("JPEG に IPTC（APP13）があれば受け付けない", () => {
    expect(
      checkImage(jpeg({ extra: [segment(0xed, [1, 2, 3])] })),
    ).toMatchObject({
      ok: false,
      error: "metadata",
    });
  });

  it("色の情報（ICC・APP2）は受け付ける（位置情報は入らない）", () => {
    expect(
      checkImage(jpeg({ extra: [segment(0xe2, [1, 2, 3])] })),
    ).toMatchObject({
      ok: true,
    });
  });

  it.each([
    "eXIf",
    "tEXt",
    "iTXt",
    "zTXt",
  ])("PNG に %s があれば受け付けない", (type) => {
    expect(checkImage(png({ extra: [chunk(type, [1, 2, 3])] }))).toMatchObject({
      ok: false,
      error: "metadata",
      detail: type,
    });
  });
});
