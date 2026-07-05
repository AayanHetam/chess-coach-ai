import type { PositionFeatureDelta } from "@/lib/mastermind/featureDelta";
import type { WeaknessProfile } from "@/lib/weaknessProfile";

/**
 * Phase-3 RELEVANCE FILTER (cross-game weakness memory → primary-idea choice).
 *
 * The coach's TEACHING METHOD rule says "pick the single dominant concept the
 * move changed and lead with that one idea" (coachChatPrompt.ts, ONE PRIMARY
 * IDEA). For a cold user that dominant idea is chosen by raw magnitude of the
 * concept-delta. This module lets a per-user weakness memory *re-weight* that
 * choice: when the current move touches a concept the player struggles with
 * repeatedly ACROSS GAMES, that concept becomes the primary idea even if a
 * larger-magnitude but one-off idea is also present — because the recurring
 * weakness is the one that will actually transfer to their next game.
 *
 * Everything here is PURE and DETERMINISTIC (same candidates + same summary →
 * same primary), so the "cross-game memory changes the chosen primary idea"
 * acceptance criterion is a unit test, not an LLM eval. The store itself is
 * `weaknessProfile.ts` today (localStorage); `MasterySummary` is a bounded,
 * serializable projection of it so a server-side store can supply the same
 * shape later without touching this filter.
 */

/**
 * One teachable concept the move changed, tagged with the weakness-profile
 * category taxonomy so it can be matched against the player's recurring
 * weaknesses. `magnitude` is the cold (user-agnostic) importance in ~pawns.
 */
export interface TeachingCandidate {
  category: string;
  magnitude: number;
  text: string;
}

export interface MasteryWeakness {
  category: string;
  severity: "critical" | "frequent" | "occasional";
  frequency: number; // 0..1 — share of analyzed games the pattern appeared in
}

/**
 * Bounded, serializable projection of a per-user weakness store. Decoupled
 * from `WeaknessProfile` on purpose: a future server store can produce this
 * shape directly. Kept small (≤3 weaknesses) so injecting it never bloats the
 * prompt.
 */
export interface MasterySummary {
  gamesAnalyzed: number;
  weaknesses: MasteryWeakness[];
}

const MAX_SUMMARY_WEAKNESSES = 3;
// Below 2 analyzed games there is no cross-game signal — one game is noise, not
// a pattern. Mirrors getWeaknessPromptContext's own gate in weaknessProfile.ts.
const MIN_GAMES_FOR_MEMORY = 2;

const SEVERITY_BOOST: Record<MasteryWeakness["severity"], number> = {
  critical: 5,
  frequent: 3,
  occasional: 1,
};

/**
 * Project the full localStorage weakness profile into the bounded summary this
 * filter consumes. Returns null when there is no trustworthy cross-game signal
 * yet (no profile, or fewer than 2 games), so callers inject nothing.
 */
export function toMasterySummary(
  profile: WeaknessProfile | null | undefined
): MasterySummary | null {
  if (!profile || profile.gamesAnalyzed < MIN_GAMES_FOR_MEMORY) return null;

  // patterns are kept frequency-sorted by updateWeaknessProfile; take the top
  // recurring (non-occasional) ones, capped for prompt-size safety.
  const weaknesses: MasteryWeakness[] = profile.patterns
    .filter((p) => p.severity !== "occasional")
    .slice(0, MAX_SUMMARY_WEAKNESSES)
    .map((p) => ({
      category: p.category,
      severity: p.severity,
      frequency: p.frequency,
    }));

  if (!weaknesses.length) return null;
  return { gamesAnalyzed: profile.gamesAnalyzed, weaknesses };
}

/**
 * Categorize the concept-delta of a single move into candidate teaching ideas,
 * tagged with the weakness-profile taxonomy. Reuses the already-computed
 * PositionFeatureDelta (no re-analysis). Deduped to one candidate per category,
 * keeping the highest magnitude. Returns [] for an empty/quiet delta.
 */
