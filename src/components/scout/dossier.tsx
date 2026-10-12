// ─────────────────────────────────────────────────────────────────────────────
// Dossier — the visual language for /scout.
//
// The scout report is a field dossier on a player, and every primitive here
// leans into that: small field labels, instrument-style segmented meters
// instead of dial gauges, and one panel shell so a ten-panel page still reads
// as a single document rather than ten unrelated cards.
//
// The panels are flat: a raised surface, a hairline, no glass, no glow. See
// docs/design/DESIGN_RULES.md.
//
// Deliberately NOT here: circular progress rings and arc gauges. Those are the
// generic stats-site vocabulary; the meters below are the house form.
// ─────────────────────────────────────────────────────────────────────────────

import { Box, Stack, Typography } from "@mui/material";
import { Icon } from "@iconify/react";
import type { ReactNode } from "react";
import { ACCENTS, type Accent } from "@/components/ui/accents";
import {
  ACCENT,
  FONT_MONO,
  LINE,
  MOTION,
  RADIUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

// Ember is the one accent: the primary action ("play this" pointers) and the
// middle band of the exploitability heat scale below.
export const EMBER = ACCENT.main;
export const EMBER_LIGHT = ACCENT.hover;

// Rose is Scout's category colour, the same rose /plan's "Your weakest line"
// card wears. It marks found weaknesses as a quiet tint on a tag or as an icon
// colour; never a border glow, a gradient or a fill.
export const ROSE: Accent = ACCENTS.rose;

/** Semantic scale for "how good is this number for the SUBJECT" (higher = better). */
export function strengthColor(v: number): string {
  if (v >= 75) return "#34d399";
  if (v >= 60) return "#a3e635";
  if (v >= 45) return "#fbbf24";
  return "#f87171";
}

/** Semantic scale for "how exploitable is this" (higher = better FOR YOU). */
export function tellColor(v: number): string {
  if (v >= 70) return "#f87171";
  if (v >= 50) return EMBER_LIGHT;
  if (v >= 35) return "#fbbf24";
  return "#34d399";
}

export const MONO = FONT_MONO;

// ─── Field label ────────────────────────────────────────────────────────────

/**
 * The small label that heads every field in the dossier. Used for section
 * names, column heads, and stat captions. Sentence case, in the platform font,
 * at `TYPE.label` (13px, 600).
 */
export function FieldLabel({
  children,
  color = TEXT.secondary,
  size,
}: {
  children: ReactNode;
  color?: string;
  /**
   * A caller's size hint. Fine print is never smaller than 12px, so the hint
   * is floored there; leave it out for the 13px label.
   */
  size?: string;
}) {
  return (
    <Typography
      component="span"
      sx={{
        ...TYPE.label,
        fontSize: size ? `max(${size}, 0.75rem)` : TYPE.label.fontSize,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Typography>
  );
}

// ─── Panel shell ────────────────────────────────────────────────────────────

export interface DossierPanelProps {
  /** Section label rendered in the header rail, e.g. "Tells". */
  label?: string;
  /** Right-aligned slot in the header rail — a count, a verdict pill, an action. */
  action?: ReactNode;
  /** Lifts the two hero panels: a stronger hairline and a primary-text label. */
  emphasis?: boolean;
  children: ReactNode;
  /** Applied to the outer panel. */
  sx?: Record<string, unknown>;
}

/**
 * The one panel shell every /scout surface uses.
 *
 * Structure is a header rail (label + action slot, separated by a hairline)
 * over the body. The rail is what gives the page its spine — panels line up on
 * a shared left edge and a shared type scale, so scanning down the page you read
 * a document, not a feed.
 */
export function DossierPanel({
  label,
  action,
  emphasis = false,
  children,
  sx = {},
}: DossierPanelProps) {
  return (
    <Box
      sx={{
        position: "relative",
        height: "100%",
        width: "100%",
        borderRadius: `${RADIUS.card}px`,
        border: `1px solid ${emphasis ? LINE.strong : LINE.hairline}`,
        background: SURFACE.raised,
        overflow: "hidden",
        // Column layout so the body can claim the leftover height when the
        // panel is stretched by a taller sibling in a grid row. Without this,
        // a short panel leaves a dead void under its content.
        display: "flex",
        flexDirection: "column",
        ...sx,
      }}
    >
      {(label || action) && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            px: 2.5,
            py: 1.25,
            gap: 1.5,
            borderBottom: `1px solid ${LINE.hairline}`,
          }}
        >
          {label ? (
            <Box sx={{ minWidth: 0 }}>
              <FieldLabel color={emphasis ? TEXT.primary : TEXT.secondary}>
                {label}
              </FieldLabel>
            </Box>
          ) : (
            <Box />
          )}
          {action}
        </Stack>
      )}

      <Box
        sx={{
          px: 2.5,
          py: 2.25,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

// ─── Segmented meter ────────────────────────────────────────────────────────

/**
 * The house meter: a row of discrete segments that fill left-to-right.
 *
 * Discrete beats continuous here — you can count "14 of 20 lit" at a glance,
 * which a smooth bar or a dial never gives you, and four of these stacked
 * compare cleanly by eye because the tick positions align.
 */
export function SegmentedMeter({
  value,
  color,
  segments = 20,
  height = 14,
  gap = 2,
}: {
  value: number;
  color: string;
  segments?: number;
  height?: number;
  gap?: number;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const lit = Math.round((clamped / 100) * segments);

  return (
    <Box
      sx={{
        display: "flex",
        gap: `${gap}px`,
        alignItems: "stretch",
        width: "100%",
      }}
      role="meter"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {Array.from({ length: segments }, (_, i) => (
        <Box
          key={i}
          sx={{
            flex: 1,
            height,
            borderRadius: "1px",
            bgcolor: i < lit ? color : LINE.hairline,
            transition: `background-color ${MOTION.hover}`,
          }}
        />
      ))}
    </Box>
  );
}

/**
 * A labelled meter row: label on the left, meter in the middle, value on the
 * right. The three columns are fixed-width so rows stack into clean vertical
 * rules.
 */
export function MeterRow({
  label,
  value,
  color,
  highlight = false,
  labelWidth = 92,
}: {
  label: string;
  value: number;
  color: string;
  /**
   * Marks this row as the one to act on. Rendered inline — an extra caption
   * line under the row would break the shared meter grid, and the grid is the
   * whole reason four dimensions are comparable at a glance.
   */
  highlight?: boolean;
  labelWidth?: number;
}) {
  return (
    <Stack direction="row" alignItems="center" spacing={1.5}>
      <Box sx={{ width: labelWidth, flexShrink: 0 }}>
        <FieldLabel color={highlight ? TEXT.primary : TEXT.secondary}>
          {label}
        </FieldLabel>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <SegmentedMeter value={value} color={color} />
      </Box>
      <Typography
        sx={{
          fontFamily: MONO,
          fontSize: "0.9rem",
          fontWeight: 700,
          color,
          width: 30,
          textAlign: "right",
          flexShrink: 0,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {Math.round(value)}
      </Typography>
      {/* Fixed-width gutter so rows stay aligned whether or not they're marked. */}
      <Box
        sx={{
          width: 14,
          flexShrink: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        {highlight && (
          <Box
            sx={{ color: ROSE.bright, display: "flex", lineHeight: 1 }}
            aria-hidden
          >
            <Icon icon="mdi:target" width={13} />
          </Box>
        )}
      </Box>
    </Stack>
  );
}

// ─── Verdict pill ───────────────────────────────────────────────────────────

/** Small status tag for the header rail's action slot. */
export function VerdictPill({
  label,
  color,
  filled = false,
}: {
  label: string;
  color: string;
  filled?: boolean;
}) {
  return (
    <Box
      sx={{
        px: 1,
        py: 0.25,
        borderRadius: `${RADIUS.small}px`,
        border: `1px solid ${color}${filled ? "" : "59"}`,
        bgcolor: filled ? color : `${color}1a`,
        flexShrink: 0,
      }}
    >
      <FieldLabel color={filled ? TEXT.onAccent : color} size="0.75rem">
        {label}
      </FieldLabel>
    </Box>
  );
}
