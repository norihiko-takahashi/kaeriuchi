import type { Raster } from "./raster";

/**
 * R1 のスパイク：赤ペンの印を見つけ、間違いの印（✗・✓・／）のまわりに枠の候補を出す（FR-2.5a）。
 * ブラウザの中（Canvas の ImageData、Web Worker）で動かす前提。写真は端末の外に出さない。
 *
 * 手順
 * 1. 長い辺を 960px 以下に縮める（速さのため。細いペンの ○ が切れないよう、小さくしすぎない）
 * 2. 紙の白さで色と明るさをそろえる（照明・紙の色の違いを吸収する）
 * 3. 「赤い」画素を選ぶ（赤みが強く、鮮やかなもの。薄いピンクの蛍光ペンは選ばない）
 * 4. つながった画素をまとめて、印の候補にする
 * 5. 形で分ける：まわりを囲んでいて真ん中が空いていれば ○（正解）、それ以外は間違いの印
 * 6. 横に同じ大きさのものが並んでいれば、赤で印刷された文字とみなして捨てる
 * 7. 間違いの印のまわりに、問題1問分の枠の候補を出す（名前の欄は、ふつう枠の外になる）
 */

export type MarkKind = "circle" | "wrong";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Mark {
  kind: MarkKind;
  /** 元の画像の座標 */
  box: Box;
}

export interface DetectResult {
  marks: Mark[];
  /** 間違いの印ごとの、枠の候補（元の画像の座標） */
  frames: Box[];
  /** 縮めた画像の大きさ（調べるときのため） */
  scale: number;
}

export interface DetectOptions {
  maxSide?: number;
  /** 赤い画素の鮮やかさのしきい値（0〜1） */
  minSaturation?: number;
  /** 印とみなす大きさ（短い辺に対する割合） */
  minSize?: number;
  maxSize?: number;
}

const DEFAULTS: Required<DetectOptions> = {
  maxSide: 960,
  minSaturation: 0.2,
  minSize: 0.015,
  maxSize: 0.3,
};

interface Small {
  w: number;
  h: number;
  /** 0〜1 にそろえた RGB */
  rgb: Float32Array;
}

function downscale(
  src: Raster,
  maxSide: number,
): { img: Small; scale: number } {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const rgb = new Float32Array(w * h * 3);
  const step = 1 / scale;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * step);
      const y0 = Math.floor(y * step);
      const x1 = Math.min(
        src.width,
        Math.max(x0 + 1, Math.floor((x + 1) * step)),
      );
      const y1 = Math.min(
        src.height,
        Math.max(y0 + 1, Math.floor((y + 1) * step)),
      );
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
          n++;
        }
      const o = (y * w + x) * 3;
      rgb[o] = r / n / 255;
      rgb[o + 1] = g / n / 255;
      rgb[o + 2] = b / n / 255;
    }
  }
  return { img: { w, h, rgb }, scale };
}

/**
 * 紙の白さでそろえる。照明のむらにも効くよう、32px ごとの区画で「明るい方から 10%」の色を紙の色とみなす
 */
function whiteBalance(img: Small) {
  const cell = 32;
  const cw = Math.ceil(img.w / cell);
  const ch = Math.ceil(img.h / cell);
  const paper = new Float32Array(cw * ch * 3);
  for (let cy = 0; cy < ch; cy++)
    for (let cx = 0; cx < cw; cx++) {
      const vals: number[][] = [[], [], []];
      for (let y = cy * cell; y < Math.min(img.h, (cy + 1) * cell); y++)
        for (let x = cx * cell; x < Math.min(img.w, (cx + 1) * cell); x++)
          for (let k = 0; k < 3; k++)
            vals[k].push(img.rgb[(y * img.w + x) * 3 + k]);
      for (let k = 0; k < 3; k++) {
        const v = vals[k].sort((a, b) => a - b);
        paper[(cy * cw + cx) * 3 + k] = Math.max(
          0.05,
          v[Math.floor(v.length * 0.9)] ?? 1,
        );
      }
    }
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const p =
        (Math.min(ch - 1, Math.floor(y / cell)) * cw +
          Math.min(cw - 1, Math.floor(x / cell))) *
        3;
      for (let k = 0; k < 3; k++) {
        const o = (y * img.w + x) * 3 + k;
        img.rgb[o] = Math.min(1, img.rgb[o] / paper[p + k]);
      }
    }
}

/**
 * 赤ペンの画素を選ぶ。色相が赤〜ピンク（300°〜360°、0°〜25°）で、ある程度鮮やかなもの。
 * 学校の丸付けのペンは、ピンクに近い赤（マゼンタ、330°〜345°）も多い（2026-11-12、本物の写真で確認）
 */
function redMask(img: Small, minSat: number): Uint8Array {
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < img.w * img.h; i++) {
    const r = img.rgb[i * 3];
    const g = img.rgb[i * 3 + 1];
    const b = img.rgb[i * 3 + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max !== r || max < 0.3) continue;
    const sat = (max - min) / max;
    if (sat < minSat) continue;
    // 赤が一番強いときの色相（−60°〜60°）
    const hue = (60 * (g - b)) / (max - min || 1);
    if (hue >= -60 && hue <= 25) m[i] = 1;
  }
  return m;
}

