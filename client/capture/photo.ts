import { fitWithin, type Size } from "@/domain/capture/geometry";

/**
 * 撮影の写真（U3）。画面を開いている間だけメモリに置く。IndexedDB・キャッシュ・ファイルには書かない（U3-PRIV-1）。
 * 読み込むときに向きを直し、長い辺を 2048px に縮める（U3-MEM-1）。元の大きさのデータはすぐに捨てる。
 */

export const PHOTO_MAX_SIDE = 2048;

export interface Photo extends Size {
  canvas: HTMLCanvasElement;
}

export class PhotoError extends Error {
  constructor() {
    super("この しゃしんは よめなかったよ");
    this.name = "PhotoError";
  }
}

export async function loadPhoto(
  file: Blob,
  maxSide = PHOTO_MAX_SIDE,
): Promise<Photo> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoError();
  }
  try {
    const size = fitWithin(bitmap, maxSide);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PhotoError();
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    return { canvas, ...size };
  } finally {
    bitmap.close();
  }
}

/** 写真を捨てる（キャンバスの中身を消して、大きさを 0 にする） */
export function discardPhoto(photo: Photo | null | undefined) {
  if (!photo) return;
  photo.canvas.getContext("2d")?.clearRect(0, 0, photo.width, photo.height);
  photo.canvas.width = 0;
  photo.canvas.height = 0;
}
