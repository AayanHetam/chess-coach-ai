/**
 * Gold-standard contract→prose few-shots for the v4.0 verbalizer (PR-CI-4).
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ DRAFT — Aayan voice review at CI-5 (explicit veto point).               │
 * │ The plan (§12 A5) assigned the prose halves to Aayan; the founder       │
 * │ approved proceeding overnight with Claude-authored drafts in masti      │
 * │ register (2026-08-10 amendment). Every prose half below is a DRAFT and  │
 * │ must be reviewed/rewritten by Aayan before game_review enforcement      │
 * │ (CI-5). Register calibrated against coachPersonalities.ts overrides +   │
 * │ real 3.6 outputs in the BEFORE baseline JSON.                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Each example pairs an ABRIDGED contract slice (real field names, invented
 * but self-consistent values) with the ideal cited prose. Abridged on
 * purpose: the few-shots teach the CITATION GRAMMAR + register, not the full
 * schema — the real user turn carries the full contract JSON.
 */

export interface VerbalizerGoldExample {
  id: string;
  scenario: string;
  contractSlice: string;
  idealProse: string;
}

export const VERBALIZER_GOLD_EXAMPLES: VerbalizerGoldExample[] = [
  {
    id: "v4-blunder-confirmed-fork",
    scenario: "Blunder with a confirmed knight fork the player allowed",
    contractSlice: JSON.stringify({
      factIdPrefix: "M1",
      moveNumber: 18,
      color: "b",
      playedSan: "Qd7",
      bestSan: "Qe7",
      classification: "blunder",
      evalBefore: { display: "-0.35" },
      evalAfter: { display: "+2.90" },
      severityDropPawns: 3.2,
      lines: [{ id: "M1.pv0", san: ["Qe7", "Nf3", "Rd8"], eval: { display: "-0.35" } }],
      motifs: [
        {
          motif: "fork",
          confirmed: true,
          by_piece: "n",
          by_square: "e6",
          targets: [
            { square: "d7", piece: "q" },
            { square: "f8", piece: "r" },
          ],
        },
      ],
      sayables: {
        motifs: ["Confirmed: fork by the n on e6 hitting q on d7 and r on f8."],
      },
      concepts: [{ name: "Knight Fork Awareness" }],
    }),
    idealProse: [
      "[INSIGHT:18:b:blunder:-0.35:+2.90:Qd7:Qe7]",
      "Ooh, this one stings a little — the queen walked straight into the knight's favorite trick.",
      "You probably wanted to keep the queen connected to the rook, and that instinct is good! But the knight hop to e6 forks the queen on d7 and the rook on f8 [F:M1.motif0], and suddenly Black is losing serious material — the eval jumps from -0.35 to +2.90 [F:M1].",
      "The engine's path keeps everything safe: 18... Qe7 followed by Nf3 Rd8 [F:M1.pv0], and Black is still right in the game at -0.35 [F:M1.pv0].",
      "Here's the pattern to bank: before dropping your queen on a square, scan every knight-hop landing square around it. Knights don't telegraph their forks — you have to count for them [F:M1.motif0].",
      "[CONCEPT:fork:Knight Fork Tactics]",
      "Knight forks punish pieces standing two squares apart on the same color complex — one hop, two targets.",
      "[/CONCEPT]",
      "[/INSIGHT]",
    ].join("\n"),
  },
  {
    id: "v4-mistake-no-confirmed-motif",
    scenario:
      "Mistake with a big eval swing but NO confirmed motif — the honest register (plan §12 A1)",
    contractSlice: JSON.stringify({
      factIdPrefix: "M2",
      moveNumber: 24,
      color: "w",
      playedSan: "b4",
      bestSan: "Rd1",
      classification: "mistake",
      evalBefore: { display: "+1.10" },
      evalAfter: { display: "-0.60" },
      severityDropPawns: 1.7,
      lines: [{ id: "M2.pv0", san: ["Rd1", "Rc8", "d5"], eval: { display: "+1.10" } }],
      motifs: [],
      concepts: [{ name: "Piece Activity Before Pawn Play" }],
      engineIdea: "Seize the open d-file before committing queenside pawns.",
    }),
    idealProse: [
      "[INSIGHT:24:w:mistake:+1.10:-0.60:b4:Rd1]",
      "The queenside push felt ambitious, but the timing let your advantage slip away.",
      "Straight talk: the engine is emphatic that this loses ground — from +1.10 to -0.60 [F:M2] — though no single named tactic was verified here. That happens! Not every mistake is a fork or a pin; sometimes it's about who gets the good squares first.",
      "The better plan was 24. Rd1, and after Rc8 comes d5 [F:M2.pv0] — White grabs the open file and keeps pressing at +1.10 [F:M2.pv0]. The idea: seize the open d-file before committing queenside pawns [F:M2.idea].",
      "Pawn moves are the only moves you can never take back. When you hold an edge, ask what your pieces want before what your pawns want.",
      "[CONCEPT:rookEndgame:Rook Activity]",
      "Rooks earn their keep on open files — activity first, pawn expansion second.",
      "[/CONCEPT]",
      "[/INSIGHT]",
    ].join("\n"),
  },
  {
    id: "v4-sentinel-eval",
    scenario:
      "Inaccuracy where the post-move eval is a client-timeout sentinel — displays copied verbatim, never forged",
    contractSlice: JSON.stringify({
      factIdPrefix: "M3",
      moveNumber: 31,
      color: "b",
      playedSan: "h5",
      bestSan: "Kg7",
      classification: "inaccuracy",
      evalBefore: { display: "-0.90" },
      evalAfter: { display: "engine data unavailable", sentinel: true },
      severityDropPawns: 1.1,
      lines: [{ id: "M3.pv0", san: ["Kg7", "Rc7", "Rf7"], eval: { display: "-0.90" } }],
      motifs: [],
      relational: { hanging: [{ square: "h5", piece: "p" }] },
      sayables: { relationalHanging: ["The p on h5 is undefended."] },
    }),
    idealProse: [
      "[INSIGHT:31:b:inaccuracy:-0.90:engine data unavailable:h5:Kg7]",
      "A small pawn push with a hidden cost — let's look at what it left behind.",
      "Before this move you were doing well at -0.90 [F:M3]. The engine data for the position after h5 is unavailable [F:M3] — the analysis timed out there — so I won't invent a number. What the board facts do show: the pawn on h5 is now undefended [F:M3.rel0], and loose pawns have a way of falling off later.",
      "The calmer route was 31... Kg7, meeting Rc7 with Rf7 [F:M3.pv0] — king safety first, and every pawn stays guarded.",
      "Endgame habit worth keeping: every pawn move should come with a one-second check — who's covering it now?",
      "[CONCEPT:hangingPiece:Hanging Piece Awareness]",
      "A piece or pawn with no defender is a standing invitation — count defenders before you push.",
      "[/CONCEPT]",
      "[/INSIGHT]",
    ].join("\n"),
  },
];

/** Prompt-injectable rendering (mirrors formatExamplesForPrompt's framing). */
export function formatVerbalizerExamples(): string {
  let out =
    "\n\n=== CONTRACT→PROSE EXAMPLES (match this citation discipline and voice) ===\n" +
    "Each example shows an abridged fact contract and the ideal verbalization. " +
    "Note: every chess-fact sentence ends with its [F:id] citation; rhetoric and encouragement carry none.\n\n";
  VERBALIZER_GOLD_EXAMPLES.forEach((ex, i) => {
    out += `EXAMPLE ${i + 1} — ${ex.scenario}:\nCONTRACT (abridged):\n${ex.contractSlice}\nIDEAL RESPONSE:\n${ex.idealProse}\n\n`;
  });
  return out;
}
