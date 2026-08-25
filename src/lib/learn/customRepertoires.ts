// PGN-imported repertoires, kept alive across the retirement of /openings.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS AT ALL
//
// The atom used to be declared inside src/pages/openings.tsx, which is now a
// redirect. Deleting it with the page would have orphaned every repertoire
// anybody ever imported: the DATA survives — `atomWithStorage` wrote it to
// localStorage under the key below and nothing clears it — but with no
// declaration left, nothing could ever read it again.
//
// So the key and the shape move here, unreferenced by any screen for now. The
// founder's decision on /openings was "retire, keep PGN import", and this is
// the half of that promise that can be kept in the same change as the
// retirement. The other half — an imported PGN becoming a course the trainer
// can ask about — is a real piece of work rather than a port, because a PGN
// carries no evaluations, no game counts and no reply shares, which is what
// the teach card is made of. It gets its own change.
// ─────────────────────────────────────────────────────────────────────────────

import { atomWithStorage } from 'jotai/utils';
import type { OpeningRepertoire } from '@/types/openings';

/** Unchanged from /openings, so existing imports are found rather than lost. */
export const CUSTOM_REPERTOIRES_KEY = 'chessMastiCustomRepertoires';

export const customRepertoiresAtom = atomWithStorage<OpeningRepertoire[]>(
  CUSTOM_REPERTOIRES_KEY,
  []
);
