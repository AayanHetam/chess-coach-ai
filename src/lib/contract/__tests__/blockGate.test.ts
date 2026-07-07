/**
 * PR-CI-3 gate tests: grammar-aware block buffering + the mandatory
 * unclosed-block flush safety (plan risk #5 — "flush-on-done + truncation
 * footnote is mandatory and fixture-tested").
 *
 * shadow mode  — pure observer: forward is never called; blocks are
 *                detected across arbitrary delta boundaries.
 * enforce mode — (built now, wired in CI-4): prefix streams immediately,
 *                blocks emit as one burst, forwarded bytes ≡ input bytes,
 *                unclosed remainder flushes with the truncation footnote.
 */
import { describe, it, expect } from "vitest";
import { InsightBlockGate } from "@/lib/contract/blockGate";
import type { CompletedBlock, PartialBlock } from "@/lib/contract/blockGate";

const HEADER = "11:w:blunder:+1.38:-2.12:Bd3:Ne6";
const BLOCK_1 = `[INSIGHT:${HEADER}]\nHeadline one.\n[WHY]\nIdea: x\n[/WHY]\n[/INSIGHT]`;
const BLOCK_2 = `[INSIGHT:14:b:mistake:-0.50:+1.20:g5:f4]\nHeadline two.\n[/INSIGHT]`;
const MESSAGE = `Let's walk through the key moments.\n\n${BLOCK_1}\n\n${BLOCK_2}`;

/** Split into n-char deltas — exercises marker splits across pushes. */
function chunk(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

describe("InsightBlockGate — shadow mode (observer)", () => {
  it.each([1, 3, 7, 64, 4096])("detects both blocks with %d-char deltas and never forwards", (size) => {
    const blocks: CompletedBlock[] = [];
    let forwarded = "";
    const gate = new InsightBlockGate({
      mode: "shadow",
      forward: (t) => {
        forwarded += t;
      },
      onBlock: (b) => blocks.push(b),
    });
    for (const d of chunk(MESSAGE, size)) gate.push(d);
    gate.end();

    expect(forwarded).toBe(""); // shadow NEVER emits — the route owns bytes
    expect(blocks).toHaveLength(2);
    expect(blocks[0].headerRaw).toBe(HEADER);
    expect(blocks[0].text).toBe(BLOCK_1);
    expect(blocks[0].body).toBe("\nHeadline one.\n[WHY]\nIdea: x\n[/WHY]\n");
    expect(blocks[1].headerRaw).toBe("14:b:mistake:-0.50:+1.20:g5:f4");
    expect(blocks[1].text).toBe(BLOCK_2);
    expect(gate.blocksSeen).toBe(2);
  });

  it("reports an unclosed trailing block at end() (max_tokens truncation)", () => {
    const partials: PartialBlock[] = [];
    const blocks: CompletedBlock[] = [];
    const gate = new InsightBlockGate({
      mode: "shadow",
      onBlock: (b) => blocks.push(b),
      onUnclosedBlock: (p) => partials.push(p),
    });
    const truncated = `${BLOCK_1}\n\n[INSIGHT:${HEADER}]\nThis card was cut off mid-`;
    for (const d of chunk(truncated, 5)) gate.push(d);
    gate.end();
    expect(blocks).toHaveLength(1);
    expect(partials).toHaveLength(1);
    expect(partials[0].headerRaw).toBe(HEADER);
    expect(partials[0].text).toBe(`[INSIGHT:${HEADER}]\nThis card was cut off mid-`);
  });

  it("a throwing onBlock callback never breaks the stream (defense-in-depth)", () => {
    const seen: string[] = [];
    const gate = new InsightBlockGate({
      mode: "shadow",
      onBlock: (b) => {
        seen.push(b.headerRaw);
        throw new Error("referee bug");
      },
    });
    expect(() => {
      for (const d of chunk(MESSAGE, 9)) gate.push(d);
      gate.end();
    }).not.toThrow();
    expect(seen).toHaveLength(2); // both blocks still observed
  });
});

describe("InsightBlockGate — enforce mode (CI-4 wiring, fixture-tested now)", () => {
  it("forwards prefix text immediately (TTFT unchanged) and blocks as single bursts", () => {
    const emissions: string[] = [];
    const gate = new InsightBlockGate({
      mode: "enforce",
      forward: (t) => emissions.push(t),
      onBlock: () => {},
    });
    // Push the entire prefix, then the block in fragments.
    gate.push("Let's walk through the key moments.\n\n");
    // Prefix must already be out BEFORE any block bytes complete.
    expect(emissions.join("")).toBe("Let's walk through the key moments.\n\n");
    for (const d of chunk(BLOCK_1, 10)) gate.push(d);
    gate.end();
    // The block arrives as exactly one burst.
    expect(emissions[emissions.length - 1]).toBe(BLOCK_1);
    expect(emissions.join("")).toBe(`Let's walk through the key moments.\n\n${BLOCK_1}`);
  });

  it.each([1, 4, 33])("byte-preserving: forwarded output ≡ input for %d-char deltas", (size) => {
    let out = "";
    const gate = new InsightBlockGate({ mode: "enforce", forward: (t) => (out += t) });
    for (const d of chunk(MESSAGE, size)) gate.push(d);
    gate.end();
    expect(out).toBe(MESSAGE);
  });

  it("MANDATORY flush safety: unclosed block flushes fully + truncation footnote", () => {
    let out = "";
    const partials: PartialBlock[] = [];
    const FOOTNOTE = "\n\n_(analysis truncated)_";
    const gate = new InsightBlockGate({
      mode: "enforce",
      forward: (t) => (out += t),
      onUnclosedBlock: (p) => partials.push(p),
      truncationFootnote: FOOTNOTE,
    });
    const truncated = `intro text ${BLOCK_1} between [INSIGHT:${HEADER}]\ncut off mid-sent`;
    for (const d of chunk(truncated, 7)) gate.push(d);
    gate.end();
    // NOTHING swallowed: every input byte reaches the client, plus footnote.
    expect(out).toBe(truncated + FOOTNOTE);
    expect(partials).toHaveLength(1);
  });

  it("flushes a trailing ambiguous open-marker prefix at end()", () => {
    let out = "";
    const gate = new InsightBlockGate({ mode: "enforce", forward: (t) => (out += t) });
    gate.push("The answer is [INSIG"); // looks like a block might start…
    // The ambiguous tail is held back until disambiguated.
    expect(out).toBe("The answer is ");
    gate.end(); // …stream ends: the held tail must not be swallowed.
    expect(out).toBe("The answer is [INSIG");
  });

  it("a bracket that is NOT an open marker is released once disambiguated", () => {
    let out = "";
    const gate = new InsightBlockGate({ mode: "enforce", forward: (t) => (out += t) });
    gate.push("See [INS");
    gate.push("TRUCTIONS] for details."); // not [INSIGHT: — releases
    gate.end();
    expect(out).toBe("See [INSTRUCTIONS] for details.");
  });
});
