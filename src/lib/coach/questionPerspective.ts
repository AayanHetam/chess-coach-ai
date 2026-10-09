/**
 * Whose side a follow-up turn looks at the game from (pathway 2.5).
 *
 * The SUBJECT of a turn is the side whose decisions the answer is about.
 * It is never the addressee: the player stays "you" whichever side the turn
 * looks at, and the opponent stays "your opponent". "From Black's side,
 * what went wrong?" asked by White makes Black's moves the subject of that
 * one answer, while every "your" in it still means White.
 *
 * Read from the words of this message first, then from the page's standing
 * choice (`perspective` on the chat request, which the client sends from
 * 2.6), then, when the page sent none, from the latest side the kept
 * history named: the four exchanges replayed to the model would otherwise
 * carry answers about Black into a turn served about White. Words that name
 * a colour always resolve. Words relative to the player ("my opponent",
 * "he", "from my side") resolve only when the player's side is confirmed:
 * the server's colour is otherwise the board orientation, a guess.
 *
 * Statements about the player's own side ("I was Black", "coach me as
 * Black") are not perspective: the page owns them (pageActions.ts). Nor is
 * "as Black" alone ("as White resigned"), "switch sides" (a request to
 * spar), "in Black's side of the board" (territory), or a side named beside
 * a move number ("after Black's move 7, what should I have played?" is
 * about the player's reply; the anchor reads that owner on its own,
 * questionAnchor.ts). Pure and client-safe.
 */

export type Side = "w" | "b";

/**
 * `COACH_PERSPECTIVE=1` turns the subject on for the follow-up route. Off,
 * every request is served byte for byte as before. Read per call.
 */
export function isPerspectiveEnabled(): boolean {
  const v = (process.env.COACH_PERSPECTIVE ?? "").trim().toLowerCase();
  return v === "1" || v === "on" || v === "true";
}

/**
 * The analysis page's half (PR 2.6), off until its flip: its own one-line
 * PR changes this default, and the env overrides it either way, which is
 * how the Playwright legs run it on. Never on before `COACH_PERSPECTIVE`:
 * a page that moves "go to move 8" to Black's 8th while the coach reads
 * the player's would disagree with it.
 */
export const PERSPECTIVE_PUBLIC_DEFAULT = false;

/**
 * Read once at module level by the analysis page. `NEXT_PUBLIC_` values are
 * inlined at build time, and only for this literal spelling of the name.
 */
export function isPerspectiveEnabledPublic(): boolean {
  const v = (process.env.NEXT_PUBLIC_COACH_PERSPECTIVE ?? "")
    .trim()
    .toLowerCase();
  if (v === "1" || v === "on" || v === "true") return true;
  if (v === "0" || v === "off" || v === "false") return false;
  return PERSPECTIVE_PUBLIC_DEFAULT;
}

/** The version of the perspective wording the route sends, echoed and logged so answers can be told apart. */
export const PERSPECTIVE_CLAUSE_VERSION = "1";

export interface TurnSubject {
  side: Side;
  /**
   * "words" when this message names the side, "field" for the page's
   * standing choice, "history" for the side an earlier kept question named.
   */
  source: "words" | "field" | "history";
  /** Which reading decided it, for the logs and the echo. */
  rule: string;
  /**
   * The page's standing side set aside for this turn, because the words
   * are about the player ("what did I do wrong?", "and White?", "back to
   * my side, why was move 8 bad?"): echoed, nothing else served about it.
   */
  yielded?: "words";
}

/** A side as the subject of a verb: "Black", "my opponent", "he". */
const SUBJ = "(white|black|(?:my|the)\\s+opponent|opponent|he|she|they)";
/** A side as an owner: "Black's", "Blacks", "my opponent's", "opponents", "his". */
const POSS =
  "(white(?:'s|s)?|black(?:'s|s)?|(?:(?:my|the)\\s+)?opponent(?:'s|s)|his|her|their)";
const VIEW_NOUN =
  "(?:side|perspective|point\\s+of\\s+view|pov|eyes|view|viewpoint|angle|shoes)";
