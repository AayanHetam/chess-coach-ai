/**
 * A review's key moments, drawn from their fields (pathway 4.2).
 *
 * Under COACH_TURN1_MOMENTS the review's stream sends each card the ladder
 * passed as a moment of its own, just before the card's text
 * (src/lib/contract/turnMoments.ts, `{ type: "moment", moment }`). With
 * this page's flag on, the deep path reads it, the message keeps it, and a
 * key moment whose card text is the one the moment was lifted from is
 * drawn from the moment: the idea and what happens as two plain lines,
 * `more` behind the same link, the lesson in the same note.
 *
 * Only the card a moment names and its prose are read. The board, the
 * move, the evals, the line and its actions stay on the wire: the header,
 * the engine's line and the game's line are drawn from the page's own data
 * as on the prose card, so nothing computed on a moment reaches the board.
 *
 * A moment is drawn only beside the exact text it was lifted from: its key
 * is the hash of that card's text (`cardKey`), and any other card, a
 * corrected one included, is the prose card as before.
 *
 * Pure and client-safe.
 */
import type { InsightData } from "@/components/AICoachInsights.parser";
import type { MomentProse } from "@/lib/coach/moment";
import { cardKey, type TurnCardRef } from "@/lib/coach/turnMoment";
import { parseInsightHeader } from "@/lib/contract/insightGrammar";
import {
  LADDER_NOTE_KIND_PRIORITY,
  renderLadderNote,
} from "@/lib/contract/ladderNote";
import { readMomentProse } from "./followUpMoment";

/**
 * Off until its flip: its own one-line PR changes this default, after the
 * server's COACH_TURN1_MOMENTS, and the env overrides it either way, which
 * is how the Playwright legs run it on.
 */
export const TURN1_MOMENTS_DEFAULT = false;

/**
 * Read once at module level by the analysis page. `NEXT_PUBLIC_` values are
 * inlined at build time, and only for this literal spelling of the name.
 */
export function isTurnMomentsEnabledPublic(): boolean {
  const v = (process.env.NEXT_PUBLIC_COACH_TURN1_MOMENTS ?? "")
    .trim()
    .toLowerCase();
  if (v === "1" || v === "on" || v === "true") return true;
  if (v === "0" || v === "off" || v === "false") return false;
  return TURN1_MOMENTS_DEFAULT;
}

/** What the page keeps of a turn-1 moment: the card it names and its prose. */
export interface CardMoment {
  card: TurnCardRef;
  prose: MomentProse;
}

const KEY_RE = /^[0-9a-f]{8}$/;

function readCardRef(raw: unknown): TurnCardRef | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.factIdPrefix !== "string" || !o.factIdPrefix.trim()) return null;
  if (
    typeof o.moveNumber !== "number" ||
    !Number.isInteger(o.moveNumber) ||
    o.moveNumber < 1 ||
    o.moveNumber > 999
  )
    return null;
  if (o.color !== "w" && o.color !== "b") return null;
  if (typeof o.playedSan !== "string" || !o.playedSan.trim()) return null;
  if (typeof o.key !== "string" || !KEY_RE.test(o.key)) return null;
  return {
    factIdPrefix: o.factIdPrefix,
    moveNumber: o.moveNumber,
    color: o.color,
    playedSan: o.playedSan,
    key: o.key,
  };
}

const hasText = (s: string | null) => !!s && s.trim().length > 0;

/**
 * The card and the prose of a turn-1 moment from the wire, or null: a card
 * reference or a prose field of the wrong shape, a question (a review's
 * card asks none), or neither an idea nor what happens. Nothing else on
 * the moment is read.
 */
export function readTurnMoment(raw: unknown): CardMoment | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const card = readCardRef((raw as Record<string, unknown>).card);
  if (!card) return null;
  const prose = readMomentProse(raw);
  if (!prose || prose.question !== null) return null;
  if (!hasText(prose.idea) && !hasText(prose.happens)) return null;
  return { card, prose };
}

/** A closed card in a message, by its header, with the key of its exact text. */
export interface CardBlockKey {
  moveNumber: number;
  color: "w" | "b";
  playedMove: string;
  /** cardKey of "[INSIGHT:" through "[/INSIGHT]". */
  key: string;
}

