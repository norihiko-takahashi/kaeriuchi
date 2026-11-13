import { fitWithin, type Rect } from "@/domain/capture/geometry";
import type { Photo } from "./photo";
import { drawStrokes, type Stroke } from "./redact";

/**
 * 枠を切り抜いて、送る画像にする（FR-2.4・2.5d、U3-PRIV-2）。
 * - 縮めた写真から枠の範囲だけを写し、かくすペンの線を黒で上から描く
 * - 長い辺 1600px まで、JPEG（品質 0.85）。2MB を超えたら品質を下げる
 * - 描き直すので、撮影の情報（位置など）は付かない
 */

export const CROP_MAX_SIDE = 1600;
export const CROP_MAX_BYTES = 2 * 1024 * 1024;
const QUALITIES = [0.85, 0.7, 0.55];

export interface Crop {
  blob: Blob;
  width: number;
  height: number;
}

export async function exportFrame(
  photo: Photo,
  rect: Rect,
  strokes: Stroke[],
): Promise<Crop> {
  const size = fitWithin({ width: rect.w, height: rect.h }, CROP_MAX_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(
    photo.canvas,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    0,
    0,
    size.width,
    size.height,
  );
  ctx.save();
  ctx.scale(size.width / rect.w, size.height / rect.h);
  ctx.translate(-rect.x, -rect.y);
  drawStrokes(ctx, strokes);
  ctx.restore();
  try {
    for (const q of QUALITIES) {
      const blob = await toBlob(canvas, q);
      if (blob.size <= CROP_MAX_BYTES || q === QUALITIES.at(-1))
        return { blob, ...size };
    }
    throw new Error("unreachable");
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob"))),
      "image/jpeg",
      quality,
    ),
  );
}