/** Ranks that pick the side's bad moves. */
const RANK =
  "(?:worst|biggest|key|main|critical|first|last|real|big|costliest|bad)";
/** Ranks that pick its good ones: a question about the board as often as the game. */
const GOOD_RANK = "(?:best|good|only|strongest|top)";
const MISTAKE_NOUN =
  "(?:mistakes?|blunders?|errors?|inaccurac(?:y|ies)|moments?|decisions?|choices?)";
const THINKING_VERB =
  "(?:thinking|planning|trying|hoping|going\\s+for|aiming\\s+for|after|up\\s+to)";

const rx = (src: string) => new RegExp(src, "gi");

/**
 * The readings, each capturing the side in group 1. A kind ending "_now"
 * asks about the board on screen and is never carried to a later turn.
 */
const RULES: { kind: string; re: RegExp }[] = [
  // "from Black's side", "from the black side", "through my opponent's
  // eyes", "in his shoes"; never "from Black's side of the board" or "side
  // to move" (territory, the turn).
  {
    kind: "view",
    re: rx(
      `\\b(?:from|through)\\s+(?:the\\s+)?${POSS}\\s+${VIEW_NOUN}\\b(?!\\s+(?:of\\s+the\\s+board|to\\b))`
    ),
  },
  { kind: "view", re: rx(`\\bin\\s+${POSS}\\s+shoes\\b`) },
  {
    kind: "view",
    re: rx(
      `\\b${POSS}\\s+(?:perspective|point\\s+of\\s+view|pov|viewpoint)\\b`
    ),
  },
  {
    kind: "view",
    re: rx(
      `\\b${POSS}\\s+side\\s+of\\s+(?:it|things|the\\s+game|the\\s+story)\\b`
    ),
  },
  // "what was Black thinking", "what Black was thinking"; "what is he up to" is about now.
  {
    kind: "thinking",
    re: rx(`\\bwhat\\s+(?:was|were)\\s+${SUBJ}\\s+${THINKING_VERB}\\b`),
  },
  {
    kind: "thinking",
    re: rx(
      `\\b(?:what|where|how)\\s+${SUBJ}\\s+(?:was|were)\\s+${THINKING_VERB}\\b`
    ),
  },
  {
    kind: "thinking_now",
    re: rx(
      `\\bwhat(?:\\s+(?:is|are)|'?s|'re)\\s+${SUBJ}\\s+${THINKING_VERB}\\b`
    ),
  },
  // "what did my opponent miss", "where did he go wrong", "why did Black lose".
  {
    kind: "decision",
    re: rx(
      `\\bwhat\\s+did\\s+${SUBJ}\\s+(?:want|plan|intend|miss|overlook|see|do\\s+wrong|get\\s+wrong)\\b`
    ),
  },
  {
    kind: "decision_now",
    re: rx(`\\bwhat\\s+(?:does|do)\\s+${SUBJ}\\s+(?:want|plan|intend|see)\\b`),
  },
  {
    kind: "decision",
    re: rx(`\\bwhere(?:\\s+did|'d)\\s+${SUBJ}\\s+go\\s+wrong\\b`),
  },
  { kind: "decision", re: rx(`\\bwhere\\s+${SUBJ}\\s+went\\s+wrong\\b`) },
  {
    kind: "decision",
    re: rx(
      `\\bhow\\s+did\\s+${SUBJ}\\s+(?:lose|go\\s+wrong|end\\s+up|get\\s+into)\\b`
    ),
  },
  {
    kind: "decision",
    re: rx(
      `\\bwhy\\s+(?:did|didn't|did\\s+not|would|wouldn't)\\s+${SUBJ}\\s+(?:play|move|take|go\\s+for|choose|castle|resign|sacrifice|trade|push|give\\s+up|lose)\\b`
    ),
  },
  // "how should Black have played", "what Black should have played";
  // "what should my opponent play here" is about now.
  {
    kind: "should",
    re: rx(
      `\\b(?:how|what)\\s+(?:should|could|would)\\s+${SUBJ}\\s+(?:have|of)\\s+(?:played|done|defended|continued|reacted|responded|tried)\\b`
    ),
  },
  {
    kind: "should",
    re: rx(
      `\\b(?:how|what)\\s+${SUBJ}\\s+(?:should|could)\\s+(?:have|of)\\s+(?:played|done)\\b`
    ),
  },
  {
    kind: "should_now",
    re: rx(`\\bwhat\\s+(?:should|could)\\s+${SUBJ}\\s+(?:play|do)\\b`),
  },
  // "Black's worst move", "my opponents mistakes", "his blunder", "the worst move by Black".
  {
    kind: "moments",
    re: rx(`\\b${POSS}\\s+(?:${RANK}\\s+)?${MISTAKE_NOUN}\\b`),
  },
  { kind: "moments", re: rx(`\\b${POSS}\\s+${RANK}\\s+moves?\\b`) },
  {
    kind: "moments",
    re: rx(
      `\\b(?:worst|biggest|costliest|key|critical|bad)\\s+(?:moves?|${MISTAKE_NOUN})\\s+(?:by|for|of)\\s+${SUBJ}\\b`
    ),
  },
  // "Black's best move", "what's my opponent's best reply".
  {
    kind: "best",
    re: rx(
      `\\b${POSS}\\s+${GOOD_RANK}\\s+(?:moves?|replies|reply|${MISTAKE_NOUN}|plans?|ideas?)\\b`
    ),
  },
];

