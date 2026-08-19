/**
 * Where the solver stands on the current puzzle.
 *
 * Lived inline in `puzzles.tsx` until the analysis gate needed to reason about
 * it too. Shared rather than duplicated because the gate's whole job is to key
 * off these exact values — two copies that drift is precisely how a "wrong"
 * state quietly starts unlocking something it shouldn't.
 *
 * `wrong` is transient and retryable: the board resets and the solver tries
 * again. It is NOT a terminal state, which matters to anything deciding
 * whether the answer is still a secret.
 */
export type AttemptStatus = "playing" | "wrong" | "solved";
