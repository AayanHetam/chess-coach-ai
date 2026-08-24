// Turning a set of picks into a bracket, and saying honestly how much of it is
// finished.
//
// Pure: no React, no storage, no clock. Everything here is arithmetic over the
// map that scripts/openings/build-repertoire-map.mjs derived.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE NUMBER THIS FILE EXISTS TO GET RIGHT
//
// "Your Black repertoire covers 84% of what you will actually face."
//
// That is the only claim on the page a player will repeat to themselves, and it
// is the one that would be easiest to inflate. So it is defined precisely:
//
//   Every root slot carries its share of your games. Filling it with a choice
//   answers `absorbs` of what follows and hands the rest to child slots, each
//   carrying its own share of the parent. A slot nobody has filled contributes
//   its whole share to OPEN, not to covered.
//
// The consequences are deliberate. Choosing 1...e5 and stopping scores badly,
// because 1...e5 is a move and not a repertoire. Choosing the London scores
// 100% immediately, because a system genuinely does answer everything. Neither
// is flattery; both are what the data says.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  RepertoireMap,
  RepertoirePick,
  RepertoireSlot,
} from '@/types/repertoire';

/** A slot in the bracket, with whatever fills it and whatever it opened up. */
export interface BracketNode {
  slot: RepertoireSlot;
  pick: RepertoirePick | null;
  /**
   * Share of your games as this colour that reach this slot, 0-1.
   *
   * Compounded down the tree: a branch worth 20% of a slot that is itself
   * worth 30% of your games is worth 6%, and showing it as 20% would make
   * every deep slot look more urgent than the shallow one that created it.
   */
  reach: number;
  children: BracketNode[];
  /** Depth from the root, for indentation and for capping the walk. */
  depth: number;
}

export interface Coverage {
  /** Share of your games you have an answer for, 0-1. */
  answered: number;
  /** The unfilled slots, biggest first. */
  open: BracketNode[];
  /** Filled slots, for a count. */
  filled: number;
}

const byId = (map: RepertoireMap) => new Map(map.slots.map(s => [s.id, s]));

/** Root slots for a side: what a repertoire on this colour must start from. */
export function roots(map: RepertoireMap, side: 'white' | 'black'): RepertoireSlot[] {
  return map.slots
    .filter(s => s.side === side && s.origin === null)
    .sort((a, b) => b.share - a.share);
}

/**
 * How many roots a band is asked to fill before the rest are offered.
 *
 * The tightest consensus in the whole coaching literature is about BREADTH, not
 * depth: one White opening, one answer to 1.e4, one answer to 1.d4, and that is
 * a beginner's repertoire. Chess.com's own beginner study plan says the same
 * thing, and so does every coach surveyed. Depth-by-rating, by contrast, has no
 * agreed numbers anywhere — which is why `BANDS` says out loud that it is a
 * judgement.
 *
 * White has one root, so a beginner meets exactly three decisions across both
 * colours. Nothing is hidden: the rest are returned as `deferred` and one click
 * away, because a player who wants the whole map should have the whole map.
 */
const ESSENTIAL_ROOTS: Record<string, number> = {
  new: 2,
  beginner: 2,
  improving: 3,
  club: 99,
  strong: 99,
};

export interface FocusedRoots {
  /** What this band is asked to fill now. */
  focus: RepertoireSlot[];
  /** Real slots, deliberately not asked for yet. Never hidden, only deferred. */
  deferred: RepertoireSlot[];
}

/**
 * Roots split into what to ask for now and what to leave for later.
 *
 * Sorted by share first, so "later" always means the rarest thing rather than
 * whatever happened to be last in the file. A slot worth 6% of a beginner's
 * games is a real slot; it is just not the one that will win them points this
 * month.
 */
export function focusedRoots(
  map: RepertoireMap,
  side: 'white' | 'black',
  bandId: string
): FocusedRoots {
  const all = roots(map, side);
  const limit = ESSENTIAL_ROOTS[bandId] ?? 99;
  return { focus: all.slice(0, limit), deferred: all.slice(limit) };
}

/**
 * The bracket as it stands.
 *
 * Children only appear once their parent is filled, which is the whole shape of
 * the thing: you cannot be asked "what do you play against the London" before
 * you have said you meet 1.d4 with 1...Nf6. Showing every possible branch up
 * front would present a hundred questions, most of which will never apply.
 */
