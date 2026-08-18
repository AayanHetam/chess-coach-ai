import type { PositionEval } from "@/types/eval";

/**
 * Choose which evaluation of the current position to show.
 *
 * Two can exist at once for the same FEN:
 *  • `saved` — from the whole-game review pass, at the review's depth.
 *  • `live`  — from the search this screen asked for, at the user's depth.
 *
 * The Lines tab used to prefer `saved` unconditionally whenever it existed,
 * which meant asking for more depth or more lines than the review produced
 * changed nothing at all: the shallower answer kept being served and the
 * controls looked inert. Depth wins; on equal depth, the wider result wins.
 */
export function pickDisplayEval(
  saved: PositionEval | null | undefined,
  live: PositionEval | null | undefined
): PositionEval | null {
  const s = saved?.lines?.length ? saved : null;
  const l = live?.lines?.length ? live : null;
  if (!s) return l ?? null;
  if (!l) return s;

  const sDepth = s.lines[0]?.depth ?? 0;
  const lDepth = l.lines[0]?.depth ?? 0;
  if (lDepth !== sDepth) return lDepth > sDepth ? l : s;
  return l.lines.length > s.lines.length ? l : s;
}

/**
 * True when what we have already satisfies what was asked for, so no new
 * search is needed. Both dimensions matter — a depth-30 answer with one line
 * does not satisfy a request for three.
 */
export function satisfiesRequest(
  positionEval: PositionEval | null | undefined,
  wantDepth: number,
  wantLines: number
): boolean {
  if (!positionEval?.lines?.length) return false;
  return (
    (positionEval.lines[0]?.depth ?? 0) >= wantDepth &&
    positionEval.lines.length >= wantLines
  );
}
