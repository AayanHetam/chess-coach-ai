import { describe, expect, it, vi } from "vitest";

const { createUser } = vi.hoisted(() => ({ createUser: vi.fn() }));

vi.mock("@/env", () => ({
  assertAuthSecrets: vi.fn(),
}));
vi.mock("@/lib/server/users", () => ({
  createUser,
  toSafe: vi.fn(),
  UserError: class UserError extends Error {},
}));
vi.mock("@/lib/auth/session", () => ({
  setSessionCookieOnResponse: vi.fn(),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  AdminConfigError: class AdminConfigError extends Error {},
}));
vi.mock("@/lib/intern/allowlist", () => ({
  isAllowlistedIntern: vi.fn(),
}));
vi.mock("@/lib/auth/isAdmin", () => ({
  isDashboardAdminEmail: vi.fn(),
}));

import { POST } from "../route";

const valid = {
  email: "new@example.com",
  password: "longenough1!",
  ageAffirmed: true,
  termsAccepted: true,
};

describe("POST /api/auth/signup consent enforcement", () => {
  it("rejects a direct request without legal acceptance before account creation", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ ...valid, termsAccepted: false }),
      })
    );

    expect(response.status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });
});
