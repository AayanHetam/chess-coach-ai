import { describe, expect, it } from "vitest";
import {
  decideReminder,
  INACTIVE_CUTOFF_MS,
  type ReminderCandidate,
} from "@/lib/reminders/eligibility";

const NOW = 1_760_000_000_000;

function user(over: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    email: "player@example.com",
    lastActiveAt: null,
    pushSubscriptionCount: 0,
    ...over,
  };
}

describe("decideReminder", () => {
  it("nudges an idle user who has an email", () => {
    expect(decideReminder(user(), NOW, false)).toEqual({ send: true });
  });

  it("skips someone who trained inside the cutoff", () => {
    const justTrained = user({ lastActiveAt: NOW - 60_000 });
    expect(decideReminder(justTrained, NOW, false)).toEqual({
      send: false,
      reason: "recently-active",
    });
  });

  it("nudges again once the cutoff has passed", () => {
    const stale = user({ lastActiveAt: NOW - INACTIVE_CUTOFF_MS - 1 });
    expect(decideReminder(stale, NOW, false).send).toBe(true);
  });

  it("treats the cutoff boundary as still-recent", () => {
    const exactly = user({ lastActiveAt: NOW - INACTIVE_CUTOFF_MS });
    // now - lastActive === cutoff is NOT "< cutoff", so it sends. Pinned
    // because flipping this comparison would double-nudge daily users.
    expect(decideReminder(exactly, NOW, false).send).toBe(true);
  });

  it("skips a user with no email and no push", () => {
    expect(decideReminder(user({ email: null }), NOW, false)).toEqual({
      send: false,
      reason: "no-channel",
    });
  });

  it("counts push as a channel only when VAPID keys are configured", () => {
    const pushOnly = user({ email: null, pushSubscriptionCount: 2 });
    // Today's production state: subscriptions could exist but the keys don't,
    // so they are undeliverable and the user genuinely has no channel.
    expect(decideReminder(pushOnly, NOW, false)).toEqual({
      send: false,
      reason: "no-channel",
    });
    expect(decideReminder(pushOnly, NOW, true)).toEqual({ send: true });
  });

  it("still nudges an email user when push is unconfigured", () => {
    const both = user({ pushSubscriptionCount: 1 });
    expect(decideReminder(both, NOW, false).send).toBe(true);
  });

  it("treats a never-active user as idle rather than skipping them", () => {
    // Someone who signed up and never trained is the MOST important person to
    // reach; a missing lastActiveAt must not read as "recently active".
    expect(decideReminder(user({ lastActiveAt: null }), NOW, false).send).toBe(
      true,
    );
    expect(
      decideReminder(user({ lastActiveAt: undefined }), NOW, false).send,
    ).toBe(true);
  });

  it("checks the channel before recency", () => {
    // A recently-active user with no channel reports no-channel: the reason
    // string drives the skip counters, so a stable precedence keeps the cron's
    // telemetry meaningful.
    const both = user({ email: null, lastActiveAt: NOW - 1000 });
    expect(decideReminder(both, NOW, false).reason).toBe("no-channel");
  });
});
