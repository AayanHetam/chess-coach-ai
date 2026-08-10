import { describe, expect, it } from "vitest";
import { signupSchema, firstZodError } from "../validation";
import { z } from "zod";

const base = {
  email: "new@user.com",
  password: "longenough1!",
};

describe("signupSchema ageAffirmed (COPPA)", () => {
  it("accepts ageAffirmed: true", () => {
    const parsed = signupSchema.parse({ ...base, ageAffirmed: true });
    expect(parsed.ageAffirmed).toBe(true);
  });

  it("rejects a missing ageAffirmed with the DOB message (deploy-skew clients)", () => {
    try {
      signupSchema.parse(base);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(z.ZodError);
      expect(firstZodError(err as z.ZodError)).toBe(
        "Please confirm your date of birth to sign up."
      );
    }
  });

  it("rejects ageAffirmed: false with the DOB message", () => {
    try {
      signupSchema.parse({ ...base, ageAffirmed: false });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(z.ZodError);
      expect(firstZodError(err as z.ZodError)).toBe(
        "Please confirm your date of birth to sign up."
      );
    }
  });

  it("rejects truthy non-boolean values (no type coercion)", () => {
    expect(() => signupSchema.parse({ ...base, ageAffirmed: "true" })).toThrow();
    expect(() => signupSchema.parse({ ...base, ageAffirmed: 1 })).toThrow();
  });
});
