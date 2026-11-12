/**
 * R1 の測定ページで使う、印の検知と見本の画像（ブラウザ用にまとめる）。
 * Web Worker の中で動かす。写真は端末の外に出さない。
 */
import { detectMarks } from "../redmarks";
import { makeSheet, VARIANTS } from "../synthetic";

const g = globalThis as unknown as {
  R1: unknown;
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (m: unknown) => void;
};
g.R1 = { detectMarks, makeSheet, VARIANTS };

// Worker として読み込まれたとき：画像を受け取り、印を見つけて返す
if (typeof (globalThis as { document?: unknown }).document === "undefined") {
  g.onmessage = (e: MessageEvent) => {
    const msg = e.data as
      | {
          type: "detect";
          id: string;
          width: number;
          height: number;
          buffer: ArrayBuffer;
        }
      | { type: "sample"; id: string; seed: number; variant: number };
    if (msg.type === "sample") {
      const v = VARIANTS[msg.variant % VARIANTS.length];
      const { image, truth } = makeSheet(msg.seed, v);
      const buffer = image.data.buffer as ArrayBuffer;
      (g.postMessage as (m: unknown, t: Transferable[]) => void)(
        {
          id: msg.id,
          buffer,
          width: image.width,
          height: image.height,
          truth,
          label: v.label,
        },
        [buffer],
      );
      return;
    }
    const t0 = performance.now();
    const r = detectMarks({
      width: msg.width,
      height: msg.height,
      data: new Uint8ClampedArray(msg.buffer),
    });
    g.postMessage({ id: msg.id, result: r, ms: performance.now() - t0 });
  };
}
