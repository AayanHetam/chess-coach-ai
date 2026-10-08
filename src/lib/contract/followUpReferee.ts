/**
 * Follow-up referee — the light enforcement the chat path never had.
 *
 * Turn 1 is contract-bound and refereed: the verbalizer cites facts and the
 * ladder deletes anything the contract cannot back. Turn 2+ (`/api/chat`)
 * streams no [INSIGHT] grammar, so the block-gated ladder cannot run there,
 * and until now nothing checked the reply at all. The probe that shipped the
 * line stories (followup_story_probe.ts) showed what that costs: without the
 * stories every answer carried a chess-false sentence — Black's hanging queen
 * called "your queen", a rook invented on c8, a mate threat that did not
 * exist. Better input cut those; nothing ENFORCED it.
 *
 * This module does, sentence by sentence, with the founder's rule for turn 1
 * (drop or rewrite an unverifiable claim, never hedge it):
 *
 *   - a TACTICAL WORD (fork, pin, skewer, discovered, trapped, hanging, back
 *     rank, mate threat) must be licensed by the review's compact contract —
 *     a motif the review confirmed, a story fact, a licensed keyword — or by
 *     a fresh chess.js read of the board under discussion (a pin or a hanging
 *     piece that is simply there);
 *   - a MOVE written in notation must be a game move, a move from an engine
 *     line or story the review carried, legal on the board under discussion
 *     (or after the earlier moves of the same sentence), or, when it carries
 *     a move number, legal at that point of the game;
 *   - an EVAL figure must be one the review or the per-move table displayed;
 *   - a PIECE ON A SQUARE ("your queen on c1", "the rook on c8") must stand
 *     there on the board under discussion or on one of the reviewed moves'
 *     before/after boards — and belong to the side the sentence says.
 *
 * A sentence that fails is removed. Definitional prose ("a fork is when one
 * piece attacks two") is exempt exactly as on turn 1. When nothing survives,
 * the reply is the honest one-liner below rather than an empty box. Legacy
 * contexts (no compact contract) are passed through untouched — there is
 * nothing to referee against.
 */
import { Chess } from "chess.js";
import type { CompactContract } from "./followUp";
import { getFenAtHalfMove } from "./chessFormat";
import { isDefinitionalSentence } from "./refereeChecks";
import { splitProseSentences } from "./sentences";
import { buildRelationalFacts } from "@/lib/relational/relationalFactsBuilder";

export const FOLLOWUP_REFEREE_FALLBACK =
  "I can't back that up from the engine lines I have for this game. Ask me about a specific move and I'll check it against them.";

export interface FollowUpRefereeInput {
  reply: string;
  /** The review's compact contract; null/undefined ⇒ legacy context, reply untouched. */
  compact: CompactContract | null | undefined;
  /** The board the question is about (client FEN, else the context FEN). */
  activeFen: string;
  /** The game's SAN moves. */
  moveHistory: readonly string[];
  /** Extra eval strings the turn may quote (the per-move table the chat context carries). */
  licensedEvals?: readonly string[];
  /**
   * Further boards a piece-on-square claim may describe: the boards before
   * and after the move the question named (questionAnchor.ts), which is not
   * always a reviewed insight and so is not always in the contract.
   */
  extraFens?: readonly string[];
  /**
   * Extra text whose tactical words and moves license the reply — the anchor
   * block (followUpContext.ts), whose line stories the model was told to
   * explain through. Same pool the contract's stories feed.
   */
  extraLicensedText?: string;
  /**
   * The ply (half-moves played) of `activeFen`, when known. With it, a
   * sentence's unnumbered moves are read as a line walked from the board
   * under discussion, and matched against the licensed lines at that ply.
   */
  activePly?: number;
  /**
   * Lines the reply may cite as sequences, each with the ply it starts
   * from: the anchor's engine line (followUpContext.ts). The review's own
   * lines come from the contract.
   */
  extraLines?: readonly LicensedLine[];
  /**
   * Spans of the reply a validator contradicted (Mastermind
   * `ValidatorIssue.llm_span`, error severity). The sentence holding one is
   * dropped whatever else licenses it. This is what lets a draft the
   * pipeline rejected be served instead of its template: the objection
   * travels with the draft and lands on the sentence it was about.
   */
  flaggedSpans?: readonly string[];
}

