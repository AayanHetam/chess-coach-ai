/**
 * PR-CI-5 — CONTRACT_UIDS parsing + the serving-arming precedence rule.
 *
 * Two failure classes are pinned here because both have already cost this
 * project a deploy cycle in other flags:
 *   1. the Vercel trailing-"\n" save hazard (MASTERMIND_VALIDATORS_ENABLED
 *      shipped as "true\n" and only .trim() saved it);
 *   2. an allowlist that matches MORE than it was given — here, uid case
 *      folding, which would arm uids the founder never listed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetContractEnvCacheForTests,
  getContractEnv,
  parseContractUids,
} from "@/env";
import {
  contractServingDecision,
  isContractServingArmed,
  isContractServingConfigured,
} from "../servingGate";

describe("parseContractUids", () => {
  it("empty / undefined ⇒ []", () => {
    expect(parseContractUids(undefined)).toEqual([]);
    expect(parseContractUids("")).toEqual([]);
    expect(parseContractUids("   ")).toEqual([]);
    expect(parseContractUids(",,, ,")).toEqual([]);
  });

  it("splits on commas and trims", () => {
    expect(parseContractUids("abc, def ,ghi")).toEqual(["abc", "def", "ghi"]);
  });

  it("survives the Vercel trailing-newline save", () => {
    expect(parseContractUids("aayanUid123\n")).toEqual(["aayanUid123"]);
    expect(parseContractUids(" aayanUid123 ,\n")).toEqual(["aayanUid123"]);
  });

  it("treats newlines/tabs as separators (multi-line paste)", () => {
    expect(parseContractUids("uidA\nuidB\r\nuidC\tuidD")).toEqual([
      "uidA",
      "uidB",
      "uidC",
      "uidD",
    ]);
  });

  it("strips surrounding quotes from a pasted value", () => {
    expect(parseContractUids('"uidA,uidB"')).toEqual(["uidA", "uidB"]);
    expect(parseContractUids("'uidA' , \"uidB\"")).toEqual(["uidA", "uidB"]);
  });

  it("dedupes", () => {
    expect(parseContractUids("uidA,uidA, uidA ")).toEqual(["uidA"]);
  });

  it("does NOT fold case — an allowlist must never match what it was not given", () => {
    expect(parseContractUids("AbCdEf")).toEqual(["AbCdEf"]);
    // Two uids that differ only by case are two DIFFERENT users.
    expect(parseContractUids("AbCdEf,abcdef")).toEqual(["AbCdEf", "abcdef"]);
  });
});

describe("getContractEnv().uids", () => {
  beforeEach(() => {
    __resetContractEnvCacheForTests();
    vi.unstubAllEnvs();
  });

  it("defaults to [] (fully dark — no dogfood arming)", () => {
    __resetContractEnvCacheForTests();
    expect(getContractEnv().uids).toEqual([]);
    expect(isContractServingConfigured(getContractEnv())).toBe(false);
  });

  it("reads and hardens CONTRACT_UIDS", () => {
    vi.stubEnv("CONTRACT_UIDS", " aayanUid123 , internUid456 ,\n");
    __resetContractEnvCacheForTests();
    expect(getContractEnv().uids).toEqual(["aayanUid123", "internUid456"]);
    expect(isContractServingConfigured(getContractEnv())).toBe(true);
  });

  it("CONTRACT_UIDS alone counts as configured (categories still empty)", () => {
    vi.stubEnv("CONTRACT_UIDS", "aayanUid123");
    __resetContractEnvCacheForTests();
    expect(getContractEnv().categories).toEqual([]);
    expect(isContractServingConfigured(getContractEnv())).toBe(true);
  });
});

describe("contractServingDecision — precedence", () => {
  const env = (categories: string[], uids: string[]) => ({ categories, uids });

  it("nothing armed ⇒ off (the CI-4 default and the rollback state)", () => {
    expect(
      contractServingDecision({ category: "game_review", uid: "aayan", env: env([], []) }),
    ).toEqual({ armed: false, reason: "off" });
  });

  it("category armed ⇒ armed for EVERY uid", () => {
    const e = env(["position_analysis"], []);
    expect(
      contractServingDecision({ category: "position_analysis", uid: "anyone", env: e }).reason,
    ).toBe("category");
    expect(
      contractServingDecision({ category: "position_analysis", uid: null, env: e }).reason,
    ).toBe("category");
  });

  it("uid armed ⇒ armed for EVERY category, including ones not listed", () => {
    const e = env(["position_analysis"], ["aayan"]);
    const d = contractServingDecision({ category: "game_review", uid: "aayan", env: e });
    expect(d).toEqual({ armed: true, reason: "uid" });
  });

  it("uid NOT armed on an unlisted category ⇒ off (this is the CI-5 dark posture)", () => {
    const e = env(["position_analysis"], ["aayan"]);
    expect(isContractServingArmed({ category: "game_review", uid: "someoneElse", env: e })).toBe(
      false,
    );
  });

  it("category wins the reason when BOTH match (rollout, not dogfood)", () => {
    const e = env(["game_review"], ["aayan"]);
    expect(contractServingDecision({ category: "game_review", uid: "aayan", env: e }).reason).toBe(
      "category",
    );
  });

  it("category match is case/whitespace-insensitive", () => {
    const e = env(["game_review"], []);
    expect(isContractServingArmed({ category: " Game_Review ", uid: "x", env: e })).toBe(true);
  });

  it("uid match is EXACT — case differences do not arm", () => {
    const e = env([], ["AbCdEf"]);
    expect(isContractServingArmed({ category: "game_review", uid: "AbCdEf", env: e })).toBe(true);
    expect(isContractServingArmed({ category: "game_review", uid: "abcdef", env: e })).toBe(false);
    expect(isContractServingArmed({ category: "game_review", uid: "ABCDEF", env: e })).toBe(false);
  });

  it("empty/whitespace uid never arms, even if the allowlist somehow held one", () => {
    const e = env([], ["", "   "]);
    expect(isContractServingArmed({ category: "game_review", uid: "", env: e })).toBe(false);
    expect(isContractServingArmed({ category: "game_review", uid: "   ", env: e })).toBe(false);
    expect(isContractServingArmed({ category: "game_review", uid: undefined, env: e })).toBe(false);
  });

  it("empty category never arms via the category lever", () => {
    const e = env([""], []);
    expect(isContractServingArmed({ category: "", uid: "x", env: e })).toBe(false);
  });

  it("uid arming survives the trailing-newline env value end to end", () => {
    vi.stubEnv("CONTRACT_CATEGORIES", "");
    vi.stubEnv("CONTRACT_UIDS", "aayanUid123\n");
    __resetContractEnvCacheForTests();
    expect(isContractServingArmed({ category: "game_review", uid: "aayanUid123" })).toBe(true);
    expect(isContractServingArmed({ category: "game_review", uid: "otherUid" })).toBe(false);
    __resetContractEnvCacheForTests();
    vi.unstubAllEnvs();
  });
});
