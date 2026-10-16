/**
 * Verified game report (COACH_CLAIM_VERIFIER) — the verdict, the story of the
 * game, the moments that decided it, credit for a good move, and one habit,
 * built only from verified facts: chess.js replays (verifyClaims.ts) and the
 * engine's numbers, each carrying its engine and depth (pass 1, or the deep
 * re-check for a re-checked move — deepRecheck.ts).
 *
 * Code writes every sentence, so the report cannot state a board fact that is
 * not true. The "why it matters" lines are opinion and say so. A section with
 * nothing verified to say is left out rather than padded.
 *
 * Credit means: the engine's move (or within a hair of it) AND either the
 * only good move or the one that kept a better outcome than the next best.
 * "Brilliant" is narrower still: a credit-worthy, engine-best move that gives
 * material the opponent could take by static count, and the engine still
 * likes it. Game B's 10.Nb5 earns credit; its 11.Bxh7+ does not (the engine
 * liked other moves almost as much), and so is not brilliant either.
 *
 * Pure: everything comes in as data.
 */
import { Chess, type Color, type Square } from "chess.js";
import { getLineWinPercentage } from "@/lib/engine/helpers/winPercentage";
import { evalBand } from "@/lib/contract/cardWorthiness";
import { capturable } from "@/lib/tactics/capturable";
import type { LineEval, PositionEval } from "@/types/eval";
import { EngineName, MoveClassification } from "@/types/enums";
import { ENGINE_LABELS } from "@/constants";
import {
  missedMate,
  recheckedPair,
  selectFlaggedMoments,
  type GameEvalRecheck,
} from "./deepRecheck";
import { replayLine } from "./verifyClaims";

export interface ReportInput {
  sans: readonly string[];
  /** Pass 1, one per position (index k = after k half-moves). */
  positions: readonly PositionEval[];
  recheck?: GameEvalRecheck | null;
  playerColor: Color | null;
  /** PGN result header when known: "1-0", "0-1", "1/2-1/2". */
  result?: string | null;
  /** Pass-1 engine, e.g. "stockfish_17_lite". */
  engine: string;
  /** Starting position when the game did not start from the initial one. */
  rootFen?: string;
}

export interface EvalNote {
  display: string;
  depth: number;
  engine: string;
  /** White's point of view, as the engine reported it. */
  cp: number | null;
  mate: number | null;
}

export interface ReportMoment {
  move: number;
  label: string;
  san: string;
  mover: Color;
  byPlayer: boolean | null;
  kind: "missed_mate" | "mistake" | "opponent_mistake";
  before: EvalNote;
  after: EvalNote;
  /** The engine's move instead, with its line (SAN, replayed). */
  best: { label: string; san: string; line: string[] } | null;
  mateIn: number | null;
  /** Board facts of the move itself (capture, check, mate). */
  did: string[];
}

export interface ReportCredit {
  move: number;
  label: string;
  san: string;
  reason: "only_good_move" | "kept_the_outcome";
  played: EvalNote;
  next: { label: string; san: string; eval: EvalNote };
  brilliant: boolean;
}

export interface ReportHabit {
  id: "mate_before_material" | "blunder_check" | "forcing_moves_first";
  text: string;
  /** The moments it rests on, as move labels ("15.Qh7+"). */
  evidence: string[];
  /** One verified sentence tying it to the game. */
  because: string;
}

export interface GameReport {
  playerColor: Color | null;
  verdict: string;
  /** Three to five sentences, or none when there were not enough verified beats. */
  story: string[];
  moments: ReportMoment[];
  credit: ReportCredit[];
  habit: ReportHabit | null;
  /** How the numbers were produced, for the footnote. */
  method: {
    engine: string;
    depth: number;
    recheck: { engine: string; depth: number; moves: number } | null;
  };
}

export type ReportSource = "verified-fact" | "engine" | "judgment";

const SIDE: Record<Color, string> = { w: "White", b: "Black" };

