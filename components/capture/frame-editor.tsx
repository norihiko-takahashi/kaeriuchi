"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Photo } from "@/client/capture/photo";
import type { Stroke } from "@/client/capture/redact";
import {
  describePosition,
  type Frame,
  frameAt,
  growRect,
  type Handle,
  handleAt,
  moveRect,
  type Rect,
  rectFromPoints,
  resizeRect,
  sortFrames,
} from "@/domain/capture/geometry";

/**
 * 写真と枠（U3、nfr-design.md §3）。
 * - 1本の指：何もないところをなぞると新しい枠、枠の中なら動かす、角なら大きさを変える（かくすペンのときは塗る）
 * - 2本の指：写真を大きくする・動かす（最大 4倍）
 * - キーボード：枠は button。矢印で動かす、Shift＋矢印で大きさ、Delete で消す
 * 写真のキャンバスはそのまま画面に置く（複製を作らない・U3-MEM-1）
 */

export type EditorMode = "frame" | "pen";

const MAX_ZOOM = 4;
/** 角の取っ手の半径（画面の px） */
const HANDLE_PX = 22;

type Gesture =
  | { kind: "draw"; start: Point; now: Point }
  | { kind: "move"; id: string; last: Point }
  | { kind: "resize"; id: string; handle: Handle; last: Point }
  | { kind: "pen"; stroke: Stroke }
  | {
      kind: "pinch";
      d0: number;
      mid0: Point;
      view0: View;
    };

interface Point {
  x: number;
  y: number;
}
interface View {
  scale: number;
  tx: number;
  ty: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi);
const pct = (v: number, of: number) => `${(v / of) * 100}%`;