export function buildBracket(
  map: RepertoireMap,
  side: 'white' | 'black',
  picks: RepertoirePick[],
  maxDepth = 3
): BracketNode[] {
  const slots = byId(map);
  const picked = new Map(picks.map(p => [p.slotId, p]));

  function node(slot: RepertoireSlot, reach: number, depth: number): BracketNode {
    const pick = picked.get(slot.id) ?? null;
    const children: BracketNode[] = [];
    if (pick && depth < maxDepth) {
      const choice = slot.choices.find(c => c.id === pick.choiceId);
      for (const gap of choice?.gaps ?? []) {
        const child = slots.get(gap.slot);
        if (child) children.push(node(child, reach * gap.share, depth + 1));
      }
      children.sort((a, b) => b.reach - a.reach);
    }
    return { slot, pick, reach, children, depth };
  }

  return roots(map, side).map(slot => node(slot, side === 'white' ? 1 : slot.share, 0));
}

/** Walk a bracket depth-first. */
export function flatten(nodes: BracketNode[]): BracketNode[] {
  return nodes.flatMap(n => [n, ...flatten(n.children)]);
}

/**
 * How much of what you will face you have an answer for.
 *
 * An unfilled slot counts as fully open. A slot filled with a choice counts as
 * covered for the share that choice absorbs, and its gaps are counted
 * separately as their own slots — so an answered slot with four unanswered
 * branches under it is NOT complete, and the number says so.
 */
export function coverage(
  map: RepertoireMap,
  side: 'white' | 'black',
  picks: RepertoirePick[]
): Coverage {
  const nodes = buildBracket(map, side, picks);
  const open: BracketNode[] = [];
  let answered = 0;
  let filled = 0;

  for (const node of flatten(nodes)) {
    if (!node.pick) {
      open.push(node);
      continue;
    }
    filled += 1;
    const choice = node.slot.choices.find(c => c.id === node.pick?.choiceId);
    if (!choice) {
      // Filled from the library or from the move list. We have no proof of what
      // it absorbs, so we credit the slot and claim nothing about what follows.
      // Crediting the branches too would be inventing coverage for a line we
      // have never measured.
      answered += node.reach;
      continue;
    }
    // The rest of `reach` flows to this choice's gaps, which are their own
    // nodes in the walk and are counted there.
    answered += node.reach * choice.absorbs;
  }

  // A repertoire that answers 1.e4 and 1.d4 and stops is not finished, so the
  // first moves outside the named roots stay uncovered rather than ignored.
  const scale = side === 'black' ? 1 - map.meta.otherFirstMoves : 1;
  open.sort((a, b) => b.reach - a.reach);
  return { answered: clamp(answered * scale), open, filled };
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Systems already in the bracket that this slot can transpose into.
 *
 * The honest form of "a Grünfeld covers 1.c4". It does not: it covers about a
 * quarter of it, and only when White cooperates by playing d4. Returned as a
 * lower bound and sorted, so the strongest real overlap is offered first.
 */
export function transposesInto(
  map: RepertoireMap,
  slotId: string,
  picks: RepertoirePick[]
): Array<{ choiceId: string; name: string; atLeast: number }> {
  const chosen = new Set(picks.map(p => p.choiceId).filter(Boolean) as string[]);
  const names = new Map<string, string>();
  for (const slot of map.slots) for (const c of slot.choices) names.set(c.id, c.name);
  return map.transpositions
    .filter(t => t.slot === slotId && chosen.has(t.choice))
    .map(t => ({ choiceId: t.choice, name: names.get(t.choice) ?? t.choice, atLeast: t.atLeast }))
    .sort((a, b) => b.atLeast - a.atLeast);
}

/**
 * What to call a slot.
 *
 * The opening's name when the position has one, and otherwise the move that
 * reached it. Never a bare position: "Against 2.Bf4" is something a player can
 * act on and an unnamed FEN is not.
 */
export function slotTitle(slot: RepertoireSlot): string {
  if (slot.line.length === 0) return 'Your first move';
  if (slot.name) return `Against the ${stripArticle(slot.name)}`;
  return `Against ${numberedLine(slot.line)}`;
}

function stripArticle(name: string): string {
  return name.replace(/^The\s+/i, '');
}

/** `1.d4 Nf6 2.Bf4`, and the last move alone when the line is long. */
export function numberedLine(line: string[], from = 0): string {
  const out: string[] = [];
  for (let i = from; i < line.length; i++) {
    if (i % 2 === 0) out.push(`${Math.floor(i / 2) + 1}.${line[i]}`);
    else if (out.length === 0) out.push(`${Math.floor(i / 2) + 1}...${line[i]}`);
    else out.push(line[i]);
  }
  return out.join(' ');
}

/** A share as a percentage string, never rounding a real branch away to "0%". */
export function share(value: number): string {
  const pct = value * 100;
  if (pct > 0 && pct < 1) return '<1%';
  return `${Math.round(pct)}%`;
}
