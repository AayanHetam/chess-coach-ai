// A chapter, as the list of questions it is.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A PROBE IS A NODE AND NOT A LINE
//
// `linesOf` flattens a chapter into variations, which is the right shape to
// READ. It is the wrong shape to be ASKED, because the same decision appears in
// every line that passes through it: the Caro's first chapter has 20 decisions
// at the beginner band and far more lines than that, and asking per line would
// ask the same question a dozen times over.
//
// A probe is one OUR-TURN node. Its identity is the `positionKey`, which is
// what makes the transposition guarantee free: two paths into one position are
// one thing to learn, one thing to record, and one card if it is ever missed.
// ─────────────────────────────────────────────────────────────────────────────

import { Chess } from 'chess.js';
import type { Course, CourseNode, MoveSource } from '@/types/course';
import type { CourseView } from '@/lib/courses/view';
import type { TrainerLine } from '@/lib/learn/trainerSession';

/**
 * Questions asked about one chapter, at most.
 *
 * Measured on the shipped courses: the cap fires on 12 of 169 chapters at the
 * improving band and 56 of 194 at club, where the largest chapter is 286
 * decisions. So it is not a theoretical limit and the number it hides has to be
 * said out loud — `total` is counted past the cap for exactly that reason.
 */
/**
 * Fallback cap, for callers that do not know the reader's band.
 *
 * The real number is `band.probeCap`. This stays 60 because that is what every
 * band used to get, so a caller passing nothing is unchanged rather than
 * quietly promoted to a club player's workload.
 */
export const MAX_PROBES_PER_CHAPTER = 60;

export interface CourseProbe {
  /** `positionKey` of the decision. The identity for progress and for cards. */
  key: string;
  /** SAN from the start of the game to this position, our move NOT included. */
  path: string[];
  /** Our move here. The answer. */
  san: string;
  /** Full FEN of the position being asked about. */
  fen: string;
  /** Ply from the start of the game. */
  ply: number;
  chapter: number;
  /** Share of play that reaches here. The weight a review schedule should use. */
  weight: number;
  games: number;
  src: MoveSource;
  /** Centipawns our move gives up against the engine's own choice, if any. */
  loss?: number;
  /** White-relative evaluation of the position being asked about. */
  ev?: { cp: number; d: number };
  /**
   * The position AFTER our move, when the view still holds it.
   *
   * Resolved here rather than on the screen because it carries `them` and `rc`
   * — the replies table, which is the block that actually fills the teach card.
   * 78.6% of decisions have one, against 12.9% carrying a quotable excerpt.
   */
  next: CourseNode | null;
}

export interface ChapterProbes {
  probes: CourseProbe[];
  /** Decisions in the chapter, counted PAST the cap. */
  total: number;
  /** True when `probes` is shorter than the chapter. Callers MUST say so. */
  capped: boolean;
}

/** Both a whole course and a band's view of one can be walked. */
type Walkable = Pick<Course, 'meta' | 'chapters' | 'nodes'> | CourseView;

const keyOf = (fen: string): string => fen.split(' ').slice(0, 4).join(' ');

/**
 * Every decision in one chapter, most likely first.
 *
 * TWO WALKS, because a chapter is not the whole of what it needs. Nodes on the
 * shared trunk (`ch === -1`) sit ABOVE every chapter root, so a walk that
 * starts at the root can never reach them — and they are still our moves. There
 * is exactly one in the shipped corpus, `Nxd4` in the Scotch at ply 6, which is
 * precisely the kind of single case that is dropped silently and noticed by
 * nobody. So the prefix is walked too.
 */
