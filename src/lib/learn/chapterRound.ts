// A round of questions about one chapter.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A ROUND AND NOT A CHAPTER
//
// The plan assumed a chapter was a sitting. Measured on the shipped courses it
// is 11 decisions at the beginner band and up to 286 at club, and no single
// unit spans that. So the sitting is a fixed number of ROUNDS and a round is a
// fixed number of correct answers.
//
// The mechanic is Quizlet's, and the load-bearing half of it is easy to miss:
// progress advances on a CORRECT answer, not on a question asked. A round ends
// after five right answers however many attempts that took, so a round that is
// going badly visibly lengthens and one that is going well is over quickly.
// That is "the session gets shorter as you learn" as a mechanic rather than a
// slogan — the progress dots and the difficulty are the same number.
//
// A miss is re-queued at the BACK of the current round, three to six positions
// later, which is real spacing and means nobody leaves a round having failed
// something. A second miss carries it to the next round rather than looping.
// ─────────────────────────────────────────────────────────────────────────────

import type { CourseProbe } from '@/lib/courses/probes';
import { DEFAULT_EASE_FACTOR, applySm2 } from '@/lib/spacedRepetition';

/**
 * Five, and the reason is already written down in this repo at
 * reviewSchedule.ts: "Five is a sitting; the rest keep until tomorrow and lose
 * nothing by waiting."
 */
export const ROUND_SIZE = 5;

/** Rounds before we stop and say so. Four rounds of five is twenty decisions. */
export const SITTING_ROUNDS = 4;

/**
 * What we know about one decision. Four values, not a boolean.
 *
 * A boolean cannot express "missed outranks never seen", which is the whole
 * ordering the next round depends on.
 *
 *   0   never asked
 *  -1   missed, or answered after a hint
 *   1   answered right, but only after getting it wrong first
 *   2   answered right cold, or right again on a later round
 *
 * 2 IS REACHED IN ONE ANSWER FROM 0, deliberately. A player who plays the
 * course move first time has shown they know it, and asking them again to
 * prove it is the curriculum behaviour this whole mode exists to refuse.
 */
export type Correctness = 0 | -1 | 1 | 2;

export interface ProbeRecord {
  /** positionKey. The same identity probes and cards use. */
  key: string;
  correctness: Correctness;
  /** Times asked, ever. Never decreases. */
  asks: number;
  /** Times answered wrong, ever. Never decreases. */
  misses: number;
  /** True once a hint was ever taken on this decision. */
  hinted: boolean;
  /** The round it was last asked in, so a round does not re-ask its own work. */
  lastRound: number;
  /**
   * When it was last answered, epoch ms.
   *
   * Only the merge needs it, and the merge needs it badly: two devices hold two
   * partial truths about the same decision and something has to say which is
   * current. Rounds cannot — round 3 on a phone and round 3 on a laptop are not
   * comparable — and "higher knowledge wins" would refuse to let a player
   * forget, which is the one thing spaced repetition exists to measure.
   */
  at: number;

  // ── The card, when one has been EARNED ────────────────────────────────────
  //
  // A 185-line course creates ZERO cards on enrolment. A card exists only where
  // a decision was actually missed or shown, which is the whole difference
  // between this and a curriculum: the review list is a record of what went
  // wrong, not a copy of the syllabus. A player who probes a chapter perfectly
  // owes nothing, and the screen has to be able to say so.
  //
  // All three are absent together or present together. `dueAt === undefined` is
  // the single test for "no card", and nothing else may stand in for it.

  /** SM-2 ease factor. */
  ease?: number;
  /** SM-2 interval, in days. */
  interval?: number;
  /** When this comes back, epoch ms. */
  dueAt?: number;
}

/** A day, in ms. The unit SM-2's interval is denominated in. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** True when this decision has been missed at least once and owes a review. */
export const hasCard = (record: ProbeRecord): boolean => record.dueAt !== undefined;

/** True when a card exists and its date has come. */
export const isDue = (record: ProbeRecord, now: number): boolean =>
  record.dueAt !== undefined && record.dueAt <= now;

/** Cards owed right now. Zero for a chapter nobody has got wrong. */
export function dueCount(records: Records, now: number): number {
  let due = 0;
  for (const record of Object.values(records)) if (isDue(record, now)) due++;
  return due;
}

/** The soonest card in this set, or null when nothing is scheduled. */
export function nextDueAt(records: Records): number | null {
  let soonest: number | null = null;
  for (const record of Object.values(records)) {
    if (record.dueAt === undefined) continue;
    if (soonest === null || record.dueAt < soonest) soonest = record.dueAt;
  }
  return soonest;
}

export function blankRecord(key: string): ProbeRecord {
  return { key, correctness: 0, asks: 0, misses: 0, hinted: false, lastRound: 0, at: 0 };
}

export type Records = Record<string, ProbeRecord>;

export const recordFor = (records: Records, key: string): ProbeRecord =>
  records[key] ?? blankRecord(key);

