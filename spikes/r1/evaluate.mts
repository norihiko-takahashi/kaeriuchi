/**
 * R1 のスパイク：赤ペンの印の検知を、見本の画像で測る。
 *   pnpm spike:r1
 * 結果は spikes/r1/reports/ に Markdown で出す（リポジトリには入れない）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { type Box, detectMarks } from "./redmarks";
import { makeSheet, VARIANTS } from "./synthetic";

const SEEDS = [1, 2, 3, 4, 5];

const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const inside = (p: { x: number; y: number }, b: Box, pad = 0) =>
  p.x >= b.x - pad &&
  p.x <= b.x + b.w + pad &&
  p.y >= b.y - pad &&
  p.y <= b.y + b.h + pad;
/** b のうち、a に含まれる面積の割合 */
const covered = (a: Box, b: Box) => {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (w * h) / (b.w * b.h);
};

interface Row {
  variant: string;
  wrongTotal: number;
  wrongFound: number;
  circleTotal: number;
  circleAsWrong: number;
  falsePositive: number;
  nameInFrame: number;
  ms: number;
}

const rows: Row[] = [];
for (const v of VARIANTS) {
  const row: Row = {
    variant: v.label,
    wrongTotal: 0,
    wrongFound: 0,
    circleTotal: 0,
    circleAsWrong: 0,
    falsePositive: 0,
    nameInFrame: 0,
    ms: 0,
  };
  for (const seed of SEEDS) {
    const { image, truth } = makeSheet(seed, v);
    const t0 = performance.now();
    const r = detectMarks(image);
    row.ms += performance.now() - t0;
    for (const m of truth.marks) {
      const pad = m.box.w * 0.2;
      const hits = r.marks.filter((d) => inside(center(d.box), m.box, pad));
      if (m.kind === "wrong") {
        row.wrongTotal++;
        if (hits.some((h) => h.kind === "wrong")) row.wrongFound++;
      } else {
        row.circleTotal++;
        if (hits.some((h) => h.kind === "wrong")) row.circleAsWrong++;
      }
    }
    row.falsePositive += r.marks.filter(
      (d) =>
        !truth.marks.some((m) => inside(center(d.box), m.box, m.box.w * 0.2)),
    ).length;
    // 名前の欄の 20% 以上を含む枠（名前が送られてしまうおそれ）
    row.nameInFrame += r.frames.filter(
      (f) => covered(f, truth.nameBox) >= 0.2,
    ).length;
  }
  row.ms /= SEEDS.length;
  rows.push(row);
}

// 大きな写真（スマホのカメラの 12MP）の速さ
const big = makeSheet(9, {
  id: "big",
  label: "12MP",
  width: 3024,
  height: 4032,
});
const tb = performance.now();
detectMarks(big.image);
const bigMs = performance.now() - tb;

const sum = (k: keyof Row) => rows.reduce((n, r) => n + (r[k] as number), 0);
const pct = (a: number, b: number) =>
  b ? `${Math.round((a / b) * 1000) / 10}%` : "-";
const md = [
  "# R1 スパイク：赤ペンの印の検知（見本の画像）",
  "",
  `- 日時：${new Date().toISOString()}`,
  `- 画像：見本（コンピューターで描いたもの）${VARIANTS.length}種類 × ${SEEDS.length}枚。1枚に 8問`,
  `- 間違いの印（✗・✓・／）を見つけられた率：**${pct(sum("wrongFound"), sum("wrongTotal"))}**（${sum("wrongFound")}/${sum("wrongTotal")}）`,
  `- ○ を間違いの印と取り違えた率：**${pct(sum("circleAsWrong"), sum("circleTotal"))}**（${sum("circleAsWrong")}/${sum("circleTotal")}）`,
  `- 印でないものを印とした数：**${sum("falsePositive")}**`,
  `- 枠の候補が名前の欄の 20% 以上を含んだ数：**${sum("nameInFrame")}**`,
  `- 速さ（1200×1600、Node）：平均 ${Math.round(sum("ms") / rows.length)}ms／12MP（3024×4032）：${Math.round(bigMs)}ms`,
  "",
  "| 条件 | 間違いの印 | ○ を取り違え | 印でないもの | 名前の欄 | 速さ |",
  "|---|---|---|---|---|---|",
  ...rows.map(
    (r) =>
      `| ${r.variant} | ${pct(r.wrongFound, r.wrongTotal)} | ${pct(r.circleAsWrong, r.circleTotal)} | ${r.falsePositive} | ${r.nameInFrame} | ${Math.round(r.ms)}ms |`,
  ),
  "",
].join("\n");

const dir = new URL("./reports/", import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}redmarks-latest.md`, md);
console.log(md);

/* ---------- 文字の規則 ---------- */
const { findPii } = await import("./pii-text");
const { POSITIVE, NEGATIVE } = await import("./pii-samples");
const missed = POSITIVE.filter((t) => findPii(t).length === 0);
const falseHits = NEGATIVE.filter((t) => findPii(t).length > 0);
const md2 = [
  "# R1 スパイク：読み取った文字の規則",
  "",
  `- 止めるべき文を見つけた率：**${pct(POSITIVE.length - missed.length, POSITIVE.length)}**（${POSITIVE.length - missed.length}/${POSITIVE.length}）`,
  `- 止めてはいけない文を止めた率：**${pct(falseHits.length, NEGATIVE.length)}**（${falseHits.length}/${NEGATIVE.length}）`,
  "",
  "見逃した文：",
  ...missed.map((t) => `- ${t}`),
  "",
  "止めてしまった文：",
  ...falseHits.map((t) => `- ${t}（${findPii(t).join("・")}）`),
  "",
].join("\n");
writeFileSync(`${dir}pii-text-latest.md`, md2);
console.log(md2);
