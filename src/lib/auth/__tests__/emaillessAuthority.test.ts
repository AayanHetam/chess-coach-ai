import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { internEmailFor } from "@/lib/intern/allowlist";

/**
 * Nothing may grant authority to an account with no email.
 *
 * Making `session.email` optional is the kind of change where every
 * `x.email === admin` stays correct and every `x.email !== admin` quietly
 * inverts. These cover the two places that derive permission from an address.
 */

describe("internEmailFor", () => {
  it("returns the address for a real intern", () => {
    expect(
      internEmailFor({ email: "  Intern@Example.com ", isIntern: true })
    ).toBe("intern@example.com");
  });

  it("returns null when the session is not an intern", () => {
    expect(internEmailFor({ email: "a@b.com", isIntern: false })).toBeNull();
    expect(internEmailFor({ email: "a@b.com" })).toBeNull();
  });

  it("returns null for an intern flag with no address behind it", () => {
    // Four routes keyed Supabase rows on `session.email` directly. Without
    // this they would have written `undefined.toLowerCase()` at runtime, or
    // — worse, if it had been coerced — an intern row belonging to nobody.
    expect(internEmailFor({ isIntern: true })).toBeNull();
    expect(internEmailFor({ email: "   ", isIntern: true })).toBeNull();
    expect(internEmailFor({ email: "", isIntern: true })).toBeNull();
  });
});

describe("requireAdmin", () => {
  const ADMIN = "boss@example.com";

  beforeEach(() => {
    vi.resetModules();
    process.env.CMIP_DASHBOARD_ADMIN_EMAIL = ADMIN;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CMIP_DASHBOARD_ADMIN_EMAIL;
  });

  async function callWith(session: Record<string, unknown> | null) {
    vi.doMock("../session", () => ({
      getSession: async () => session,
    }));
    const { requireAdmin } = await import("../requireAdmin");
    return requireAdmin();
  }

  it("admits the configured admin", async () => {
    const out = await callWith({ uid: "u1", email: ADMIN });
    expect("session" in out).toBe(true);
  });

  it("refuses a session with NO email", async () => {
    // The bug this exists for: `session.email.trim() !== admin` becomes
    // `undefined !== admin`, which is true, so it refuses — but one refactor
    // to `?.` and it becomes `undefined !== admin` on an optional chain that
    // some future edit turns into a permissive default. Asserted explicitly.
    const out = await callWith({ uid: "u1" });
    expect("response" in out).toBe(true);
    if ("response" in out) expect(out.response.status).toBe(403);
  });

  it("refuses a different email", async () => {
    const out = await callWith({ uid: "u1", email: "someone@else.com" });
    expect("response" in out).toBe(true);
  });
});
