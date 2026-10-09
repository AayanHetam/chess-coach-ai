/**
 * What the replay gate knows about a served answer, from the game alone.
 * It reads which numbered moves the answer names are legal where it puts
 * them and whether the engine computed them, the eval figures in its prose,
 * and the proof tokens it carries and whether the page could draw them.
 * Pure, no I/O.
 *
 * A board is one the game, its stored engine lines or a verified what-if
 * reaches, kept per ply (the half-moves played before it). An edge is a
 * move one of those walks played from a board, so a move the engine or the
 * game made there is "computed" and any other legal move is not.
 */
import { Chess } from "chess.js";
import type { PositionEval } from "@/types/eval";
import type { VerifiedWhatIf } from "@/lib/coach/clientEvals";
import {
  EVAL_RE,
  FOLLOWUP_REFEREE_FALLBACK,
  SAN_TOKEN_RE,
  numberedPly,
} from "@/lib/contract/followUpReferee";
import { splitProseSentences } from "@/lib/contract/sentences";
import { LINE_TOKEN_INLINE_RE, LINE_TOKEN_LINE_RE } from "@/lib/coach/moment";
import { isWalkthroughQuestion } from "@/lib/coach/questionShape";
import {
  engineLineAt,
  parseLineToken,
  playedLineAt,
} from "@/components/preview-analysis/coachLines";

export interface PlyTable {
  /** The boards (FEN) each ply holds, the side to move being that ply's. */
  boards: ReadonlyMap<number, ReadonlySet<string>>;
  /** The moves computed from a board (SAN, check and comment marks off, case kept). */
  edges: ReadonlyMap<string, ReadonlySet<string>>;
  lastPly: number;
  /** False when the game stopped at a move chess.js would not play. */
  gameReplayed: boolean;
}

/** SAN without its check or comment marks, case kept: Bxc4 is not bxc4. */
const exactSan = (s: string) => s.replace(/[+#!?]/g, "");

function playSan(
  fen: string,
  san: string
): { fen: string; san: string } | null {
  try {
    const g = new Chess(fen);
    const m = g.move(san);
    return m ? { fen: g.fen(), san: m.san } : null;
  } catch {
    return null;
  }
}

function playUci(g: Chess, uci: string): string | null {
  try {
    const m = g.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length >= 5 ? uci[4] : undefined,
    });
    return m ? m.san : null;
  } catch {
    return null;
  }
}

export function plyTable(
  moves: readonly string[],
  positions: readonly PositionEval[] | undefined,
  whatIf?: VerifiedWhatIf | null
): PlyTable {
  const boards = new Map<number, Set<string>>();
  const edges = new Map<string, Set<string>>();
  const addBoard = (ply: number, fen: string) => {
    const at = boards.get(ply) ?? new Set<string>();
    at.add(fen);
    boards.set(ply, at);
  };
  const addEdge = (fen: string, san: string) => {
    const from = edges.get(fen) ?? new Set<string>();
    from.add(exactSan(san));
    edges.set(fen, from);
  };

  // The game, to the first move that will not play.
  const g = new Chess();
  const game: string[] = [g.fen()];
  addBoard(0, g.fen());
  let gameReplayed = true;
  for (let i = 0; i < moves.length; i++) {
    const before = g.fen();
    let san: string | null = null;
    try {
      san = g.move(moves[i])?.san ?? null;
    } catch {
      san = null;
    }
    if (!san) {
      gameReplayed = false;
      break;
    }
    addEdge(before, san);
    addBoard(i + 1, g.fen());
    game.push(g.fen());
  }

  // Every stored line with a real search, from its game board, to its
  // first illegal step. A depth-0 sentinel is no line.
  for (let p = 0; p < game.length; p++) {
    for (const line of positions?.[p]?.lines ?? []) {
      if (!(line.depth >= 1) || !line.pv || line.pv.length === 0) continue;
      const w = new Chess(game[p]);
      for (let k = 0; k < line.pv.length; k++) {
        const before = w.fen();
        const san = playUci(w, line.pv[k]);
        if (!san) break;
        addEdge(before, san);
        addBoard(p + k + 1, w.fen());
      }
    }
  }

  // A verified what-if's lines, from the position it was asked at.
  for (const m of whatIf?.moves ?? []) {
    let fen = whatIf!.fenBefore;
    addBoard(whatIf!.index, fen);
    for (let k = 0; k < m.lineSan.length; k++) {
      const next = playSan(fen, m.lineSan[k]);
      if (!next) break;
      addEdge(fen, next.san);
      fen = next.fen;
      addBoard(whatIf!.index + k + 1, fen);
    }
  }

  return {
    boards,
    edges,
    lastPly: Math.max(...Array.from(boards.keys())),
    gameReplayed,
  };
}

export type MoveClass =
  | "computed"
  | "alternative"
  | "offLine"
  | "illegal"
  | "past"
  | "unmeasured";

export interface MoveReading {
  mention: string;
  sentence: string;
  cls: MoveClass;
  detail?: string;
}

