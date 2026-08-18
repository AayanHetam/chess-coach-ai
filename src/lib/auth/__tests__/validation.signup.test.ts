import { describe, expect, it } from "vitest";
import { signupSchema, firstZodError } from "../validation";
import { z } from "zod";

const base = {
  email: "new@user.com",
  password: "longenough1!",
  // Required since handles became mandatory at signup. Present in `base` so
  // the COPPA cases below still test what they say they test: with the handle
  // missing too, `firstZodError` would report the handle and these would pass
  // for the wrong reason.
  handle: "lazerwizard",
};

describe("signupSchema ageAffirmed (COPPA)", () => {
  it("accepts ageAffirmed: true", () => {
    const parsed = signupSchema.parse({ ...base, ageAffirmed: true });
    expect(parsed.ageAffirmed).toBe(true);
  });

  it("rejects a missing ageAffirmed with the affirmation message (deploy-skew clients)", () => {
    try {
      signupSchema.parse(base);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(z.ZodError);
      expect(firstZodError(err as z.ZodError)).toBe(
        "Please confirm you're 13 or older to sign up."
      );
    }
  });

  it("rejects ageAffirmed: false with the affirmation message", () => {
    try {
      signupSchema.parse({ ...base, ageAffirmed: false });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(z.ZodError);
      expect(firstZodError(err as z.ZodError)).toBe(
        "Please confirm you're 13 or older to sign up."
      );
    }
  });

  it("rejects truthy non-boolean values (no type coercion)", () => {
    expect(() =>
      signupSchema.parse({ ...base, ageAffirmed: "true" })
    ).toThrow();
    expect(() => signupSchema.parse({ ...base, ageAffirmed: 1 })).toThrow();
  });
});

describe("signupSchema handle (required)", () => {
  it("accepts a handle", () => {
    expect(signupSchema.parse({ ...base, ageAffirmed: true }).handle).toBe(
      "lazerwizard"
    );
  });

  it("trims it", () => {
    expect(
      signupSchema.parse({ ...base, handle: "  lazer  ", ageAffirmed: true })
        .handle
    ).toBe("lazer");
  });

  it("rejects a missing handle with an actionable message", () => {
    const { handle: _h, ...noHandle } = base;
    void _h;
    try {
      signupSchema.parse({ ...noHandle, ageAffirmed: true });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(z.ZodError);
      // A browser holding a pre-handle bundle lands here. The message has to
      // tell them what to do, because "Invalid input" sends them nowhere.
      expect(firstZodError(err as z.ZodError)).toBe(
        "Pick a handle to finish signing up."
      );
    }
  });

  it("rejects an empty or whitespace-only handle", () => {
    for (const handle of ["", "   "]) {
      expect(() =>
        signupSchema.parse({ ...base, handle, ageAffirmed: true })
      ).toThrow();
    }
  });

  it("does not enforce SHAPE here — that is checkHandle's job on the server", () => {
    // Deliberate: this schema only guarantees a non-empty string arrives.
    // Duplicating the reserved list and the fold rules here would give two
    // places to keep in sync, and the server one is the gate that matters.
    expect(() =>
      signupSchema.parse({ ...base, handle: "admin", ageAffirmed: true })
    ).not.toThrow();
  });
});

describe("which error a client missing everything is shown", () => {
  it("reports the COPPA affirmation before the handle", () => {
    // Zod reports issues in FIELD ORDER and the route surfaces only the
    // first, so field order is a product decision here, not a style one. A
    // browser holding a bundle from before either change posts neither, and
    // the age affirmation is the legally load-bearing one.
    try {
      signupSchema.parse({
        email: "new@user.com",
        password: "longenough1!",
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(firstZodError(err as z.ZodError)).toMatch(/13 or older/i);
    }
  });

  it("reports the handle once the affirmation is satisfied", () => {
    const { handle: _h, ...noHandle } = base;
    void _h;
    try {
      signupSchema.parse({ ...noHandle, ageAffirmed: true });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(firstZodError(err as z.ZodError)).toBe(
        "Pick a handle to finish signing up."
      );
    }
  });
});
