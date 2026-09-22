"use client";

import type { CSSProperties } from "react";
import { Masti } from "./Masti";
import { MASTI_ASPECT, MASTI_FACE, type MastiMood } from "./manifest";

export interface MastiAvatarProps {
  mood: MastiMood;
  /** Diameter in px. */
  size?: number;
  /** Play the animation inside the circle (bursts only; avatars should rest). */
  animated?: boolean;
  loops?: number;
  replayKey?: string | number;
  /** Ember ring and glow, the coach-identity treatment. */
  ring?: boolean;
  label?: string;
  decorative?: boolean;
  style?: CSSProperties;
  className?: string;
  "data-testid"?: string;
}

/**
 * Masti's face in a circle: the chat avatar, the coach-panel identity, the
 * tiny glyph next to a verdict. It crops the full-body still through a round
 * window using the per-mood focal points in the manifest, so the face is
 * centred whatever the pose. Still by default; pass `animated` for a short
 * burst (a solve, a blunder) and `replayKey` to play it again.
 */
export function MastiAvatar({
  mood,
  size = 36,
  animated = false,
  loops = 2,
  replayKey,
  ring = true,
  label,
  decorative = true,
  style,
  className,
  "data-testid": testId,
}: MastiAvatarProps) {
  const face = MASTI_FACE[mood];
  const figureWidth = Math.round(size * face.scale);
  const figureHeight = Math.round(figureWidth / MASTI_ASPECT);
  return (
    <span
      className={className}
      data-testid={testId}
      data-masti-avatar={mood}
      style={{
        position: "relative",
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        lineHeight: 0,
        background:
          "radial-gradient(circle at 50% 35%, rgba(249,115,22,0.28) 0%, rgba(20,22,28,0.9) 72%)",
        boxShadow: ring
          ? "0 0 0 1px rgba(249,115,22,0.42), 0 0 18px rgba(249,115,22,0.28)"
          : undefined,
        ...style,
      }}
    >
      <Masti
        mood={mood}
        size={figureWidth}
        animated={animated}
        loops={loops}
        replayKey={replayKey}
        label={label}
        decorative={decorative}
        variant="sm"
        style={{
          position: "absolute",
          left: Math.round(size / 2 - face.x * figureWidth),
          top: Math.round(size / 2 - face.y * figureHeight),
        }}
      />
    </span>
  );
}

export default MastiAvatar;
