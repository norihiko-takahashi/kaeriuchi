/**
 * かくすペン（FR-2.5c）。線は縮めた写真の座標で持つ。
 * 送るときに、切り抜く画像の上に黒で描いてから JPEG にする（塗る前の画素は送らない・U3-PRIV-2）。
 */

export interface Stroke {
  points: { x: number; y: number }[];
  /** 線の太さ（写真の画素） */
  width: number;
}

export const PEN_COLOR = "#000000";

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.save();
  ctx.strokeStyle = PEN_COLOR;
  ctx.fillStyle = PEN_COLOR;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    const [first, ...rest] = s.points;
    if (!first) continue;
    ctx.lineWidth = s.width;
    if (rest.length === 0) {
      ctx.beginPath();
      ctx.arc(first.x, first.y, s.width / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (const p of rest) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  ctx.restore();
}
