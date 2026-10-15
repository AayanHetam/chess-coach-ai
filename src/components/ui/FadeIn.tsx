"use client";

import type { CSSProperties, ReactNode } from "react";

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  durationMs?: number;
  style?: CSSProperties;
}

/**
 * A short cross-fade for content that arrives (a new chat message). Opacity
 * only (the keyframes are in the theme's global CSS): nothing slides into
 * place, and reduced-motion visitors get the baseline's near-zero durations.
 */
export function FadeIn({
  children,
  delay = 0,
  durationMs = 180,
  style,
}: FadeInProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        animation: `cmFadeIn ${durationMs}ms ease-out ${delay}s both`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
