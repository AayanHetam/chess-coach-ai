/**
 * Claim gate (COACH_CLAIM_VERIFIER) — reads a card's prose sentence by
 * sentence, pulls out the board claims it can parse, and has the replay
 * verifier (verifyClaims.ts) decide them against the line each clause cites.
 *
 * Code owns board facts; the model only phrases them. So:
 *  - a FALSE claim never ships: its sentence is replaced by the verified
 *    fact when there is a single one to state, otherwise dropped;
 *  - an UNVERIFIED claim survives only in a sentence phrased as opinion
 *    ("this looks like…", "a likely idea is…"); otherwise it is dropped;
 *  - every sentence that ships carries a source: verified-fact, engine or
 *    judgment.
 *
 * The extractor is deliberately small: where material ends and how much a
 * line changes it, captures, hanging pieces, mate, and pieces on squares —
 * the claims the verifier can prove. A sentence that sounds like a claim
 * but parses to nothing is logged, not judged. Hypotheticals ("could win",
 * "would be a rook up") are not claims about the line and are skipped.
 *
 * ANCHORING. Each clause of a contract card ends with its citation token
 * ([F:M1.pv0.s2], [F:M1.game], [F:M1]), so a claim is checked against the
 * line the NEXT token in its sentence names; an uncited claim against the
 * played move.
 *
 * Pure apart from the log line per blocked claim.
 */
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { logger } from "@/lib/logging";
import type { InsightContract, LineFact } from "@/lib/contract/types";
import { splitLineSentences } from "@/lib/contract/sentences";
import {
  replayLine,
  verifyClaims,
  type Claim,
  type ClaimVerdict,
} from "./verifyClaims";

const log = logger.child({ module: "claim-gate" });

export type SentenceSource = "verified-fact" | "engine" | "judgment";

export interface CheckedClaim {
  claim: Claim;
  /** The words the claim was read from. */
  phrase: string;
  /** The fact id it was checked against ("M1.pv0.s2", "M1.game", "M1"). */
  anchor: string;
  verdict: ClaimVerdict;
}

export interface CheckedSentence {
  /** The sentence as written, citation tokens included. */
  text: string;
  claims: CheckedClaim[];
  opinion: boolean;
  action: "keep" | "drop" | "rewrite";
  /** The verified replacement, when `action` is "rewrite". */
  rewrite?: string;
  source: SentenceSource;
  /** Sounds like a board claim but nothing was parsed from it (logged). */
  unparsed: boolean;
}

export interface CardClaimCheck {
  sentences: CheckedSentence[];
  /** Claims that cost their sentence: false, or unverified outside opinion. */
  blocked: CheckedClaim[];
}

export interface ClaimGateOpts {
  /** The reader's colour, for "you"/"your". Defaults to the card's mover. */
  playerColor?: Color;
  /** Log blocked claims (on by default; tests turn it off). */
  log?: boolean;
}

// ── Vocabulary ──────────────────────────────────────────────────────────────
const NUMBER: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const NOUN_POINTS: Record<string, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  piece: 3,
  minor: 3,
  rook: 5,
  queen: 9,
  exchange: 2,
  point: 1,
};
const PIECE_OF: Record<string, PieceSymbol> = {
  pawn: "p",
  knight: "n",
  bishop: "b",
  rook: "r",
  queen: "q",
  king: "k",
};
const SIDE_NAME: Record<Color, string> = { w: "White", b: "Black" };
const PIECE_NAME: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};
const opp = (c: Color): Color => (c === "w" ? "b" : "w");

const AMOUNT = String.raw`(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})`;
const ADJ = String.raw`(?:(?:whole|full|clean|extra|clear|healthy|solid)\s+)?`;
const NOUN = String.raw`(pawns?|knights?|bishops?|rooks?|queens?|pieces?|minor pieces?|exchange|points?)`;
const SIDE = String.raw`(white|black|you|your opponent|the opponent)`;
const OWNER = String.raw`(the|your|white's|black's|its|his|her|their)`;
const PIECE = String.raw`(pawn|knight|bishop|rook|queen)`;
const SQ = String.raw`([a-h][1-8])`;
const HANG_WORD = String.raw`(?:hanging|en prise|undefended|unprotected|loose)`;

/** "White comes out a rook ahead", "you're two pawns down", "Black is ahead". */
const STANDING_RE = new RegExp(
  String.raw`\b${SIDE}(?:'re|'s|\s+is|\s+are|\s+ends?(?:\s+up)?|\s+finish(?:es)?|\s+comes?\s+out|\s+stays?|\s+remains?|\s+walks?\s+away|\s+will\s+be|\s+is\s+left)\s+(?:${AMOUNT}\s+${ADJ}${NOUN}\s+)?(up|ahead|down|behind)\b`,
  "gi"
);
/** "White is up a rook", "you end up a piece". */
const UP_A_RE = new RegExp(
  String.raw`\b${SIDE}(?:'re|'s|\s+is|\s+are|\s+ends?|\s+finish(?:es)?|\s+comes?\s+out)\s+(up|down)\s+${AMOUNT}\s+${ADJ}${NOUN}\b`,
  "gi"
);
const LEVEL_RE =
  /\b(?:material\s+(?:is|stays|remains|ends|comes out|will be)\s+(?:level|even|equal|balanced)|(?:level|even|equal)\s+material|material\s+parity)\b/gi;
