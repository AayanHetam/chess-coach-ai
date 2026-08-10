/**
 * PR-CI-4 enforced contract stream: prefix TTFT, whole-card bursts in
 * order, server-authoritative headers, citation stripping across delta
 * boundaries, unclosed-block truncation flush, off-plan card fail-visible.
 * Hermetic: deterministic referee mode, no network.
 */
import { describe, it, expect, vi } from "vitest";
import { createEnforcedContractStream, TRUNCATION_FOOTNOTE } from "@/lib/contract/enforcedStream";
import type { EnforcedStreamOpts } from "@/lib/contract/enforcedStream";
import { renderInsightHeader } from "@/lib/contract/insightGrammar";
import { makeContract, makeInsight } from "./insightFactory";

vi.mock("@/lib/logging", () => ({
  logger: {
    child: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  },
}));

const insightA = makeInsight(); // M1, move 11 w, Bd3
const insightB = makeInsight({
  moveNumber: 14,
  color: "b",
  playedSan: "Bd3",
  factIdPrefix: "M2",
  topMistakeRank: 2,
});
const contract = makeContract([insightA, insightB]);

const CLEAN_A = "Solid effort, but Ne6 was the move [F:M1]. After Ne6 Qd7 Nxg7 White nets the advantage at +3.20 [F:M1.pv0].";
const CLEAN_B = "Steady move [F:M2].";
const BAD_B_EXTRA =
  "A steady choice that kept the position balanced and the king out of trouble [F:M2].\nThe eval crashed to -9.50 here.";

function makeStream(over: Partial<EnforcedStreamOpts> = {}) {
  const emitted: string[] = [];
  const stream = createEnforcedContractStream({
    contract,
    emit: (t) => emitted.push(t),
    correlationId: "t",
    refereeMode: "deterministic",
    citationGranularity: "sentence",
    deadlineAtMs: Date.now() + 60_000,
    regenSystem: { stable: "SYS", perUser: "USER" },
    ...over,
  });
  return { stream, emitted };
}

function feed(stream: { push(d: string): void }, text: string, chunk = 13) {
  for (let i = 0; i < text.length; i += chunk) stream.push(text.slice(i, i + chunk));
}

const headerA = renderInsightHeader(insightA);
const headerB = renderInsightHeader(insightB);

describe("enforced stream", () => {
  it("streams the prefix immediately (before any card completes), strips citations, and bursts cards in order", async () => {
    const { stream, emitted } = makeStream();
    const prefix = "Let's walk through the key moments [F:M1].\n\n";
    feed(stream, prefix);
    // Prefix must be flowing to the client BEFORE any block completes (the
    // FIFO chain settles on microtasks — flush them, no wall-clock wait).
    await new Promise((r) => setTimeout(r, 0));
    expect(emitted.join("")).toContain("Let's walk through");
    expect(emitted.join("")).not.toContain("[F:");

    feed(stream, `${headerA}\n${CLEAN_A}\n[/INSIGHT]\n\n${headerB}\n${CLEAN_B}\n[/INSIGHT]`);
    const summary = await stream.end();
    const full = emitted.join("");

    expect(summary.cards.map((c) => c.factIdPrefix)).toEqual(["M1", "M2"]);
    expect(summary.ladderDistribution.pass).toBe(2);
    expect(full.indexOf(headerA)).toBeGreaterThan(-1);
    expect(full.indexOf(headerA)).toBeLessThan(full.indexOf(headerB));
    expect(full).not.toContain("[F:");
    expect(summary.finalText).toBe(full);
    expect(summary.citedFactIds).toEqual(expect.arrayContaining(["M1", "M1.pv0", "M2"]));
    expect(summary.unclosedBlock).toBe(false);
  });

  it("rewrites a model-mangled header from the contract (server-authoritative)", async () => {
    const { stream, emitted } = makeStream();
    // Wrong eval fields + wrong best move in the model's header for M1.
    feed(stream, `[INSIGHT:11:w:blunder:+9.99:-9.99:Bd3:Qh5]\n${CLEAN_A}\n[/INSIGHT]`);
    const summary = await stream.end();
    const full = emitted.join("");
    expect(full).toContain(headerA); // authoritative rewrite
    expect(full).not.toContain("+9.99");
    expect(summary.cards[0].stage).toBe("pass");
  });

  it("anchors a malformed header to the next expected card by order", async () => {
    const { stream, emitted } = makeStream();
    feed(stream, `[INSIGHT:garbled]\n${CLEAN_A}\n[/INSIGHT]`);
    const summary = await stream.end();
    expect(summary.cards[0].factIdPrefix).toBe("M1");
    expect(emitted.join("")).toContain(headerA);
  });

  it("a violating card resolves through the ladder (template floor) while clean cards pass", async () => {
    const { stream, emitted } = makeStream();
    feed(stream, `${headerA}\n${CLEAN_A}\n[/INSIGHT]\n${headerB}\nThe eval crashed to -9.50 in this spot for -9.50 reasons.\n[/INSIGHT]`);
    const summary = await stream.end();
    expect(summary.ladderDistribution.pass).toBe(1);
    expect(summary.ladderDistribution.templated).toBe(1);
    expect(emitted.join("")).not.toContain("-9.50");
    expect(summary.errorsInitialTotal).toBeGreaterThan(0);
  });

  it("sentence-drops a violation confined to one sentence (no LLM, no budgets)", async () => {
    const { stream, emitted } = makeStream();
    feed(stream, `${headerB}\n${BAD_B_EXTRA}\n[/INSIGHT]`);
    const summary = await stream.end();
    expect(summary.ladderDistribution.sentence_drop).toBe(1);
    expect(emitted.join("")).toContain("A steady choice");
    expect(emitted.join("")).not.toContain("-9.50");
    expect(summary.budgets.editsRemaining).toBe(2);
    expect(summary.budgets.regensRemaining).toBe(3);
  });

  it("unclosed trailing block flushes raw + truncation footnote (never swallowed)", async () => {
    const { stream, emitted } = makeStream();
    feed(stream, `${headerA}\ncut off mid-sentence about the`);
    const summary = await stream.end();
    expect(summary.unclosedBlock).toBe(true);
    const full = emitted.join("");
    expect(full).toContain("cut off mid-sentence");
    expect(full).toContain(TRUNCATION_FOOTNOTE.trim());
  });

  it("an off-plan extra card (no contract insight left) ships fail-visible with an unverified footnote", async () => {
    const { stream, emitted } = makeStream();
    feed(
      stream,
      `${headerA}\n${CLEAN_A}\n[/INSIGHT]\n${headerB}\n${CLEAN_B}\n[/INSIGHT]\n[INSIGHT:29:w:mistake:+0.10:-0.90:h4:g3]\nAn invented third card.\n[/INSIGHT]`,
    );
    const summary = await stream.end();
    expect(summary.unanchoredBlocks).toBe(1);
    const full = emitted.join("");
    expect(full).toContain("An invented third card.");
    expect(full).toContain("served unverified");
    expect(summary.cards).toHaveLength(2); // ladder ran only on anchored cards
  });
});
