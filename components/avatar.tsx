import type { AvatarConfig } from "@/shared/schemas";

/** プリセットのアバター（写真は使わない・BR-1.7）。絵は仮のもの（OQ6） */
export const AVATAR_COLORS = [
  "#f97316",
  "#0ea5e9",
  "#22c55e",
  "#a855f7",
  "#ef4444",
  "#eab308",
] as const;
export const AVATAR_FACES = [
  "にこにこ",
  "きりっ",
  "ねむねむ",
  "びっくり",
] as const;
export const AVATAR_ACCESSORIES = [
  "なし",
  "ぼうし",
  "リボン",
  "めがね",
] as const;

function Face({ face }: { face: number }) {
  switch (face % AVATAR_FACES.length) {
    case 1:
      return (
        <>
          <path
            d="M30 42 l10 -3 M70 42 l-10 -3"
            stroke="#1f2937"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle cx="36" cy="48" r="4" fill="#1f2937" />
          <circle cx="64" cy="48" r="4" fill="#1f2937" />
          <path
            d="M40 66 h20"
            stroke="#1f2937"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </>
      );
    case 2:
      return (
        <>
          <path
            d="M30 48 q6 4 12 0 M58 48 q6 4 12 0"
            stroke="#1f2937"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M44 66 q6 3 12 0"
            stroke="#1f2937"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
    case 3:
      return (
        <>
          <circle cx="36" cy="46" r="6" fill="#1f2937" />
          <circle cx="64" cy="46" r="6" fill="#1f2937" />
          <circle cx="50" cy="68" r="6" fill="#1f2937" />
        </>
      );
    default:
      return (
        <>
          <circle cx="36" cy="46" r="5" fill="#1f2937" />
          <circle cx="64" cy="46" r="5" fill="#1f2937" />
          <path
            d="M36 62 q14 12 28 0"
            stroke="#1f2937"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
  }
}

function Accessory({ accessory }: { accessory: number }) {
  switch (accessory % AVATAR_ACCESSORIES.length) {
    case 1:
      return <path d="M18 28 q32 -28 64 0 z" fill="#1e3a8a" />;
    case 2:
      return (
        <path d="M66 14 l14 -8 v18 z M66 14 l-14 -8 v18 z" fill="#db2777" />
      );
    case 3:
      return (
        <g stroke="#1f2937" strokeWidth="3" fill="none">
          <circle cx="36" cy="46" r="10" />
          <circle cx="64" cy="46" r="10" />
          <path d="M46 46 h8" />
        </g>
      );
    default:
      return null;
  }
}

export function Avatar({
  config,
  size = 64,
  label,
}: {
  config: AvatarConfig;
  size?: number;
  label?: string;
}) {
  const color = AVATAR_COLORS[config.color % AVATAR_COLORS.length];
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="50" cy="52" r="42" fill={color} />
      <circle cx="50" cy="52" r="34" fill="#fde7d4" />
      <Face face={config.face} />
      <Accessory accessory={config.accessory} />
    </svg>
  );
}
