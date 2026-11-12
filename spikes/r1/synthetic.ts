import {
  arc,
  createRaster,
  line,
  type Raster,
  type RGB,
  rect,
  rng,
} from "./raster";
import type { Box, MarkKind } from "./redmarks";

/**
 * R1 のスパイク：丸付けしたテストの「見本の画像」を作る（本物の写真の代わり。本物はあとで用意する）。
 * 名前の欄、問題文（印刷）、鉛筆の答え、赤ペンの ○・✗・✓・／ を描き、正解の位置も返す。
 */

export type ShapeKind = "circle" | "cross" | "check" | "slash";

export interface Truth {
  marks: { shape: ShapeKind; kind: MarkKind; box: Box }[];
  nameBox: Box;
}

export interface Variant {
  id: string;
  label: string;
  width?: number;
  height?: number;
  paper?: RGB;
  /** 明るさ（1 = そのまま） */
  light?: number;
  /** 左から右への影（0 = なし、0.5 = 左が半分の明るさ） */
  shadow?: number;
  /** 暖色の照明（0〜1） */
  warm?: number;
  /** 傾き（度） */
  rotate?: number;
  pen?: RGB;
  penWidth?: number;
  /** 赤ペンのかすれ（1 = 濃い） */
  penAlpha?: number;
  /** 赤で印刷された見出し */
  redHeader?: boolean;
  /** ピンクの蛍光ペン */
  highlighter?: boolean;
  /** ノイズの強さ（0〜255） */
  noise?: number;
}

const INK: RGB = [40, 40, 45];
const PENCIL: RGB = [95, 95, 100];
const RED: RGB = [205, 35, 45];

function scribble(
  r: Raster,
  x: number,
  y: number,
  w: number,
  h: number,
  rand: () => number,
) {
  // 鉛筆の手書き（ぐにゃぐにゃの線）
  let px = x;
  let py = y + h / 2;
  const steps = Math.max(4, Math.floor(w / 6));
  for (let i = 1; i <= steps; i++) {
    const nx = x + (w * i) / steps;
    const ny = y + h * (0.2 + rand() * 0.6);
    line(r, px, py, nx, ny, 3, PENCIL, 0.9);
    px = nx;
    py = ny;
  }
}

function printedLine(
  r: Raster,
  x: number,
  y: number,
  w: number,
  size: number,
  c: RGB,
  rand: () => number,
) {
  // 印刷された文字の代わりに、文字の大きさの四角を並べる
  for (let cx = x; cx < x + w; cx += size * 1.1) {
    if (rand() < 0.12) continue;
    rect(r, cx, y, size * 0.85, size * 0.85, c);
  }
}

function drawMark(
  r: Raster,
  shape: ShapeKind,
  cx: number,
  cy: number,
  s: number,
  pen: RGB,
  width: number,
  alpha: number,
) {
  const c: RGB = [
    pen[0] * alpha + 255 * (1 - alpha),
    pen[1] * alpha + 255 * (1 - alpha),
    pen[2] * alpha + 255 * (1 - alpha),
  ];
  const h = s / 2;
  switch (shape) {
    case "circle":
      // 手で描いた ○ は、少しだけ閉じていないことが多い
      arc(
        r,
        cx,
        cy,
        h,
        -Math.PI / 2 + 0.15,
        (3 * Math.PI) / 2 - 0.05,
        width,
        c,
      );
      break;
    case "cross":
      line(r, cx - h, cy - h, cx + h, cy + h, width, c);
      line(r, cx + h, cy - h, cx - h, cy + h, width, c);
      break;
    case "check":
      line(r, cx - h, cy, cx - h * 0.2, cy + h, width, c);
      line(r, cx - h * 0.2, cy + h, cx + h, cy - h, width, c);
      break;
    case "slash":
      line(r, cx + h * 0.6, cy - h, cx - h * 0.6, cy + h, width, c);
      break;
  }
}

function rotateRaster(src: Raster, deg: number, bg: RGB): Raster {
  const out = createRaster(src.width, src.height, bg);
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const cx = src.width / 2;
  const cy = src.height / 2;
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const sx = Math.round(cos * (x - cx) + sin * (y - cy) + cx);
      const sy = Math.round(-sin * (x - cx) + cos * (y - cy) + cy);
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      const i = (y * src.width + x) * 4;
      const j = (sy * src.width + sx) * 4;
      out.data[i] = src.data[j];
      out.data[i + 1] = src.data[j + 1];
      out.data[i + 2] = src.data[j + 2];
    }
  return out;
}

