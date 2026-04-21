// ─────────────────────────────────────────────────────────────────────────────
// LiveClock
//
// Client-side tick-downer for Lichess Board-API clocks. We receive absolute
// remaining-millis from the server; locally we interpolate by decrementing
// once every 100ms so users see smooth countdown instead of 1-second jumps.
//
// IMPORTANT: the SERVER is authoritative. Every incoming gameState replaces
// our local clock value; we only interpolate in the gaps between events.
// ─────────────────────────────────────────────────────────────────────────────

import { Box, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

export interface LiveClockProps {
  /** Milliseconds on the clock when `serverAt` snapshot was taken. */
  ms: number;
  /** Is this side currently on move? If so, tick down in real time. */
  active: boolean;
  /** Monotonic epoch millis when `ms` was observed. Used as the tick anchor. */
  serverAt: number;
  /** Label (usually "WHITE" or "BLACK"). Optional. */
  label?: string;
  /** Show in orange when below this threshold in ms. */
  lowTimeMs?: number;
  /** Size variant. */
  size?: 'sm' | 'md';
}

/** Format milliseconds as m:ss, or M:SS.t when under 20 seconds. */
function formatClock(ms: number): string {
  const safe = Math.max(0, ms);
  const totalTenths = Math.floor(safe / 100);
  const tenths = totalTenths % 10;
  const totalSeconds = Math.floor(safe / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  const ss = seconds.toString().padStart(2, '0');
  if (safe < 20_000) {
    return `${minutes}:${ss}.${tenths}`;
  }
  return `${minutes}:${ss}`;
}

export default function LiveClock({
  ms,
  active,
  serverAt,
  label,
  lowTimeMs = 30_000,
  size = 'md',
}: LiveClockProps) {
  // Locally interpolated remaining-ms.
  const [localMs, setLocalMs] = useState(ms);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setLocalMs(ms);
    if (!active) return;
    // Use setInterval rather than rAF — rAF pauses when tab is backgrounded,
    // which is fine visually, but setInterval gives us predictable cadence
    // regardless of display state.
    const id = setInterval(() => {
      const elapsed = Date.now() - serverAt;
      setLocalMs(Math.max(0, ms - elapsed));
    }, 100);
    return () => {
      clearInterval(id);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [ms, active, serverAt]);

  const low = localMs < lowTimeMs;
  const critical = localMs < 10_000;
  const textColor = critical ? '#ef4444' : low ? '#f59e0b' : 'text.primary';
  void label; // label not rendered in this design

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: size === 'sm' ? 1.5 : 2,
        py: size === 'sm' ? 0.75 : 1,
        borderRadius: 2.5,
        bgcolor: active ? 'rgba(255,107,53,0.08)' : 'rgba(0,0,0,0.03)',
        minWidth: size === 'sm' ? 80 : 100,
        transition: 'background-color 0.2s',
      }}
    >
      <Typography
        component="span"
        sx={{
          fontFamily: '"SF Mono", Menlo, Consolas, monospace',
          fontWeight: 800,
          fontSize: size === 'sm' ? '1.15rem' : '1.5rem',
          color: textColor,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}
      >
        {formatClock(localMs)}
      </Typography>
    </Box>
  );
}