/** Who had the move: you, your opponent, or the side when whose game it is is not known. */
function moverName(mo: ReportMoment, midSentence = false): string {
  if (mo.byPlayer === null) return SIDE[mo.mover];
  const name = mo.byPlayer ? "You" : "Your opponent";
  return midSentence ? name.toLowerCase() : name;
}
const opp = (c: Color): Color => (c === "w" ? "b" : "w");

// ── Per-move data ───────────────────────────────────────────────────────────
interface MoveData {
  move: number;
  san: string;
  label: string;
  mover: Color;
  fenBefore: string;
  fenAfter: string;
  before: LineEval[];
  after: LineEval[];
  engine: string;
}

function fensOf(input: ReportInput): string[] | null {
  const r = replayLine(input.rootFen ?? new Chess().fen(), input.sans);
  if (!r.ok) return null;
  return [r.startFen, ...r.plies.map((p) => p.fenAfter)];
}

function labelOf(fen: string, san: string): string {
  const [, turn, , , , full] = fen.split(" ");
  return `${full}${turn === "w" ? "." : "..."}${san}`;
}

function moveData(
  input: ReportInput,
  fens: string[],
  i: number
): MoveData | null {
  const deep = recheckedPair(input.recheck, i);
  const before = deep ? deep.before.lines : input.positions[i]?.lines;
  const after = deep ? deep.after.lines : input.positions[i + 1]?.lines;
  if (!before?.length || !after?.length || !fens[i] || !fens[i + 1])
    return null;
  return {
    move: i,
    san: input.sans[i],
    label: labelOf(fens[i], input.sans[i]),
    mover: fens[i].split(" ")[1] === "b" ? "b" : "w",
    fenBefore: fens[i],
    fenAfter: fens[i + 1],
    before,
    after,
    engine: deep ? input.recheck!.engine : input.engine,
  };
}

function note(line: LineEval, engine: string): EvalNote {
  const display =
    typeof line.mate === "number"
      ? `M${line.mate > 0 ? "+" : ""}${line.mate}`
      : `${(line.cp ?? 0) >= 0 ? "+" : ""}${((line.cp ?? 0) / 100).toFixed(2)}`;
  return {
    display,
    depth: line.depth,
    engine,
    cp: typeof line.cp === "number" ? line.cp : null,
    mate: typeof line.mate === "number" ? line.mate : null,
  };
}

/** An eval note's centipawns for `side` (mates as ±10000). */
function noteFor(e: EvalNote, side: Color): number {
  const white = e.mate !== null ? (e.mate > 0 ? 10000 : -10000) : (e.cp ?? 0);
  return side === "w" ? white : -white;
}

const scored = (l: LineEval | undefined) =>
  !!l &&
  l.depth > 0 &&
  (typeof l.cp === "number" || typeof l.mate === "number");

/** Centipawns for `side`, mates as ±(10000 - distance) so a faster mate is worth more. */
function valueFor(l: LineEval, side: Color): number {
  const white =
    typeof l.mate === "number"
      ? l.mate > 0
        ? 10000 - l.mate
        : -10000 - l.mate
      : (l.cp ?? 0);
  return side === "w" ? white : -white;
}

function winFor(l: LineEval, side: Color): number {
  const white = getLineWinPercentage(l);
  return side === "w" ? white : 100 - white;
}

function sanLine(fen: string, uci: readonly string[], plies = 6): string[] {
  const r = replayLine(fen, uci.slice(0, plies));
  return r.plies.map((p) => p.san);
}

/** What the move itself did, as certain board facts. */
function didFacts(m: MoveData): string[] {
  const r = replayLine(m.fenBefore, [m.san]);
  const p = r.plies[0];
  if (!r.ok || !p) return [];
  const out: string[] = [];
  const NAME: Record<string, string> = {
    p: "pawn",
    n: "knight",
    b: "bishop",
    r: "rook",
    q: "queen",
  };
  if (p.captured)
    out.push(`took the ${NAME[p.captured.piece]} on ${p.captured.square}`);
  if (p.isMate) out.push("was checkmate");
  else if (p.givesCheck) out.push("gave check");
  return out;
}

