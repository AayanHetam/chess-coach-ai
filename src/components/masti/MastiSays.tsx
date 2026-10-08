"use client";

import type { CSSProperties, ReactNode } from "react";
import { Masti } from "./Masti";
import type { MastiMood } from "./manifest";

export interface MastiSaysProps {
  mood: MastiMood;
  /** Figure width in px. */
  size?: number;
  /** Which side the figure stands on. The bubble's tail points at him. */
  side?: "left" | "right";
  /** Bubble surface: glass on dark chrome, ember for a celebration. */
  tone?: "glass" | "ember" | "jade" | "rose";
  children?: ReactNode;
  animated?: boolean;
  loops?: number;
  replayKey?: string | number;
  replayOnHover?: boolean;
  priority?: boolean;
  maxWidth?: number | string;
  /** Vertical alignment of figure and bubble. */
  align?: "flex-end" | "center" | "flex-start";
  style?: CSSProperties;
  className?: string;
  "data-testid"?: string;
}

const TONES: Record<
  NonNullable<MastiSaysProps["tone"]>,
  { background: string; border: string; color: string }
> = {
  glass: {
    background: "rgba(20,22,28,0.72)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.92)",
  },
  ember: {
    background: "rgba(249,115,22,0.14)",
    border: "1px solid rgba(249,115,22,0.38)",
    color: "rgba(255,240,224,0.95)",
  },
  jade: {
    background: "rgba(52,211,153,0.12)",
    border: "1px solid rgba(52,211,153,0.36)",
    color: "rgba(236,253,245,0.95)",
  },
  rose: {
    background: "rgba(251,113,133,0.12)",
    border: "1px solid rgba(251,113,133,0.36)",
    color: "rgba(255,241,242,0.95)",
  },
};

/**
 * Masti with a speech bubble. The bubble is a plain glass box with a tail
 * drawn as a rotated square, all inline styles, so it renders identically on
 * the server and inside MUI-free pages. Without children only the figure
 * renders, which is what the `thinking` mood wants: a chin-stroking Masti
 * says "give me a minute" on his own.
 */
export function MastiSays({
  mood,
  size = 96,
  side = "left",
  tone = "glass",
  children,
  animated,
  loops,
  replayKey,
  replayOnHover,
  priority,
  maxWidth = 380,
  align = "flex-end",
  style,
  className,
  "data-testid": testId,
}: MastiSaysProps) {
  const t = TONES[tone];
  const hasBubble =
    children !== undefined && children !== null && children !== false;
  const tailSize = 12;
  return (
    <div
      className={className}
      data-testid={testId}
      data-masti-says={mood}
      style={{
        display: "flex",
        flexDirection: side === "left" ? "row" : "row-reverse",
        alignItems: align,
        gap: 12,
        ...style,
      }}
    >
      <Masti
        mood={mood}
        size={size}
        animated={animated}
        loops={loops}
        replayKey={replayKey}
        replayOnHover={replayOnHover}
        priority={priority}
      />
      {hasBubble && (
        <div
          role="note"
          style={{
            position: "relative",
            maxWidth,
            padding: "12px 15px",
            borderRadius: 16,
            background: t.background,
            border: t.border,
            color: t.color,
            backdropFilter: "blur(12px) saturate(140%)",
            WebkitBackdropFilter: "blur(12px) saturate(140%)",
            boxShadow: "0 8px 28px rgba(0,0,0,0.32)",
            fontSize: "0.94rem",
            lineHeight: 1.5,
            marginBottom: align === "flex-end" ? Math.round(size * 0.18) : 0,
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute",
              bottom: 16,
              [side === "left" ? "left" : "right"]: -tailSize / 2 - 1,
              width: tailSize,
              height: tailSize,
              background: t.background,
              borderLeft: side === "left" ? t.border : undefined,
              borderBottom: side === "left" ? t.border : undefined,
              borderRight: side === "right" ? t.border : undefined,
              borderTop: side === "right" ? t.border : undefined,
              transform: "rotate(45deg)",
            }}
          />
          {children}
        </div>
      )}
    </div>
  );
}

export default MastiSays;
