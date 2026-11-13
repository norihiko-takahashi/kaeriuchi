/**
 * 撮影：枠の計算（U3、nfr-design.md §3）。座標は、縮めた写真の画素で持つ。
 * 画面の部品から切り離した純粋な関数（U3-TEST-1）。
 */

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Frame extends Rect {
  id: string;
}

/** 1回の撮影で囲める枠の数（U3-COST-1） */
export const MAX_FRAMES = 10;
/** これより短い辺の枠は「ちいさすぎる」（写真の短い辺に対する割合） */
export const MIN_SIDE_RATIO = 0.04;
/** これより大きい枠は「おおきすぎる」（写真の面積に対する割合） */
export const MAX_AREA_RATIO = 0.6;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi);

/** 2つの点から四角を作る（どちら向きになぞっても同じ）。写真の外は切り詰める */
export function rectFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
  photo: Size,
): Rect {
  const x0 = clamp(Math.min(a.x, b.x), 0, photo.width);
  const y0 = clamp(Math.min(a.y, b.y), 0, photo.height);
  const x1 = clamp(Math.max(a.x, b.x), 0, photo.width);
  const y1 = clamp(Math.max(a.y, b.y), 0, photo.height);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 写真の中に収める（大きさは写真より大きくしない） */
export function clampRect(r: Rect, photo: Size): Rect {
  const w = clamp(r.w, 1, photo.width);
  const h = clamp(r.h, 1, photo.height);
  return {
    x: clamp(r.x, 0, photo.width - w),
    y: clamp(r.y, 0, photo.height - h),
    w,
    h,
  };
}

/** 動かす */
export function moveRect(r: Rect, dx: number, dy: number, photo: Size): Rect {
  return clampRect({ ...r, x: r.x + dx, y: r.y + dy }, photo);
}

export type Handle = "nw" | "ne" | "sw" | "se";

/** 角の取っ手で大きさを変える。反対の角は動かさない。最小の大きさより小さくしない */
export function resizeRect(
  r: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  photo: Size,
): Rect {
  const min = minSide(photo);
  let x0 = r.x;
  let y0 = r.y;
  let x1 = r.x + r.w;
  let y1 = r.y + r.h;
  if (handle === "nw" || handle === "sw") x0 = clamp(x0 + dx, 0, x1 - min);
  else x1 = clamp(x1 + dx, x0 + min, photo.width);
  if (handle === "nw" || handle === "ne") y0 = clamp(y0 + dy, 0, y1 - min);
  else y1 = clamp(y1 + dy, y0 + min, photo.height);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** キーボードで大きさを変える（右下の角を動かす） */
export function growRect(r: Rect, dw: number, dh: number, photo: Size): Rect {
  return resizeRect(r, "se", dw, dh, photo);
}

export const minSide = (photo: Size) =>
  Math.max(1, Math.round(Math.min(photo.width, photo.height) * MIN_SIDE_RATIO));

export type FrameWarning = "tooSmall" | "tooLarge";

export function frameWarning(r: Rect, photo: Size): FrameWarning | null {
  if (Math.min(r.w, r.h) < minSide(photo)) return "tooSmall";
  if (r.w * r.h > photo.width * photo.height * MAX_AREA_RATIO)
    return "tooLarge";
  return null;
}

/** 何もないところに足すときの枠（真ん中に、写真の短い辺の 30% の大きさ） */
export function centerRect(photo: Size): Rect {
  const s = Math.round(Math.min(photo.width, photo.height) * 0.3);
  return {
    x: Math.round((photo.width - s) / 2),
    y: Math.round((photo.height - s) / 2),
    w: s,
    h: s,
  };
}

/**
 * 確認の順番：上から下。上の端が近いもの（2つの枠の低いほうの高さの半分以内）は同じ段とみなし、段の中は左から
 */
export function sortFrames<T extends Rect>(frames: T[]): T[] {
  const byTop = [...frames].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: T[][] = [];
  for (const f of byTop) {
    const row = rows.at(-1);
    const anchor = row?.[0];
    if (row && anchor && f.y - anchor.y <= Math.min(anchor.h, f.h) / 2)
      row.push(f);
    else rows.push([f]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
}

/** 指の位置にある枠（重なっていれば、あとから作ったもの＝上に描いたもの） */
export function frameAt<T extends Rect>(
  frames: T[],
  p: { x: number; y: number },
): T | undefined {
  return [...frames]
    .reverse()
    .find(
      (f) => p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h,
    );
}

/** 角の取っ手の上か（取っ手の半径は、画面の 22px を写真の画素に直したもの） */
export function handleAt(
  r: Rect,
  p: { x: number; y: number },
  radius: number,
): Handle | null {
  const corners: [Handle, number, number][] = [
    ["nw", r.x, r.y],
    ["ne", r.x + r.w, r.y],
    ["sw", r.x, r.y + r.h],
    ["se", r.x + r.w, r.y + r.h],
  ];
  for (const [h, cx, cy] of corners)
    if (Math.hypot(p.x - cx, p.y - cy) <= radius) return h;
  return null;
}

/** 読み上げ用の位置（「うえの ひだり」など） */
export function describePosition(r: Rect, photo: Size): string {
  const cx = (r.x + r.w / 2) / photo.width;
  const cy = (r.y + r.h / 2) / photo.height;
  const v =
    cy < 1 / 3 ? "うえの ほう" : cy > 2 / 3 ? "したの ほう" : "まんなか";
  const h = cx < 1 / 3 ? "ひだり" : cx > 2 / 3 ? "みぎ" : "";
  return h ? `${v}・${h}` : v;
}

/** 縮めるときの大きさ（長い辺を max まで。小さいものは変えない） */
export function fitWithin(size: Size, max: number): Size {
  const s = Math.min(1, max / Math.max(size.width, size.height));
  return {
    width: Math.max(1, Math.round(size.width * s)),
    height: Math.max(1, Math.round(size.height * s)),
  };
}
