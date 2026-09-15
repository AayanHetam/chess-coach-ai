// One place that turns a catalogue choice into build options.
//
// Two scripts walk the catalogue — build-courses.mjs to write the artifacts and
// build-eval-gaps.mjs to find what they still need evaluated — and they must
// build the SAME course from the same choice, or the gap pass fills holes in a
// tree the real build never walks. The threshold flags are passed in rather
// than defaulted here so neither script can quietly diverge on them either.

/**
 * @param {{ id: string, name: string, root: string[], side: 'white'|'black', coverage?: string, setup?: string[] }} choice
 * @param {{ maxPly: number, minShare: number, minGames: number }} flags
 */
export function courseOptionsFor(choice, { maxPly, minShare, minGames }) {
  return {
    id: choice.id,
    name: choice.name,
    root: choice.root,
    side: choice.side,
    maxPly,
    minShare,
    minGames,
    // A system's fixed move list. Engine vets it; engine does not choose it.
    setup: choice.coverage === 'system' ? choice.setup ?? null : null,
  };
}