const playedUci = (m: MoveData) => {
  const r = replayLine(m.fenBefore, [m.san]);
  return r.plies[0]?.uci ?? "";
};

// ── Credit and brilliance ───────────────────────────────────────────────────
interface CreditRead {
  worthy: boolean;
  reason: ReportCredit["reason"];
  gap: number;
  next: LineEval | null;
}

/**
 * Engine-best (or within 20 centipawns of the best) and the move that had to
 * be found: the next best alternative is at least a pawn worse, or not a
 * mate where this is, or at least half a pawn worse AND in a worse outcome
 * band. A mate in one is not credit — it finishes the game, it does not
 * find anything.
 */
function creditRead(m: MoveData): CreditRead {
  const no: CreditRead = {
    worthy: false,
    reason: "only_good_move",
    gap: 0,
    next: null,
  };
  const [best] = m.before;
  const next = m.before.find(
    (l, k) => k > 0 && l.pv[0] && l.pv[0] !== best?.pv[0]
  );
  const after = m.after[0];
  if (!scored(best) || !scored(next) || !scored(after)) return no;
  if (typeof best.mate === "number" && Math.abs(best.mate) === 1) return no;
  const played = playedUci(m);
  const nearBest =
    played === best.pv[0] ||
    valueFor(best, m.mover) - valueFor(after, m.mover) <= 20;
  if (!nearBest || played === next!.pv[0]) return no;
  const gap = valueFor(best, m.mover) - valueFor(next!, m.mover);
  const bestMates =
    typeof best.mate === "number" &&
    (m.mover === "w" ? best.mate > 0 : best.mate < 0);
  const nextMates =
    typeof next!.mate === "number" &&
    (m.mover === "w" ? next!.mate > 0 : next!.mate < 0);
  if (gap >= 100 || (bestMates && !nextMates))
    return { worthy: true, reason: "only_good_move", gap, next: next! };
  const band = (l: LineEval) =>
    evalBand(Math.max(-9999, Math.min(9999, valueFor(l, m.mover))));
  if (gap >= 50 && band(next!) < band(best))
    return { worthy: true, reason: "kept_the_outcome", gap, next: next! };
  return { ...no, gap, next: next! };
}

/** A credit-worthy, engine-best move that gives material by static count, and the engine still likes it. */
function earnsBrilliance(m: MoveData, read: CreditRead): boolean {
  if (!read.worthy || playedUci(m) !== m.before[0]?.pv[0]) return false;
  const [best] = m.before;
  const after = m.after[0];
  if (!scored(after) || valueFor(after, m.mover) < valueFor(best, m.mover) - 50)
    return false;
  let game: Chess;
  try {
    game = new Chess(m.fenAfter);
  } catch {
    return false;
  }
  const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  for (const row of game.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== m.mover || VALUE[sq.type] < 3) continue;
      if (capturable(game, sq.square as Square, opp(m.mover))) return true;
    }
  }
  return false;
}

/**
 * The browser labels a move "brilliant" on a sacrifice that does not lose.
 * Under the claim verifier the chip is earned only on the criteria above.
 * Exposed for the client, which owns the chips.
 */
export function earnsBrilliantChip(input: ReportInput, move: number): boolean {
  const fens = fensOf(input);
  if (!fens) return false;
  const m = moveData(input, fens, move);
  return !!m && earnsBrilliance(m, creditRead(m));
}

/**
 * The browser's labels with every "brilliant" these criteria do not earn
 * taken back — to Best when it was the engine's move, else Excellent (the
 * browser's own rule already guarantees it was not a losing move).
 */
export function gateBrilliantChips(
  input: ReportInput,
  labelled: readonly PositionEval[]
): PositionEval[] {
  const fens = fensOf(input);
  if (!fens) return [...labelled];
  return labelled.map((p, k) => {
    if (k === 0 || p.moveClassification !== MoveClassification.Brilliant)
      return p;
    const m = moveData(input, fens, k - 1);
    if (m && earnsBrilliance(m, creditRead(m))) return p;
    const engineBest = !!m && playedUci(m) === m.before[0]?.pv[0];
    return {
      ...p,
      moveClassification: engineBest
        ? MoveClassification.Best
        : MoveClassification.Excellent,
    };
  });
}