/**
 * The questions for one round.
 *
 * ONE concat, then one slice. That matters beyond tidiness: it is the single
 * funnel every question in the product passes through, so it is the only place
 * a content gate would ever have to go.
 *
 * Priority, in order:
 *   1. missed          they got it wrong and have not fixed it
 *   2. learning, stale fixed once, and not already asked this round
 *   3. never asked     in the order probesOf gave, which is most-likely first
 *   4. learning, fresh only to fill a short round rather than end it early
 */
export function buildRound(
  probes: CourseProbe[],
  records: Records,
  round: number,
  size: number = ROUND_SIZE,
  now = 0
): CourseProbe[] {
  const at = (p: CourseProbe) => recordFor(records, p.key);
  const missed = probes.filter(p => at(p).correctness === -1);
  const learning = probes.filter(p => at(p).correctness === 1);
  const unseen = probes.filter(p => at(p).correctness === 0);
  // Known, and the date has come round. `now` defaults to 0 so a caller that
  // does not pass a clock sweeps nothing — the zero-by-definition case, rather
  // than a silent "everything is due" from an undefined comparison.
  const due = probes.filter(p => at(p).correctness === 2 && isDue(at(p), now));

  const stale = learning.filter(p => round - at(p).lastRound >= 1);
  const fresh = learning.filter(p => round - at(p).lastRound < 1);

  // Due sits SECOND, above anything never asked. A decision you got wrong in
  // March and have not seen since is worth more than the next new one, and the
  // whole point of earning a card is that it comes back.
  const queue = [...missed, ...due, ...stale, ...unseen, ...fresh];
  const seen = new Set<string>();
  const out: CourseProbe[] = [];
  for (const probe of queue) {
    if (seen.has(probe.key)) continue;
    seen.add(probe.key);
    out.push(probe);
    if (out.length >= size) break;
  }
  return out;
}

/**
 * The questions for one round of a DRILL.
 *
 * Not `buildRound` with a flag. The difference is the whole point of the mode:
 * a session asks what you owe, and a drill asks the lot — so it cannot consult
 * `records` at all, or "drill this chapter cold" would quietly become "drill
 * the parts of it you are bad at", which is the thing the player already has.
 *
 * Chunked by round rather than sampled, so going through a drill twice covers
 * the same ground in the same order and a player can tell they finished it.
 * Order is `probes`' own, which is most-likely-first.
 */
export function drillRound(
  probes: CourseProbe[],
  round: number,
  size: number = ROUND_SIZE
): CourseProbe[] {
  const start = Math.max(0, (round - 1) * size);
  return probes.slice(start, start + size);
}

/** Rounds a drill of this many decisions takes. Zero decisions is zero rounds. */
export const drillRounds = (count: number, size: number = ROUND_SIZE): number =>
  Math.ceil(Math.max(0, count) / size);

export interface AskOutcome {
  right: boolean;
  /** A hint was taken before answering. */
  hinted?: boolean;
  round: number;
  /** Epoch ms. Passed in rather than read, so this module stays clock-free. */
  at: number;
}

/**
 * One answer, applied.
 *
 * A HINT COSTS THE ROUND. Whatever they then play, the decision lands on -1 and
 * cannot reach `2` on this ask, so `known` can never mean `was shown`. That is
 * the only thing standing between the hint and being a shortcut — every other
 * guarantee about it (no engine in the import graph, no free-FEN entry, the
 * band cut) stops it reaching for an engine, and none of them stops it being
 * free.
 */
export function gradeAsk(record: ProbeRecord, outcome: AskOutcome): ProbeRecord {
  const asks = record.asks + 1;
  const hinted = record.hinted || Boolean(outcome.hinted);
  const base = { ...record, asks, hinted, lastRound: outcome.round, at: outcome.at };

  if (!outcome.right) {
    return { ...base, correctness: -1, misses: record.misses + 1, ...earn(record, outcome.at) };
  }
  if (outcome.hinted) {
    // Right, but shown. Not a miss — they did not play the wrong move — and not
    // knowledge either. It comes back.
    return { ...base, correctness: -1, ...earn(record, outcome.at) };
  }
  // Cold and right is the end of it. Right after a miss is one rung, and the
  // rung after that is reached on a LATER round, never twice in one.
  const next: Correctness = record.correctness === 0 ? 2 : record.correctness === -1 ? 1 : 2;
  return { ...base, correctness: next, ...advance(record, outcome.at) };
}

/**
 * The card a miss creates, or the reset a miss deals an existing one.
 *
 * `applySm2` is the repo's own SM-2, shared with puzzles and opening drills and
 * not touched. Quality 2 for both a wrong move and a hinted one: the scale
 * calls 3 "correct with difficulty", which would ADVANCE the interval, and a
 * decision that had to be shown has not been recalled at all. That asymmetry is
 * the same one `correctness` makes and it has to be made twice, because the two
 * numbers answer different questions — what you know, and when to ask again.
 */
