/**
 * R1 のスパイク：画像を、ブラウザの ImageData と同じ形（RGBA の並び）で扱う。
 * Canvas がない環境（Node のテスト）でも、見本の画像を描いて試せるようにする。
 */
export interface Raster {
  width: number;
  height: number;
  /** RGBA。ImageData.data と同じ並び */
  data: Uint8ClampedArray;
}

export type RGB = [number, number, number];

export function createRaster(width: number, height: number, fill: RGB): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

export function setPixel(r: Raster, x: number, y: number, c: RGB, alpha = 1) {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= r.width || yi >= r.height) return;
  const i = (yi * r.width + xi) * 4;
  for (let k = 0; k < 3; k++)
    r.data[i + k] = r.data[i + k] * (1 - alpha) + c[k] * alpha;
}

/** 太さのある線を描く */
export function line(
  r: Raster,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  c: RGB,
  alpha = 1,
) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len));
  const rad = width / 2;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = x0 + (x1 - x0) * t;
    const cy = y0 + (y1 - y0) * t;
    for (let dy = -rad; dy <= rad; dy++)
      for (let dx = -rad; dx <= rad; dx++)
        if (dx * dx + dy * dy <= rad * rad)
          setPixel(r, cx + dx, cy + dy, c, alpha);
  }
}

/** 円の弧（from〜to はラジアン） */
export function arc(
  r: Raster,
  cx: number,
  cy: number,
  radius: number,
  from: number,
  to: number,
  width: number,
  c: RGB,
) {
  const steps = Math.ceil(Math.abs(to - from) * radius);
  let px = cx + radius * Math.cos(from);
  let py = cy + radius * Math.sin(from);
  for (let s = 1; s <= steps; s++) {
    const a = from + ((to - from) * s) / steps;
    const nx = cx + radius * Math.cos(a);
    const ny = cy + radius * Math.sin(a);
    line(r, px, py, nx, ny, width, c);
    px = nx;
    py = ny;
  }
}

export function rect(
  r: Raster,
  x: number,
  y: number,
  w: number,
  h: number,
  c: RGB,
  alpha = 1,
) {
  for (let yy = Math.round(y); yy < y + h; yy++)
    for (let xx = Math.round(x); xx < x + w; xx++)
      setPixel(r, xx, yy, c, alpha);
}

/** 決まった結果になる乱数（見本の画像を毎回同じにする） */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}