/** "wins a pawn", "loses two pawns", "nets the exchange", "wins a knight for two pawns". */
const CHANGE_RE = new RegExp(
  String.raw`\b(wins?|winning|won|nets?|gains?|picks?\s+up|grabs?|collects?|loses?|losing|lost|drops?|dropping|gives?\s+up|giving\s+up|sheds?)\s+(?:back\s+)?(?:${AMOUNT}\s+${ADJ}${NOUN}|(the)\s+(exchange))(?:\s+for\s+${AMOUNT}\s+${NOUN})?(?!\s+on\s+[a-h][1-8])`,
  "gi"
);
const MATERIAL_CHANGE_RE =
  /\b(wins?|winning|won|gains?|loses?|losing|lost)\s+(?:some\s+)?material\b/gi;
/** "takes the knight on b5", "cxb5 captures the bishop", "wins the queen". */
const CAPTURE_RE = new RegExp(
  String.raw`\b(takes|took|captures?|captured|grabs?|snaps?\s+up|picks?\s+off|wins?|won|removes)\s+${OWNER}\s+${PIECE}(?:\s+on\s+${SQ})?`,
  "gi"
);
/** "the knight on b5 is hanging", "your bishop hangs". */
const HANG_RE = new RegExp(
  String.raw`\b${OWNER}\s+${PIECE}(?:\s+on\s+${SQ})?\s+(?:(?:is|was|now|still|left|stays|becomes|remains|being|just)\s+)*(?:${HANG_WORD}|hangs|hung)\b`,
  "gi"
);
/** "leaves the knight (on b5) hanging". */
const LEAVES_HANG_RE = new RegExp(
  String.raw`\b(?:leaves?|leaving|left)\s+${OWNER}\s+${PIECE}(?:\s+on\s+${SQ})?\s+${HANG_WORD}`,
  "gi"
);
/** "hangs the bishop (on c4)". */
const HANGS_THE_RE = new RegExp(
  String.raw`\b(?:hangs|hanging)\s+${OWNER}\s+${PIECE}(?:\s+on\s+${SQ})?`,
  "gi"
);
const PIECE_K = String.raw`(king|queen|rook|bishop|knight|pawn)`;
/** "pins the knight (on f6) (to the queen on d8)". */
const PINS_RE = new RegExp(
  String.raw`\b(?:pins|pinning|pinned)\s+${OWNER}\s+${PIECE_K}(?:\s+on\s+${SQ})?(?:\s+(?:to|against)\s+${OWNER}\s+${PIECE_K}(?:\s+on\s+${SQ})?)?`,
  "gi"
);
/** "the knight on f6 is pinned (to the queen on d8)". */
const PINNED_RE = new RegExp(
  String.raw`\b${OWNER}\s+${PIECE_K}(?:\s+on\s+${SQ})?\s+(?:(?:is|was|now|still|stays|remains|being|gets|got|left|absolutely|completely|badly)\s+)+pinned(?:\s+(?:to|against)\s+${OWNER}\s+${PIECE_K}(?:\s+on\s+${SQ})?)?`,
  "gi"
);
/** "the king is forced to f6". */
const FORCED_TO_RE = new RegExp(
  String.raw`\b${OWNER}\s+${PIECE_K}\s+(?:is|was|gets|being|has\s+been)\s+(?:forced|driven|compelled)\s+(?:back\s+)?(?:to|onto|into)\s+${SQ}`,
  "gi"
);
/** "forces the king to f6". */
const FORCES_RE = new RegExp(
  String.raw`\b(?:forces?|forcing|forced|compels?)\s+${OWNER}\s+${PIECE_K}\s+(?:back\s+)?(?:to|onto|into)\s+${SQ}`,
  "gi"
);
/** "drives the king to e4 — the only legal square". */
const ONLY_SQUARE_RE = new RegExp(
  String.raw`\b${OWNER}\s+(king)\s+(?:to|on|onto|into)\s+${SQ}\b[^.;]{0,40}?\bonly\s+(?:legal\s+|available\s+|safe\s+)?square\b`,
  "gi"
);
/** "the only legal reply", "a forced reply". */
const ONLY_REPLY_RE =
  /\b(?:only\s+legal\s+(?:reply|move|response)|forced\s+(?:reply|response))\b/gi;
