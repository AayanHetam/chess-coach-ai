import { Chess } from "chess.js";

/**
 * Deterministic mate-claim ground truth for puzzle explanations.
 *
 * Why this exists: the Puzzle Coach told a user that "**Qxd8#** is checkmate
 * because the king can't move and no piece covers d8" on Lichess puzzle 0vFpB.
 * The real position after Qxd8 has two legal replies — Kh7 and Bf8 — so it is
 * a check that wins a rook, not mate. The line was still correct; the reason
 * given for it was fabricated.
 *
 * The fix is not a better prompt. Whether a move delivers mate is decidable in
 * microseconds from data both puzzle routes already hold (the FEN and the full
 * UCI solution), so it should never be left to a model. chess.js even annotates
 * SAN correctly on its own: it writes `Qxd8+`, not `Qxd8#`.
 *
 * This module supplies the ground truth and finds prose that contradicts it.
 * What to do about a contradiction belongs to the caller.
 */

/** Per-ply truth, captured in the position *after* that ply was played. */
export interface PlyTruth {
  /** SAN with chess.js's own +/# annotation. Authoritative. */
  san: string;
  /** SAN with any +/# stripped, for matching against prose tokens. */
  bare: string;
  isCheckmate: boolean;
  isCheck: boolean;
  /** Legal replies in this position. Empty iff mate or stalemate. */
  escapes: string[];
}

export interface MateClaimTruth {
  plies: PlyTruth[];
  /** Truth for the last ply, or null if the line was empty/illegal. */
  final: PlyTruth | null;
  /** True if the line could not be fully replayed — "unknown", not "safe". */
  illegal: boolean;
}

/**
 * Replay a UCI line from a FEN and report the truth at every ply.
 *
 * @param fen Position the line starts from.
 * @param uci Moves in UCI ("d1d8"), e.g. a Lichess puzzle's `Moves` column.
 */
export function analyzeMateClaim(fen: string, uci: string[]): MateClaimTruth {
  const plies: PlyTruth[] = [];
  let illegal = false;

  let game: Chess;
  try {
    game = new Chess(fen);
  } catch {
    return { plies: [], final: null, illegal: true };
  }

  for (const m of uci) {
    let san: string;
    try {
      const r = game.move({
        from: m.slice(0, 2),
        to: m.slice(2, 4),
        promotion: m.length > 4 ? m.slice(4) : "q",
      });
      if (!r) {
        illegal = true;
        break;
      }
      san = r.san;
    } catch {
      illegal = true;
      break;
    }
    plies.push({
      san,
      bare: san.replace(/[+#]$/, ""),
      isCheckmate: game.isCheckmate(),
      isCheck: game.inCheck(),
      escapes: game.moves(),
    });
  }

  return {
    plies,
    // A partially-replayed line says nothing about the intended final
    // position, so never report a final truth off one.
    final: illegal || plies.length === 0 ? null : plies[plies.length - 1],
    illegal,
  };
}

/** A `#`-suffixed SAN token in prose that the position does not support. */
export interface FalseMateClaim {
  /** The offending token as written, e.g. "Qxd8#". */
  claimed: string;
  /** What the move actually is, per chess.js, e.g. "Qxd8+". */
  actual: string;
  /** Legal replies that disprove it, in that move's own position. */
  escapes: string[];
}

/** SAN with a mate suffix: Qxd8#, Rd8#, exd8=Q#, O-O#. */
const SAN_MATE = /\b(O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)#/g;

/**
 * Find mate claims in coach prose that the verified line disproves.
 *
 * Deliberately narrow: it only flags a `#` token whose bare SAN is a move in
 * the *solution line itself* that isn't mate at that point. Precision matters
 * here, because coaches legitimately discuss mate in hypothetical branches
 * ("if Kh8, then Qg7#") and legitimately name patterns ("a back-rank mate
 * threat"). A keyword scan for "checkmate" would flag both of those correct
 * statements. Comparing against the line's own annotations avoids that entire
 * class of false positive, since chess.js already wrote `+` or `#` for us.
 *
 * Known limit, stated rather than hidden: prose asserting mate in words only
 * ("this is checkmate") with no `#` token is NOT caught. Catching that safely
 * requires tying the claim to a specific move; a bare-word scanner fires on
 * legitimate branch discussion, which is a worse trade than the miss.
 */
export function findFalseMateClaims(
  text: string,
  truth: MateClaimTruth,
): FalseMateClaim[] {
  if (truth.illegal || truth.plies.length === 0) return [];

  const byBare = new Map<string, PlyTruth>();
  for (const p of truth.plies) if (!byBare.has(p.bare)) byBare.set(p.bare, p);

  const out: FalseMateClaim[] = [];
  const seen = new Set<string>();
  // exec loop rather than matchAll: the repo's tsconfig target predates
  // downlevelIteration, so iterating the matchAll iterator won't compile.
  const re = new RegExp(SAN_MATE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const bare = m[1];
    const ply = byBare.get(bare);
    // Not a move in this line — could be a hypothetical branch. Leave it.
    if (!ply) continue;
    // The line's own annotation agrees it's mate, so the claim is correct.
    if (ply.isCheckmate) continue;
    if (seen.has(bare)) continue;
    seen.add(bare);
    out.push({ claimed: `${bare}#`, actual: ply.san, escapes: ply.escapes });
  }
  return out;
}

export interface MateCorrection {
  /** Prose with `#` rewritten to the true annotation and a note appended. */
  text: string;
  /** What was corrected. Empty when the prose was already truthful. */
  corrections: FalseMateClaim[];
}

/**
 * Rewrite false mate claims in coach prose, deterministically.
 *
 * Shared by both puzzle routes so the correction reads identically wherever it
 * fires. No LLM call: the `#` → `+` swap and the explanatory note are both
 * derivable from the verified line, and spending a model call to fix a model
 * mistake is how you get a second mistake.
 *
 * Returns the input untouched when there's nothing to fix, so callers can use
 * `corrections.length` as the "did anything fire" signal.
 */
export function applyMateCorrection(
  text: string,
  truth: MateClaimTruth,
): MateCorrection {
  const corrections = findFalseMateClaims(text, truth);
  if (corrections.length === 0) return { text, corrections };

  let out = text;
  for (const c of corrections) out = out.split(c.claimed).join(c.actual);

  const first = corrections[0];
  const escapes = first.escapes.slice(0, 2).join(" and ");
  out += `\n\n_(Correction: ${first.actual} is check, not mate${
    escapes ? ` — ${escapes} still holds` : ""
  }. The line wins material rather than ending the game.)_`;

  return { text: out, corrections };
}

/**
 * One-line ground truth to hand the model in the prompt, so it doesn't make the
 * claim in the first place. Prevention is cheaper than correction, and the
 * routes already build a chess.js position — this costs nothing extra.
 */
export function describeMateTruth(truth: MateClaimTruth): string {
  if (truth.illegal || !truth.final) return "";
  const f = truth.final;
  if (f.isCheckmate) {
    return `GROUND TRUTH: the final move ${f.san} IS checkmate.`;
  }
  const escapes = f.escapes.slice(0, 4).join(", ");
  return (
    `GROUND TRUTH: the final move ${f.san} is ${
      f.isCheck ? "CHECK, not checkmate" : "NOT check and NOT checkmate"
    }. ` +
    `Legal replies remain: ${escapes || "none listed"}. ` +
    `Do NOT call this mate — explain the real payoff (material, or the threat that follows).`
  );
}
