import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parseMastermindFlag,
  getMastermindEnv,
  __resetMastermindEnvCacheForTests,
} from "../env";

// ─────────────────────────────────────────────────────────────────────
// parseMastermindFlag — pure function, no env stubbing required
// ─────────────────────────────────────────────────────────────────────

describe("parseMastermindFlag: truthy values", () => {
  it.each(["true", "1", "yes"])("'%s' → true", (raw) => {
    expect(parseMastermindFlag(raw)).toBe(true);
  });
});

describe("parseMastermindFlag: case-insensitivity", () => {
  it.each(["TRUE", "True", "TrUe", "YES", "Yes"])("'%s' → true", (raw) => {
    expect(parseMastermindFlag(raw)).toBe(true);
  });
});

describe("parseMastermindFlag: whitespace tolerance", () => {
  it.each(["  true  ", "\ttrue\n", " 1 ", "yes  "])(
    "trims and parses '%s' → true",
    (raw) => {
      expect(parseMastermindFlag(raw)).toBe(true);
    },
  );
});

describe("parseMastermindFlag: falsy values", () => {
  it.each(["false", "FALSE", "0", "no", "off", "disabled"])(
    "'%s' → false",
    (raw) => {
      expect(parseMastermindFlag(raw)).toBe(false);
    },
  );

  it("empty string → false", () => {
    expect(parseMastermindFlag("")).toBe(false);
  });

  it("whitespace-only → false", () => {
    expect(parseMastermindFlag("   ")).toBe(false);
  });

  it("undefined → false", () => {
    expect(parseMastermindFlag(undefined)).toBe(false);
  });

  it("garbage string → false", () => {
    expect(parseMastermindFlag("garbage")).toBe(false);
  });

  it("'truefoo' (prefix match guard) → false", () => {
    expect(parseMastermindFlag("truefoo")).toBe(false);
  });

  it("'2' → false (only '1' is truthy)", () => {
    expect(parseMastermindFlag("2")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// getMastermindEnv — env-stubbing + memoization
// ─────────────────────────────────────────────────────────────────────

describe("getMastermindEnv: env reading", () => {
  beforeEach(() => {
    __resetMastermindEnvCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetMastermindEnvCacheForTests();
  });

  it("unset env → validatorsEnabled false", () => {
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "");
    expect(getMastermindEnv()).toEqual({ validatorsEnabled: false });
  });

  it("'true' → validatorsEnabled true", () => {
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "true");
    expect(getMastermindEnv()).toEqual({ validatorsEnabled: true });
  });

  it("'1' → validatorsEnabled true", () => {
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "1");
    expect(getMastermindEnv()).toEqual({ validatorsEnabled: true });
  });

  it("'yes' → validatorsEnabled true", () => {
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "yes");
    expect(getMastermindEnv()).toEqual({ validatorsEnabled: true });
  });

  it("'false' → validatorsEnabled false", () => {
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "false");
    expect(getMastermindEnv()).toEqual({ validatorsEnabled: false });
  });

  it("garbage value → validatorsEnabled false (safe default)", () => {
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "maybe");
    expect(getMastermindEnv()).toEqual({ validatorsEnabled: false });
  });

  it("case-insensitive: 'TRUE' → true", () => {
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "TRUE");
    expect(getMastermindEnv()).toEqual({ validatorsEnabled: true });
  });
});

describe("getMastermindEnv: memoization", () => {
  beforeEach(() => {
    __resetMastermindEnvCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetMastermindEnvCacheForTests();
  });

  it("second call returns cached value even if env changes mid-process", () => {
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "true");
    const first = getMastermindEnv();
    expect(first.validatorsEnabled).toBe(true);

    // Flip env — memoized reader should still report true.
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "false");
    const second = getMastermindEnv();
    expect(second.validatorsEnabled).toBe(true);
  });

  it("returns the same object reference (identity-stable across calls)", () => {
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "true");
    const first = getMastermindEnv();
    const second = getMastermindEnv();
    expect(first).toBe(second);
  });

  it("__resetMastermindEnvCacheForTests clears the cache; next call re-reads env", () => {
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "true");
    expect(getMastermindEnv().validatorsEnabled).toBe(true);

    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "false");
    __resetMastermindEnvCacheForTests();

    expect(getMastermindEnv().validatorsEnabled).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Production-safety invariant
// ─────────────────────────────────────────────────────────────────────

describe("getMastermindEnv: production-safety invariant", () => {
  beforeEach(() => {
    __resetMastermindEnvCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetMastermindEnvCacheForTests();
  });

  it("default false applies when env var entirely absent (no stub)", () => {
    // Delete the var if it leaked in from the test env.
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "");
    expect(getMastermindEnv()).toEqual({ validatorsEnabled: false });
  });

  it("typo-resistant: 'tru' / 'rue' / 'yess' all default false", () => {
    for (const raw of ["tru", "rue", "yess", "1.0", "true ", "true\0"]) {
      expect(parseMastermindFlag(raw)).toBe(raw === "true " ? true : false);
    }
  });
});
