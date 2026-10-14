"use client";

import type { CSSProperties, ReactNode } from "react";
import { Masti } from "./Masti";
import type { MastiMood } from "./manifest";
import { LINE, SURFACE, TEXT, TYPE } from "@/theme/tokens";

export interface MastiSaysProps {
  mood: MastiMood;
  /** Figure width in px. */
  size?: number;
  /** Which side the figure stands on. The bubble's tail points at him. */
  side?: "left" | "right";
  /**
   * Historical: every tone is now the same solid surface (the bubble carries
   * no tint; Masti's mood carries the feeling). Kept so callers compile.
   */
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

// The one bubble: a nested block on whatever surface Masti stands on, a
// hairline, no blur, no shadow, no tone tint (design rules, recipe 16). The
// hero's white bubble is drawn by HeroMasti, not here.
const BUBBLE = {
  background: SURFACE.raisedSecondary,
  border: `1px solid ${LINE.hairline}`,
  color: TEXT.primary,
} as const;

const TONES: Record<NonNullable<MastiSaysProps["tone"]>, typeof BUBBLE> = {
  glass: BUBBLE,
  ember: BUBBLE,
  jade: BUBBLE,
  rose: BUBBLE,
};

/**
 * Masti with a speech bubble. The bubble is a plain box with a tail drawn
 * as a rotated square, all inline styles, so it renders identically on the
 * server and inside MUI-free pages. Without children only the figure
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
            fontSize: TYPE.body.fontSize,
            lineHeight: TYPE.body.lineHeight,
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