export function candidatesFromDelta(
  delta: PositionFeatureDelta
): TeachingCandidate[] {
  if (delta.isEmptyDelta) return [];
  const byCategory = new Map<string, TeachingCandidate>();

  const add = (category: string, magnitude: number, text: string) => {
    if (magnitude <= 0) return;
    const existing = byCategory.get(category);
    if (!existing || magnitude > existing.magnitude) {
      byCategory.set(category, { category, magnitude, text });
    }
  };

  // Material / hung pieces → board-vision failure ("Hanging Pieces"). Material
  // swing carries the numeric magnitude; a bare newly-hanging piece with no
  // swing yet still counts as a ~3pt board-vision lapse (minor-piece value).
  const net = delta.materialDelta.black - delta.materialDelta.white;
  const hung = delta.hangingPiecesDelta.newlyHanging;
  const hangMagnitude = Math.max(Math.abs(net), hung.length > 0 ? 3 : 0);
  if (hangMagnitude > 0) {
    const parts: string[] = [];
    if (net !== 0) {
      const side = net > 0 ? "Black" : "White";
      parts.push(`material swung ~${Math.abs(net)}p toward ${side}`);
    }
    if (hung.length) {
      parts.push(
        `hanging: ${hung
          .slice(0, 2)
          .map((h) => `${h.color} ${h.piece} on ${h.square}`)
          .join(", ")}`
      );
    }
    add("Hanging Pieces", hangMagnitude, parts.join("; "));
  }

  // Conceded threats → missed the opponent's reply ("Missed Tactics").
  const newThreats = delta.threatsDelta.newThreats;
  if (newThreats.length) {
    add(
      "Missed Tactics",
      2,
      `new threat(s): ${newThreats
        .slice(0, 2)
        .map((t) => t.description)
        .join("; ")}`
    );
  }

  // King-safety degradation ("King Safety").
  const ksW = delta.kingSafetyDelta.white;
  const ksB = delta.kingSafetyDelta.black;
  if (ksW < 0 || ksB < 0) {
    const worse = ksW < ksB ? "White" : "Black";
    add("King Safety", 1.5, `${worse}'s king safety dropped`);
  }

  // A piece the move trapped ("Piece Activity").
  const trapped = delta.pieceActivityDelta.newlyTrapped;
  if (trapped.length) {
    add(
      "Piece Activity",
      1,
      `newly trapped: ${trapped
        .slice(0, 1)
        .map((p) => `${p.color} ${p.piece} on ${p.square}`)
        .join(", ")}`
    );
  }

  return Array.from(byCategory.values());
}

function boostFor(category: string, summary: MasterySummary | null | undefined): number {
  if (!summary) return 0;
  const w = summary.weaknesses.find((x) => x.category === category);
  return w ? SEVERITY_BOOST[w.severity] : 0;
}

/** Deterministic ordering: score desc, then cold magnitude desc, then category asc. */
function rankBy(
  candidates: TeachingCandidate[],
  summary: MasterySummary | null | undefined
): TeachingCandidate[] {
  return [...candidates].sort((a, b) => {
    const sa = a.magnitude + boostFor(a.category, summary);
    const sb = b.magnitude + boostFor(b.category, summary);
    if (sb !== sa) return sb - sa;
    if (b.magnitude !== a.magnitude) return b.magnitude - a.magnitude;
    return a.category.localeCompare(b.category);
  });
}

export interface PrimaryIdeaResult {
  /** The idea to lead with, or null when the move is quiet (no candidates). */
  primary: TeachingCandidate | null;
  /** All candidates in the personalized ranking order. */
  ranked: TeachingCandidate[];
  /** True when the weakness memory changed the primary vs the cold ranking. */
  personalized: boolean;
}

/**
 * Pick the single primary teaching idea for this move and this user. With no
 * summary (cold user) the largest-magnitude concept wins. With a summary, a
 * recurring-weakness category is boosted and can overtake a larger one-off
 * idea — that flip is what `personalized` reports and what the cross-game
 * memory test asserts.
 */
export function selectPrimaryIdea(
  candidates: TeachingCandidate[],
  summary?: MasterySummary | null
): PrimaryIdeaResult {
  if (!candidates.length) {
    return { primary: null, ranked: [], personalized: false };
  }
  const cold = rankBy(candidates, null);
  const ranked = rankBy(candidates, summary);
  const personalized =
    !!summary && cold[0].category !== ranked[0].category;
  return { primary: ranked[0], ranked, personalized };
}

/**
 * Bounded prompt block naming the player's recurring cross-game weaknesses and
 * the directive to lead with one when the current position touches it. Returns
 * "" when there is no trustworthy signal (so nothing is injected). Kept to a
 * few lines — never dump the full profile into the prompt.
 */
export function renderPersonalizedFocus(
  summary: MasterySummary | null | undefined
): string {
  if (!summary || !summary.weaknesses.length) return "";
  const lines = summary.weaknesses.map(
    (w) =>
      `- ${w.category} — recurred in ${Math.round(w.frequency * 100)}% of games [${w.severity}]`
  );
  return [
    `PERSONALIZED FOCUS (cross-game weakness memory, ${summary.gamesAnalyzed} games analyzed):`,
    ...lines,
    "When the current move touches one of these recurring weaknesses, make THAT the ONE PRIMARY IDEA even if a larger one-off point also exists — the recurring pattern is the lesson that transfers. Connect it explicitly ('this is the same pattern we've seen before'). Do not invent a weakness the position does not show.",
  ].join("\n");
}
