/**
 * 送られた画像の検証（U2-SEC-3、U2-PRIV-1）。
 * - 中身が本当に JPEG・PNG か（先頭のバイトで判定する。ファイル名や Content-Type は信じない）
 * - 2MB 以下、縦横 4096px 以下
 * - 撮った場所（GPS）などが入るメタデータが残っていないか。残っていたら受け付けない
 *   （端末で描き直して消す前提。nfr-design.md §3）
 */

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 4096;

export type ImageError =
  | "too_large"
  | "unsupported_format"
  | "corrupt"
  | "too_many_pixels"
  | "metadata";

export type ImageCheck =
  | {
      ok: true;
      mime: "image/jpeg" | "image/png";
      width: number;
      height: number;
    }
  | { ok: false; error: ImageError; detail?: string };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** JPEG の、位置情報などが入りうるメタデータの区切り */
const JPEG_METADATA_MARKERS: Record<number, string> = {
  225: "APP1（Exif・XMP）",
  237: "APP13（IPTC）",
};

/** PNG の、位置情報や文字が入りうるチャンク */
const PNG_METADATA_CHUNKS = new Set(["eXIf", "tEXt", "iTXt", "zTXt"]);

function checkJpeg(b: Uint8Array): ImageCheck {
  let i = 2;
  let size: { width: number; height: number } | undefined;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return { ok: false, error: "corrupt" };
    const marker = b[i + 1];
    if (marker === 0xd9 || marker === 0xda) break; // 終わり、または画像のデータの始まり
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length)
      return { ok: false, error: "corrupt" };
    if (JPEG_METADATA_MARKERS[marker]) {
      return {
        ok: false,
        error: "metadata",
        detail: JPEG_METADATA_MARKERS[marker],
      };
    }
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof && len >= 7) {
      size = {
        height: (b[i + 5] << 8) | b[i + 6],
        width: (b[i + 7] << 8) | b[i + 8],
      };
    }
    i += 2 + len;
  }
  if (!size) return { ok: false, error: "corrupt" };
  return { ok: true, mime: "image/jpeg", ...size };
}

function checkPng(b: Uint8Array): ImageCheck {
  let i = 8;
  let size: { width: number; height: number } | undefined;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  while (i + 8 <= b.length) {
    const len = view.getUint32(i);
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    if (i + 12 + len > b.length) return { ok: false, error: "corrupt" };
    if (type === "IHDR" && len >= 8) {
      size = { width: view.getUint32(i + 8), height: view.getUint32(i + 12) };
    }
    if (PNG_METADATA_CHUNKS.has(type)) {
      return { ok: false, error: "metadata", detail: type };
    }
    if (type === "IEND") break;
    i += 12 + len;
  }
  if (!size) return { ok: false, error: "corrupt" };
  return { ok: true, mime: "image/png", ...size };
}

export function checkImage(b: Uint8Array): ImageCheck {
  if (b.length > MAX_IMAGE_BYTES) return { ok: false, error: "too_large" };
  let result: ImageCheck;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    result = checkJpeg(b);
  } else if (PNG_SIGNATURE.every((v, k) => b[k] === v)) {
    result = checkPng(b);
  } else {
    return { ok: false, error: "unsupported_format" };
  }
  if (
    result.ok &&
    (result.width > MAX_IMAGE_SIDE ||
      result.height > MAX_IMAGE_SIDE ||
      result.width === 0 ||
      result.height === 0)
  ) {
    return { ok: false, error: "too_many_pixels" };
  }
  return result;
}
