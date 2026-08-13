// ─────────────────────────────────────────────────────────────────────────────
// Dossier — the visual language for /scout.
//
// The scout report is a field dossier on a player, and every primitive here
// leans into that: mono field labels, corner-bracket registration marks, and
// instrument-style segmented meters instead of dial gauges. Panels share one
// shell so a ten-panel page still reads as a single document rather than ten
// unrelated cards.
//
// Deliberately NOT here: circular progress rings and arc gauges. Those are the
// generic stats-site vocabulary; the meters below are the house form.
// ─────────────────────────────────────────────────────────────────────────────

import { Box, Stack, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import type { ReactNode } from 'react';

// Ember accent, per the Chess Masti design OS: glow / voice / focus, never fill.
export const EMBER = '#F97316';
export const EMBER_LIGHT = '#FB923C';

/** Semantic scale for "how good is this number for the SUBJECT" (higher = better). */
export function strengthColor(v: number): string {
  if (v >= 75) return '#34d399';
  if (v >= 60) return '#a3e635';
  if (v >= 45) return '#fbbf24';
  return '#f87171';
}

/** Semantic scale for "how exploitable is this" (higher = better FOR YOU). */
export function tellColor(v: number): string {
  if (v >= 70) return '#f87171';
  if (v >= 50) return EMBER_LIGHT;
  if (v >= 35) return '#fbbf24';
  return '#34d399';
}

export const MONO =
  "'SF Mono', 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace";

// ─── Field label ────────────────────────────────────────────────────────────

/**
 * The mono, wide-tracked, small-caps label that heads every field in the
 * dossier. Used for section names, column heads, and stat captions.
 */
export function FieldLabel({
  children,
  color = 'rgba(255,255,255,0.42)',
  size = '0.62rem',
}: {
  children: ReactNode;
  color?: string;
  size?: string;
}) {
  return (
    <Typography
      component="span"
      sx={{
        fontFamily: MONO,
        fontSize: size,
        fontWeight: 600,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Typography>
  );
}

// ─── Panel shell ────────────────────────────────────────────────────────────

/**
 * Registration marks at the panel corners. Four 10px L-shapes, drawn with
 * borders so they cost no extra DOM beyond the spans. This is the signature
 * of the surface — it's what makes a stack of panels read as one dossier.
 */
function CornerMarks({ color }: { color: string }) {
  const base = {
    position: 'absolute' as const,
    width: 9,
    height: 9,
    borderColor: color,
    borderStyle: 'solid',
    pointerEvents: 'none' as const,
    transition: 'border-color 200ms ease',
  };
  return (
    <>
      <Box sx={{ ...base, top: 8, left: 8, borderWidth: '1px 0 0 1px' }} />
      <Box sx={{ ...base, top: 8, right: 8, borderWidth: '1px 1px 0 0' }} />
      <Box sx={{ ...base, bottom: 8, left: 8, borderWidth: '0 0 1px 1px' }} />
      <Box sx={{ ...base, bottom: 8, right: 8, borderWidth: '0 1px 1px 0' }} />
    </>
  );
}

export interface DossierPanelProps {
  /** Mono section label rendered in the header rail, e.g. "TELLS". */
  label?: string;
  /** Right-aligned slot in the header rail — a count, a verdict pill, an action. */
  action?: ReactNode;
  /** Accent the panel edge + corner marks in ember (used for the two hero panels). */
  emphasis?: boolean;
  children: ReactNode;
  /** Applied to the outer panel. */
  sx?: Record<string, unknown>;
}

/**
 * The one panel shell every /scout surface uses.
 *
 * Structure is a header rail (mono label + action slot, separated by a hairline)
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
  const edge = emphasis ? 'rgba(249,115,22,0.28)' : 'rgba(255,255,255,0.09)';
  const marks = emphasis ? 'rgba(249,115,22,0.55)' : 'rgba(255,255,255,0.18)';

  return (
    <Box
      sx={{
        position: 'relative',
        height: '100%',
        width: '100%',
        borderRadius: '1.25rem',
        border: `1px solid ${edge}`,
        background: emphasis
          ? 'linear-gradient(160deg, rgba(249,115,22,0.055) 0%, rgba(16,18,24,0.72) 42%)'
          : 'rgba(16,18,24,0.62)',
        backdropFilter: 'blur(16px) saturate(150%)',
        WebkitBackdropFilter: 'blur(16px) saturate(150%)',
        boxShadow: emphasis
          ? '0 12px 40px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.07)'
          : '0 8px 30px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.05)',
        overflow: 'hidden',
        // Column layout so the body can claim the leftover height when the
        // panel is stretched by a taller sibling in a grid row. Without this,
        // a short panel leaves a dead void under its content.
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 200ms ease, box-shadow 200ms ease',
        '&:hover': {
          borderColor: emphasis
            ? 'rgba(249,115,22,0.42)'
            : 'rgba(255,255,255,0.14)',
        },
        ...sx,
      }}
    >
      <CornerMarks color={marks} />

      {(label || action) && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            px: 2.5,
            py: 1.25,
            gap: 1.5,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          {label ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
              <Box
                sx={{
                  width: 3,
                  height: 11,
                  borderRadius: 2,
                  bgcolor: emphasis ? EMBER : 'rgba(255,255,255,0.28)',
                  flexShrink: 0,
                }}
              />
              <FieldLabel color={emphasis ? EMBER_LIGHT : 'rgba(255,255,255,0.55)'}>
                {label}
              </FieldLabel>
            </Stack>
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
          display: 'flex',
          flexDirection: 'column',
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
      sx={{ display: 'flex', gap: `${gap}px`, alignItems: 'stretch', width: '100%' }}
      role="meter"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {Array.from({ length: segments }, (_, i) => {
        const on = i < lit;
        // The leading segment glows — it reads as the needle of an instrument.
        const isHead = on && i === lit - 1;
        return (
          <Box
            key={i}
            sx={{
              flex: 1,
              height,
              borderRadius: '1px',
              bgcolor: on ? color : 'rgba(255,255,255,0.07)',
              opacity: on ? (isHead ? 1 : 0.82) : 1,
              boxShadow: isHead ? `0 0 8px ${color}` : 'none',
              transition: `background-color 320ms ease ${i * 12}ms, opacity 320ms ease`,
            }}
          />
        );
      })}
    </Box>
  );
}

/**
 * A labelled meter row: mono label on the left, meter in the middle, mono
 * value on the right. The three columns are fixed-width so rows stack into
 * clean vertical rules.
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
        <FieldLabel color={highlight ? EMBER_LIGHT : 'rgba(255,255,255,0.66)'}>
          {label}
        </FieldLabel>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <SegmentedMeter value={value} color={color} />
      </Box>
      <Typography
        sx={{
          fontFamily: MONO,
          fontSize: '0.9rem',
          fontWeight: 700,
          color,
          width: 30,
          textAlign: 'right',
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {Math.round(value)}
      </Typography>
      {/* Fixed-width gutter so rows stay aligned whether or not they're marked. */}
      <Box sx={{ width: 14, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        {highlight && (
          <Box sx={{ color: EMBER_LIGHT, display: 'flex', lineHeight: 1 }} aria-hidden>
            <Icon icon="mdi:target" width={13} />
          </Box>
        )}
      </Box>
    </Stack>
  );
}

// ─── Verdict pill ───────────────────────────────────────────────────────────

/** Small mono status pill for the header rail's action slot. */
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
        px: 1.1,
        py: 0.35,
        borderRadius: '4px',
        border: `1px solid ${color}${filled ? '' : '59'}`,
        bgcolor: filled ? color : `${color}1a`,
        flexShrink: 0,
      }}
    >
      <FieldLabel color={filled ? '#0A0A0A' : color} size="0.58rem">
        {label}
      </FieldLabel>
    </Box>
  );
}
