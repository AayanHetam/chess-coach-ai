/**
 * Formats a headline figure (the /plan stat tiles) with a pinned locale: the
 * server and the browser must agree on the SSR text or React reports a
 * hydration mismatch and re-renders the strip on load.
 *
 * This is what remains of NumberTicker. The count-up it used to drive was
 * decoration, and it read as "0" to a crawler, a hidden tab and anyone with
 * reduced motion; callers render the formatted number directly.
 */
export const formatTickerValue = (v: number) =>
  Math.round(v).toLocaleString("en-US");
