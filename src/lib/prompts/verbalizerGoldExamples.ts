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
          // Geometry-verified (Aayan caught the original e6→d7 impossibility,
          // 2026-08-10): a knight on c5 attacks both d7 and b7.
          motif: "fork",
          confirmed: true,
          by_piece: "n",
          by_square: "c5",
          targets: [
            { square: "d7", piece: "q" },
            { square: "b7", piece: "b" },
          ],
        },
      ],
      sayables: {
        motifs: ["Confirmed: fork by the n on c5 hitting q on d7 and b on b7."],
      },
      concepts: [{ name: "Knight Fork Awareness" }],
    }),
    idealProse: [
      "[INSIGHT:18:b:blunder:-0.35:+2.90:Qd7:Qe7]",
      "Ooh, this one stings a little — the queen walked straight into the knight's favorite trick.",
      "You probably wanted to keep the queen connected to the rook, and that instinct is good! But this move hands White a resource: the knight hop to c5 forks the queen on d7 and the bishop on b7 [F:M1.motif0], and Black is losing serious material — the eval swings from -0.35 to +2.90 [F:M1].",
      "The engine's path keeps everything safe: 18... Qe7 followed by Nf3 Rd8 [F:M1.pv0], and Black is still right in the game at -0.35 [F:M1.pv0].",
      "Here's the pattern to bank: before parking your queen, scan every knight-hop landing square around her AND your loose pieces. Knights don't telegraph their forks — you have to count for them [F:M1.motif0].",
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
  {
    // ADDED 2026-08-10 (CI-4 gate recovery). Examples 1-3 are founder-approved
    // and BYTE-UNTOUCHED. They all verbalize as flowing paragraphs, but the
    // model in production emits the legacy [WHY] Idea:/Problem:/Solution:/
    // Outcome: scaffold — and that is exactly where citation coverage leaked
    // (79.7% inside [WHY] vs 96-98% in [THREATS]/[ROLES], measured on the
    // 2026-08-10 verification generations). This example teaches the target
    // density INSIDE the scaffold the model actually uses: one token per
    // sentence, the same id repeated when the same fact carries two sentences,
    // cited section bullets, an UNCITED encouraging takeaway, and a [CONCEPT]
    // body kept general enough to need no citation.
    id: "v4-scaffold-citation-density",
    scenario:
      "Mistake inside the full [WHY]/[THREATS]/[ROLES] scaffold — per-sentence citation density, cited bullets, uncited takeaway",
    contractSlice: JSON.stringify({
      factIdPrefix: "M4",
      moveNumber: 22,
      color: "w",
      playedSan: "Rfd1",
      bestSan: "Bxf6",
      classification: "mistake",
      evalBefore: { display: "+1.60" },
      evalAfter: { display: "+0.10" },
      severityDropPawns: 1.5,
      lines: [{ id: "M4.pv0", san: ["Bxf6", "gxf6", "Qh6"], eval: { display: "+1.60" } }],
      motifs: [
        {
          // Geometry-verified: a bishop on g5 attacks f6, and g5-f6-e7-d8 is a
          // single diagonal, so the pin of the f6 knight against the d8 queen
          // is board-true (pinned by a bishop ⇒ relative, not absolute).
          motif: "pin",
          confirmed: true,
          by_piece: "b",
          by_square: "g5",
          targets: [{ square: "f6", piece: "n" }],
          against: { square: "d8", piece: "q" },
          absolute: false,
        },
      ],
      relational: {
        captures: [],
        hanging: [],
        pins: [
          {
            pinnedSquare: "f6",
            pinnedPiece: "n",
            bySquare: "g5",
            byPiece: "b",
            againstSquare: "d8",
            againstPiece: "q",
            isAbsolute: false,
          },
        ],
      },
      threats: [{ threatSan: "h6", capturedSquare: null, isCheck: false, isMate: false }],
      sayables: {
        motifs: ["Confirmed: relative pin — the b on g5 pins the n on f6 to the q on d8."],
        relationalPins: ["The n on f6 is pinned to the q on d8 by the b on g5."],
      },
      concepts: [{ name: "Cashing In a Pin" }],
      engineIdea: "Take the pin before Black can unpin with ...h6.",
    }),
    idealProse: [
      "[INSIGHT:22:w:mistake:+1.60:+0.10:Rfd1:Bxf6]",
      "Bringing the last rook to the party is usually excellent advice — here it handed Black the one thing they needed.",
      "[WHY]",
      "Idea: You wanted every piece in the attack before cashing anything in, and 22. Rfd1 is the most natural way to do that [F:M4].",
      "Problem: Your bishop on g5 was already pinning the knight on f6 to the queen on d8 [F:M4.motif0], and that knight cannot step aside while the pin holds [F:M4.rel0]. Spending a move elsewhere gives Black time to play ...h6 and shove the bishop away [F:M4.threat0], which is why the eval slides from +1.60 to +0.10 [F:M4].",
      "Solution: The engine cashes in at once with 22. Bxf6, meeting gxf6 with the queen swinging to h6 [F:M4.pv0] — White keeps the whole edge at +1.60 [F:M4.pv0]. The engine's idea is simply to take the pin before Black can unpin [F:M4.idea].",
      "Outcome: Same pieces, same squares, half the advantage [F:M4].",
      "Nothing wrong with the plan — only the order. Collect what you have already earned, then bring up the reserves.",
      "[CONTINUATION:22:w]",
      "[MAIA_CONTINUATION:22:w]",
      "[/WHY]",
      "[THREATS]",
      "- Black can play ...h6, hitting the bishop on g5 and breaking the pin [F:M4.threat0].",
      "[/THREATS]",
      "[ROLES]",
      "- Your bishop on g5 is doing all the work here — it is the piece holding the knight on f6 still [F:M4.motif0].",
      "- Black's knight on f6 is frozen while the pin lasts, tied to the queen on d8 behind it [F:M4.rel0].",
      "[/ROLES]",
      "[CONCEPT:pin:Cashing In a Pin]",
      "A pin is a loan, not a gift — the moment your opponent can chase the pinning piece away, all that pressure evaporates.",
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
    "Note: every chess-fact sentence ends with its [F:id] citation — including each " +
    "Idea:/Problem:/Solution:/Outcome: line and each [THREATS]/[ROLES] bullet, and " +
    "including consecutive sentences that repeat the same id. Rhetoric, the closing " +
    "takeaway, and the general [CONCEPT] body carry none.\n\n";
  VERBALIZER_GOLD_EXAMPLES.forEach((ex, i) => {
    out += `EXAMPLE ${i + 1} — ${ex.scenario}:\nCONTRACT (abridged):\n${ex.contractSlice}\nIDEAL RESPONSE:\n${ex.idealProse}\n\n`;
  });
  return out;
}
