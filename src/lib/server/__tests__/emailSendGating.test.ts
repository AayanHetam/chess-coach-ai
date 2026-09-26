import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * The suppression list is only worth anything if it is consulted on the path
 * that actually sends. These tests assert against the Resend client itself:
 * a suppressed address must produce ZERO provider calls, not a provider call
 * that happens to be filtered somewhere downstream.
 */

const { mockSend, mockSuppressed } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockSuppressed: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));
vi.mock("@/lib/server/emailSuppression", () => ({
  isEmailSuppressed: mockSuppressed,
}));
vi.mock("@/env", () => ({
  getAuthEnv: () => ({
    email: { resendApiKey: "re_test", fromAddress: "noreply@chessmasti.com" },
  }),
}));

import { sendDailyReminderEmail, sendPasswordResetEmail } from "../email";

beforeEach(() => {
  vi.clearAllMocks();
  mockSend.mockResolvedValue({ error: null });
  mockSuppressed.mockResolvedValue(false);
});

const UNSUB = "https://chessmasti.com/api/reminders/unsubscribe?uid=u1&t=abc";

describe("bulk email is gated on the suppression list", () => {
  it("does not reach the provider at all for a suppressed address", async () => {
    mockSuppressed.mockResolvedValue(true);
    const outcome = await sendDailyReminderEmail({
      to: "gone@example.com",
      unsubscribeUrl: UNSUB,
    });
    expect(outcome).toBe("suppressed");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sends when the address is not suppressed", async () => {
    const outcome = await sendDailyReminderEmail({
      to: "player@example.com",
      unsubscribeUrl: UNSUB,
    });
    expect(outcome).toBe("sent");
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("carries a visible unsubscribe link in BOTH html and plain text", async () => {
    // A text-only client still has to be able to opt out.
    await sendDailyReminderEmail({ to: "p@example.com", unsubscribeUrl: UNSUB });
    const payload = mockSend.mock.calls[0][0];
    expect(payload.html).toContain(UNSUB);
    expect(payload.text).toContain(UNSUB);
  });

  it("carries the RFC 8058 one-click headers", async () => {
    await sendDailyReminderEmail({ to: "p@example.com", unsubscribeUrl: UNSUB });
    const headers = mockSend.mock.calls[0][0].headers;
    expect(headers["List-Unsubscribe"]).toBe(`<${UNSUB}>`);
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});

describe("transactional email is exempt", () => {
  it("reaches a SUPPRESSED address, or account recovery would be impossible", async () => {
    mockSuppressed.mockResolvedValue(true);
    await sendPasswordResetEmail({
      to: "gone@example.com",
      resetUrl: "https://chessmasti.com/reset?t=x",
      expiresInMinutes: 30,
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSuppressed).not.toHaveBeenCalled();
  });

  it("carries no unsubscribe headers — it is not bulk mail", async () => {
    await sendPasswordResetEmail({
      to: "p@example.com",
      resetUrl: "https://chessmasti.com/reset?t=x",
      expiresInMinutes: 30,
    });
    expect(mockSend.mock.calls[0][0].headers).toBeUndefined();
  });
});
