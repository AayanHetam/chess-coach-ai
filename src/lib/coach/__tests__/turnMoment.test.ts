/**
 * The turn-1 moment's wire module (pathway 4.1): the card key, and the
 * promise that the module imports nothing at runtime, so a Playwright spec
 * can import it by relative path.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { cardKey, TURN_MOMENT_EVENT } from "../turnMoment";

describe("cardKey", () => {
  it("is FNV-1a 32 with the standard offset basis and prime", () => {
    expect(cardKey("")).toBe("811c9dc5");
    expect(cardKey("a")).toBe("e40c292c");
    expect(cardKey("foobar")).toBe("bf9cf968");
  });

  it("is deterministic, eight lowercase hex digits, and moves with one character", () => {
    const card =
      "[INSIGHT:8:w:blunder:+2.84:-2.11:Nc7+:Qxc1]\nYou went for the check.\n[/INSIGHT]";
    expect(cardKey(card)).toBe(cardKey(card));
    expect(cardKey(card)).toMatch(/^[0-9a-f]{8}$/);
    expect(cardKey(card.replace("check.", "check!"))).not.toBe(cardKey(card));
    expect(cardKey(`${card} `)).not.toBe(cardKey(card));
  });

  it("hashes UTF-16 code units, so text outside ASCII keys too", () => {
    expect(cardKey("Masti é")).toMatch(/^[0-9a-f]{8}$/);
    expect(cardKey("Masti é")).not.toBe(cardKey("Masti e"));
  });

  it("names the SSE event", () => {
    expect(TURN_MOMENT_EVENT).toBe("moment");
  });
});

describe("the module", () => {
  it("has no runtime import (types only)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "turnMoment.ts"),
      "utf8"
    );
    const imports = src.match(/^\s*import\b.*$/gm) ?? [];
    expect(imports.length).toBeGreaterThan(0);
    for (const line of imports) expect(line).toMatch(/^\s*import type\b/);
    expect(src).not.toMatch(/\brequire\(/);
    expect(src).not.toMatch(/\bimport\(/);
  });
});