// ── Moments ─────────────────────────────────────────────────────────────────
function momentOf(input: ReportInput, m: MoveData): ReportMoment | null {
  const before = m.before[0];
  const after = m.after[0];
  if (!scored(before) || !after) return null;
  const byPlayer =
    input.playerColor === null ? null : input.playerColor === m.mover;
  const mated = missedMate(before, after, m.mover);
  if (!scored(after) && !mated) return null;
  const loss = scored(after)
    ? winFor(before, m.mover) - winFor(after, m.mover)
    : 0;
  const kind: ReportMoment["kind"] | null = mated
    ? "missed_mate"
    : byPlayer === false
      ? loss >= 15
        ? "opponent_mistake"
        : null
      : loss >= 5
        ? "mistake"
        : null;
  if (!kind) return null;
  const bestUci = before.pv[0];
  const best =
    bestUci && bestUci !== playedUci(m)
      ? (() => {
          const line = sanLine(m.fenBefore, before.pv, 8);
          return line[0]
            ? { label: labelOf(m.fenBefore, line[0]), san: line[0], line }
            : null;
        })()
      : null;
  return {
    move: m.move,
    label: m.label,
    san: m.san,
    mover: m.mover,
    byPlayer,
    kind,
    before: note(before, m.engine),
    after: scored(after)
      ? note(after, m.engine)
      : { display: "", depth: 0, engine: m.engine, cp: null, mate: null },
    best,
    mateIn: mated?.mateIn ?? null,
    did: didFacts(m),
  };
}

// ── Habit ───────────────────────────────────────────────────────────────────
/** No pawn of the king's side on the three squares in front of it. */
function kingExposed(fen: string, side: Color): boolean {
  let game: Chess;
  try {
    game = new Chess(fen);
  } catch {
    return false;
  }
  let king: Square | null = null;
  for (const row of game.board())
    for (const sq of row)
      if (sq?.type === "k" && sq.color === side) king = sq.square as Square;
  if (!king) return false;
  const file = king.charCodeAt(0) - 97;
  const rank = Number(king[1]) + (side === "w" ? 1 : -1);
  if (rank < 1 || rank > 8) return true;
  for (const f of [file - 1, file, file + 1]) {
    if (f < 0 || f > 7) continue;
    const p = game.get(`${String.fromCharCode(97 + f)}${rank}` as Square);
    if (p?.type === "p" && p.color === side) return false;
  }
  return true;
}

/** The move took a piece, or the game's next few plies netted the mover a piece's worth. */
function grabbedMaterial(
  input: ReportInput,
  fens: string[],
  mo: ReportMoment
): boolean {
  if (mo.did.some((d) => /^took the (knight|bishop|rook|queen)/.test(d)))
    return true;
  const r = replayLine(fens[mo.move], input.sans.slice(mo.move, mo.move + 5));
  if (!r.ok || r.delta === null) return false;
  return (mo.mover === "w" ? r.delta : -r.delta) >= 3;
}