/** "the knight on g5", "Black's rook on f8". */
const PIECE_ON_RE =
  /\b(the|your|white's|black's|his|her|their|its|a|an)\s+(king|queen|rook|bishop|knight|pawn)\s+on\s+([a-h][1-8])\b/gi;
/** A SAN token, optionally numbered ("19.Nxa8", "10...cxb5", "Qh7+"). */
const SAN_RE =
  /\b(?:\d{1,3}\.(?:\.\.)?\s*)?((?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?|[a-h](?:x[a-h])?[1-8](?:=[QRBN])?|O-O(?:-O)?)[+#]?)/g;
const CITATION_RE = /\[F:([A-Za-z0-9_.-]{1,40})\]/g;

const OPINION_RE =
  /\b(looks? like|seems?|might|may|maybe|perhaps|probably|likely|I think|I'd|I would|feels? like|a likely idea|the idea (?:is|was)|the plan (?:is|was)|could be|arguably|presumably|it appears)\b/i;
/** Words that make a clause hypothetical: it is not a claim about the line. */
const HYPOTHETICAL_RE =
  /\b(could|would|might|may|should|can|wants? to|tries? to|threatens? to|trying to|if|unless|hoping to|instead)\b/i;
const ENGINE_RE =
  /(?:[+\-−]\d+\.\d{2}\b|\bM[+-]\d+\b|\bmate in \d+\b|\bengine\b|\bstockfish\b|\bbest move\b|\bpreferred\b|\bprefers\b|\btop choice\b|\bevaluation\b|\beval\b)/i;
const CLAIM_TRIGGER_RE =
  /\b(wins?|won|loses?|lost|hangs?|hanging|en prise|undefended|captures?|takes|ahead|behind|checkmate|pins?|pinned|forced|only legal)\b/i;

// ── Anchors ─────────────────────────────────────────────────────────────────
interface Anchor {
  id: string;
  startFen: string;
  line: string[];
  /** The cited ply of the line, or null for the whole line. */
  ply: number | null;
  /** The engine's reply after the played move, when the anchor IS the played move. */
  refutation?: string[];
  playedMove: boolean;
}

const storySans = (l: LineFact | undefined): string[] =>
  l ? (l.story?.plies.map((p) => p.san) ?? l.san.slice(0, 6)) : [];

function anchorFor(id: string | null, insight: InsightContract): Anchor {
  const P = insight.factIdPrefix;
  const played: Anchor = {
    id: P,
    startFen: insight.fenBefore,
    line: [insight.playedSan],
    ply: 0,
    refutation: insight.refutation,
    playedMove: true,
  };
  if (!id || !id.startsWith(P)) return played;
  const suffix = id.slice(P.length + 1);
  const pv = /^pv(\d{1,2})(?:\.s(\d{1,2}))?$/.exec(suffix);
  if (pv) {
    const line = storySans(insight.lines[Number(pv[1])]);
    if (line.length === 0) return played;
    return {
      id,
      startFen: insight.fenBefore,
      line,
      ply: pv[2] !== undefined ? Number(pv[2]) : null,
      playedMove: false,
    };
  }
  const game = /^game(?:\.s(\d{1,2}))?$/.exec(suffix);
  if (game) {
    const line = insight.gameStory?.plies.map((p) => p.san) ?? [
      insight.playedSan,
    ];
    const ply = game[1] !== undefined ? Number(game[1]) : null;
    // The game's own first ply IS the played move.
    return {
      id,
      startFen: insight.fenBefore,
      line,
      ply,
      playedMove: ply === 0,
      refutation: ply === 0 ? insight.refutation : undefined,
    };
  }
  return { ...played, id };
}

/** The citation token after `index` in the sentence, else the last one before it. */
function citedIdAt(sentence: string, index: number): string | null {
  let before: string | null = null;
  for (const m of Array.from(sentence.matchAll(CITATION_RE))) {
    if ((m.index ?? 0) >= index) return m[1];
    before = m[1];
  }
  return before;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function amountPoints(
  amount: string | undefined,
  noun: string | undefined
): number | null {
  if (!noun) return null;
  const base = noun
    .toLowerCase()
    .replace(/^minor\s+/, "minor ")
    .split(/\s+/)[0]
    .replace(/s$/, "");
  const per = NOUN_POINTS[base === "minor" ? "minor" : base];
  if (per === undefined) return null;
  const n = amount ? (NUMBER[amount.toLowerCase()] ?? Number(amount)) : 1;
  return Number.isFinite(n) ? n * per : null;
}

function sideWord(word: string | undefined, player: Color): Color | null {
  if (!word) return null;
  const w = word.toLowerCase();
  if (w.startsWith("white")) return "w";
  if (w.startsWith("black")) return "b";
  if (w === "you" || w === "your") return player;
  if (w === "your opponent" || w === "the opponent") return opp(player);
  return null;
}

/** The clause before `index`: back to the last ; — : or sentence start. */
function clauseBefore(sentence: string, index: number): string {
  const head = sentence.slice(0, index);
  const cut = Math.max(
    head.lastIndexOf(";"),
    head.lastIndexOf("—"),
    head.lastIndexOf(":"),
    head.lastIndexOf(", but")
  );
  return cut >= 0 ? head.slice(cut + 1) : head;
}

/** Index in `line` of a SAN written in the prose (check marks and numbering ignored). */
function sanIndex(line: string[], san: string): number {
  const bare = (s: string) => s.replace(/[+#!?]/g, "");
  return line.findIndex((s) => bare(s) === bare(san));
}

/** The last SAN written in `text` that is a move of `line`, as its index. */
function lastLineSanIn(text: string, line: string[]): number {
  let idx = -1;
  for (const m of Array.from(text.matchAll(SAN_RE))) {
    const i = sanIndex(line, m[1]);
    if (i >= 0) idx = i;
  }
  return idx;
}

/** The side that plays ply `k` of the line from `startFen`. */
function moverAt(startFen: string, k: number): Color {
  const toMove = (startFen.split(" ")[1] === "b" ? "b" : "w") as Color;
  return k % 2 === 0 ? toMove : opp(toMove);
}

/** The single piece of `type` of `owner` (or either side) at `fen`, if exactly one. */
function onlyPiece(
  fen: string,
  type: PieceSymbol,
  owner: Color | null
): Square | null {
  let found: Square | null = null;
  try {
    for (const row of new Chess(fen).board()) {
      for (const sq of row) {
        if (!sq || sq.type !== type || (owner && sq.color !== owner)) continue;
        if (found) return null;
        found = sq.square as Square;
      }
    }
  } catch {
    return null;
  }
  return found;
}

function fenAfter(anchor: Anchor, plies: number): string | null {
  const r = replayLine(anchor.startFen, anchor.line.slice(0, plies));
  return r.ok ? (r.plies.at(-1)?.fenAfter ?? anchor.startFen) : null;
}

// ── Extraction ──────────────────────────────────────────────────────────────
interface Extracted {
  claims: Array<{ claim: Claim; phrase: string; anchor: Anchor }>;
  /** Uncited piece-on-square mentions: true if any of the card's lines bears them out. */
  anyLine: Array<{ claim: Claim; phrase: string }>;
  /** Claims with several readings (a pin before or after the move): true if any reading holds. */
  anyOf: Array<{
    phrase: string;
    options: Array<{ claim: Claim; anchor: Anchor }>;
  }>;
}

function extract(
  sentence: string,
  insight: InsightContract,
  player: Color
): Extracted {
  const out: Extracted = { claims: [], anyLine: [], anyOf: [] };
  // Text a capture or hanging phrase already read ("takes the knight on d7"):
  // its "knight on d7" is not a second, separate claim.
  const consumed: Array<[number, number]> = [];
  const anchorAt = (index: number) =>
    anchorFor(citedIdAt(sentence, index), insight);
  const endOf = (a: Anchor) => (a.ply !== null ? a.ply + 1 : a.line.length);
  const hypothetical = (index: number) =>
    HYPOTHETICAL_RE.test(clauseBefore(sentence, index));
  const subjectSide = (index: number, a: Anchor): Color => {
    const clause = clauseBefore(sentence, index);
    const named = Array.from(
      clause.matchAll(new RegExp(String.raw`\b${SIDE}\b`, "gi"))
    ).at(-1);
    const side = sideWord(named?.[1], player);
    if (side) return side;
    const k = lastLineSanIn(clause, a.line);
    if (k >= 0) return moverAt(a.startFen, k);
    return moverAt(a.startFen, a.ply ?? 0);
  };

  // Where material stands.
  for (const re of [STANDING_RE, UP_A_RE]) {
    for (const m of Array.from(sentence.matchAll(re))) {
      const idx = m.index ?? 0;
      const groups =
        re === STANDING_RE
          ? { side: m[1], amount: m[2], noun: m[3], dir: m[4] }
          : { side: m[1], dir: m[2], amount: m[3], noun: m[4] };
      if (!groups.noun && !/\bmaterial\b/i.test(sentence)) continue; // "down to two minutes"
      if (hypothetical(idx)) continue;
      const side = sideWord(groups.side, player);
      if (!side) continue;
      const leads = /up|ahead/i.test(groups.dir) ? side : opp(side);
      const margin = amountPoints(groups.amount, groups.noun) ?? undefined;
      const a = anchorAt(idx + m[0].length);
      out.claims.push({
        claim: { kind: "ahead", leader: leads, margin, atPly: endOf(a) },
        phrase: m[0],
        anchor: a,
      });
    }
  }
  for (const m of Array.from(sentence.matchAll(LEVEL_RE))) {
    const idx = m.index ?? 0;
    if (hypothetical(idx)) continue;
    const a = anchorAt(idx + m[0].length);
    out.claims.push({
      claim: { kind: "ahead", leader: "level", atPly: endOf(a) },
      phrase: m[0],
      anchor: a,
    });
  }

  // What a line wins or loses.
  for (const m of Array.from(sentence.matchAll(CHANGE_RE))) {
    const idx = m.index ?? 0;
    if (hypothetical(idx)) continue;
    const verb = m[1].toLowerCase();
    const gained = m[5] ? NOUN_POINTS.exchange : amountPoints(m[2], m[3]);
    const paid = m[7] ? amountPoints(m[6], m[7]) : 0;
    if (gained === null || paid === null) continue;
    const a = anchorAt(idx + m[0].length);
    const side = subjectSide(idx, a);
    const losing = /^(lose|losing|lost|drop|dropping|give|giving|shed)/.test(
      verb
    );
    const net = gained - paid;
    if (net <= 0) continue; // "a knight for three pawns" is a trade, not a claim this reads
    out.claims.push({
      claim: {
        kind: "material_change",
        side,
        points: losing ? -net : net,
        mode: "at_least",
        fromPly: a.ply ?? 0,
        toPly: a.line.length,
      },
      phrase: m[0],
      anchor: a,
    });
  }
  for (const m of Array.from(sentence.matchAll(MATERIAL_CHANGE_RE))) {
    const idx = m.index ?? 0;
    if (hypothetical(idx)) continue;
    const a = anchorAt(idx + m[0].length);
    const side = subjectSide(idx, a);
    const losing = /^los/.test(m[1].toLowerCase());
    out.claims.push({
      claim: {
        kind: "material_change",
        side,
        points: losing ? -1 : 1,
        mode: "at_least",
        fromPly: a.ply ?? 0,
        toPly: a.line.length,
      },
      phrase: m[0],
      anchor: a,
    });
  }

  // Captures, with the piece named.
  for (const m of Array.from(sentence.matchAll(CAPTURE_RE))) {
    const idx = m.index ?? 0;
    if (hypothetical(idx)) continue;
    const piece = PIECE_OF[m[3].toLowerCase()];
    const square = m[4]?.toLowerCase() as Square | undefined;
    consumed.push([idx, idx + m[0].length]);
    const a = anchorAt(idx + m[0].length);
    const k = lastLineSanIn(clauseBefore(sentence, idx), a.line);
    if (k >= 0) {
      out.claims.push({
        claim: {
          kind: "captures",
          moveIndex: k,
          piece,
          ...(square ? { square } : {}),
        },
        phrase: m[0],
        anchor: a,
      });
    } else if (a.ply !== null && !a.playedMove) {
      out.claims.push({
        claim: {
          kind: "captures",
          moveIndex: a.ply,
          piece,
          ...(square ? { square } : {}),
        },
        phrase: m[0],
        anchor: a,
      });
    } else {
      out.claims.push({
        claim: { kind: "line_captures", piece, ...(square ? { square } : {}) },
        phrase: m[0],
        anchor: a,
      });
    }
  }

  // Hanging pieces.
  for (const re of [HANG_RE, LEAVES_HANG_RE, HANGS_THE_RE]) {
    for (const m of Array.from(sentence.matchAll(re))) {
      const idx = m.index ?? 0;
      if (hypothetical(idx)) continue;
      const ownerWord = m[1].toLowerCase();
      const piece = PIECE_OF[m[2].toLowerCase()];
      consumed.push([idx, idx + m[0].length]);
      const a = anchorAt(idx + m[0].length);
      const at = endOf(a);
      const fen = fenAfter(a, at);
      let square = m[3]?.toLowerCase() as Square | undefined;
      let owner = sideWord(ownerWord, player);
      if (!square && fen) {
        // "12.Ng5 leaves the knight hanging": the piece the move named.
        const k = lastLineSanIn(clauseBefore(sentence, idx), a.line);
        const mover = k >= 0 ? k : (a.ply ?? 0);
        const r = replayLine(a.startFen, a.line.slice(0, mover + 1));
        const moved = r.ok ? r.plies[mover] : undefined;
        if (moved && moved.piece === piece) {
          square = moved.to;
          owner = owner ?? moved.mover;
        } else {
          square = onlyPiece(fen, piece, owner) ?? undefined;
        }
      }
      if (!square) {
        out.claims.push({
          claim: { kind: "hangs", square: "a1", piece, atPly: -1 },
          phrase: m[0],
          anchor: a,
        }); // unresolved: unverified
        continue;
      }
      out.claims.push({
        claim: { kind: "hangs", square, piece, atPly: at },
        phrase: m[0],
        anchor: a,
      });
      // As the reason the played move failed, the engine's reply must take it.
      const ownerColor = fen
        ? (new Chess(fen).get(square)?.color ?? owner)
        : owner;
      if (
        a.playedMove &&
        ownerColor === insight.color &&
        a.refutation?.length
      ) {
        out.claims.push({
          claim: { kind: "refutation_takes", square, piece },
          phrase: m[0],
          anchor: { ...a, line: [insight.playedSan], ply: 0 },
        });
      }
    }
  }

  // Pins. A pin is a fact about one position, and prose rarely says which:
  // the cited line's position, or the board before or after the played move.
  const played = anchorFor(null, insight);
  for (const re of [PINS_RE, PINNED_RE]) {
    for (const m of Array.from(sentence.matchAll(re))) {
      const idx = m.index ?? 0;
      const end = idx + m[0].length;
      if (hypothetical(idx)) continue;
      if (consumed.some(([a, b]) => idx < b && end > a)) continue;
      consumed.push([idx, end]);
      const pinnerOn = Array.from(
        clauseBefore(sentence, idx).matchAll(PIECE_ON_RE)
      ).at(-1);
      const claim = (atPly: number): Claim => ({
        kind: "pin",
        pinnedPiece: PIECE_OF[m[2].toLowerCase()],
        ...(m[3] ? { pinned: m[3].toLowerCase() as Square } : {}),
        ...(m[5] ? { behindPiece: PIECE_OF[m[5].toLowerCase()] } : {}),
        ...(m[6] ? { behind: m[6].toLowerCase() as Square } : {}),
        ...(re === PINS_RE && pinnerOn
          ? { pinner: pinnerOn[3].toLowerCase() as Square }
          : {}),
        atPly,
      });
      const a = anchorAt(end);
      const options = [
        ...(a.playedMove ? [] : [{ claim: claim(endOf(a)), anchor: a }]),
        { claim: claim(0), anchor: played },
        { claim: claim(1), anchor: played },
      ];
      out.anyOf.push({ phrase: m[0], options });
    }
  }

  // Forced moves: "the only legal reply", "the king is forced to f6". The
  // position is the one after the move the clause names; failing that, the
  // one before the forced move itself.
  const lines = (a: Anchor) => [a, ...cardLines(insight)];
  const afterNamedMove = (idx: number, a: Anchor) => {
    const clause = clauseBefore(sentence, idx);
    for (const c of lines(a)) {
      const k = lastLineSanIn(clause, c.line);
      if (k >= 0) return { anchor: c, at: k + 1 };
    }
    return null;
  };
  const beforeMove = (a: Anchor, piece: PieceSymbol, to: Square) => {
    for (const c of lines(a)) {
      const r = replayLine(c.startFen, c.line);
      const j = r.ok
        ? r.plies.findIndex((p) => p.piece === piece && p.to === to)
        : -1;
      if (j >= 0) return { anchor: c, at: j };
    }
    return null;
  };
  for (const re of [FORCED_TO_RE, FORCES_RE, ONLY_SQUARE_RE]) {
    for (const m of Array.from(sentence.matchAll(re))) {
      const idx = m.index ?? 0;
      const end = idx + m[0].length;
      if (hypothetical(idx)) continue;
      if (consumed.some(([a, b]) => idx < b && end > a)) continue;
      consumed.push([idx, end]);
      const piece = PIECE_OF[m[2].toLowerCase()];
      const square = m[3].toLowerCase() as Square;
      const a = anchorAt(end);
      const where = afterNamedMove(idx, a) ?? beforeMove(a, piece, square);
      out.claims.push({
        claim: {
          kind: "only_square",
          atPly: where?.at ?? -1,
          square,
          whole: re !== ONLY_SQUARE_RE,
        },
        phrase: m[0],
        anchor: where?.anchor ?? a,
      });
    }
  }
  for (const m of Array.from(sentence.matchAll(ONLY_REPLY_RE))) {
    const idx = m.index ?? 0;
    if (hypothetical(idx)) continue;
    const a = anchorAt(idx + m[0].length);
    let where = afterNamedMove(idx, a);
    if (!where) {
      // "the only legal reply is 15...Kf6": the position before that move.
      for (const s of Array.from(sentence.slice(idx).matchAll(SAN_RE))) {
        for (const c of lines(a)) {
          const j = sanIndex(c.line, s[1]);
          if (j >= 0) {
            where = { anchor: c, at: j };
            break;
          }
        }
        if (where) break;
      }
    }
    out.claims.push({
      claim: { kind: "only_reply", atPly: where?.at ?? -1 },
      phrase: m[0],
      anchor: where?.anchor ?? a,
    });
  }

  // Mate, read off a SAN written with "#".
  for (const m of Array.from(sentence.matchAll(SAN_RE))) {
    if (!m[1].endsWith("#")) continue;
    const a = anchorAt((m.index ?? 0) + m[0].length);
    const k = sanIndex(a.line, m[1]);
    if (k >= 0)
      out.claims.push({
        claim: { kind: "is_mate", moveIndex: k },
        phrase: m[0],
        anchor: a,
      });
  }

  // Pieces on squares.
  for (const m of Array.from(sentence.matchAll(PIECE_ON_RE))) {
    const idx = m.index ?? 0;
    const end = idx + m[0].length;
    if (consumed.some(([a, b]) => idx < b && end > a)) continue;
    const color = sideWord(m[1], player) ?? undefined;
    const claim: Claim = {
      kind: "piece_on_in_line",
      square: m[3].toLowerCase() as Square,
      piece: PIECE_OF[m[2].toLowerCase()],
      ...(color ? { color } : {}),
    };
    const id = citedIdAt(sentence, idx + m[0].length);
    if (id)
      out.claims.push({ claim, phrase: m[0], anchor: anchorFor(id, insight) });
    else out.anyLine.push({ claim, phrase: m[0] });
  }
  return out;
}

/** Every line the card can speak about: the played move, each engine line, the game's continuation. */
function cardLines(insight: InsightContract): Anchor[] {
  const P = insight.factIdPrefix;
  const lines: Anchor[] = [
    {
      id: P,
      startFen: insight.fenBefore,
      line: [insight.playedSan],
      ply: null,
      playedMove: true,
    },
  ];
  insight.lines.forEach((l, k) => {
    const sans = storySans(l);
    if (sans.length)
      lines.push({
        id: `${P}.pv${k}`,
        startFen: insight.fenBefore,
        line: sans,
        ply: null,
        playedMove: false,
      });
  });
  const game = insight.gameStory?.plies.map((p) => p.san);
  if (game?.length)
    lines.push({
      id: `${P}.game`,
      startFen: insight.fenBefore,
      line: game,
      ply: null,
      playedMove: false,
    });
  return lines;
}

function verifyAt(claim: Claim, anchor: Anchor): ClaimVerdict {
  if (claim.kind === "hangs" && claim.atPly === -1) {
    return {
      claim,
      status: "unverified",
      reason: "the sentence does not say which piece",
    };
  }
  return verifyClaims({
    startFen: anchor.startFen,
    line: anchor.line,
    claims: [claim],
    refutation: anchor.refutation,
  }).verdicts[0];
}

// ── Rewrites: the verified fact in place of a false one ─────────────────────
function rewriteFor(c: CheckedClaim, at: Anchor | null): string | null {
  const actual = c.verdict.actual as Record<string, unknown> | undefined;
  if (!actual || !at) return null;
  const r = replayLine(at.startFen, at.line);
  if (!r.ok || r.plies.length === 0) return null;
  const pts = (n: number) => `${n} point${n === 1 ? "" : "s"}`;
  switch (c.claim.kind) {
    case "ahead": {
      const at = c.claim.atPly ?? r.plies.length;
      const last = r.plies[at - 1];
      if (!last) return null;
      const leader = actual.leader as Color | "level";
      const margin = actual.margin as number;
      return leader === "level"
        ? `After ${last.label}${last.san}, material is level.`
        : `After ${last.label}${last.san}, ${SIDE_NAME[leader]} is ${pts(margin)} up.`;
    }
    case "material_change": {
      const first = r.plies[c.claim.fromPly ?? 0];
      const last = r.plies[(c.claim.toPly ?? r.plies.length) - 1];
      if (!first || !last) return null;
      const change = actual.change as number;
      const side = SIDE_NAME[c.claim.side];
      const span =
        first === last
          ? `${first.label}${first.san}`
          : `${first.label}${first.san} to ${last.label}${last.san}`;
      return change === 0
        ? `From ${span}, ${side} neither wins nor loses material.`
        : `From ${span}, ${side} ${change > 0 ? "gains" : "loses"} ${pts(Math.abs(change))}.`;
    }
    case "captures": {
      const ply = r.plies[c.claim.moveIndex];
      const piece = actual.piece as PieceSymbol | undefined;
      if (!ply || !piece) return null;
      return `${ply.label}${ply.san} takes the ${PIECE_NAME[piece]} on ${actual.square as string}.`;
    }
    default:
      return null;
  }
}

// ── The gate ────────────────────────────────────────────────────────────────
/** Lines of `body`, each split into sentences the same way the ladder's sentence-drop splits them. */
export function sentencesOf(body: string): string[] {
  return body
    .split("\n")
    .flatMap((line) => splitLineSentences(line))
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^\[\/?[A-Z_]+(?::[^\]]*)?\]$/.test(s));
}

export function checkCardClaims(
  prose: string,
  insight: InsightContract,
  opts: ClaimGateOpts = {}
): CardClaimCheck {
  const player = opts.playerColor ?? insight.color;
  const sentences: CheckedSentence[] = [];
  const blocked: CheckedClaim[] = [];
  for (const text of sentencesOf(prose)) {
    const opinion = OPINION_RE.test(text.replace(CITATION_RE, ""));
    const { claims: raw, anyLine, anyOf } = extract(text, insight, player);
    // The anchor object rides beside each claim for the rewrite.
    const anchors = new Map<CheckedClaim, Anchor>();
    const claims: CheckedClaim[] = raw.map((c) => {
      const checked: CheckedClaim = {
        claim: c.claim,
        phrase: c.phrase,
        anchor: c.anchor.id,
        verdict: verifyAt(c.claim, c.anchor),
      };
      anchors.set(checked, c.anchor);
      return checked;
    });
    for (const c of anyLine) {
      const verdicts = cardLines(insight).map((a) => verifyAt(c.claim, a));
      const verdict =
        verdicts.find((v) => v.status === "verified") ??
        (verdicts.every((v) => v.status === "false")
          ? verdicts[0]
          : {
              claim: c.claim,
              status: "unverified" as const,
              reason: "no line of the card settles it",
            });
      claims.push({
        claim: c.claim,
        phrase: c.phrase,
        anchor: insight.factIdPrefix,
        verdict,
      });
    }
    for (const c of anyOf) {
      const checked = c.options.map((o) => ({
        o,
        v: verifyAt(o.claim, o.anchor),
      }));
      const pick =
        checked.find((x) => x.v.status === "verified") ??
        (checked.every((x) => x.v.status === "false")
          ? checked[0]
          : (checked.find((x) => x.v.status === "unverified") ?? checked[0]));
      claims.push({
        claim: pick.o.claim,
        phrase: c.phrase,
        anchor: pick.o.anchor.id,
        verdict: pick.v,
      });
    }
    const falses = claims.filter((c) => c.verdict.status === "false");
    const unverified = claims.filter((c) => c.verdict.status === "unverified");
    let action: CheckedSentence["action"] = "keep";
    let rewrite: string | undefined;
    if (falses.length > 0) {
      const fixed =
        falses.length === 1 && unverified.length === 0
          ? rewriteFor(falses[0], anchors.get(falses[0]) ?? null)
          : null;
      const cites = Array.from(text.matchAll(CITATION_RE)).map((m) => m[0]);
      if (fixed) {
        action = "rewrite";
        rewrite = cites.length
          ? `${fixed.replace(/\.$/, "")} ${cites.join(" ")}.`
          : fixed;
      } else action = "drop";
      blocked.push(...falses);
    } else if (unverified.length > 0 && !opinion) {
      action = "drop";
      blocked.push(...unverified);
    }
    const verified = claims.some((c) => c.verdict.status === "verified");
    const source: SentenceSource =
      action === "rewrite" ||
      (verified && unverified.length === 0 && falses.length === 0)
        ? "verified-fact"
        : ENGINE_RE.test(text.replace(CITATION_RE, ""))
          ? "engine"
          : "judgment";
    const unparsed =
      claims.length === 0 &&
      CLAIM_TRIGGER_RE.test(text.replace(CITATION_RE, ""));
    sentences.push({
      text,
      claims,
      opinion,
      action,
      ...(rewrite ? { rewrite } : {}),
      source,
      unparsed,
    });
  }

  if (opts.log !== false) {
    for (const c of blocked) {
      log.info("coach claim blocked", {
        factIdPrefix: insight.factIdPrefix,
        kind: c.claim.kind,
        status: c.verdict.status,
        reason: c.verdict.reason,
        anchor: c.anchor,
        phrase: c.phrase.slice(0, 80),
      });
    }
    const unparsed = sentences.filter((s) => s.unparsed);
    if (unparsed.length > 0) {
      log.debug("coach claim gate: claim-like sentences it could not parse", {
        factIdPrefix: insight.factIdPrefix,
        sentences: unparsed.map((s) => s.text.slice(0, 100)),
      });
    }
  }
  return { sentences, blocked };
}

/**
 * Apply the gate to a card body: false sentences rewritten to the verified
 * fact or dropped, unverified non-opinion sentences dropped. Returns null
 * when nothing would be left worth a card (the caller falls back to the
 * template card, built only from contract facts).
 */
export function applyClaimGate(
  body: string,
  check: CardClaimCheck
): string | null {
  const byText = new Map(check.sentences.map((s) => [s.text, s]));
  const lines = body.split("\n").map((line) => {
    if (/^\s*\[\/?[A-Z_]+(?::[^\]]*)?\]\s*$/.test(line)) return line;
    const kept = splitLineSentences(line).flatMap((sen) => {
      const s = byText.get(sen.trim());
      if (!s || s.action === "keep") return [sen];
      if (s.action === "rewrite" && s.rewrite) return [s.rewrite];
      return [];
    });
    return kept.join(" ");
  });
  const result = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return result.replace(/\[[^\]]*\]/g, "").trim().length < 40 ? null : result;
}
