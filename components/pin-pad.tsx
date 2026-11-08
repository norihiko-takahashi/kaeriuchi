"use client";

import { useId } from "react";

/** PIN の入力。保護者は6桁、子どもは4桁 */
export function PinPad({
  length,
  value,
  onChange,
  label,
  disabled,
  describedBy,
}: {
  length: number;
  value: string;
  onChange: (v: string) => void;
  label: string;
  disabled?: boolean;
  describedBy?: string;
}) {
  const id = useId();
  const press = (d: string) => {
    if (value.length < length) onChange(value + d);
  };
  return (
    <div className="flex flex-col items-center gap-4">
      <label htmlFor={id} className="font-bold">
        {label}
      </label>
      <input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]*"
        maxLength={length}
        value={value}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(e) =>
          onChange(e.target.value.replace(/\D/g, "").slice(0, length))
        }
        className="tap w-48 rounded-[var(--radius)] border border-line bg-surface text-center text-2xl tracking-[0.5em]"
      />
      <div className="grid grid-cols-3 gap-2" aria-hidden="true">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k) =>
          k === "" ? (
            <span key="blank" />
          ) : (
            <button
              key={k}
              type="button"
              tabIndex={-1}
              disabled={disabled}
              onClick={() =>
                k === "⌫" ? onChange(value.slice(0, -1)) : press(k)
              }
              className="tap h-14 w-16 rounded-[var(--radius)] border border-line bg-surface text-xl font-bold"
            >
              {k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
