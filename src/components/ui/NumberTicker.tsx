"use client";

interface NumberTickerProps {
  value: number;
  /** Kept for callers; the figure no longer counts up. */
  durationMs?: number;
  suffix?: string;
  prefix?: string;
}

/** Pinned locale: the server and the browser must agree on the SSR text or
 *  React reports a hydration mismatch and re-renders the strip on load. */
export const formatTickerValue = (v: number) =>
  Math.round(v).toLocaleString("en-US");

/**
 * A headline figure.
 *
 * It used to count up from zero once it scrolled into view. The count-up was
 * decoration, and it read as "0" to a crawler, a hidden tab and anyone with
 * reduced motion, so the formatted number is what renders everywhere now. The
 * name and props stay so callers need no change.
 */
export function NumberTicker({
  value,
  suffix = "",
  prefix = "",
}: NumberTickerProps) {
  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {prefix}
      {formatTickerValue(value)}
      {suffix}
    </span>
  );
}