/** A licensed line and where in the game it starts. */
export interface LicensedLine {
  startFen: string;
  /** Half-moves played before the line's first move. */
  startPly: number;
  sans: readonly string[];
}

export interface FollowUpRefereeDrop {
  sentence: string;
  reason: string;
}

export interface FollowUpRefereeResult {
  text: string;
  /** false ⇒ nothing to referee against (legacy context); text === reply. */
  applied: boolean;
  sentences: number;
  dropped: FollowUpRefereeDrop[];
}

// ── Tactical vocabulary → what licenses it ─────────────────────────────────
interface KeywordFamily {
  name: string;
  re: RegExp;
  /** Substrings of the contract's licence pool that back the word. */
  poolRoots: string[];
  /** Fresh board read that backs it, if any. */
  board?: "hanging" | "pin";
}
const FAMILIES: KeywordFamily[] = [
  { name: "fork", re: /\bfork(?:s|ed|ing)?\b/i, poolRoots: ["fork"] },
  {
    name: "double attack",
    re: /\bdouble attack\b/i,
    poolRoots: ["fork", "double attack"],
  },
  {
    name: "pin",
    re: /\bpin(?:s|ned|ning)?\b/i,
    poolRoots: ["pin"],
    board: "pin",
  },
  { name: "skewer", re: /\bskewer(?:s|ed|ing)?\b/i, poolRoots: ["skewer"] },
  {
    name: "discovered",
    re: /\bdiscover(?:ed|y)\b/i,
    poolRoots: ["discover", "uncovers"],
  },
  { name: "trapped", re: /\btrapped\b/i, poolRoots: ["trapped", "traps"] },
  {
    name: "hanging",
    re: /\bhanging\b/i,
    poolRoots: [
      "hanging",
      "en prise",
      "undefended",
      "can now be taken",
      "can be recaptured",
    ],
    board: "hanging",
  },
  {
    name: "back rank",
    re: /\bback[- ]rank\b/i,
    poolRoots: ["back-rank", "back rank"],
  },
  {
    name: "mate threat",
    re: /\b(?:(?:check)?mat(?:e|ing) threat|threat(?:en|ens|ening) (?:an? )?(?:immediate |quick |forced )?(?:check)?mate)\b/i,
    poolRoots: [
      "threatens mate",
      "mate threat",
      "allows mate",
      "back-rank mate",
      "checkmate",
    ],
  },
  {
    name: "removes the defender",
    re: /\bremov(?:e|es|ing) the defender\b/i,
    poolRoots: ["removes the"],
  },
];

/** A move in notation. Pawn moves are only taken as moves when cued (a move number or a move verb) — bare "e5" is a square. */
const SAN_CORE =
  "(?:[NBRQK][a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?|[a-h]x[a-h][1-8](?:=[NBRQ])?[+#]?)";
const PAWN_SAN = "(?:[a-h][1-8](?:=[NBRQ])?[+#]?)";
const SAN_TOKEN_RE = new RegExp(
  `(?<![A-Za-z0-9])(?:(\\d+)(\\.{1,3})\\s*)?(${SAN_CORE})(?![A-Za-z0-9])` +
    `|(?<![A-Za-z0-9])(\\d+)(\\.{1,3})\\s*(${PAWN_SAN})(?![A-Za-z0-9])` +
    `|\\b(?:play|played|plays|playing|move|moves|with|after|instead of|rather than|try|consider)\\s+(${PAWN_SAN})(?![A-Za-z0-9])`,
  "g"
);
const EVAL_RE =
  /(?<![A-Za-z0-9.])([+-]\d+(?:\.\d{1,2})?|M[+-]?\d+)(?![A-Za-z0-9.%])/g;
/** "your queen on c1", "White's rook on a1", "the knight on f6", "Black's king at g8" */
const PIECE_ON_SQUARE_RE =
  /\b(?:(white|black|your|my|their|opponent'?s|the opponent'?s)\s+(?:own\s+)?)?(pawn|knight|bishop|rook|queen|king)\s+(?:on|at)\s+([a-h][1-8])\b/gi;