/** 1px ふくらませて、かすれた線をつなぐ */
function dilate(m: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) out[yy * w + xx] = 1;
        }
    }
  return out;
}

interface Comp {
  box: Box;
  pixels: number[];
}

function components(m: Uint8Array, w: number, h: number): Comp[] {
  const seen = new Uint8Array(m.length);
  const out: Comp[] = [];
  const stack: number[] = [];
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || seen[i]) continue;
    const pixels: number[] = [];
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const p = stack.pop() as number;
      pixels.push(p);
      const x = p % w;
      const y = (p - x) / w;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          if (m[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
    }
    out.push({ box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, pixels });
  }
  return out;
}

/** まわりを囲んでいるか：真ん中から 24 方向に線を伸ばし、印に当たる方向の割合 */
function angularCoverage(c: Comp, m: Uint8Array, w: number): number {
  const cx = c.box.x + c.box.w / 2;
  const cy = c.box.y + c.box.h / 2;
  const maxR = Math.max(c.box.w, c.box.h) * 0.6;
  const dirs = 24;
  let hit = 0;
  for (let d = 0; d < dirs; d++) {
    const a = (2 * Math.PI * d) / dirs;
    for (let r = maxR * 0.2; r <= maxR; r += 0.5) {
      const x = Math.round(cx + r * Math.cos(a));
      const y = Math.round(cy + r * Math.sin(a));
      if (
        x < c.box.x ||
        y < c.box.y ||
        x >= c.box.x + c.box.w ||
        y >= c.box.y + c.box.h
      )
        break;
      if (m[y * w + x]) {
        hit++;
        break;
      }
    }
  }
  return hit / dirs;
}

/** 真ん中（30% の範囲）が空いているか */
function centerEmpty(c: Comp, m: Uint8Array, w: number): boolean {
  const x0 = Math.round(c.box.x + c.box.w * 0.35);
  const x1 = Math.round(c.box.x + c.box.w * 0.65);
  const y0 = Math.round(c.box.y + c.box.h * 0.35);
  const y1 = Math.round(c.box.y + c.box.h * 0.65);
  let on = 0;
  let n = 0;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      n++;
      if (m[y * w + x]) on++;
    }
  return n > 0 && on / n < 0.08;
}

/** 横に同じくらいの大きさのものが 4つ以上並んでいれば、赤で印刷された文字とみなす */
function isPrintedText(c: Comp, all: Comp[]): boolean {
  const size = Math.max(c.box.w, c.box.h);
  const cy = c.box.y + c.box.h / 2;
  const row = all.filter((o) => {
    const s = Math.max(o.box.w, o.box.h);
    return (
      Math.abs(o.box.y + o.box.h / 2 - cy) < size * 0.3 &&
      s > size * 0.6 &&
      s < size * 1.6 &&
      Math.abs(o.box.x - c.box.x) < size * 6
    );
  });
  return row.length >= 4;
}

export function detectMarks(
  src: Raster,
  options: DetectOptions = {},
): DetectResult {
  const o = { ...DEFAULTS, ...options };
  const { img, scale } = downscale(src, o.maxSide);
  whiteBalance(img);
  const mask = dilate(redMask(img, o.minSaturation), img.w, img.h);
  const short = Math.min(img.w, img.h);
  const comps = components(mask, img.w, img.h).filter((c) => {
    const s = Math.max(c.box.w, c.box.h);
    return (
      s >= short * o.minSize && s <= short * o.maxSize && c.pixels.length >= 12
    );
  });

  const marks: Mark[] = [];
  const frames: Box[] = [];
  const up = (b: Box): Box => ({
    x: Math.round(b.x / scale),
    y: Math.round(b.y / scale),
    w: Math.round(b.w / scale),
    h: Math.round(b.h / scale),
  });
  for (const c of comps) {
    if (isPrintedText(c, comps)) continue;
    const aspect = c.box.w / c.box.h;
    const round =
      aspect > 0.55 &&
      aspect < 1.8 &&
      angularCoverage(c, mask, img.w) >= 0.75 &&
      centerEmpty(c, mask, img.w);
    const kind: MarkKind = round ? "circle" : "wrong";
    marks.push({ kind, box: up(c.box) });
    if (kind === "wrong") {
      // 問題1問分の枠：印の高さの 2.4倍、印の左 1つ分から右へ 7つ分（印は問題番号か答えの近くに付くことが多い）
      const s = Math.max(c.box.w, c.box.h);
      const x = Math.max(0, c.box.x - s);
      const y = Math.max(0, c.box.y + c.box.h / 2 - s * 1.2);
      frames.push(
        up({
          x,
          y,
          w: Math.min(img.w - x, s * 8),
          h: Math.min(img.h - y, s * 2.4),
        }),
      );
    }
  }
  return { marks, frames, scale };
}
