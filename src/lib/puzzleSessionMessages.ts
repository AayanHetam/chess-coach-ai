/**
 * Motivational one-liners shown on the Puzzle Coach session-recap card.
 *
 * Sixty notes, bucketed by how the session's rating ended up:
 *   • GAIN    — net rating went up   (25)
 *   • LOSS    — net rating went down (25)
 *   • NEUTRAL — roughly flat         (5)
 *
 * Short, warm, and a little "masti" — the recap should feel like a coach
 * cheering you on, not a report card. Keep each under ~70 characters.
 */

/** Below this absolute net delta, a session counts as "no real change". */
export const NEUTRAL_BAND = 8;

export const SESSION_MESSAGES_GAIN: readonly string[] = [
  "Rating up — that's the climb. Keep going. 📈",
  "You just got sharper. The board noticed.",
  "Points in the bank. Pattern recognition leveling up.",
  "That's progress you can feel. Same time tomorrow?",
  "Up and to the right. Exactly where you want to be.",
  "Your tactics are waking up. Nice session.",
  "Gained ground today — future-you says thanks.",
  "Brain: trained. Rating: risen. Repeat. 🧠",
  "You out-calculated the puzzles. Well played.",
  "Each solve stacks. Today the stack got taller.",
  "Climbing. Slow is smooth, smooth is fast.",
  "The hard ones got easier. That's the whole game.",
  "New high energy — your vision is improving.",
  "Rating up, doubts down. Good work.",
  "You're seeing the board a move deeper now.",
  "Solid gains. Tactics don't stand a chance.",
  "That's a +. Momentum is on your side.",
  "Up today. Consistency turns this into mastery.",
  "Your pattern bank just earned interest. 💹",
  "Sharper than when you sat down. Mission complete.",
  "Green arrows everywhere. Love to see it.",
  "You earned every point. On to the next.",
  "Calculation muscles flexed and grew. Nice.",
  "Trending up — this is what showing up looks like.",
  "Rating climbed. The grind is quietly paying off.",
];

export const SESSION_MESSAGES_LOSS: readonly string[] = [
  "Rating dipped — but every miss is a lesson logged. 📚",
  "Tough set. The growth is hiding in the misses.",
  "Down a bit, wiser a lot. Come back swinging.",
  "Hard puzzles bite. That's how they make you stronger.",
  "A dip today, a spike tomorrow. Keep at it.",
  "You stretched past your level — that's the point.",
  "Rating slipped, resolve didn't. Round two soon. 💪",
  "Misses sting now, pay off later. Trust it.",
  "Off day on the board ≠ off track. Reset and return.",
  "The losses teach louder than the wins. Listen in.",
  "Slid back a touch — the climb resumes next session.",
  "You faced sharper puzzles. Brave beats comfy.",
  "Down, not out. Champions log the hard days too.",
  "Today tested you. Tomorrow you'll test it back.",
  "Rating dipped; pattern memory still went up.",
  "Every master has sessions like this. Keep moving.",
  "A setback is a setup. Shake it off. 🔄",
  "You learned where the gaps are. That's worth points.",
  "Slipped today, but you showed up — that counts.",
  "Hard mode hurts the ego, helps the game.",
  "The board won this round. Demand a rematch.",
  "Lower score, higher ceiling. Onward.",
  "Bruised rating, sharper instincts. Fair trade.",
  "Dip noted. Now go prove it was temporary.",
  "Lost a little rating, gained a little grit. 🧗",
];

export const SESSION_MESSAGES_NEUTRAL: readonly string[] = [
  "Held your ground today. Steady is underrated. ⚖️",
  "Right around even — a solid, honest session.",
  "Flat rating, sharper reps. Foundations matter.",
  "You broke even and built habit. That's a win too.",
  "Level pegging today. Tomorrow, tip it upward. ➡️",
];

export type SessionTrend = "gain" | "loss" | "neutral";

/** Classify a session's net rating delta into a message bucket. */
export function classifyTrend(netDelta: number): SessionTrend {
  if (netDelta > NEUTRAL_BAND) return "gain";
  if (netDelta < -NEUTRAL_BAND) return "loss";
  return "neutral";
}

/**
 * Pick a fresh motivational note for a finished session. Random within the
 * bucket so it "changes every time"; pass `avoid` (the last shown message) to
 * reduce immediate repeats across back-to-back sessions.
 */
export function pickSessionMessage(netDelta: number, avoid?: string): string {
  const bucket =
    classifyTrend(netDelta) === "gain"
      ? SESSION_MESSAGES_GAIN
      : classifyTrend(netDelta) === "loss"
        ? SESSION_MESSAGES_LOSS
        : SESSION_MESSAGES_NEUTRAL;

  const pool =
    bucket.length > 1 && avoid ? bucket.filter((m) => m !== avoid) : bucket;
  const choices = pool.length > 0 ? pool : bucket;
  return choices[Math.floor(Math.random() * choices.length)];
}
