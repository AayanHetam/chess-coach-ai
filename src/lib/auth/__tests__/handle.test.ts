import { describe, it, expect } from "vitest";
import {
  checkHandle,
  canonicalHandle,
  RESERVED_HANDLES,
  HANDLE_MIN,
  HANDLE_MAX,
} from "../handle";

describe("checkHandle — shape", () => {
  it("accepts an ordinary handle and preserves the typed capitalisation", () => {
    const r = checkHandle("Lazer_Wizard");
    expect(r.ok).toBe(true);
    expect(r.display).toBe("Lazer_Wizard");
    expect(r.canonical).toBe("lazerwizard");
  });

  it("trims surrounding whitespace", () => {
    expect(checkHandle("  lazer  ").display).toBe("lazer");
  });

  it("enforces the length bounds", () => {
    expect(checkHandle("ab").problem).toBe("too_short");
    expect(checkHandle("a".repeat(HANDLE_MIN)).ok).toBe(true);
    expect(checkHandle("a".repeat(HANDLE_MAX)).ok).toBe(true);
    expect(checkHandle("a".repeat(HANDLE_MAX + 1)).problem).toBe("too_long");
  });

  it("rejects a handle that starts or ends with a separator", () => {
    // A leading separator lets a handle be mistaken for a flag or a path
    // fragment; a trailing one is invisible in most UIs.
    expect(checkHandle("_lazer").problem).toBe("bad_shape");
    expect(checkHandle("-lazer").problem).toBe("bad_shape");
    expect(checkHandle("lazer_").problem).toBe("bad_shape");
    expect(checkHandle("lazer-").problem).toBe("bad_shape");
  });

  it("rejects spaces, dots and anything exotic", () => {
    for (const bad of [
      "lazer wizard",
      "lazer.wizard",
      "lazer@wizard",
      "lazer/wizard",
      "lazer\\wizard",
      "lazer#1",
      "lázer",
      "lazer​wizard", // zero-width space
      "🧙wizard",
    ]) {
      expect(checkHandle(bad).ok, `should reject ${JSON.stringify(bad)}`).toBe(
        false
      );
    }
  });

  it("rejects empty and missing input rather than throwing", () => {
    expect(checkHandle("").ok).toBe(false);
    expect(checkHandle(undefined).ok).toBe(false);
    expect(checkHandle(null).ok).toBe(false);
  });

  it("always explains itself when it says no", () => {
    // A validator that rejects without a reason is a dead end in the UI.
    for (const bad of ["ab", "a".repeat(99), "_x_", "admin", ""]) {
      const r = checkHandle(bad);
      expect(r.ok).toBe(false);
      expect(r.message, `no message for ${JSON.stringify(bad)}`).toBeTruthy();
      expect(r.problem).toBeTruthy();
    }
  });
});

describe("uniqueness is case- and separator-insensitive", () => {
  it("folds case", () => {
    expect(canonicalHandle("LazerWizard")).toBe(canonicalHandle("lazerwizard"));
  });

  it("folds underscores and hyphens together", () => {
    // `lazer_wizard` and `lazer-wizard` reading as two different people is a
    // phishing affordance, not a feature — and this handle is also a sign-in
    // credential.
    const a = canonicalHandle("lazer_wizard");
    const b = canonicalHandle("lazer-wizard");
    const c = canonicalHandle("lazerwizard");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("does not fold digits into letters", () => {
    // Deliberately NOT folding 0/o or 1/l: that would block far more
    // legitimate handles than it protects, and the display form is shown
    // everywhere anyway.
    expect(canonicalHandle("lazer0")).not.toBe(canonicalHandle("lazero"));
  });
});

describe("reserved handles", () => {
  it("blocks our own route namespace", () => {
    for (const name of ["admin", "api", "plan", "puzzles", "profile"]) {
      expect(checkHandle(name).problem, `${name} should be reserved`).toBe(
        "reserved"
      );
    }
  });

  it("blocks EVERY reserved name, whichever rule catches it", () => {
    // The guarantee is "unclaimable", not "rejected with problem=reserved".
    // Short entries like "u" and "me" are below HANDLE_MIN, so the length rule
    // fires first and gives the more accurate message. They stay on the list
    // so that lowering HANDLE_MIN later cannot silently release them.
    for (const name of Array.from(RESERVED_HANDLES)) {
      expect(checkHandle(name).ok, `${name} is claimable`).toBe(false);
    }
  });

  it("blocks impersonation of us", () => {
    for (const name of ["chessmasti", "official", "staff", "support"]) {
      expect(checkHandle(name).problem, `${name} should be reserved`).toBe(
        "reserved"
      );
    }
  });

  it("checks the CANONICAL form, so separators cannot smuggle one through", () => {
    // "Adm-in" must be as reserved as "admin", or the list is decoration.
    expect(checkHandle("Adm-in").problem).toBe("reserved");
    expect(checkHandle("A_D_M_I_N").problem).toBe("reserved");
    expect(checkHandle("chess-masti").problem).toBe("reserved");
    expect(checkHandle("ChessMasti").problem).toBe("reserved");
  });

  it("every reserved entry is itself in canonical form", () => {
    // Otherwise an entry can never match, and silently protects nothing.
    for (const name of Array.from(RESERVED_HANDLES)) {
      expect(canonicalHandle(name), `${name} is not canonical`).toBe(
        name.replace(/[_-]/g, "")
      );
      expect(name).toBe(name.toLowerCase());
    }
  });
});

describe("separator-only handles cannot slip past the length rule", () => {
  it("rejects a handle whose canonical form is too short", () => {
    // "a-b" passes the shape rule at 3 chars but folds to "ab" — two
    // characters of actual identity. Uniqueness is enforced on the fold, so
    // the length rule has to be too.
    expect(checkHandle("a-b").problem).toBe("too_short");
    expect(checkHandle("a_b").problem).toBe("too_short");
    expect(checkHandle("a-b-c").ok).toBe(true); // folds to "abc"
  });
});