const PIECE_LETTER: Record<string, string> = {
  pawn: "p",
  knight: "n",
  bishop: "b",
  rook: "r",
  queen: "q",
  king: "k",
};

const stripSan = (s: string) => s.replace(/[+#!?]/g, "").toLowerCase();
/** A line that opens with a move ("Qxc1 …", "e5 …"), for telling a move number from a list number. */
const MOVE_START_RE = new RegExp(`^(?:${SAN_CORE}|${PAWN_SAN})(?![A-Za-z0-9])`);

function evalKey(display: string): string | null {
  const m = /^([+-])(\d+(?:\.\d+)?)$/.exec(display.trim());
  if (m) return `${m[1]}${Number(m[2]).toFixed(2)}`;
  const mate = /^M([+-]?)(\d+)$/.exec(display.trim());
  if (mate) return `M${mate[1] || "+"}${mate[2]}`;
  return null;
}

/**
 * The shape two texts are compared in: whitespace collapsed, markdown
 * emphasis and trailing punctuation off, lower case. A span an extractor
 * model pulled out of the reply rarely keeps the reply's asterisks.
 */
function normalizeForMatch(s: string): string {
  return s
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[\s.!?,;:]+$/g, "")
    .trim()
    .toLowerCase();
}

export function refereeFollowUp(
  input: FollowUpRefereeInput
): FollowUpRefereeResult {
  const { reply, compact, activeFen, moveHistory } = input;
  if (!compact)
    return { text: reply, applied: false, sentences: 0, dropped: [] };

  // ── Licence pools ──────────────────────────────────────────────────────────
  const poolText = [
    ...compact.insights.flatMap((i) => [
      ...i.allowedTacticalKeywords,
      ...i.motifSayables,
      ...(i.bestLineStory ?? []),
      ...(i.gameStory ?? []),
      ...(i.relationalSayables ?? []),
    ]),
    input.extraLicensedText ?? "",
  ]
    .join(" | ")
    .toLowerCase();
  const sanPool = new Set<string>();
  for (const m of moveHistory) sanPool.add(stripSan(m));
  const STORY_SAN_RE = new RegExp(
    `(?<![A-Za-z0-9])(?:\\d+\\.{1,3}\\s*)?(${SAN_CORE}|${PAWN_SAN})(?![A-Za-z0-9])`,
    "g"
  );
  for (const i of compact.insights) {
    sanPool.add(stripSan(i.playedSan));
    if (i.bestSan) sanPool.add(stripSan(i.bestSan));
    for (const s of i.bestLineSan) sanPool.add(stripSan(s));
    for (const line of [...(i.bestLineStory ?? []), ...(i.gameStory ?? [])]) {
      for (const tok of Array.from(line.matchAll(STORY_SAN_RE)))
        sanPool.add(stripSan(tok[1]));
    }
  }
  // The anchor block's engine line and game continuation are licensed moves
  // too — the model was told to explain through them.
  for (const line of (input.extraLicensedText ?? "").split("\n")) {
    for (const tok of Array.from(line.matchAll(STORY_SAN_RE)))
      sanPool.add(stripSan(tok[1]));
  }
  // ── Lines as positions ───────────────────────────────────────────────────
  // Every licensed line laid out ply by ply: "<ply>:<san>" → the board after
  // that move. A numbered move in the reply is checked here, at its own
  // number, so a move that is real in one key moment's line cannot be
  // borrowed for another move number. Live, 2026-09-26: "8... Kxc7" — real
  // at move 9 in the 9. Nxa8 line, impossible at move 8 — passed three
  // times because the pool above knows moves, not plies.
  const lineAfter = new Map<string, string>();
  const addLine = (
    startFen: string,
    startPly: number,
    sans: readonly string[]
  ) => {
    let g: Chess;
    try {
      g = new Chess(startFen);
    } catch {
      return;
    }
    let ply = startPly;
    for (const san of sans) {
      try {
        if (!g.move(san)) return;
      } catch {
        return;
      }
      lineAfter.set(`${ply}:${stripSan(san)}`, g.fen());
      ply += 1;
    }
  };
  try {
    addLine(getFenAtHalfMove(moveHistory as string[], 0), 0, moveHistory);
  } catch {
    /* no game to walk */
  }
  for (const i of compact.insights) {
    addLine(
      i.fenBefore,
      (i.moveNumber - 1) * 2 + (i.color === "b" ? 1 : 0),
      i.bestLineSan
    );
  }
  for (const l of input.extraLines ?? [])
    addLine(l.startFen, l.startPly, l.sans);
  const applySan = (fen: string, san: string): string | null => {
    try {
      const g = new Chess(fen);
      return g.move(san) ? g.fen() : null;
    } catch {
      return null;
    }
  };

  const evalPool = new Set<string>();
  for (const i of compact.insights)
    for (const d of [i.evalBeforeDisplay, i.evalAfterDisplay]) {
      const k = evalKey(d);
      if (k) evalPool.add(k);
    }
  for (const d of input.licensedEvals ?? []) {
    const k = evalKey(d);
    if (k) evalPool.add(k);
  }

  let boardHanging = false;
  let boardPin = false;
  try {
    const rel = buildRelationalFacts(activeFen);
    boardHanging = rel.hanging.length > 0;
    boardPin = rel.pins.length > 0;
  } catch {
    /* no fresh board read — contract pools still apply */
  }

  // Every position a follow-up may legitimately describe: the board under
  // discussion plus each reviewed move's before/after boards.
  const boards: Chess[] = [];
  for (const fen of [
    activeFen,
    ...(input.extraFens ?? []),
    ...compact.insights.flatMap((i) => [i.fenBefore, i.fenAfter]),
  ]) {
    if (!fen) continue;
    try {
      boards.push(new Chess(fen));
    } catch {
      /* skip */
    }
  }
  const playerColor = compact.playerColor === "b" ? "b" : "w";
  const claimedColor = (word: string | undefined): "w" | "b" | null => {
    const w = (word ?? "").toLowerCase();
    if (w === "white") return "w";
    if (w === "black") return "b";
    if (w === "your") return playerColor;
    if (w === "their" || w.includes("opponent"))
      return playerColor === "w" ? "b" : "w";
    return null;
  };
  /** True iff SOME licensed board has that piece (and colour, when claimed) on that square. */
  const pieceStands = (
    color: "w" | "b" | null,
    piece: string,
    square: string
  ): boolean =>
    boards.some((b) => {
      const p = b.get(square as never);
      return (
        !!p &&
        p.type === PIECE_LETTER[piece] &&
        (color === null || p.color === color)
      );
    });

  // ── Validator objections ──────────────────────────────────────────────────
  // A span may be a phrase ("Black's queen is hanging"), a whole sentence, or
  // several joined with " | " (the eval validator's supporting spans). Each
  // piece is looked for inside a sentence, and a sentence inside a piece, so
  // a span that ran across a boundary still lands on every sentence it
  // covered.
  const flaggedPieces: string[] = [];
  for (const raw of input.flaggedSpans ?? []) {
    for (const part of raw.split(" | ")) {
      for (const piece of splitProseSentences(part)) {
        const n = normalizeForMatch(piece);
        if (n.length >= 4) flaggedPieces.push(n);
      }
    }
  }
  const isFlagged = (sentence: string): boolean => {
    if (flaggedPieces.length === 0) return false;
    const n = normalizeForMatch(sentence);
    if (n.length === 0) return false;
    return flaggedPieces.some(
      (p) => n.includes(p) || (n.length >= 12 && p.includes(n))
    );
  };

  // ── Sentence by sentence, line by line (keeps bullets and paragraphs) ─────
  const dropped: FollowUpRefereeDrop[] = [];
  let sentenceCount = 0;
  const keptLines: string[] = [];
  for (const rawLine of reply.split("\n")) {
    let bullet = /^(\s*(?:[-*•]|\d+[.)])\s+)/.exec(rawLine)?.[1] ?? "";
    // "8. Qxc1 Kxc7 — …" opens with a move number, not a list marker. Taking
    // the "8. " as a bullet left "Qxc1 Kxc7" unnumbered, and unnumbered
    // moves fall back to the pool: the live "Kxc7" escaped exactly there.
    if (/\d/.test(bullet) && MOVE_START_RE.test(rawLine.slice(bullet.length)))
      bullet = "";
    const body = rawLine.slice(bullet.length);
    if (body.trim().length === 0) {
      keptLines.push(rawLine);
      continue;
    }
    const sentences = splitProseSentences(body);
    const kept: string[] = [];
    // A line the coach proposes from the board under discussion: later moves
    // of the same sentence are legal after the earlier ones.
    for (const sentence of sentences) {
      sentenceCount++;
      let reason: string | null = null;
      const definitional = isDefinitionalSentence(sentence);

      // A validator's objection outranks every licence: the sentence it was
      // about goes, definitional or not.
      if (isFlagged(sentence)) reason = "validator";

      if (!reason && !definitional) {
        for (const fam of FAMILIES) {
          if (!fam.re.test(sentence)) continue;
          const licensed =
            fam.poolRoots.some((r) => poolText.includes(r)) ||
            (fam.board === "hanging" && boardHanging) ||
            (fam.board === "pin" && boardPin);
          if (!licensed) {
            reason = `tactical:${fam.name}`;
            break;
          }
        }
      }

      if (!reason && boards.length > 0) {
        for (const m of Array.from(sentence.matchAll(PIECE_ON_SQUARE_RE))) {
          const piece = m[2].toLowerCase();
          const square = m[3].toLowerCase();
          if (!pieceStands(claimedColor(m[1]), piece, square)) {
            reason = `piece:${m[0]}`;
            break;
          }
        }
      }

      if (!reason) {
        // A sentence's moves are read as a line: from the board under
        // discussion, or from the first numbered move it names. A numbered
        // move is licensed only at its own number — a licensed line's move
        // there (the game's included), a legal alternative there, or the
        // next move of the line the sentence is already walking. Once the
        // sentence has placed itself in a line, its unnumbered moves are that
        // line's next moves, never a bare pool match.
        let running: { fen: string; ply: number | null } = {
          fen: activeFen,
          ply: input.activePly ?? null,
        };
        let inSequence = false;
        for (const m of Array.from(sentence.matchAll(SAN_TOKEN_RE))) {
          const san = m[3] ?? m[6] ?? m[7];
          const num = m[1] ?? m[4];
          const dots = m[2] ?? m[5];
          if (!san) continue;
          const key = stripSan(san);
          if (num !== undefined) {
            const ply =
              (Number(num) - 1) * 2 + (dots && dots.length >= 3 ? 1 : 0);
            const after = lineAfter.get(`${ply}:${key}`);
            if (after) {
              running = { fen: after, ply: ply + 1 };
              inSequence = true;
              continue;
            }
            let fenAtPly: string | null = null;
            try {
              fenAtPly = getFenAtHalfMove(moveHistory as string[], ply);
            } catch {
              fenAtPly = null;
            }
            const alt = fenAtPly ? applySan(fenAtPly, san) : null;
            if (alt) {
              running = { fen: alt, ply: ply + 1 };
              inSequence = true;
              continue;
            }
            if (running.ply === ply) {
              const next = applySan(running.fen, san);
              if (next) {
                running = { fen: next, ply: ply + 1 };
                inSequence = true;
                continue;
              }
            }
            reason = `san:${san}`;
            break;
          }
          const next = applySan(running.fen, san);
          if (next) {
            running = {
              fen: next,
              ply: running.ply === null ? null : running.ply + 1,
            };
            continue;
          }
          if (running.ply !== null) {
            const lineNext = lineAfter.get(`${running.ply}:${key}`);
            if (lineNext) {
              running = { fen: lineNext, ply: running.ply + 1 };
              continue;
            }
          }
          if (!inSequence && sanPool.has(key)) continue;
          reason = `san:${san}`;
          break;
        }
      }

      if (!reason && evalPool.size > 0) {
        for (const m of Array.from(sentence.matchAll(EVAL_RE))) {
          const k = evalKey(m[1]);
          if (k && !evalPool.has(k)) {
            reason = `eval:${m[1]}`;
            break;
          }
        }
      }

      if (reason) dropped.push({ sentence: sentence.trim(), reason });
      else kept.push(sentence.trim());
    }
    if (kept.length > 0) keptLines.push(`${bullet}${kept.join(" ")}`);
  }

  let text = keptLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length === 0) text = FOLLOWUP_REFEREE_FALLBACK;
  return { text, applied: true, sentences: sentenceCount, dropped };
}
