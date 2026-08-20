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
    const parsed = signupSchema.parse({
      ...base,
      ageAffirmed: true,
      termsAccepted: true,
    });
    expect(parsed.ageAffirmed).toBe(true);
    expect(parsed.termsAccepted).toBe(true);
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

  it("rejects missing or false legal consent", () => {
    expect(() => signupSchema.parse({ ...base, ageAffirmed: true })).toThrow(
      "Please accept the Terms of Service and Privacy Policy to sign up."
    );
    expect(() =>
      signupSchema.parse({ ...base, ageAffirmed: true, termsAccepted: false })
    ).toThrow(
      "Please accept the Terms of Service and Privacy Policy to sign up."
    );
  });
});

describe("signupSchema emailOptIn (optional marketing consent)", () => {
  const consented = { ...base, ageAffirmed: true, termsAccepted: true };

  it("is not required — a payload without it still parses", () => {
    expect(signupSchema.parse(consented).emailOptIn).toBeUndefined();
  });

  it("accepts an explicit true or false", () => {
    expect(
      signupSchema.parse({ ...consented, emailOptIn: true }).emailOptIn
    ).toBe(true);
    expect(
      signupSchema.parse({ ...consented, emailOptIn: false }).emailOptIn
    ).toBe(false);
  });

  it("never gates signup the way the required consents do", () => {
    // emailOptIn: false must NOT throw — that is the whole difference
    // between this checkbox and ageAffirmed/termsAccepted.
    expect(() =>
      signupSchema.parse({ ...consented, emailOptIn: false })
    ).not.toThrow();
  });

  it("rejects non-boolean values (no type coercion)", () => {
    expect(() =>
      signupSchema.parse({ ...consented, emailOptIn: "true" })
    ).toThrow();
    expect(() =>
      signupSchema.parse({ ...consented, emailOptIn: 1 })
    ).toThrow();
  });
});

describe("signupSchema handle (required)", () => {
  it("accepts a handle", () => {
    expect(
      signupSchema.parse({ ...base, ageAffirmed: true, termsAccepted: true })
        .handle
    ).toBe("lazerwizard");
  });

  it("trims it", () => {
    expect(
      signupSchema.parse({
        ...base,
        handle: "  lazer  ",
        ageAffirmed: true,
        termsAccepted: true,
      }).handle
    ).toBe("lazer");
  });

  it("rejects a missing handle with an actionable message", () => {
    const { handle: _h, ...noHandle } = base;
    void _h;
    try {
      signupSchema.parse({
        ...noHandle,
        ageAffirmed: true,
        termsAccepted: true,
      });
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
        signupSchema.parse({
          ...base,
          handle,
          ageAffirmed: true,
          termsAccepted: true,
        })
      ).toThrow();
    }
  });

  it("does not enforce SHAPE here — that is checkHandle's job on the server", () => {
    // Deliberate: this schema only guarantees a non-empty string arrives.
    // Duplicating the reserved list and the fold rules here would give two
    // places to keep in sync, and the server one is the gate that matters.
    expect(() =>
      signupSchema.parse({
        ...base,
        handle: "admin",
        ageAffirmed: true,
        termsAccepted: true,
      })
    ).not.toThrow();
  });
});

describe("which error a client missing everything is shown", () => {
  it("reports the COPPA affirmation before the terms and the handle", () => {
    // Zod reports issues in FIELD ORDER and the route surfaces only the
    // first, so field order is a product decision here, not a style one. A
    // browser holding a bundle from before any of these changes posts none
    // of them, and the age affirmation is the legally load-bearing one.
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

  it("reports the terms consent before the handle once age is affirmed", () => {
    const { handle: _h, ...noHandle } = base;
    void _h;
    try {
      signupSchema.parse({ ...noHandle, ageAffirmed: true });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(firstZodError(err as z.ZodError)).toBe(
        "Please accept the Terms of Service and Privacy Policy to sign up."
      );
    }
  });

  it("reports the handle once both consents are satisfied", () => {
    const { handle: _h, ...noHandle } = base;
    void _h;
    try {
      signupSchema.parse({
        ...noHandle,
        ageAffirmed: true,
        termsAccepted: true,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(firstZodError(err as z.ZodError)).toBe(
        "Pick a handle to finish signing up."
      );
    }
  });
});