export function probesOf(
  view: Walkable,
  chapterIndex: number,
  side: 'white' | 'black',
  /**
   * Most probes this chapter may ask. Comes from the reader's band, because
   * "how much work one chapter is" is exactly what differs between a 700 and a
   * 2100. Defaults to the old flat value so a caller with no band in hand
   * behaves as it always did.
   */
  cap: number = MAX_PROBES_PER_CHAPTER
): ChapterProbes {
  const chapter = view.chapters.find(c => c.i === chapterIndex);
  if (!chapter) return { probes: [], total: 0, capped: false };

  const nodes = view.nodes as Record<string, CourseNode>;
  const rootPly = view.meta.root.length;
  const found: CourseProbe[] = [];
  const seen = new Set<string>();

  const emit = (key: string, node: CourseNode, board: Chess, path: string[]) => {
    if (!node.us || seen.has(key)) return;
    seen.add(key);
    found.push({
      key,
      path: [...path],
      san: node.us,
      fen: board.fen(),
      ply: node.p,
      chapter: chapterIndex,
      weight: node.w,
      games: node.g,
      src: node.src ?? 'corpus',
      ...(node.loss === undefined ? {} : { loss: node.loss }),
      ...(node.ev === undefined ? {} : { ev: node.ev }),
      next: (node.next && nodes[node.next]) || null,
    });
  };

  // ── Walk 1: the prefix, for trunk decisions the chapter root sits below.
  const prefix = new Chess();
  const walked: string[] = [];
  for (const san of chapter.line) {
    const here = nodes[keyOf(prefix.fen())];
    // Moves inside the course root are the premise, not a question.
    if (here && here.ch === -1 && here.p >= rootPly) emit(keyOf(prefix.fen()), here, prefix, walked);
    try {
      if (!prefix.move(san)) break;
    } catch {
      break;
    }
    walked.push(san);
  }

  // ── Walk 2: the chapter itself.
  //
  // Cycle-safe on the path, not on `seen`: a transposition makes the graph
  // cyclic and an unguarded walk would not return, while deduping on `seen`
  // alone would stop the walk from passing THROUGH a shared position into the
  // distinct subtree below it.
  const onPath = new Set<string>();
  let total = 0;

  const walk = (key: string, board: Chess, path: string[]) => {
    const node = nodes[key];
    if (!node || onPath.has(key)) return;
    // Edges cross chapters. Following them would put a fifth of chapter 1's
    // decisions inside chapter 0's session at the club band — measured: 1,438
    // of 7,190 probes, across 80 chapters — and the contract screen's "38
    // decisions in this chapter" would be describing something else. A chapter
    // asks its own nodes and the trunk they all share.
    //
    // Nothing is lost to the player: progress is keyed by `positionKey`, so a
    // position answered in one chapter is already known when another chapter
    // transposes into it.
    if (node.ch !== chapterIndex && node.ch !== -1) return;
    onPath.add(key);

    if (node.us) {
      total += seen.has(key) ? 0 : 1;
      emit(key, node, board, path);
      if (node.next && nodes[node.next]) {
        let moved = false;
        try {
          moved = Boolean(board.move(node.us));
        } catch {
          moved = false;
        }
        if (moved) {
          path.push(node.us);
          walk(node.next, board, path);
          path.pop();
          board.undo();
        }
      }
    } else if (node.them?.length) {
      for (const reply of node.them) {
        if (!nodes[reply.to]) continue;
        let moved = false;
        try {
          moved = Boolean(board.move(reply.san));
        } catch {
          moved = false;
        }
        if (!moved) continue;
        path.push(reply.san);
        walk(reply.to, board, path);
        path.pop();
        board.undo();
      }
    }

    onPath.delete(key);
  };

  const start = new Chess();
  const startPath: string[] = [];
  for (const san of chapter.line) {
    try {
      if (!start.move(san)) break;
    } catch {
      break;
    }
    startPath.push(san);
  }
  walk(chapter.at, start, startPath);

  // Decisions found on the prefix are decisions too. The chapter walk cannot
  // have counted them: it starts below them.
  total += found.filter(p => p.ply < chapter.line.length).length;

  // `side` is not used to CHOOSE the nodes — the builder emits `us` only on our
  // turns — but a decision in a position that is not ours to move in would be a
  // corrupt course, and the trainer must drop it rather than ask it. Filtered
  // BEFORE the cap, so a dropped node cannot cost a real question its place.
  const ours = found.filter(p => (p.fen.split(' ')[1] === 'w' ? 'white' : 'black') === side);

  // Most likely first. `w` is a product of shares, so this also puts ancestors
  // before descendants, which is the order a round wants.
  const ordered = ours.sort((a, b) => b.weight - a.weight || a.ply - b.ply);
  const probes = ordered.slice(0, Math.max(1, cap));

  return {
    probes,
    total: Math.max(total, ours.length),
    capped: ours.length > probes.length,
  };
}

/**
 * The probe, in the shape the state machine consumes.
 *
 * NO `target`, deliberately. `expectedAt` falls back to the last move of
 * `moves` when there is none, which is exactly `probe.san`, so nothing has to
 * invent a `TrainerTarget.source` — the course's four `MoveSource` values do
 * not map onto the trainer's two without over-claiming, and `corpus-confirmed`
 * is neither "the engine picked this" nor "this is what masters play".
 */
export function toTrainerLine(probe: CourseProbe, side: 'white' | 'black'): TrainerLine {
  return { moves: [...probe.path, probe.san], color: side };
}

/**
 * Where our move came from, said only when it is worth saying.
 *
 * Null for `corpus-confirmed`, which is 97.6% of decisions. Printing "the
 * engine agrees and people play it" on ninety-seven cards in a hundred is not
 * information, it is wallpaper, and `lineNotes` in this repo already wrote the
 * rule down: a part is shown only when it deviates from the ordinary case.
 *
 * The strings are the ones `lineNotes` already ships, so the two surfaces
 * cannot drift into describing the same fact two ways.
 */
export function sourceWords(src: MoveSource): string | null {
  switch (src) {
    case 'corpus-confirmed':
      return null;
    case 'engine':
      return "the engine's choice over the popular move";
    case 'setup':
      return "this system's setup, engine-checked";
    case 'corpus':
      return 'most played, not engine-checked';
  }
}
