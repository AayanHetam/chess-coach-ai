"use client";

import type { CSSProperties } from "react";
import { FONT_SANS, TEXT } from "@/theme/tokens";

/**
 * The activity indicator: a thin ring with a moving head, the platform's
 * own idiom, and a sentence-case caption. It replaces the tumbling 3D
 * bullseye with its glow. The ring is at most 44px whatever `size` says;
 * `size` sizes the box the ring is centred in, so callers that reserved a
 * big square keep their layout.
 *
 *   <Loader />                         // 260px box, "Loading" caption
 *   <Loader size={120} showLabel={false} />
 *   <Loader color="#F97316" label="Analyzing" />
 */

const KEYFRAMES = `
@keyframes cmSpin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .cm-loader-ring { animation-duration: 2.4s !important; } }
`;

export function Loader({
  size = 260,
  color = "#F97316",
  label = "Loading",
  showLabel = true,
}: {
  size?: number;
  color?: string;
  label?: string;
  showLabel?: boolean;
}) {
  const ring = Math.max(18, Math.min(44, Math.round(size / 3)));
  const border = Math.max(2, Math.round(ring / 12));
  const ringStyle: CSSProperties = {
    width: ring,
    height: ring,
    borderRadius: "50%",
    borderStyle: "solid",
    borderWidth: border,
    borderColor: hexA(color, 0.2),
    borderTopColor: color,
    animation: "cmSpin 0.9s linear infinite",
  };

  return (
    <div
      role="status"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        width: size,
        minHeight: ring + (showLabel ? 36 : 0),
      }}
    >
      <style>{KEYFRAMES}</style>
      <div className="cm-loader-ring" style={ringStyle} />
      {showLabel && (
        <span
          style={{
            fontSize: 13,
            lineHeight: 1.3,
            color: TEXT.secondary,
            fontFamily: FONT_SANS,
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

/** #RRGGBB + alpha -> rgba() string */
function hexA(hex: string, a: number) {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export default Loader;