function earn(record: ProbeRecord, at: number): Pick<ProbeRecord, 'ease' | 'interval' | 'dueAt'> {
  const { easeFactor, interval } = applySm2(
    {
      easeFactor: record.ease ?? DEFAULT_EASE_FACTOR,
      interval: record.interval ?? 0,
      attempts: record.asks,
    },
    2
  );
  return { ease: easeFactor, interval, dueAt: at + interval * DAY_MS };
}

/**
 * A right answer, applied to a card that already exists.
 *
 * NOTHING when there is no card, and that is the guarantee the whole review
 * layer rests on: a player who probes a 185-line course perfectly finishes with
 * zero cards. A curriculum would have created 185 on enrolment and asked them
 * all back.
 */
function advance(record: ProbeRecord, at: number): Pick<ProbeRecord, 'ease' | 'interval' | 'dueAt'> {
  if (record.dueAt === undefined) return {};
  const { easeFactor, interval } = applySm2(
    {
      easeFactor: record.ease ?? DEFAULT_EASE_FACTOR,
      interval: record.interval ?? 1,
      attempts: record.asks,
    },
    5
  );
  return { ease: easeFactor, interval, dueAt: at + interval * DAY_MS };
}

export interface Tally {
  /** Decisions never asked. */
  unseen: number;
  /** Missed, or fixed once and not yet owned. */
  learning: number;
  known: number;
  total: number;
  /** total − known. The one number the summary screen shows, and it only falls. */
  open: number;
}

export function roundTally(probes: CourseProbe[], records: Records): Tally {
  let unseen = 0;
  let learning = 0;
  let known = 0;
  for (const probe of probes) {
    const c = recordFor(records, probe.key).correctness;
    if (c === 2) known++;
    else if (c === 0) unseen++;
    else learning++;
  }
  return { unseen, learning, known, total: probes.length, open: probes.length - known };
}

/** Nothing left to ask in this chapter at this band. */
export const chapterClosed = (tally: Tally): boolean =>
  tally.total > 0 && tally.known === tally.total;

// ─────────────────────────────────────────────────────────────────────────────
// THE IN-FLIGHT ROUND
//
// A timeline of decisions, and a progress counter that moves only on a correct
// answer. Those two facts are what make the round's length a readout of how it
// is going rather than a fixed cost.
// ─────────────────────────────────────────────────────────────────────────────

export interface RoundState {
  round: number;
  /** Probe keys, in the order they will be asked. A miss appends its own key. */
  timeline: string[];
  /** Index of the question being asked. */
  at: number;
  /** Correct answers so far. The progress bar. */
  progress: number;
  /** Correct answers this round needs. */
  size: number;
  /** Keys already re-queued once. A second miss carries to the next round. */
  requeued: string[];
}

export function startRound(
  probes: CourseProbe[],
  records: Records,
  round: number,
  size: number = ROUND_SIZE,
  now = 0
): RoundState {
  const chosen = buildRound(probes, records, round, size, now);
  return {
    round,
    timeline: chosen.map(p => p.key),
    at: 0,
    progress: 0,
    size: Math.min(size, chosen.length),
    requeued: [],
  };
}

/**
 * A drill round, opened.
 *
 * Same state, same grading, same re-queue on a miss. Only the queue differs,
 * and it differs by not being chosen from what you know.
 */
export function startDrill(
  probes: CourseProbe[],
  round: number,
  size: number = ROUND_SIZE
): RoundState {
  const chosen = drillRound(probes, round, size);
  return {
    round,
    timeline: chosen.map(p => p.key),
    at: 0,
    progress: 0,
    size: Math.min(size, chosen.length),
    requeued: [],
  };
}

/**
 * The round advanced by one answer.
 *
 * Correct: progress moves, and the next question is the next one.
 * Wrong: progress does NOT move, and the decision is appended to the back of
 * the timeline — three to six questions later, which is real spacing and means
 * nobody leaves a round having failed something. Once only: a second miss in
 * the same round carries it to the next round rather than looping on it, which
 * is the difference between spacing and punishment.
 */
export function answerRound(state: RoundState, right: boolean): RoundState {
  const key = state.timeline[state.at];
  if (key === undefined) return state;

  if (right) {
    return { ...state, at: state.at + 1, progress: state.progress + 1 };
  }
  const alreadyBack = state.requeued.includes(key);
  return {
    ...state,
    at: state.at + 1,
    timeline: alreadyBack ? state.timeline : [...state.timeline, key],
    requeued: alreadyBack ? state.requeued : [...state.requeued, key],
  };
}

/**
 * Is the round over?
 *
 * Two ways, and they are different things. Reaching `size` correct answers is
 * finishing it. Running out of timeline means everything left was missed twice,
 * and those carry to the next round — the round is over either way, but only
 * the first is completion.
 */
export function roundDone(state: RoundState): boolean {
  return state.size === 0 || state.progress >= state.size || state.at >= state.timeline.length;
}

/** The key being asked, or null when the round is over. */
export function currentKey(state: RoundState): string | null {
  if (roundDone(state)) return null;
  return state.timeline[state.at] ?? null;
}

/** True when this decision has already been asked once this round. */
export const isRepeat = (state: RoundState, key: string): boolean =>
  state.requeued.includes(key);
