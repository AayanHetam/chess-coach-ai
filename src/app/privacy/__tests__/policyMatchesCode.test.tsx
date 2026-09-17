import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrivacyPage from "@/app/privacy/page";

/**
 * The privacy policy is a claim about what the code does. These tests pin the
 * claims that are cheapest to falsify by accident — the ones that were already
 * wrong once.
 *
 * Until 2026-09-16 the policy said deletion meant emailing a Gmail address and
 * waiting seven days, which stayed true only as long as nobody shipped an
 * in-app button; and it said Resend "sends the password-reset email", which
 * stopped being the whole truth the day reminder emails shipped. Both drifted
 * silently because nothing connected the page to the behaviour.
 *
 * These assertions are not a substitute for reading the policy against the
 * code. They are a tripwire for the specific sentences that promise something
 * a future change can quietly take away.
 */

function pageText(): string {
  return renderToStaticMarkup(<PrivacyPage />)
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&rarr;/g, "->")
    .replace(/&mdash;/g, "--")
    .replace(/\s+/g, " ")
    .trim();
}

describe("privacy policy matches what the code actually does", () => {
  it("points at the in-app delete control, not only at an email address", () => {
    const text = pageText();
    expect(text).toContain("Delete my account");
    expect(text).toContain("type DELETE to confirm");
    // The old promise must not be the ONLY route offered any more.
    expect(text).not.toMatch(
      /Email\s+aayanhetamsaria4@gmail\.com\s+and we'll delete your account and saved games within seven days\./
    );
  });

  it("names the surfaces deletion actually clears, including the public ones", () => {
    const text = pageText();
    // These two are the ones a reader would not guess and the ones that were
    // being left behind before 2026-09-16.
    expect(text).toContain("public Puzzle Rush leaderboard");
    expect(text).toContain("handle reservation");
  });

  it("admits what deletion does NOT reach", () => {
    // A policy that claims total erasure is a policy that is lying: pre-signin
    // analytics is not linkable to the account, and internship applications
    // are filed by email.
    const text = pageText();
    expect(text).toContain("before you ever signed in");
    expect(text).toContain("internship");
  });

  it("does not understate what the email provider receives", () => {
    const text = pageText();
    expect(text).toContain("Resend");
    // Reminders shipped after the original sentence was written.
    expect(text).toContain("training-reminder");
    expect(text).toContain("one-click unsubscribe");
  });

  it("never claims Chess Masti collects nothing", () => {
    const text = pageText().toLowerCase();
    expect(text).not.toContain("we do not collect any");
    expect(text).not.toContain("we collect no data");
    // The AI disclosure has to stay: the coach ships game data to a third party.
    expect(text).toContain("anthropic");
  });
});