/** "back to my side", "from my perspective": the player's own side, inside a question. */
const PLAYER_RE =
  /\b(?:back\s+to|from|through)\s+my\s+(?:own\s+)?(?:side|colou?r|perspective|point\s+of\s+view|pov|view)\b/i;

/** Words that ask about the side's mistakes, which earn the key-moments block. */
const MISTAKES_CUE_RE =
  /\b(?:worst|biggest|costliest|mistakes?|blunders?|errors?|inaccurac(?:y|ies)|wrong|lose|lost|losing|(?:should|could)(?:\s+\w+){0,3}\s+have|better|turning\s+point|key\s+moments?|critical|miss(?:ed)?)\b/i;
/** Words that put the question on one move or on the board on screen instead. */
const HERE_CUE_RE =
  /\b(?:here|now|this\s+(?:position|move)|last\s+move|first\s+move|current)\b/i;

const normalise = (s: string) => s.replace(/[’‘]/g, "'");

/** "I", "me", "my" (not "my opponent"): a question about the player's own play. */
const FIRST_PERSON_RE =
  /\b(?:i(?!\s+(?:don't\s+|do\s+not\s+)?(?:see|understand|get|follow)\b)|mine|myself|we|us|our|ours)\b|\bmy\b(?!\s+opponent)/i;
/** "my knight", "my rooks": then "they" and "he" are the player's own pieces. */
const MY_PIECES_RE =
  /\bmy\s+(?:pawns?|knights?|bishops?|rooks?|queens?|kings?|pieces?)\b/i;
/** The player's colour named as a word: a question about the player's side. */
const namesColour = (text: string, side: Side) =>
  (side === "w" ? /\bwhite\b/i : /\bblack\b/i).test(text);
/** Readings about the game played that may carry over to a later question. */
const CARRIED_KINDS = new Set([
  "view",
  "thinking",
  "decision",
  "should",
  "moments",
]);

/**
 * Words about the player's own play: the first person ("I", "we", "my"
 * but not "my opponent"), the player's own side ("back to my side"), or
 * the player's colour by name. They end a carried subject and set aside a
 * standing one for the turn. The page reads them too, so its what-if
 * draws the move the coach will anchor.
 */
export function aboutThePlayer(message: string, player: Side): boolean {
  const said = normalise(message ?? "");
  return (
    FIRST_PERSON_RE.test(said) ||
    PLAYER_RE.test(said) ||
    namesColour(said, player)
  );
}

/** The page's standing choice, as sent: "w", "b", "white" or "black"; anything else is no choice. */
export function readPerspectiveField(raw: unknown): Side | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "w" || v === "white") return "w";
  if (v === "b" || v === "black") return "b";
  return null;
}

/**
 * The side this message's words make the subject, with the reading that
 * found it ("colour_view", "opponent_thinking", "player"), or null when the
 * words name none, or name two.
 */
export function perspectiveFromWords(
  message: string,
  player: Side,
  sideConfirmed: boolean
): { side: Side; rule: string } | null {
  if (!message) return null;
  const text = normalise(message);
  const other: Side = player === "w" ? "b" : "w";
  const found: { side: Side; rule: string }[] = [];
  const firstPerson = FIRST_PERSON_RE.test(text);
  for (const { kind, re } of RULES) {
    // "did I punish Black's blunder?" is about the player's play.
    if ((kind === "moments" || kind === "best") && firstPerson) continue;
    for (const m of Array.from(text.matchAll(re))) {
      const who = m[1].toLowerCase();
      if (/^(?:he|she|they)$/.test(who) && MY_PIECES_RE.test(text)) continue;
      if (who.startsWith("white"))
        found.push({ side: "w", rule: `colour_${kind}` });
      else if (who.startsWith("black"))
        found.push({ side: "b", rule: `colour_${kind}` });
      else if (sideConfirmed)
        found.push({ side: other, rule: `opponent_${kind}` });
    }
  }
  if (sideConfirmed && PLAYER_RE.test(text))
    found.push({ side: player, rule: "player" });
  if (found.length === 0) return null;
  // "From White's side, what was Black thinking?": no one side is the subject.
  if (found.some((f) => f.side !== found[0].side)) return null;
  return found[0];
}

/**
 * Whether a turn about a side asks about that side's mistakes, so its worst
 * moments are worth putting in front of the model: "from Black's side, what
 * went wrong?" does, "what is Black's best move here?" does not.
 */
export function asksAboutMistakes(message: string): boolean {
  const text = normalise(message ?? "");
  return MISTAKES_CUE_RE.test(text) && !HERE_CUE_RE.test(text);
}

/**
 * The subject of this turn. The words, else the field, else the side the
 * kept history's latest question about the game named (newest first). A
 * field is the page's standing choice even when it is the player's own
 * side, so it ends a subject the history carried. A subject equal to the
 * player's side is returned when the words name it ("back to my side") and
 * is null otherwise: an ordinary turn is served as without one.
 *
 * The history carries only a reading about the game played (a view, what
 * the side was thinking, what it did or should have done, its mistakes),
 * never a question about the board on screen ("Black's best move here"),
 * and never into a question in the first person ("what should I play?") or
 * one that names the player's side, confirmed or not: those end it.
 */
export function resolveTurnSubject(input: {
  message: string;
  field?: unknown;
  player: Side;
  sideConfirmed: boolean;
  /** The kept history's user questions, oldest first. */
  history?: readonly string[];
}): TurnSubject | null {
  const words = perspectiveFromWords(
    input.message,
    input.player,
    input.sideConfirmed
  );
  if (words) return { side: words.side, source: "words", rule: words.rule };
  const text = normalise(input.message ?? "");
  const endsCarry = (said: string) => aboutThePlayer(said, input.player);
  const field = readPerspectiveField(input.field);
  if (field) {
    if (field === input.player) return null;
    return endsCarry(text)
      ? { side: field, source: "field", rule: "field", yielded: "words" }
      : { side: field, source: "field", rule: "field" };
  }
  // "what should we play now?", "and how did White play?", "back to my side".
  if (endsCarry(text) || HERE_CUE_RE.test(text)) return null;
  const history = input.history ?? [];
  for (let i = history.length - 1; i >= 0; i--) {
    const said = normalise(history[i] ?? "");
    const earlier = perspectiveFromWords(
      said,
      input.player,
      input.sideConfirmed
    );
    if (earlier) {
      // A later turn about the player's side ended the carry.
      if (earlier.side === input.player) return null;
      const kind = earlier.rule.replace(/^(?:colour|opponent)_/, "");
      if (!CARRIED_KINDS.has(kind) || HERE_CUE_RE.test(said)) continue;
      return { side: earlier.side, source: "history", rule: earlier.rule };
    }
    // "back to me please, what did I do wrong?" ended it too.
    if (endsCarry(said)) return null;
  }
  return null;
}
