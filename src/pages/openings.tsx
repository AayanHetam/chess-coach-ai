// /openings is retired. It is now a doorway to /learn.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS HERE
//
// A 1,092-line surface titled "Opening Training — master your openings through
// flashcard-style drills with spaced repetition", offering ONE course: a
// hand-authored Vienna Game, at 0%.
//
// It had to go because it competed with the real thing. /learn now holds 43
// generated courses cut to the player's level, and /train/course/<id>/<n> asks
// about them. Two surfaces called opening training, with the older and emptier
// one easier to find, is worse than one.
//
// A REDIRECT RATHER THAN A 404, and temporary rather than permanent: the page
// was linked from the app drawer for months, and a 308 would be cached by
// browsers past any decision to change our minds.
//
// PGN import is NOT lost. Its dialog, its parser and the storage key for every
// repertoire anyone imported are all still in the tree — see
// src/lib/learn/customRepertoires.ts for why they are kept and what still owes
// them a screen.
// ─────────────────────────────────────────────────────────────────────────────

import type { GetServerSideProps } from "next";

export default function OpeningsRetired() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: "/learn", permanent: false },
});
