"use client";

/** ミスモンの HP。色だけでなく、数字と読み上げでも伝える（U45-UX-2） */
export function HpBar({ hp, max }: { hp: number; max: number }) {
  const pct = max > 0 ? Math.round((hp / max) * 100) : 0;
  return (
    <div className="flex w-full flex-col gap-1">
      <div
        role="progressbar"
        aria-label="ミスモンの HP"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={hp}
        aria-valuetext={`HP ${hp} / ${max}`}
        className="h-4 w-full overflow-hidden rounded-full border border-line bg-surface"
      >
        <div
          className="h-full bg-danger transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-right text-sm font-bold" aria-hidden="true">
        HP {hp} / {max}
      </p>
    </div>
  );
}