function rotateBox(b: Box, deg: number, w: number, h: number): Box {
  const a = (deg * Math.PI) / 180;
  const cx = w / 2;
  const cy = h / 2;
  const pts = [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x, b.y + b.h],
    [b.x + b.w, b.y + b.h],
  ].map(([x, y]) => [
    Math.cos(a) * (x - cx) - Math.sin(a) * (y - cy) + cx,
    Math.sin(a) * (x - cx) + Math.cos(a) * (y - cy) + cy,
  ]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

export function makeSheet(
  seed: number,
  v: Variant,
): { image: Raster; truth: Truth } {
  const rand = rng(seed);
  const W = v.width ?? 1200;
  const H = v.height ?? 1600;
  const k = W / 1200;
  const paper = v.paper ?? [250, 250, 247];
  let img = createRaster(W, H, paper);

  // 見出し
  printedLine(
    img,
    80 * k,
    60 * k,
    500 * k,
    40 * k,
    v.redHeader ? [200, 40, 50] : INK,
    rand,
  );
  // 名前の欄（右上）
  const nameBox: Box = { x: 700 * k, y: 50 * k, w: 420 * k, h: 80 * k };
  line(
    img,
    nameBox.x,
    nameBox.y + nameBox.h,
    nameBox.x + nameBox.w,
    nameBox.y + nameBox.h,
    3,
    INK,
  );
  printedLine(
    img,
    nameBox.x + 10 * k,
    nameBox.y + 30 * k,
    90 * k,
    28 * k,
    INK,
    rand,
  );
  scribble(img, nameBox.x + 130 * k, nameBox.y + 10 * k, 260 * k, 60 * k, rand);

  const truth: Truth = { marks: [], nameBox };
  const shapes: ShapeKind[] = ["circle", "cross", "check", "slash"];
  const pen = v.pen ?? RED;
  const rows = 8;
  for (let i = 0; i < rows; i++) {
    const y = (200 + i * 170) * k;
    // 問題番号と問題文
    rect(img, 80 * k, y, 36 * k, 36 * k, INK);
    printedLine(img, 140 * k, y, 620 * k, 30 * k, INK, rand);
    printedLine(img, 140 * k, y + 50 * k, 380 * k, 30 * k, INK, rand);
    // 答えの欄と鉛筆の答え
    line(img, 800 * k, y + 80 * k, 1100 * k, y + 80 * k, 2, INK);
    scribble(img, 820 * k, y + 20 * k, 200 * k, 55 * k, rand);
    if (v.highlighter && i % 3 === 1)
      rect(img, 140 * k, y - 4 * k, 500 * k, 40 * k, [255, 150, 190], 0.3);

    const shape = shapes[Math.floor(rand() * shapes.length)];
    const s = (60 + rand() * 40) * k;
    // 印は答えの上か、問題番号の上
    const onAnswer = rand() < 0.7;
    const cx = onAnswer ? (880 + rand() * 120) * k : 98 * k;
    const cy = y + (onAnswer ? 45 : 18) * k + (rand() - 0.5) * 10 * k;
    drawMark(
      img,
      shape,
      cx,
      cy,
      s,
      pen,
      (v.penWidth ?? 6) * k,
      v.penAlpha ?? 1,
    );
    const pad = ((v.penWidth ?? 6) * k) / 2;
    truth.marks.push({
      shape,
      kind: shape === "circle" ? "circle" : "wrong",
      box: {
        x: cx - s / 2 - pad,
        y: cy - s / 2 - pad,
        w: s + pad * 2,
        h: s + pad * 2,
      },
    });
  }

  if (v.rotate) {
    img = rotateRaster(img, v.rotate, [120, 110, 100]);
    for (const m of truth.marks) m.box = rotateBox(m.box, v.rotate, W, H);
    truth.nameBox = rotateBox(truth.nameBox, v.rotate, W, H);
  }

  // 照明・紙の色・ノイズ
  const light = v.light ?? 1;
  const warm = v.warm ?? 0;
  const shadow = v.shadow ?? 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const f = light * (1 - shadow * (1 - x / W));
      const n = v.noise ? (rand() - 0.5) * v.noise : 0;
      img.data[i] = img.data[i] * f + n;
      img.data[i + 1] = img.data[i + 1] * f * (1 - warm * 0.08) + n;
      img.data[i + 2] = img.data[i + 2] * f * (1 - warm * 0.25) + n;
    }
  return { image: img, truth };
}

export const VARIANTS: Variant[] = [
  { id: "plain", label: "明るい部屋・白い紙" },
  { id: "warm", label: "暖色の照明", warm: 1 },
  { id: "dim", label: "暗めの部屋", light: 0.6, noise: 12 },
  { id: "shadow", label: "手やスマホの影（左が暗い）", shadow: 0.5 },
  { id: "recycled", label: "黄ばんだ紙（再生紙）", paper: [240, 230, 195] },
  { id: "rotate", label: "4度傾いている", rotate: 4 },
  { id: "thin", label: "細い赤ペン", penWidth: 3 },
  { id: "faint", label: "かすれた赤ペン", penAlpha: 0.55 },
  { id: "orange", label: "朱色に近い赤ペン", pen: [225, 80, 40] },
  { id: "red-header", label: "赤で印刷された見出し", redHeader: true },
  { id: "highlighter", label: "ピンクの蛍光ペン", highlighter: true },
  {
    id: "worst",
    label: "暗い・暖色・影・傾き・かすれ",
    light: 0.65,
    warm: 1,
    shadow: 0.4,
    rotate: -3,
    penAlpha: 0.7,
    noise: 10,
  },
];
