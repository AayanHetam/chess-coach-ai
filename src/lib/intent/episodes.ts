import type { IntentSummary } from "@/lib/contract/types";
import type { IntentFacts } from "./types";

/**
 * Ply → episode collapsing.
 *
 * Raw per-ply intent counts overstate badly: 25 of the 34 "surviving mates"
 * the module once reported were consecutive plies of ONE lost ending. Any
 * consumer that quotes a number — telemetry, cards, an eval harness — must
 * first collapse a mover's consecutive identical claims into a single episode
 * and split by mover. This module is that collapse, built once.
 *
 * The rule: within ONE mover's analysed plies (in ply order), a run of rows
 * that all carry the same fact family with the same identity key is one
 * episode. An analysed same-mover ply WITHOUT the fact breaks the run — the
 * story visibly changed. An UN-analysed gap does not break it: a review that
 * cards plies 40 and 46 has no evidence about 42, and inventing a boundary
 * there would multiply episodes exactly the way per-ply counting did.
 *
 * Families that persist across plies (a threat left unanswered, a mate that
 * keeps hanging over the game, a prophylactic story) collapse on their
 * identity key. One-shot families (a capture, an escape, a trap sprung, a
 * cost paid) are their own episode per ply by construction — their key is the
 * ply itself.
 */

export type EpisodeFamily =
  | "mate"
  | "material"
  | "trap"
  | "escape"
  | "prophylaxis"
  | "unaddressedThreat"
  | "cost";

export interface IntentEpisode {
  family: EpisodeFamily;
  /** Identity within the family — threat SAN for threats, "mate" for mates, `ply:N` for one-shot facts. */
  key: string;
  mover: "w" | "b";
  /** Analysed plies in the episode, ascending. */
  plies: number[];
}

/**
 * Identity key per family, or null when the fact is absent on this ply.
 * Persisting families key on WHAT persists; one-shot families key on the ply.
 */
function familyKey(family: EpisodeFamily, facts: IntentFacts, ply: number): string | null {
  switch (family) {
    case "mate":
      return facts.mate ? "mate" : null;
    case "unaddressedThreat":
      return facts.unaddressedThreat ? facts.unaddressedThreat.threatSan : null;
    case "prophylaxis":
      return facts.prophylaxis ? facts.prophylaxis.threatSan : null;
    case "material":
      return facts.material ? `ply:${ply}` : null;
    case "trap":
      return facts.trap ? `ply:${ply}` : null;
    case "escape":
      return facts.escape ? `ply:${ply}` : null;
    case "cost":
      return facts.cost ? `ply:${ply}` : null;
  }
}

const FAMILIES: EpisodeFamily[] = [
  "mate",
  "material",
  "trap",
  "escape",
  "prophylaxis",
  "unaddressedThreat",
  "cost",
];

export function collapseToEpisodes(rows: IntentSummary[]): IntentEpisode[] {
  const episodes: IntentEpisode[] = [];
  for (const mover of ["w", "b"] as const) {
    const mine = rows
      .filter((r) => r.mover === mover)
      .sort((a, b) => a.ply - b.ply);
    for (const family of FAMILIES) {
      let open: IntentEpisode | null = null;
      for (const r of mine) {
        const key = familyKey(family, r.facts, r.ply);
        if (key === null) {
          // Analysed ply without the fact: the run, if any, is over.
          open = null;
          continue;
        }
        if (open && open.key === key) {
          open.plies.push(r.ply);
        } else {
          open = { family, key, mover, plies: [r.ply] };
          episodes.push(open);
        }
      }
    }
  }
  return episodes.sort(
    (a, b) => a.plies[0] - b.plies[0] || a.family.localeCompare(b.family),
  );
}

/** Episode counts per family — the shape the telemetry row stores. */
export function episodeCountsByFamily(
  rows: IntentSummary[],
): Partial<Record<EpisodeFamily, number>> {
  const counts: Partial<Record<EpisodeFamily, number>> = {};
  for (const ep of collapseToEpisodes(rows)) {
    counts[ep.family] = (counts[ep.family] ?? 0) + 1;
  }
  return counts;
}