/** The engine's move was mate, or a check, or a line with two checks by the mover. */
function bestAttackedTheKing(mo: ReportMoment): boolean {
  if (!mo.best) return false;
  if (mo.mateIn !== null) return true;
  if (mo.best.san.includes("+")) return true;
  return (
    mo.best.line.filter((s, k) => k % 2 === 0 && /[+#]/.test(s)).length >= 2
  );
}

function pickHabit(
  input: ReportInput,
  fens: string[],
  moments: ReportMoment[]
): ReportHabit | null {
  const mine = moments.filter(
    (m) => m.byPlayer !== false && m.kind !== "opponent_mistake"
  );
  const greedy = mine.filter(
    (m) =>
      grabbedMaterial(input, fens, m) &&
      bestAttackedTheKing(m) &&
      kingExposed(fens[m.move], opp(m.mover))
  );
  if (
    greedy.length >= 2 ||
    (greedy.length === 1 && greedy[0].kind === "missed_mate")
  ) {
    const parts = greedy.map((m) =>
      m.kind === "missed_mate" && m.best
        ? `at ${m.label} ${moverName(m, true)} had mate in ${m.mateIn} with ${m.best.label}`
        : `at ${m.label} the material cost the attack (${m.before.display} → ${m.after.display})`
    );
    return {
      id: "mate_before_material",
      text: "When the enemy king is exposed, look for checks and mate before you take material.",
      evidence: greedy.map((m) => m.label),
      because: `${capitalise(parts.join("; "))}.`,
    };
  }
  const forcing = mine.filter(
    (m) => m.best && /[+#x]/.test(m.best.san) && !/[+#x]/.test(m.san)
  );
  if (forcing.length >= 2) {
    return {
      id: "forcing_moves_first",
      text: "Before you settle on a move, look at every check and capture first.",
      evidence: forcing.map((m) => m.label),
      because: `${capitalise(forcing.map((m) => `at ${m.label} the engine's move was ${m.best!.label}`).join("; "))}.`,
    };
  }
  return null;
}

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ── Verdict and story ───────────────────────────────────────────────────────
function resultOf(
  input: ReportInput,
  fens: string[]
): { winner: Color | "draw" | null; how: string } {
  const last = replayLine(
    fens[fens.length - 2] ?? fens[0],
    input.sans.slice(-1)
  );
  const moveNo = Math.ceil(input.sans.length / 2);
  if (last.ok && last.endsInMate)
    return {
      winner: last.plies[0].mover,
      how: ` by checkmate on move ${moveNo}`,
    };
  if (last.ok && last.endsInStalemate)
    return { winner: "draw", how: " by stalemate" };
  if (input.result === "1-0") return { winner: "w", how: "" };
  if (input.result === "0-1") return { winner: "b", how: "" };
  if (input.result === "1/2-1/2") return { winner: "draw", how: "" };
  return { winner: null, how: "" };
}

function verdictOf(
  input: ReportInput,
  fens: string[],
  moments: ReportMoment[]
): string {
  const { winner, how } = resultOf(input, fens);
  const you = input.playerColor;
  const missed = moments.some(
    (m) => m.kind === "missed_mate" && m.byPlayer !== false
  );
  // Winning (3 pawns or more) before, no better than slightly better after.
  const slipped = moments.some(
    (m) =>
      m.kind === "mistake" &&
      m.byPlayer !== false &&
      noteFor(m.before, m.mover) >= 300 &&
      noteFor(m.after, m.mover) < 100
  );
  const story = [
    missed ? "missing a forced mate" : "",
    slipped ? "letting a winning position slip" : "",
  ]
    .filter(Boolean)
    .join(" and later ");
  const tail = story ? `, after ${story}` : "";
  if (winner === null)
    return you
      ? `You played ${SIDE[you]}; the game was not finished.`
      : "The game was not finished.";
  if (winner === "draw") return `The game was drawn${how}${tail}.`;
  if (you === null) return `${SIDE[winner]} won${how}.`;
  return winner === you
    ? `You won with ${SIDE[you]}${how}${tail}.`
    : `You lost with ${SIDE[you]}${how}${tail}.`;
}

const at = (e: EvalNote) => `${e.display}, depth ${e.depth}`;

/** How much a moment matters: missed mates, then win chance lost (or handed over). */
function importance(mo: ReportMoment): number {
  if (mo.kind === "missed_mate") return 1000;
  const toLine = (e: EvalNote): LineEval => ({
    pv: [],
    depth: e.depth,
    multiPv: 1,
    ...(e.mate !== null ? { mate: e.mate } : { cp: e.cp ?? 0 }),
  });
  const lost = Math.abs(
    winFor(toLine(mo.before), mo.mover) - winFor(toLine(mo.after), mo.mover)
  );
  return 300 + lost * 5;
}

function storyOf(
  input: ReportInput,
  fens: string[],
  moments: ReportMoment[],
  credit: ReportCredit[]
): string[] {
  type Beat = { move: number; score: number; text: string };
  const beats: Beat[] = [];
  const merged = new Set<number>();
  const lastMove = input.sans.length - 1;
  const last = replayLine(fens[lastMove] ?? fens[0], input.sans.slice(-1));
  const mateLabel =
    last.ok && last.endsInMate
      ? labelOf(fens[lastMove], input.sans[lastMove])
      : null;
  const ordered = [...moments].sort((a, b) => a.move - b.move);
  for (let k = 0; k < ordered.length; k++) {
    const mo = ordered[k];
    if (merged.has(mo.move)) continue;
    const swing = `from ${mo.before.display} to ${mo.after.display} (depth ${mo.after.depth})`;
    if (mo.kind === "opponent_mistake") {
      const did = mo.did.length ? ` ${mo.did[0]} and` : "";
      let text =
        mateLabel && mo.move === lastMove - 1
          ? `Your opponent's ${mo.label} allowed ${mateLabel}, checkmate`
          : `Your opponent's ${mo.label}${did} swung the game ${swing}`;
      if (mateLabel && mo.move === lastMove - 1) merged.add(lastMove);
      const answer = credit.find((c) => c.move === mo.move + 1);
      const then = ordered[k + 1];
      if (answer && !text.includes("checkmate")) {
        text += `, and ${answer.label} was the only good way to make it count`;
        merged.add(answer.move);
      } else if (
        then?.kind === "opponent_mistake" &&
        then.move === mo.move + 2
      ) {
        text +=
          mateLabel && then.move === lastMove - 1
            ? `, and ${then.label} allowed ${mateLabel}, checkmate`
            : `, and ${then.label} swung it again ${`from ${then.before.display} to ${then.after.display} (depth ${then.after.depth})`}`;
        merged.add(then.move);
        if (mateLabel && then.move === lastMove - 1) merged.add(lastMove);
      }
      beats.push({ move: mo.move, score: importance(mo), text: `${text}.` });
    } else if (mo.kind === "missed_mate" && mo.best) {
      beats.push({
        move: mo.move,
        score: importance(mo),
        text: `${moverName(mo)} had mate in ${mo.mateIn} with ${mo.best.label}, but played ${mo.label} instead (${at(mo.after)}).`,
      });
    } else if (mo.kind === "mistake") {
      const lead = mo.did.length
        ? `${mo.label} ${mo.did.join(" and ")}, and`
        : `After ${mo.label},`;
      beats.push({
        move: mo.move,
        score: importance(mo),
        text: `${lead} the evaluation went ${swing}.`,
      });
    }
  }
  for (const c of credit) {
    if (merged.has(c.move)) continue;
    beats.push({
      move: c.move,
      score: 350 + (c.brilliant ? 100 : 0),
      text: `${c.label} was the only good move (${at(c.played)}; ${c.next.label} was ${c.next.eval.display}).`,
    });
  }
  const chosen = beats
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .sort((a, b) => a.move - b.move);
  if (mateLabel && !merged.has(lastMove) && chosen.length < 5) {
    chosen.push({
      move: lastMove,
      score: 0,
      text: `${mateLabel} was checkmate.`,
    });
  }
  const story = chosen.map((b) => capitalise(b.text));
  return story.length >= 3 ? story : [];
}

// ── Build ───────────────────────────────────────────────────────────────────
export function buildGameReport(input: ReportInput): GameReport | null {
  const fens = fensOf(input);
  if (!fens || input.positions.length === 0) return null;
  const flagged = selectFlaggedMoments(input.positions, {
    playerColor: input.playerColor,
    firstMover: fens[0].split(" ")[1] === "b" ? "b" : "w",
    max: 8,
  });
  const allMoments = flagged
    .map((f) => moveData(input, fens, f.move))
    .filter((m): m is MoveData => m !== null)
    .map((m) => momentOf(input, m))
    .filter((m): m is ReportMoment => m !== null)
    .sort((a, b) => importance(b) - importance(a));
  // The list the reader sees: their own moments first (up to four), the
  // opponent's biggest slips after, five in all, in game order.
  const mine = allMoments.filter((m) => m.byPlayer !== false).slice(0, 4);
  const moments = [...mine, ...allMoments.filter((m) => m.byPlayer === false)]
    .slice(0, 5)
    .sort((a, b) => a.move - b.move);

  const found: Array<{ credit: ReportCredit; gap: number }> = [];
  for (let i = 0; i < input.sans.length; i++) {
    const m = moveData(input, fens, i);
    if (!m || (input.playerColor !== null && m.mover !== input.playerColor))
      continue;
    const read = creditRead(m);
    if (!read.worthy || !read.next) continue;
    const nextSan = sanLine(m.fenBefore, read.next.pv, 1)[0];
    if (!nextSan) continue;
    found.push({
      gap: read.gap,
      credit: {
        move: i,
        label: m.label,
        san: m.san,
        reason: read.reason,
        played: note(m.after[0], m.engine),
        next: {
          label: labelOf(m.fenBefore, nextSan),
          san: nextSan,
          eval: note(read.next, m.engine),
        },
        brilliant: earnsBrilliance(m, read),
      },
    });
  }
  // The two that mattered most, told in game order.
  const topCredit = found
    .sort(
      (a, b) =>
        Number(b.credit.brilliant) - Number(a.credit.brilliant) || b.gap - a.gap
    )
    .slice(0, 2)
    .map((f) => f.credit)
    .sort((a, b) => a.move - b.move);

  const recheckDepth =
    input.recheck && Object.keys(input.recheck.positions ?? {}).length > 0
      ? input.recheck
      : null;
  return {
    playerColor: input.playerColor,
    verdict: verdictOf(input, fens, allMoments),
    story: storyOf(input, fens, allMoments, topCredit),
    moments,
    credit: topCredit,
    habit: pickHabit(input, fens, allMoments),
    method: {
      engine: input.engine,
      depth:
        input.positions.find((p) => p.lines?.[0]?.depth)?.lines[0].depth ?? 0,
      recheck: recheckDepth
        ? {
            engine: recheckDepth.engine,
            depth: recheckDepth.depth,
            moves: recheckDepth.moments.length,
          }
        : null,
    },
  };
}

// ── Rendering ───────────────────────────────────────────────────────────────
const WHY: Record<ReportMoment["kind"], string> = {
  missed_mate:
    "a forced mate ends the game on the spot; any other move gives the opponent another chance.",
  mistake:
    "the engine's move kept the advantage; this one gave much of it back.",
  opponent_mistake: "a slip like this is the moment to punish.",
};

function momentLine(mo: ReportMoment): { fact: string; why: string } {
  const swing = `${mo.before.display} → ${mo.after.display}, depth ${mo.after.depth}`;
  let fact: string;
  if (mo.kind === "missed_mate" && mo.best) {
    fact = `${moverName(mo)} had mate in ${mo.mateIn} with ${mo.best.label} (${mo.before.display}, depth ${mo.before.depth}); after ${mo.label} it was ${mo.after.display}.`;
  } else {
    const did = mo.did.length ? `${capitalise(mo.did.join(" and "))}; ` : "";
    const instead = mo.best
      ? `the engine's move was ${mo.best.label}`
      : "the evaluation moved";
    fact = `${did}${did ? instead : capitalise(instead)} (${swing}).`;
  }
  const tookMaterial = mo.did.some((d) => d.startsWith("took"));
  const why =
    mo.kind === "mistake" && tookMaterial && bestAttackedTheKing(mo)
      ? "the attack on the king was worth more than the material."
      : WHY[mo.kind];
  return { fact, why };
}

/** Verdict, story and the decisive moments: what goes before the cards. */
export function renderReportHead(report: GameReport): {
  text: string;
  sources: Array<{ text: string; source: ReportSource }>;
} {
  const sources: Array<{ text: string; source: ReportSource }> = [];
  const parts: string[] = [`**Verdict:** ${report.verdict}`];
  sources.push({ text: report.verdict, source: "verified-fact" });
  if (report.story.length > 0) {
    parts.push(report.story.join(" "));
    for (const s of report.story)
      sources.push({
        text: s,
        source: /depth \d+/.test(s) ? "engine" : "verified-fact",
      });
  }
  if (report.moments.length > 0) {
    const lines = report.moments.map((mo) => {
      const { fact, why } = momentLine(mo);
      sources.push(
        { text: fact, source: "engine" },
        { text: `Why it matters (opinion): ${why}`, source: "judgment" }
      );
      return `- **${mo.label}** — ${fact} _Why it matters (opinion): ${why}_`;
    });
    parts.push(["**The moments that decided it**", ...lines].join("\n"));
  }
  return { text: `${parts.join("\n\n")}\n\n`, sources };
}

/** Credit, the habit, and how it was checked: what goes after the cards. */
export function renderReportTail(report: GameReport): {
  text: string;
  sources: Array<{ text: string; source: ReportSource }>;
} {
  const sources: Array<{ text: string; source: ReportSource }> = [];
  const parts: string[] = [];
  const kept = (e: EvalNote) =>
    e.mate !== null ? `a forced mate (${e.display})` : e.display;
  const credits = report.credit.map((c, k) => {
    const why =
      c.reason === "only_good_move"
        ? `the only good move: it kept ${kept(c.played)} where ${c.next.label} gave ${c.next.eval.display} (depth ${c.played.depth})`
        : `it kept a better game than ${c.next.label} (${c.played.display} against ${c.next.eval.display}, depth ${c.played.depth})`;
    const text = `**${c.label}${c.brilliant ? "!!" : "!"}** was ${k > 0 && c.reason === report.credit[0].reason ? "also " : ""}${why}.`;
    sources.push({ text, source: "engine" });
    return text;
  });
  if (credits.length > 0) parts.push(`**Credit:** ${credits.join(" ")}`);
  if (report.habit) {
    parts.push(
      `**One habit to work on:** ${report.habit.text} ${report.habit.because}`
    );
    sources.push(
      { text: report.habit.text, source: "judgment" },
      { text: report.habit.because, source: "engine" }
    );
  }
  const m = report.method;
  const footnote = m.recheck
    ? `_Every board fact here was replayed move by move. Evaluations: ${engineLabel(m.engine)} at depth ${m.depth}; the decisive moments re-checked by ${engineLabel(m.recheck.engine)} at depth ${m.recheck.depth}._`
    : `_Every board fact here was replayed move by move. Evaluations: ${engineLabel(m.engine)} at depth ${m.depth}._`;
  parts.push(footnote);
  sources.push({ text: footnote, source: "verified-fact" });
  return { text: `\n\n${parts.join("\n\n")}`, sources };
}

/**
 * The report as structured facts for the model: it writes the cards, the app
 * shows the report, and the two must agree. The model is told to use no
 * board facts beyond the contract and these.
 */
export function gameReportPromptBlock(report: GameReport): string {
  const facts = {
    verdict: report.verdict,
    moments: report.moments.map((m) => ({
      move: m.label,
      kind: m.kind,
      before: m.before,
      after: m.after,
      engineMove: m.best?.label ?? null,
      mateIn: m.mateIn,
      boardFacts: m.did,
    })),
    credit: report.credit.map((c) => ({
      move: c.label,
      reason: c.reason,
      eval: c.played,
      nextBest: c.next,
    })),
    habit: report.habit
      ? { text: report.habit.text, evidence: report.habit.evidence }
      : null,
  };
  return [
    "REPORT FACTS (verified by the app, shown to the player above and below your cards):",
    JSON.stringify(facts),
    "The app itself shows the verdict, the story of the game, the decisive moments, the credit and the habit above. Do NOT write your own intro line and do not repeat them; write only the cards, consistent with these facts. Use no board facts beyond the contract and REPORT FACTS.",
  ].join("\n");
}

/** The browser sends the engine's id ("stockfish_17_lite"); readers get its name. */
function engineLabel(id: string): string {
  return ENGINE_LABELS[id as EngineName]?.small ?? id;
}
