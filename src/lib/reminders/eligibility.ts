/**
 * Who gets a daily reminder, and why not.
 *
 * Extracted from `/api/send-reminders` so it can be tested. That route is the
 * retention loop the whole programme depends on, it runs unattended on a cron,
 * and it had **no tests at all** — while also being written to return 200 even
 * when every send fails, so a regression here is silent by design.
 *
 * The route still owns delivery, pruning and counters; this owns the decision.
 */

/** How long after training we consider someone "already nudged by doing it". */
export const INACTIVE_CUTOFF_MS = 20 * 60 * 60 * 1000;

export interface ReminderCandidate {
  email?: string | null;
  lastActiveAt?: number | null;
  pushSubscriptionCount: number;
}

export type ReminderSkipReason = "no-channel" | "recently-active";

export interface ReminderDecision {
  send: boolean;
  reason?: ReminderSkipReason;
}

/**
 * Decide whether to nudge one user.
 *
 * @param user            The candidate. Assumes `reminderPrefs.enabled` was
 *                        already true — that filter lives in the Firestore
 *                        query, not here.
 * @param now             Epoch ms. Injected so tests don't touch the clock.
 * @param pushConfigured  Whether VAPID keys exist. When false, stored push
 *                        subscriptions are unusable, so a user with push but
 *                        no email has no channel at all — which is exactly the
 *                        production state today and worth being explicit about.
 */
export function decideReminder(
  user: ReminderCandidate,
  now: number,
  pushConfigured: boolean,
  cutoffMs: number = INACTIVE_CUTOFF_MS,
): ReminderDecision {
  const hasPush = pushConfigured && user.pushSubscriptionCount > 0;
  const hasEmail = Boolean(user.email);
  if (!hasEmail && !hasPush) return { send: false, reason: "no-channel" };

  // Someone who trained a few hours ago doesn't need telling to train. Note
  // this reads lastActiveAt, which is only written by the shared
  // useRecordTrainingDay hook — a training surface that forgets to call it
  // would make its own users look idle and over-nudge them.
  if (
    typeof user.lastActiveAt === "number" &&
    now - user.lastActiveAt < cutoffMs
  ) {
    return { send: false, reason: "recently-active" };
  }

  return { send: true };
}