export function FrameEditor({
  photo,
  mode,
  frames,
  onFrames,
  selectedId,
  onSelect,
  strokes,
  onStrokes,
  penWidth,
  canAdd,
  newId,
}: {
  photo: Photo;
  mode: EditorMode;
  frames: Frame[];
  onFrames: (f: Frame[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  strokes: Stroke[];
  onStrokes: (s: Stroke[]) => void;
  /** かくすペンの太さ（写真の画素） */
  penWidth: number;
  canAdd: boolean;
  newId: () => string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });

  // 写真のキャンバスを、そのまま画面に置く
  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const c = photo.canvas;
    c.style.width = "100%";
    c.style.height = "100%";
    c.style.display = "block";
    c.setAttribute("aria-hidden", "true");
    el.appendChild(c);
    return () => {
      if (c.parentElement === el) el.removeChild(c);
    };
  }, [photo]);

  const size = { width: photo.width, height: photo.height };

  /** 画面の位置 → 写真の画素（拡大も含めて） */
  const toPhoto = (clientX: number, clientY: number): Point => {
    const r = inner.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: ((clientX - r.left) / r.width) * photo.width,
      y: ((clientY - r.top) / r.height) * photo.height,
    };
  };
  const pxToPhoto = () => {
    const r = inner.current?.getBoundingClientRect();
    return r ? photo.width / r.width : 1;
  };

  const clampView = (v: View): View => {
    const w = outer.current?.clientWidth ?? 0;
    const h = outer.current?.clientHeight ?? 0;
    const scale = clamp(v.scale, 1, MAX_ZOOM);
    return {
      scale,
      tx: clamp(v.tx, w * (1 - scale), 0),
      ty: clamp(v.ty, h * (1 - scale), 0),
    };
  };

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    const box = outer.current?.getBoundingClientRect();
    if (!a || !b || !box) return;
    setGesture({
      kind: "pinch",
      d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid0: { x: (a.x + b.x) / 2 - box.left, y: (a.y + b.y) / 2 - box.top },
      view0: view,
    });
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) return startPinch();
    if (pointers.current.size > 2) return;
    const p = toPhoto(e.clientX, e.clientY);
    if (mode === "pen") {
      setGesture({ kind: "pen", stroke: { points: [p], width: penWidth } });
      return;
    }
    const selected = frames.find((f) => f.id === selectedId);
    const handle = selected
      ? handleAt(selected, p, HANDLE_PX * pxToPhoto())
      : null;
    if (selected && handle) {
      setGesture({ kind: "resize", id: selected.id, handle, last: p });
      return;
    }
    const hit = frameAt(frames, p);
    if (hit) {
      onSelect(hit.id);
      setGesture({ kind: "move", id: hit.id, last: p });
      return;
    }
    onSelect(null);
    if (canAdd) setGesture({ kind: "draw", start: p, now: p });
  };

  const updateFrame = (id: string, f: (r: Rect) => Rect) =>
    onFrames(frames.map((x) => (x.id === id ? { ...x, ...f(x) } : x)));

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;
    if (gesture.kind === "pinch") {
      const [a, b] = [...pointers.current.values()];
      const box = outer.current?.getBoundingClientRect();
      if (!a || !b || !box) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = {
        x: (a.x + b.x) / 2 - box.left,
        y: (a.y + b.y) / 2 - box.top,
      };
      const { view0, mid0 } = gesture;
      const scale = clamp((view0.scale * d) / gesture.d0, 1, MAX_ZOOM);
      // 指の真ん中にあった点が、指の真ん中に残るように
      const cx = (mid0.x - view0.tx) / view0.scale;
      const cy = (mid0.y - view0.ty) / view0.scale;
      setView(
        clampView({ scale, tx: mid.x - cx * scale, ty: mid.y - cy * scale }),
      );
      return;
    }
    const p = toPhoto(e.clientX, e.clientY);
    if (gesture.kind === "draw") setGesture({ ...gesture, now: p });
    else if (gesture.kind === "pen")
      setGesture({
        kind: "pen",
        stroke: { ...gesture.stroke, points: [...gesture.stroke.points, p] },
      });
    else if (gesture.kind === "move") {
      updateFrame(gesture.id, (r) =>
        moveRect(r, p.x - gesture.last.x, p.y - gesture.last.y, size),
      );
      setGesture({ ...gesture, last: p });
    } else if (gesture.kind === "resize") {
      updateFrame(gesture.id, (r) =>
        resizeRect(
          r,
          gesture.handle,
          p.x - gesture.last.x,
          p.y - gesture.last.y,
          size,
        ),
      );
      setGesture({ ...gesture, last: p });
    }
  };

  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (!gesture) return;
    if (gesture.kind === "pinch") {
      // 2本の指のあとは、残った指で何も始めない
      if (pointers.current.size === 0) setGesture(null);
      return;
    }
    if (gesture.kind === "draw") {
      const r = rectFromPoints(gesture.start, gesture.now, size);
      // タップしただけ（ほとんど動かしていない）なら作らない
      if (Math.max(r.w, r.h) > 8 * pxToPhoto()) {
        const f = { id: newId(), ...r };
        onFrames([...frames, f]);
        onSelect(f.id);
      }
    } else if (gesture.kind === "pen") {
      onStrokes([...strokes, gesture.stroke]);
    }
    setGesture(null);
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, f: Frame) => {
    const step = Math.max(
      1,
      Math.round(Math.min(photo.width, photo.height) * 0.01),
    );
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onFrames(frames.filter((x) => x.id !== f.id));
      onSelect(null);
      return;
    }
    const v = d[e.key];
    if (!v) return;
    e.preventDefault();
    onSelect(f.id);
    updateFrame(f.id, (r) =>
      e.shiftKey
        ? growRect(r, v[0], v[1], size)
        : moveRect(r, v[0], v[1], size),
    );
  };

  const order = new Map(sortFrames(frames).map((f, i) => [f.id, i]));
  const draft =
    gesture?.kind === "draw"
      ? rectFromPoints(gesture.start, gesture.now, size)
      : null;
  const liveStrokes =
    gesture?.kind === "pen" ? [...strokes, gesture.stroke] : strokes;

  return (
    <div
      ref={outer}
      className="relative w-full touch-none overflow-hidden rounded-[var(--radius)] border border-line bg-[#111] select-none"
      style={{
        aspectRatio: `${photo.width} / ${photo.height}`,
        maxHeight: "70dvh",
      }}
    >
      <div
        ref={inner}
        data-testid="frame-editor"
        className="absolute inset-0 origin-top-left"
        style={{
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          cursor: mode === "pen" ? "crosshair" : "default",
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div ref={holder} className="absolute inset-0" />
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${photo.width} ${photo.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {liveStrokes.map((s, i) => (
            <polyline
              // biome-ignore lint/suspicious/noArrayIndexKey: 線は足すか最後を消すだけ
              key={i}
              points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#000"
              strokeWidth={s.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
        {frames.map((f) => {
          // 番号は確認の順番（上の段から、段の中は左から）
          const i = order.get(f.id) ?? 0;
          const selected = f.id === selectedId;
          return (
            <button
              key={f.id}
              type="button"
              tabIndex={mode === "frame" ? 0 : -1}
              aria-label={`${i + 1}ばんの わく（${describePosition(f, size)}）${selected ? "・えらんでいる" : ""}`}
              aria-pressed={selected}
              onFocus={() => mode === "frame" && onSelect(f.id)}
              onKeyDown={(e) => onKey(e, f)}
              className="absolute box-border rounded-md"
              style={{
                left: pct(f.x, photo.width),
                top: pct(f.y, photo.height),
                width: pct(f.w, photo.width),
                height: pct(f.h, photo.height),
                border: `${selected ? 4 : 3}px solid ${selected ? "#facc15" : "#22d3ee"}`,
                background: "rgba(34, 211, 238, 0.12)",
                pointerEvents: "none",
              }}
            >
              <span className="absolute -top-0.5 -left-0.5 rounded-br-md bg-[#0e7490] px-1.5 text-sm font-bold text-white">
                {i + 1}
              </span>
              {selected && mode === "frame"
                ? (["nw", "ne", "sw", "se"] as const).map((h) => (
                    <span
                      key={h}
                      aria-hidden="true"
                      className="absolute h-4 w-4 rounded-full border-2 border-white bg-[#facc15]"
                      style={{
                        left: h.endsWith("w") ? -8 : undefined,
                        right: h.endsWith("e") ? -8 : undefined,
                        top: h.startsWith("n") ? -8 : undefined,
                        bottom: h.startsWith("s") ? -8 : undefined,
                      }}
                    />
                  ))
                : null}
            </button>
          );
        })}
        {draft ? (
          <div
            aria-hidden="true"
            className="absolute box-border rounded-md border-[3px] border-dashed border-[#22d3ee]"
            style={{
              left: pct(draft.x, photo.width),
              top: pct(draft.y, photo.height),
              width: pct(draft.w, photo.width),
              height: pct(draft.h, photo.height),
            }}
          />
        ) : null}
      </div>
      {view.scale > 1 ? (
        <button
          type="button"
          onClick={() => setView({ scale: 1, tx: 0, ty: 0 })}
          className="absolute right-2 bottom-2 rounded-full bg-surface px-3 py-1 text-sm font-bold shadow"
        >
          もとの おおきさ
        </button>
      ) : null}
    </div>
  );
}