/** The prose a reader sees: token lines out, markdown emphasis off. */
function proseOf(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((l) => !LINE_TOKEN_LINE_RE.test(l))
    .join("\n")
    .replace(/[*_`]/g, "");
}

interface Running {
  fen: string;
  computed: boolean;
}

const RANK: Record<MoveClass, number> = {
  computed: 3,
  alternative: 2,
  offLine: 2,
  illegal: 0,
  past: 0,
  unmeasured: 0,
};

/**
 * Every move the text names in notation that the gate can judge, in reading
 * order. A numbered move is judged on the boards at its own ply, and on the
 * sentence's own line when that line has reached the same ply, as the
 * referee walks a sentence ("8. Qxc1 Rb8 9. Qf4 Nf6 10. Bc4 Nxe4" leaves
 * the stored lines at Nf6 and stays legal). An unnumbered one right after
 * another (whitespace alone between them) continues that line. Any other
 * unnumbered move is left to the referee, which owns bare mentions, and
 * ends the line.
 */
export function readMoves(text: string, t: PlyTable): MoveReading[] {
  const out: MoveReading[] = [];
  for (const sentence of splitProseSentences(proseOf(text))) {
    let running: Running[] | null = null;
    /** The ply the running line's next move sits at, when it is known. */
    let runningPly: number | null = null;
    let lastEnd = -1;
    for (const m of Array.from(sentence.matchAll(SAN_TOKEN_RE))) {
      const num = m[1] ?? m[4];
      const dots = m[2] ?? m[5];
      const san = m[3] ?? m[6] ?? m[7];
      if (!san) continue;
      const start = m.index ?? 0;
      // A cued push ("play e5") starts at its move, not at the cue.
      const mentionStart =
        m[7] !== undefined ? start + m[0].length - m[7].length : start;
      const joined =
        lastEnd >= 0 && /^\s+$/.test(sentence.slice(lastEnd, mentionStart));
      lastEnd = start + m[0].length;

      let from: Running[];
      let mention: string;
      if (num !== undefined) {
        mention = `${num}${dots} ${san}`;
        const ply = numberedPly(num, dots);
        const at = t.boards.get(ply);
        const own = running && runningPly === ply ? running : [];
        if (!at && own.length === 0) {
          out.push({
            mention,
            sentence,
            cls: t.gameReplayed ? "past" : "unmeasured",
          });
          running = null;
          runningPly = null;
          continue;
        }
        const byFen = new Map<string, boolean>();
        for (const fen of Array.from(at ?? [])) byFen.set(fen, true);
        for (const b of own)
          byFen.set(b.fen, (byFen.get(b.fen) ?? false) || b.computed);
        from = Array.from(byFen, ([fen, computed]) => ({ fen, computed }));
      } else if (joined && running) {
        mention = san;
        from = running;
      } else {
        running = null;
        runningPly = null;
        continue;
      }

      const next: Running[] = [];
      let cls: MoveClass = "illegal";
      for (const b of from) {
        const r = playSan(b.fen, san);
        if (!r) continue;
        const edge =
          b.computed && (t.edges.get(b.fen)?.has(exactSan(r.san)) ?? false);
        next.push({ fen: r.fen, computed: edge });
        const c: MoveClass = edge
          ? "computed"
          : num !== undefined
            ? "alternative"
            : "offLine";
        if (RANK[c] > RANK[cls]) cls = c;
      }
      if (next.length === 0) {
        let detail: string | undefined;
        if (num !== undefined) {
          const ply = numberedPly(num, dots);
          const other = ply % 2 === 0 ? ply + 1 : ply - 1;
          const legalThere = Array.from(t.boards.get(other) ?? []).some(
            (fen) => playSan(fen, san) !== null
          );
          if (legalThere) detail = "legal for the other side at this number";
        }
        out.push({
          mention,
          sentence,
          cls: "illegal",
          ...(detail ? { detail } : {}),
        });
        running = null;
        runningPly = null;
        continue;
      }
      out.push({ mention, sentence, cls });
      runningPly =
        num !== undefined
          ? numberedPly(num, dots) + 1
          : runningPly === null
            ? null
            : runningPly + 1;
      running = next;
    }
  }
  return out;
}

/** The eval figures written in the prose ("+2.84", "M+3"), token lines out. */
export function evalFigures(text: string): string[] {
  const prose = text
    .split(/\r?\n/)
    .filter((l) => !LINE_TOKEN_LINE_RE.test(l))
    .join("\n");
  return Array.from(prose.matchAll(EVAL_RE)).map((m) => m[0]);
}

export interface ProofTokens {
  onLine: {
    token: string;
    kind: "engine" | "played" | "maia";
    drawable: boolean;
  }[];
  /** Tokens inside a sentence, which the page strips. */
  inline: number;
}

/**
 * The line tokens the answer carries. One on a line of its own is drawn
 * when the client's own resolver finds its line (coachLines.ts), a Maia
 * token never.
 */
export function proofTokens(
  text: string,
  moves: readonly string[],
  positions: readonly PositionEval[] | undefined
): ProofTokens {
  const onLine: ProofTokens["onLine"] = [];
  let inline = 0;
  for (const raw of text.split(/\r?\n/)) {
    const tok = parseLineToken(raw);
    if (tok) {
      const drawable =
        tok.kind === "maia"
          ? false
          : tok.kind === "engine"
            ? engineLineAt(positions, moves, tok.moveNumber, tok.color) !== null
            : playedLineAt(moves, tok.moveNumber, tok.color) !== null;
      onLine.push({ token: raw.trim(), kind: tok.kind, drawable });
      continue;
    }
    inline += (raw.match(LINE_TOKEN_INLINE_RE) ?? []).length;
  }
  return { onLine, inline };
}

/** The probes' own percentile: sorted[min(n-1, floor(p*n))], null for none. */
export function pctl(xs: readonly number[], p: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

/**
 * An answer at rest: served whole by the model (or its refereed draft), not
 * an order the page carried out, a template or the referee's line, not an
 * acknowledgement and not a walkthrough asked for.
 */
export function atRest(t: {
  status: number;
  served: string;
  servedBy: string;
  question: string;
  grammar?: string;
}): boolean {
  return (
    t.status === 200 &&
    t.servedBy !== "page" &&
    t.servedBy !== "template" &&
    t.servedBy !== "referee_line" &&
    t.served !== FOLLOWUP_REFEREE_FALLBACK &&
    t.grammar !== "acknowledgement" &&
    !isWalkthroughQuestion(t.question)
  );
}
