/**
 * The ordering rule between hydrating progress from the server and pushing it
 * back — extracted from useProgressSync because getting it wrong is silent and
 * destructive, and because two bare refs inside an effect are not a place a
 * rule like this can be read or tested.
 *
 * The rule: a device may push only AFTER the server copy has been merged in.
 *
 * Why it matters. Every best starts at 0 on a browser that has not hydrated.
 * `mergeProgress` runs on the CLIENT, so whatever gets pushed is what the
 * server stores — PUT /api/progress deliberately takes the snapshot as final.
 * Push before hydrating and the zeros are the snapshot: the user's real bests
 * are overwritten by a device that simply hadn't loaded them yet. The
 * leaderboard derived from them was flattened the same way, and there its
 * max-wins guard is the only thing that can still refuse the regression.
 *
 * The window is not theoretical: hydration is a network round trip and the
 * push debounce is 2.5s, which a cold serverless GET routinely exceeds.
 *
 * The subtlety worth naming: hydration must count as finished even when it
 * FAILS. An offline device still has to be able to save what its user does
 * this session, so a failed hydrate opens the gate. What must never open it is
 * hydration merely having STARTED — which is the bug this replaced.
 */
export class ProgressSyncGate {
  private hydratedFor: string | null = null;
  private hydratingFor: string | null = null;

  /**
   * Claims the right to hydrate for `uid`. False when hydration for this user
   * has already finished or is still in flight, so the caller skips it —
   * re-entrancy control, separate from whether pushing is allowed.
   */
  claimHydrate(uid: string): boolean {
    if (this.hydratedFor === uid || this.hydratingFor === uid) return false;
    this.hydratingFor = uid;
    return true;
  }

  /** Call however hydration ended, success or failure. */
  completeHydrate(uid: string): void {
    this.hydratedFor = uid;
    if (this.hydratingFor === uid) this.hydratingFor = null;
  }

  /**
   * Gives up an in-flight claim without declaring hydration done, so the next
   * mount can retry it. Needed because an unmount — React StrictMode's
   * deliberate double-mount, or `user` changing identity — abandons the fetch
   * midway; without this the claim would still be held, the retry would be
   * refused as a duplicate, and canPush would stay false forever, which is a
   * device that silently never saves again.
   *
   * Deliberately cannot revoke a COMPLETED hydration: if the fetch happened to
   * settle before the unmount, that merge really did happen.
   */
  abandonHydrate(uid: string): void {
    if (this.hydratingFor === uid) this.hydratingFor = null;
  }

  /** Sign-out: the next sign-in must hydrate again before it may push. */
  reset(): void {
    this.hydratedFor = null;
    this.hydratingFor = null;
  }

  canPush(uid: string): boolean {
    return this.hydratedFor === uid;
  }
}
