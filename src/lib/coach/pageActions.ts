/**
 * What the page can do on its own when the player types an order.
 *
 * "Flip the board", "go to move 20", "play the line again", "back": the
 * ideal coach (MASTERMIND_CONTEXT/IDEAL_PRODUCT.md, "Action" and
 * "Preference") does these at once and says so in one line, with no model
 * call. Before this, every one of them was a question for the coach: a
 * full review on a session's first turn, a Haiku call after it, and an
 * answer that could not touch the board.
 *
 * This module only reads the words. `parsePageTurn` takes the whole message
 * or nothing: a lead-in ("can you", "please", "masti,") and a trailing
 * "please" or "thanks" are allowed, anything else left over is a question
 * and goes to the coach as before. So "go to move 8 and tell me why it was
 * bad", "next move?", "would you play it?" and "why was move 20 bad?" are
 * never orders. A word that is an order as often as it is a question
 * ("next", "start", "start over", "again", "move 20", "last move") is not
 * one either. The page decides what an order does in the position it is
 * in (preview-analysis/pageActionPlan.ts), because only the page knows the
 * game, the drill, the line on the board and the side.
 *
 * The shadow intent router (questionIntent.ts) keeps its own, looser
 * reading until the router goes live (pathway PR 3.4), so a flag-off page
 * and the route's logs are unchanged by this module.
 *
 * Pure and client-safe: no chess.js, no zod, no prompt module
 * (lib/coach/__tests__/whatIfClientChain.test.ts keeps it that way).
 */

/** Something the page does to the board. */
export type PageAction =
  | { kind: "flip_board"; to?: "white" | "black" }
  /** A move number as the player wrote it; the page finds the ply in its own game. */
  | { kind: "go_to_move"; moveNumber: number; color?: "w" | "b" }
  | { kind: "go_to_start" }
  | { kind: "go_to_end" }
  | { kind: "step"; delta: 1 | -1 }
  /** The strip's own Back where it shows one, else one move back. */
  | { kind: "back" }
  /** Leave whatever is on top of the game: a drill, a line being explored. */
  | { kind: "back_to_game" }
  | { kind: "replay_line" };

/**
 * A standing word about the player's side, the one preference the page
 * keeps (decision 15 of the pathway took "keep it short" out: depth is
 * never a setting). `bare` is a colour on its own ("black"), an answer only
 * while the page is asking which side the player was.
 */
export type PagePreference =
  | { kind: "side"; color: "w" | "b"; bare: boolean }
  | { kind: "my_side" };

export type PageTurn =
  | { type: "action"; action: PageAction }
  | { type: "preference"; preference: PagePreference };

export type PageTurnKind = PageAction["kind"] | PagePreference["kind"];

/** Every kind a page that runs this module can carry out. */
export const PAGE_TURN_KINDS: readonly PageTurnKind[] = [
  "flip_board",
  "go_to_move",
  "go_to_start",
  "go_to_end",
  "step",
  "back",
  "back_to_game",
  "replay_line",
  "side",
  "my_side",
];

export function pageTurnKind(turn: PageTurn): PageTurnKind {
  return turn.type === "action" ? turn.action.kind : turn.preference.kind;
}

// ─── The switch ────────────────────────────────────────────────────────────

/**
 * Off until its flip (its own one-line PR changes this default). The env
 * overrides it either way, which is how the Playwright legs run it on.
 */
export const PAGE_ACTIONS_DEFAULT = false;

/**
 * Read once at module level by the analysis page. `NEXT_PUBLIC_` values are
 * inlined at build time, and only for this literal spelling of the name.
 * A page with it off never sends `pageActions`, so the chat route never
 * answers an order for it either.
 */
export function isPageActionsEnabledPublic(): boolean {
  const v = (process.env.NEXT_PUBLIC_COACH_PAGE_ACTIONS ?? "")
    .trim()
    .toLowerCase();
  if (v === "1" || v === "on" || v === "true") return true;
  if (v === "0" || v === "off" || v === "false") return false;
  return PAGE_ACTIONS_DEFAULT;
}

// ─── Reading the words ─────────────────────────────────────────────────────

/**
 * Before the order: a greeting, a name, a "please", a "can you". "Coach" is
 * a name only with a comma after it: "coach me as Black" is an order.
 */
