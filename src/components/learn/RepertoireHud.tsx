"use client";

import { Box, Typography } from "@mui/material";
import { Lock } from "lucide-react";
import type { Band } from "@/lib/repertoire/levels";
import { rankFor } from "@/lib/repertoire/rank";
import { ProgressRing } from "./ProgressRing";
import { EMBER, FOCUS, GOLD, GOOD } from "./tokens";

export type Side = "white" | "black";

export interface SideStat {
  /** Coverage, 0-1. */
  done: number;
  enough: boolean;
  locked: boolean;
  picks: number;
}

export interface RepertoireHudProps {
  side: Side;
  onChange: (side: Side) => void;
  stats: Record<Side, SideStat>;
  band: Band;
}

const cap = (s: Side) => (s === "white" ? "White" : "Black");

/**
 * Both colours at a glance, and the switch between them.
 *
 * The old page had a pill toggle and one coverage card for whichever colour
 * was showing, so half of a repertoire was always off screen. Here each colour
 * is a ring with its own number and rank, and tapping one is how you switch:
 * the tab IS the scoreboard. The rings are decorative (the number is printed
 * inside them and the meter below carries the accessible label), which is why
 * they can animate freely.
 */
export function RepertoireHud({ side, onChange, stats, band }: RepertoireHudProps) {
  return (
    <Box
      role="tablist"
      aria-label="Repertoire colour"
      data-testid="repertoire-hud"
      sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 2.5 }}
    >
      {(["white", "black"] as const).map((option) => {
        const s = stats[option];
        const active = side === option;
        const done = s.locked || s.enough;
        const colour = done ? GOOD : GOLD.base;
        const pct = Math.round(s.done * 100);
        return (
          <Box
            key={option}
            component="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option)}
            data-testid={`hud-${option}`}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              minHeight: 72,
              px: { xs: 1.25, md: 1.75 },
              py: 1,
              borderRadius: "1.25rem",
              cursor: "pointer",
              textAlign: "left",
              color: "inherit",
              border: `1px solid ${active ? (done ? "rgba(134,239,172,0.45)" : GOLD.border) : "rgba(255,255,255,0.08)"}`,
              background: active
                ? `radial-gradient(120% 80% at 50% 0%, ${done ? "rgba(134,239,172,0.10)" : GOLD.tint}, transparent 70%), rgba(255,255,255,0.03)`
                : "rgba(255,255,255,0.015)",
              boxShadow: active ? (done ? "0 20px 48px -28px rgba(134,239,172,0.45)" : GOLD.glow) : "none",
              transition: "border-color 180ms ease, background 180ms ease, transform 180ms ease",
              "&:hover": { borderColor: done ? GOOD : "rgba(249,115,22,0.5)", transform: "translateY(-1px)" },
              "@media (prefers-reduced-motion: reduce)": { transition: "none", "&:hover": { transform: "none" } },
              ...FOCUS,
            }}
          >
            <ProgressRing value={s.done} size={52} stroke={5} colour={colour}>
              {s.locked ? (
                <Lock size={16} color={GOOD} aria-hidden />
              ) : (
                <Typography
                  component="span"
                  sx={{ fontSize: "0.74rem", fontWeight: 800, color: active ? "#fff" : "rgba(255,255,255,0.7)", fontVariantNumeric: "tabular-nums" }}
                >
                  {pct}%
                </Typography>
              )}
            </ProgressRing>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ color: active ? "#fff" : "rgba(255,255,255,0.7)", fontWeight: 700, fontSize: "0.92rem", lineHeight: 1.2 }}>
                As {cap(option)}
              </Typography>
              <Typography sx={{ fontSize: "0.72rem", color: s.locked ? GOOD : active ? EMBER : "rgba(255,255,255,0.45)", mt: 0.25, lineHeight: 1.25 }}>
                {s.locked ? "Locked" : rankFor(s.done, band).name}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

export default RepertoireHud;
