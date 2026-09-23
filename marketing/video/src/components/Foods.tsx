// Soft flat-vector food illustrations for the floating background layer.
// Each is drawn in a 100x100 box; colour is fixed (pastel) and the layer
// controls opacity/blur so they read as decoration, not content.
import type { CSSProperties } from "react";

type P = { size: number; style?: CSSProperties };
const box = (size: number, style?: CSSProperties) => ({
  width: size,
  height: size,
  viewBox: "0 0 100 100",
  style: { display: "block", ...style } as CSSProperties,
});

export const Banana = ({ size, style }: P) => (
  <svg {...box(size, style)}>
    <path
      d="M18 30c6 30 30 50 60 48 6 0 8 6 2 9-38 12-72-18-72-56 0-5 8-6 10-1z"
      fill="#F6D35B"
    />
    <path d="M18 30c8 26 30 44 58 44-30 4-56-16-66-42 2-4 6-4 8-2z" fill="#E7B93A" opacity={0.8} />
    <path d="M13 26c-3-5-1-9 3-9l5 9c-3 2-6 2-8 0z" fill="#8A6A2E" />
  </svg>
);

export const Apple = ({ size, style }: P) => (
  <svg {...box(size, style)}>
    <path
      d="M50 32c10-8 26-6 32 6 8 16 0 40-14 50-6 4-12 2-18 0-6 2-12 4-18 0C18 78 10 54 18 38c6-12 22-14 32-6z"
      fill="#E5654E"
    />
    <path d="M50 30c0-8 4-14 10-18" stroke="#7A4A2A" strokeWidth={5} strokeLinecap="round" fill="none" />
    <path d="M56 22c8-6 16-4 20 2-8 4-16 4-20-2z" fill="#8FA073" />
    <ellipse cx={34} cy={52} rx={6} ry={10} fill="#FFFFFF" opacity={0.35} />
  </svg>
);

export const Carrot = ({ size, style }: P) => (
  <svg {...box(size, style)}>
    <path d="M30 40l48 40c4 4 0 10-6 8L22 62c-8-6-2-26 8-22z" fill="#EF8A3C" />
    <path d="M40 52l20 16M48 46l16 12" stroke="#D8702A" strokeWidth={4} strokeLinecap="round" />
    <path d="M32 40c-4-10-2-18 4-24 2 8 6 12 10 14-4-10 0-18 8-22 0 10 4 14 8 16-10 8-20 14-30 16z" fill="#8FA073" />
  </svg>
);

export const Egg = ({ size, style }: P) => (
  <svg {...box(size, style)}>
    <path d="M50 12c18 0 30 26 30 46s-12 30-30 30-30-10-30-30 12-46 30-46z" fill="#FFF6E5" />
    <path d="M50 12c18 0 30 26 30 46-8-16-20-22-32-20 4-10 4-18 2-26z" fill="#F3E4C8" opacity={0.7} />
  </svg>
);

export const Milk = ({ size, style }: P) => (
  <svg {...box(size, style)}>
    <path d="M30 22h40l6 66c0 4-4 6-8 6H32c-4 0-8-2-8-6z" fill="#EAF2FA" />
    <path d="M27 50h46l3 38c0 4-4 6-8 6H32c-4 0-8-2-8-6z" fill="#FFFFFF" />
    <rect x={28} y={14} width={44} height={10} rx={4} fill="#DCE6F0" />
  </svg>
);

export const Roti = ({ size, style }: P) => (
  <svg {...box(size, style)}>
    <circle cx={50} cy={50} r={36} fill="#EDD3A5" />
    <circle cx={50} cy={50} r={30} fill="#F3DFB8" />
    <circle cx={38} cy={42} r={4} fill="#D9B37A" />
    <circle cx={60} cy={56} r={5} fill="#D9B37A" />
    <circle cx={48} cy={64} r={3} fill="#D9B37A" />
    <circle cx={62} cy={38} r={3} fill="#D9B37A" />
  </svg>
);

export const Broccoli = ({ size, style }: P) => (
  <svg {...box(size, style)}>
    <rect x={44} y={56} width={12} height={30} rx={5} fill="#BFD39A" />
    <circle cx={50} cy={40} r={20} fill="#7FA562" />
    <circle cx={30} cy={48} r={14} fill="#8FB56E" />
    <circle cx={70} cy={48} r={14} fill="#8FB56E" />
    <circle cx={40} cy={30} r={11} fill="#9CC17A" />
    <circle cx={62} cy={30} r={11} fill="#9CC17A" />
  </svg>
);

export const Orange = ({ size, style }: P) => (
  <svg {...box(size, style)}>
    <circle cx={50} cy={50} r={38} fill="#F6A83A" />
    <circle cx={50} cy={50} r={31} fill="#FFD68A" />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
      <path
        key={a}
        d="M50 50 L50 22 A28 28 0 0 1 69.8 30.2 Z"
        fill="#F9B84E"
        transform={`rotate(${a} 50 50) scale(0.92) translate(4 4)`}
      />
    ))}
  </svg>
);

export const Idli = ({ size, style }: P) => (
  <svg {...box(size, style)}>
    <ellipse cx={50} cy={58} rx={36} ry={16} fill="#E8E1D2" />
    <ellipse cx={50} cy={48} rx={36} ry={20} fill="#FBF7EE" />
    <ellipse cx={40} cy={44} rx={12} ry={6} fill="#FFFFFF" opacity={0.7} />
  </svg>
);

export const FOODS = [Banana, Apple, Carrot, Egg, Milk, Roti, Broccoli, Orange, Idli];