const OPEN_RE = /\[INSIGHT:([^\]]+)\]/i;
const CLOSE_TOKEN = "[/INSIGHT]";

/**
 * Every closed card in `content`, in order, scanned the way parseInsights
 * scans (a header it would drop is skipped, an unclosed block ends the
 * scan), each keyed on its exact text. Run over the message's content as
 * it arrived, before the page strips practice tags.
 */
export function insightBlockKeys(content: string): CardBlockKey[] {
  const out: CardBlockKey[] = [];
  let cursor = 0;
  while (cursor < content.length) {
    const m = OPEN_RE.exec(content.slice(cursor));
    if (!m) break;
    const open = cursor + m.index;
    const close = content.indexOf(CLOSE_TOKEN, open + m[0].length);
    if (close < 0) break;
    const end = close + CLOSE_TOKEN.length;
    const header = parseInsightHeader(m[1]);
    if (header)
      out.push({
        moveNumber: header.moveNumber,
        color: header.color,
        playedMove: header.playedMove,
        key: cardKey(content.slice(open, end)),
      });
    cursor = end;
  }
  return out;
}

type CardHeader = Pick<InsightData, "moveNumber" | "color" | "playedMove">;

const sameHeader = (a: CardHeader, b: CardHeader) =>
  a.moveNumber === b.moveNumber &&
  a.color === b.color &&
  a.playedMove === b.playedMove;

/**
 * The prose of the moment lifted from this card, or null. The moment must
 * name the card's move, and its key must be the key of the card's own
 * text: the `occurrence`-th block with the card's header (0 unless the
 * review carries two cards for one move).
 */
export function momentForInsight(
  moments: readonly CardMoment[] | undefined,
  blocks: readonly CardBlockKey[],
  insight: CardHeader,
  occurrence = 0
): MomentProse | null {
  if (!moments || moments.length === 0) return null;
  const block = blocks.filter((b) => sameHeader(b, insight))[occurrence];
  if (!block) return null;
  const found = moments.find(
    (m) =>
      m.card.key === block.key &&
      sameHeader(
        {
          moveNumber: m.card.moveNumber,
          color: m.card.color,
          playedMove: m.card.playedSan,
        },
        insight
      )
  );
  return found ? found.prose : null;
}

/** The prose for each card parseInsights found in `content`, in its order. */
export function insightMoments(
  moments: readonly CardMoment[] | undefined,
  content: string,
  insights: readonly CardHeader[]
): (MomentProse | null)[] {
  if (!moments || moments.length === 0) return insights.map(() => null);
  const blocks = insightBlockKeys(content);
  const seen: CardHeader[] = [];
  return insights.map((insight) => {
    const occurrence = seen.filter((s) => sameHeader(s, insight)).length;
    seen.push(insight);
    return momentForInsight(moments, blocks, insight, occurrence);
  });
}

/**
 * Every line the ladder can write about what it left out (ladderNote.ts,
 * COACH_LADDER_NOTE), from its own renderer: one kind once or as "some",
 * two kinds named together, and the mixed phrase.
 */
const LADDER_NOTE_LINES: ReadonlySet<string> = (() => {
  const lines = new Set<string>();
  const add = (kinds: Parameters<typeof renderLadderNote>[0]) => {
    const line = renderLadderNote(kinds);
    if (line) lines.add(line);
  };
  for (const a of LADDER_NOTE_KIND_PRIORITY) {
    add([a]);
    add([a, a]);
    for (const b of LADDER_NOTE_KIND_PRIORITY) if (b !== a) add([a, b]);
  }
  add(LADDER_NOTE_KIND_PRIORITY.slice(0, 3));
  return lines;
})();

/**
 * The ladder's line about what it left out, when a card's lede carries one.
 * The moment is cut as if the line were not there, and a card drawn from
 * its moment does not draw the lede, so the card draws this line itself.
 */
export function ladderNoteIn(
  headline: string | null | undefined
): string | null {
  for (const line of (headline ?? "").split(/\r?\n/)) {
    const t = line.trim();
    if (LADDER_NOTE_LINES.has(t)) return t;
  }
  return null;
}