const LEAD_IN_RE =
  /^(?:(?:hey|hi|hello|ok|okay|masti|please|pls|can you|could you|just|now|let's|lets|so|and)(?:[\s,!.]+|$)|coach[,!.]+\s*)/;
/** Asking politely, the one opening that may end in a question mark. */
const REQUEST_RE =
  /^(?:(?:hey|hi|hello|ok|okay|masti|coach)[\s,!.]+)*(?:can|could) you\b/;
/** After the order. */
const TRAILER_RE = /[\s,]+(?:please|pls|thanks|thank you|thx|ty|for me|now)$/;

const COLOR = "(white|black)";
const GO = "(?:go|jump|skip|take me|bring me)";

const FLIP_RE = new RegExp(
  `^(?:(?:flip|rotate|turn)(?: (?:the|my))? board(?: (?:around|over|round))?(?: (?:to|for) ${COLOR})?|flip(?: it)?(?: (?:around|over))?|flip (?:to|for) ${COLOR})$`
);
const GO_TO_MOVE_RE = new RegExp(
  `^(?:${GO}(?: back| forward| ahead)? to|back to|show(?: me)?|goto)(?: (?:the )?${COLOR}'s)? move (?:number |no\\.? )?(\\d{1,4})(?: (?:for|as) ${COLOR})?$`
);
const GO_TO_START_RE = new RegExp(
  `^(?:${GO}(?: back)? to (?:the )?(?:start|beginning)(?: of the game)?|back to (?:the )?(?:start|beginning)|reset(?: (?:the )?board)?|reset to (?:the )?(?:start|beginning))$`
);
const GO_TO_END_RE = new RegExp(
  `^${GO}(?: forward)? to (?:the )?(?:end|final position|last position|last move)(?: of the game)?$`
);
const STEP_FORWARD_RE =
  /^(?:next move|(?:go |step |move )?forward(?: (?:one|a) move)?|one move forward)$/;
const STEP_BACK_RE =
  /^(?:previous move|prev move|(?:go |step |move )?back (?:one|a) move|step back|one move back)$/;
const BACK_RE =
  /^(?:back|go back|take me back|bring me back|(?:go )?back to where i was)$/;
const BACK_TO_GAME_RE =
  /^(?:(?:go )?back to the game|return to the game|(?:exit|leave|close|stop)(?: the| this)? (?:line|exploration|preview|drill|puzzle)|stop exploring)$/;
const REPLAY_RE =
  /^(?:(?:re)?play (?:the |that |this )?line(?: again)?|play (?:it|that) again|replay(?: it| that)?|show(?: me)? the line again)$/;
const SIDE_RE = new RegExp(
  `^(?:(?:always |from now on,? )?coach me as|i (?:was|am|played|play|was playing|am playing)(?: as)?|i'm(?: playing)?(?: as)?|my side is) (?:the )?${COLOR}(?: pieces)?(?: from now on| always)?$`
);
const BARE_SIDE_RE = new RegExp(`^${COLOR}$`);
const MY_SIDE_RE =
  /^(?:(?:go |switch )?back to my (?:side|colou?r|perspective)|my side again)$/;

const side = (word: string | undefined): "w" | "b" | undefined =>
  word === "white" ? "w" : word === "black" ? "b" : undefined;

/**
 * The message down to the order it might be: typographic quotes and the
 * ellipsis made plain, one line, lower case, the lead-ins and the
 * politeness taken off. A question mark survives unless the message asked
 * politely ("can you flip the board?"); one full stop and any "!" are
 * dropped, so "go to move 8..." (Black's move, in notation) is not read as
 * "go to move 8".
 */
function orderText(message: string): string | null {
  let s = message
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const request = REQUEST_RE.test(s);
  for (let i = 0; i < 8; i++) {
    const m = LEAD_IN_RE.exec(s);
    if (!m) break;
    s = s.slice(m[0].length);
  }
  let stop = false;
  let mark = false;
  for (let i = 0; i < 8; i++) {
    const before = s;
    s = s.replace(/!+$/, "").trimEnd();
    if (!stop && s.endsWith(".") && !s.endsWith("..")) {
      s = s.slice(0, -1).trimEnd();
      stop = true;
    }
    if (request && !mark && s.endsWith("?")) {
      s = s.slice(0, -1).trimEnd();
      mark = true;
    }
    s = s.replace(TRAILER_RE, "");
    if (s === before) break;
  }
  return s.length > 0 ? s : null;
}

/**
 * The order a whole message gives, or null when it is not one (then it is
 * a question for the coach, exactly as before). Never throws.
 */
export function parsePageTurn(message: string): PageTurn | null {
  if (typeof message !== "string" || message.length > 200) return null;
  const s = orderText(message);
  if (!s || /[?"]/.test(s)) return null;
  const action = (a: PageAction): PageTurn => ({ type: "action", action: a });

  const flip = FLIP_RE.exec(s);
  if (flip) {
    const to = flip[1] ?? flip[2];
    return action(
      to === "white" || to === "black"
        ? { kind: "flip_board", to }
        : { kind: "flip_board" }
    );
  }
  const goTo = GO_TO_MOVE_RE.exec(s);
  if (goTo) {
    const before = side(goTo[1]);
    const after = side(goTo[3]);
    // "white's move 8 for black" names two sides: not an order.
    if (before && after && before !== after) return null;
    const color = before ?? after;
    const moveNumber = Number(goTo[2]);
    return action(
      color
        ? { kind: "go_to_move", moveNumber, color }
        : { kind: "go_to_move", moveNumber }
    );
  }
  if (GO_TO_START_RE.test(s)) return action({ kind: "go_to_start" });
  if (GO_TO_END_RE.test(s)) return action({ kind: "go_to_end" });
  if (STEP_FORWARD_RE.test(s)) return action({ kind: "step", delta: 1 });
  if (STEP_BACK_RE.test(s)) return action({ kind: "step", delta: -1 });
  if (BACK_RE.test(s)) return action({ kind: "back" });
  if (BACK_TO_GAME_RE.test(s)) return action({ kind: "back_to_game" });
  if (REPLAY_RE.test(s)) return action({ kind: "replay_line" });

  const pref = (p: PagePreference): PageTurn => ({
    type: "preference",
    preference: p,
  });
  const sideSaid = SIDE_RE.exec(s);
  if (sideSaid)
    return pref({ kind: "side", color: side(sideSaid[1])!, bare: false });
  const bare = BARE_SIDE_RE.exec(s);
  if (bare) return pref({ kind: "side", color: side(bare[1])!, bare: true });
  if (MY_SIDE_RE.test(s)) return pref({ kind: "my_side" });
  return null;
}

// ─── The wire ──────────────────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** One action from a response, checked field by field; null when it is not one. */
function readPageAction(raw: unknown): PageAction | null {
  if (!isObject(raw)) return null;
  switch (raw.kind) {
    case "flip_board":
      if (raw.to === undefined) return { kind: "flip_board" };
      return raw.to === "white" || raw.to === "black"
        ? { kind: "flip_board", to: raw.to }
        : null;
    case "go_to_move": {
      const n = raw.moveNumber;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 9999)
        return null;
      if (raw.color === undefined) return { kind: "go_to_move", moveNumber: n };
      return raw.color === "w" || raw.color === "b"
        ? { kind: "go_to_move", moveNumber: n, color: raw.color }
        : null;
    }
    case "step":
      return raw.delta === 1 || raw.delta === -1
        ? { kind: "step", delta: raw.delta }
        : null;
    case "go_to_start":
    case "go_to_end":
    case "back":
    case "back_to_game":
    case "replay_line":
      return { kind: raw.kind };
    default:
      return null;
  }
}

/** The `actions` of a chat response: what the client can check, at most four. */
export function readPageActions(raw: unknown): PageAction[] {
  if (!Array.isArray(raw)) return [];
  const out: PageAction[] = [];
  for (const item of raw.slice(0, 4)) {
    const a = readPageAction(item);
    if (a) out.push(a);
  }
  return out;
}

/** The `preference` of a chat response. */
export function readPagePreference(raw: unknown): PagePreference | null {
  if (!isObject(raw)) return null;
  if (raw.kind === "my_side") return { kind: "my_side" };
  if (
    raw.kind === "side" &&
    (raw.color === "w" || raw.color === "b") &&
    typeof raw.bare === "boolean"
  )
    return { kind: "side", color: raw.color, bare: raw.bare };
  return null;
}

/**
 * The page turn a response served, when it served one: exactly one action,
 * or a preference. Anything else (an unknown kind from a newer server) is
 * null, and the page says it could not do it rather than showing the
 * server's text as an answer.
 */
export function readServedPageTurn(gameAnalysis: unknown): PageTurn | null {
  if (!isObject(gameAnalysis)) return null;
  const preference = readPagePreference(gameAnalysis.preference);
  if (preference) return { type: "preference", preference };
  const raw = gameAnalysis.actions;
  if (!Array.isArray(raw) || raw.length !== 1) return null;
  const action = readPageAction(raw[0]);
  return action ? { type: "action", action } : null;
}

/**
 * The `pageActions` of a chat request: the kinds of order the page that
 * sent it can carry out. Unknown names are dropped; anything that is not a
 * short list of strings is no list at all.
 */
export function readPageTurnKinds(raw: unknown): PageTurnKind[] {
  if (!Array.isArray(raw) || raw.length > 32) return [];
  const known = new Set<string>(PAGE_TURN_KINDS);
  const out: PageTurnKind[] = [];
  for (const k of raw)
    if (
      typeof k === "string" &&
      known.has(k) &&
      !out.includes(k as PageTurnKind)
    )
      out.push(k as PageTurnKind);
  return out;
}
