/**
 * CMIP pacing model — pure logic, server- and browser-safe.
 *
 * "Are you ahead or behind on this week's quota?" reduced to a small
 * deterministic function so the intern dashboard and the admin roster
 * compute identical numbers.
 *
 * Resolved 2026-05-17:
 *   - Target: 10 submissions per ISO week per intern
 *   - Timezone: America/Los_Angeles (PT), Mon→Sun
 *   - Program start: 2026-06-30 00:00 PT. Before this, status is always
 *     "pre-program" — no red/yellow ever surfaces.
 *   - Pacing model: linear. expected = (elapsedFractionOfWeek) × target.
 *   - Status pill at ±2 thresholds:
 *       |delta| < 2  → on-track
 *       delta ≤ -2   → behind
 *       delta ≥ +2   → ahead
 */

export type PacingStatus = "pre-program" | "on-track" | "behind" | "ahead";

export type PacingResult = {
  submittedThisWeek: number;
  target: number;
  status: PacingStatus;
  /** Actual − expected. Positive = ahead, negative = behind. Always 0 in pre-program. */
  delta: number;
  /** Expected count given elapsed fraction of this week. 0 in pre-program. */
  expected: number;
  streakWeeks: number;
  /** ms timestamp of this week's Monday 00:00 PT. */
  weekStartMs: number;
  /** ms timestamp of program start (2026-06-30 00:00 PT). */
  programStartMs: number;
  /** ms timestamp at which the calculation was performed. */
  nowMs: number;
};

export const WEEKLY_TARGET = 10;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PILL_THRESHOLD = 2;

/** 2026-06-30 00:00 in PT (UTC-7 in June; this is +07:00 from UTC midnight). */
export const PROGRAM_START_MS = Date.UTC(2026, 5, 30, 7, 0, 0);

/**
 * Return the start of the current PT week (Mon 00:00) as a UTC ms timestamp.
 *
 * Implementation note: PT shifts between UTC-8 (PST) and UTC-7 (PDT). We
 * derive the current PT offset via Intl.DateTimeFormat and use it to align
 * a Monday-00:00-PT instant. Around DST transitions the boundary may shift
 * by an hour, which is below the resolution that matters for pacing.
 */
export function getPTWeekStart(nowMs: number): number {
  const offsetMinutes = getPTOffsetMinutes(nowMs);
  // Shift "now" into a pretend-UTC frame whose UTC components match the PT
  // clock — this lets us use getUTC* methods to find weekday + date.
  const ptNow = new Date(nowMs + offsetMinutes * 60_000);
  const utcDay = ptNow.getUTCDay(); // 0=Sun .. 6=Sat
  const daysSinceMon = (utcDay + 6) % 7; // Mon→0, Tue→1, ..., Sun→6
  // Construct Monday 00:00 in the pretend-UTC frame, then back out the offset.
  const mondayPretendUtcMs = Date.UTC(
    ptNow.getUTCFullYear(),
    ptNow.getUTCMonth(),
    ptNow.getUTCDate() - daysSinceMon,
    0,
    0,
    0,
  );
  return mondayPretendUtcMs - offsetMinutes * 60_000;
}

function getPTOffsetMinutes(ms: number): number {
  const utcDate = new Date(ms);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(utcDate);
  const lookup = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const ptComponentsAsUtcMs = Date.UTC(
    lookup("year"),
    lookup("month") - 1,
    lookup("day"),
    lookup("hour"),
    lookup("minute"),
    lookup("second"),
  );
  return Math.round((ptComponentsAsUtcMs - ms) / 60_000);
}

export type ComputePacingInput = {
  /** Count of `submitted` rows in the current PT week. */
  submittedThisWeek: number;
  /** Count of consecutive prior weeks (in PT) where submissions ≥ target. */
  streakWeeks: number;
  /** Override for testing. Defaults to Date.now(). */
  nowMs?: number;
  /** Override for testing. Defaults to WEEKLY_TARGET. */
  target?: number;
  /** Override for testing. Defaults to PROGRAM_START_MS. */
  programStartMs?: number;
};

export function computePacing(input: ComputePacingInput): PacingResult {
  const nowMs = input.nowMs ?? Date.now();
  const target = input.target ?? WEEKLY_TARGET;
  const programStartMs = input.programStartMs ?? PROGRAM_START_MS;
  const weekStartMs = getPTWeekStart(nowMs);

  if (nowMs < programStartMs) {
    return {
      submittedThisWeek: input.submittedThisWeek,
      target,
      status: "pre-program",
      delta: 0,
      expected: 0,
      streakWeeks: 0, // streak doesn't accrue before program start
      weekStartMs,
      programStartMs,
      nowMs,
    };
  }

  // Pacing math (linear).
  const elapsedFraction = Math.max(0, Math.min(1, (nowMs - weekStartMs) / WEEK_MS));
  const expected = elapsedFraction * target;
  const delta = input.submittedThisWeek - expected;

  let status: PacingStatus;
  if (delta <= -PILL_THRESHOLD) status = "behind";
  else if (delta >= PILL_THRESHOLD) status = "ahead";
  else status = "on-track";

  return {
    submittedThisWeek: input.submittedThisWeek,
    target,
    status,
    delta,
    expected,
    streakWeeks: input.streakWeeks,
    weekStartMs,
    programStartMs,
    nowMs,
  };
}

/**
 * Human-readable copy for the QuotaWidget. Same logic on both intern view
 * (their own pacing) and admin view (per-intern pacing in the roster).
 */
export function describePacing(r: PacingResult): string {
  if (r.status === "pre-program") {
    const days = Math.max(0, Math.ceil((r.programStartMs - r.nowMs) / (24 * 60 * 60 * 1000)));
    return `Pre-program · ${r.submittedThisWeek} submitted (anything is ahead). Program starts in ${days} day${days === 1 ? "" : "s"}.`;
  }
  if (r.status === "on-track") {
    return `${r.submittedThisWeek} of ${r.target} this week · On track`;
  }
  if (r.status === "behind") {
    const behind = Math.ceil(-r.delta);
    return `${r.submittedThisWeek} of ${r.target} this week · ${behind} behind pace`;
  }
  // ahead
  const ahead = Math.floor(r.delta);
  return `${r.submittedThisWeek} of ${r.target} this week · ${ahead} ahead — strong week`;
}
