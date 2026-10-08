/**
 * What is the player asking for?
 *
 * The ideal coach (MASTERMIND_CONTEXT/IDEAL_PRODUCT.md, "What the player
 * can ask") names sixteen intents and three answer shapes. Today there is
 * no router: every follow-up gets one prompt, one shape, one fact pack and
 * one action (the anchor). This module is the first half of the router the
 * pathway describes, in SHADOW: rules first, for the asks a rule can read
 * with certainty (an action, a slash command, a move-shaped question
 * through the anchor's askedSan, a walkthrough, a mode entry, a side
 * switch, a greeting), and `unknown` for the rest, which the Haiku
 * classifier keeps deciding exactly as it does now.
 *
 * Nothing serves differently on this result. The route logs it and echoes
 * it beside `anchor` so the distribution can be measured before any shape,
 * fact pack or category map depends on it.
 *
 * Rules are conservative on purpose: "go to move 20" and "why was move 20
 * bad" both carry a move number, so the action rules run first and demand
 * the verb at the start of the message; a question word anywhere before
 * the verb hands the message on. A rule that is not sure says `unknown`.
 *
 * Pure. The anchor is resolved by the caller (questionAnchor.ts) so the
 * two readers of the same question agree on which move it names.
 */
import type { QuestionAnchor } from "./questionAnchor";
import { isWalkthroughQuestion } from "./questionShape";

export type QuestionIntent =
  | "verdict"
  | "what_if"
  | "compare"
  | "plan"
  | "perspective"
  | "opening"
  | "endgame"
  | "concept"
  | "action"
  | "walkthrough"
  | "try_it"
  | "quiz"
  | "defend_it"
  | "master_game"
  | "progress"
  | "preference"
  | "greeting"
  | "unknown";

export const QUESTION_INTENTS: readonly QuestionIntent[] = [
  "verdict",
  "what_if",
  "compare",
  "plan",
  "perspective",
  "opening",
  "endgame",
  "concept",
  "action",
  "walkthrough",
  "try_it",
  "quiz",
  "defend_it",
  "master_game",
  "progress",
  "preference",
  "greeting",
  "unknown",
];

/** The thing an action ask wants done. The app does it; the model is not asked. */
export type IntentAction =
  | { kind: "slash"; command: string }
  | { kind: "flip_board" }
  | { kind: "go_to_ply"; ply: number }
  | { kind: "go_to_start" }
  | { kind: "go_to_end" }
  | { kind: "step"; delta: 1 | -1 }
  | { kind: "replay_line" }
  | { kind: "back_to_game" };

export type IntentSide = "w" | "b" | "player" | "opponent";

export interface IntentResolution {
  intent: QuestionIntent;
  /** Which rule decided; "none" when no rule matched and the classifier decides. */
  rule: string;
  action?: IntentAction;
  /** The side a perspective or preference ask names. */
  side?: IntentSide;
  /** The moves a compare or what-if names, in notation as written. */
  moves?: string[];
  /** A preference about length. */
  length?: "short" | "long";
}

export interface IntentContext {
  /** The move the question names, as questionAnchor.ts resolved it. */
  anchor: QuestionAnchor | null;
  /** The game's SAN moves. */
  moves: readonly string[];
  playerColor: "w" | "b";
}

const SAN_CORE =
  "(?:[NBRQK][a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?|[a-h]x[a-h][1-8](?:=[NBRQ])?[+#]?|[a-h][1-8](?:=[NBRQ])?[+#]?)";
/** A move in notation, optionally numbered: "8. Nc7+", "Nf3", "exd5", "e4". */
const SAN_RE = new RegExp(
  `(?<![A-Za-z0-9])(?:\\d{1,3}\\s*\\.{1,3}\\s*)?(${SAN_CORE})(?![A-Za-z0-9])`,
  "g"
);
/** A bare pawn push ("e4") is a square as often as a move; it counts only beside a cue. */
const PAWN_PUSH_RE = /^[a-h][1-8](?:=[NBRQ])?[+#]?$/;
const PIECE_SAN_RE = /^(?:[NBRQK]|O-O|[a-h]x)/;

/** "can you", "please", "could you", "masti," and the like, before the verb. */
const LEAD_IN =
  "(?:(?:hey|hi|ok|okay|masti|coach|please|can you|could you|would you|will you|just|now|let'?s|lets)[,\\s]+)*";
const startsWith = (body: string) =>
  new RegExp(`^\\s*${LEAD_IN}(?:${body})`, "i");

const SLASH_RE = /^\s*\/([a-z][a-z0-9-]*)\b/i;
const FLIP_RE = startsWith(
  "(?:flip|rotate|turn)\\s+(?:the\\s+)?board|flip\\s+it"
);
const GO_TO_MOVE_RE = startsWith(
  "(?:go|jump|skip|take me|bring me)\\s+(?:back\\s+|forward\\s+)?to\\s+move\\s+(\\d{1,3})|show\\s+(?:me\\s+)?move\\s+(\\d{1,3})\\b(?!\\s*[:(]\\s*[NBRQKa-hO])"
);
const GO_TO_START_RE = startsWith(
  "(?:go|jump|take me)\\s+(?:back\\s+)?to\\s+(?:the\\s+)?(?:start|beginning|first move)\\b"
);
const GO_TO_END_RE = startsWith(
  "(?:go|jump|skip|take me)\\s+to\\s+(?:the\\s+)?(?:end|last move|final position)\\b"
);
const STEP_RE = startsWith(
  "(?:next|previous|prev|last)\\s+move\\b|(?:go\\s+)?(?:back|forward)\\s+(?:one|a)\\s+move\\b|step\\s+(?:back|forward)\\b"
);
const REPLAY_RE = startsWith(
  "(?:re)?play\\s+(?:the\\s+|that\\s+|this\\s+)?line(?:\\s+again)?\\b|play\\s+it(?:\\s+again)?\\b|replay\\b|show\\s+(?:me\\s+)?the\\s+line(?:\\s+again)?\\b"
);
const BACK_TO_GAME_RE = startsWith(
  "(?:go\\s+)?back\\s+to\\s+the\\s+game\\b|(?:reset|exit)\\s+(?:the\\s+)?(?:board|line|exploration)\\b"
);

const GREETING_RE =
  /^\s*(?:hi|hello|hey|yo|thanks|thank you|thx|ty|cheers|ok|okay|cool|nice|great|awesome|got it|makes sense|good (?:morning|evening|afternoon))\b[\s!.,]*(?:masti|coach)?[\s!.,]*$/i;

const PREF_SIDE_RE =
  /\b(?:always|from now on|by default|going forward)\b.*?\b(?:coach|analy[sz]e|review|look at|see)\b.*?\bas\s+(white|black)\b|\bcoach\s+me\s+as\s+(white|black)\b/i;
const PREF_BACK_RE = /\bback\s+to\s+my\s+(?:side|colou?r|perspective)\b/i;
const PREF_LENGTH_RE =
  /\b(?:keep\s+it|keep\s+(?:your\s+)?answers?|be)\s+(short|shorter|brief|longer|more detailed)\b|\b(shorter|longer)\s+answers?\b/i;

const PERSPECTIVE_SIDE_RE =
  /\b(?:from|through|in)\s+(white|black)'?s?\s+(?:side|perspective|point of view|pov|eyes|shoes)\b|\bas\s+(white|black)\b(?!\s+(?:I|i|you|we)\b)|\b(white|black)'?s?\s+(?:perspective|point of view|side of (?:it|the board|things))\b/i;
const PERSPECTIVE_OPP_RE =
  /\b(?:what\s+was|what\s+were|what\s+is)\s+(?:my\s+)?opponent\s+(?:thinking|planning|trying|hoping|going for)\b|\bfrom\s+(?:my\s+)?opponent'?s?\s+(?:side|perspective|point of view|eyes|shoes)\b|\b(?:switch|swap|change|flip)\s+(?:sides|perspective|perspectives)\b|\bother\s+side\s+of\s+the\s+board\b|\bthe\s+other\s+side'?s?\s+(?:view|perspective)\b/i;

const TRY_IT_RE =
  /\b(?:let\s+me|can\s+i|could\s+i|i\s+want\s+to|i'?d\s+like\s+to)\s+(?:try|play|take over|continue|spar)\b(?:\s+(?:it|this|from here|from this position|out|the position|against you))?|\bplay\s+(?:it\s+)?out\s+(?:from|against)\b|\bspar\b|\bplay\s+against\s+(?:me|you|the engine)\b/i;
const DEFEND_IT_RE =
  /\b(?:let\s+me|can\s+i|could\s+i|i\s+want\s+to)\s+(?:try\s+to\s+)?defend\b|\bdefend\s+(?:it|this|from|the position)\b/i;
const QUIZ_RE =
  /\b(?:test|quiz|drill)\s+me\b|\bgive\s+me\s+(?:a\s+)?(?:puzzle|puzzles|practice|exercise|exercises|drills?)\b|\b(?:more\s+)?practice\s+(?:on|with|for)\b|\bi\s+keep\s+missing\s+these\b|\bpuzzle\s+me\b/i;

const WHAT_IF_RE =
  /\b(?:what\s+if|what\s+about|how\s+about|why\s+not|instead\s+of|instead\b|rather\s+than|could\s+i\s+have\s+played|should\s+i\s+have\s+played|would\s+.*\s+(?:have\s+)?(?:been\s+)?better|is\s+.*\s+better|was\s+.*\s+better|does\s+.*\s+work|would\s+.*\s+work)/i;
const COMPARE_JOIN_RE = new RegExp(
  `(?<![A-Za-z0-9])(?:\\d{1,3}\\s*\\.{1,3}\\s*)?(${SAN_CORE})(?![A-Za-z0-9])\\s*(?:,\\s*)?(?:or|vs\\.?|versus|against|compared\\s+(?:to|with))\\s+(?:\\d{1,3}\\s*\\.{1,3}\\s*)?(${SAN_CORE})(?![A-Za-z0-9])`,
  "i"
);

const PLAN_RE =
  /\b(?:what(?:'s|\s+is|\s+was)\s+(?:my|the|a\s+good|the\s+right)\s+plan|plan\s+(?:here|in\s+this\s+position|from\s+here|for\s+(?:white|black|me))|what\s+should\s+i\s+(?:do|play|aim\s+for|be\s+doing)\s+(?:here|now|in\s+this\s+position|from\s+here)|how\s+(?:do|should)\s+i\s+(?:continue|proceed|improve\s+my\s+position)|what(?:'s|\s+is)\s+the\s+idea\s+(?:here|in\s+this\s+position)|where\s+(?:do|should)\s+my\s+pieces\s+go)\b/i;
const ENDGAME_RE =
  /\b(?:endgame|ending|endings)\b|\b(?:rook|pawn|king and pawn|bishop|knight|queen|minor piece|opposite[- ]colou?red bishop)\s+(?:endgame|ending)\b|\bhow\s+do\s+i\s+(?:win|hold|draw|convert)\s+this\b|\btablebase\b/i;
const OPENING_RE =
  /\b(?:what|which)\s+opening\b|\bopening\s+(?:was|is)\s+this\b|\b(?:leave|left|out\s+of|deviat\w+\s+from|still\s+in)\s+(?:the\s+)?(?:book|theory)\b|\bopening\s+theory\b|\bis\s+this\s+(?:a\s+)?(?:known\s+)?(?:opening|line|book\s+line)\b|\bname\s+of\s+(?:this|the)\s+opening\b|\bwhat\s+(?:should|do)\s+i\s+study\s+(?:in|for)\s+(?:this|the)\s+opening\b/i;
const CONCEPT_RE =
  /\b(?:what(?:'s|\s+is|\s+does)\s+(?:a|an|the\s+term)?\s*(?:[\w-]+\s+){1,3}(?:mean|attack|sacrifice|pin|fork|skewer|zugzwang|tempo|outpost|prophylaxis|initiative|opposition|triangulation|fianchetto|gambit|zwischenzug|intermezzo|overload|deflection|decoy|interference|clearance|minority|majority|structure|break)\b|\bdefine\s+\w+|\bwhat\s+does\s+[\w-]+\s+mean\b|\bexplain\s+(?:the\s+)?(?:term|concept|idea\s+of)\b|\bwhat\s+is\s+(?:a|an)\s+[\w-]+(?:\s+[\w-]+)?\s*\?)/i;
const PROGRESS_RE =
  /\bam\s+i\s+(?:improving|getting\s+better|progressing)\b|\bwhat\s+should\s+i\s+(?:work|focus)\s+on\b|\bmy\s+(?:weaknesses|strengths|rating|progress|biggest\s+weakness|recurring\s+mistakes?|pattern\s+of\s+mistakes)\b|\bwhat\s+(?:should|do)\s+i\s+study\b(?!\s+(?:in|for)\s+(?:this|the)\s+opening)|\bhow\s+(?:am\s+i|is\s+my)\s+(?:doing|play|game)\b|\bacross\s+my\s+games\b/i;
const MASTER_GAME_RE =
  /\bmaster\s+games?\b|\bhow\s+(?:(?:do|would|did)\s+)?(?:a\s+)?(?:masters?|grandmasters?|gms?|strong\s+players?|pros?)\s+(?:play|played|handle|handled|treat|treated)\b|\bshow\s+me\s+a\s+(?:master\s+|model\s+|top[- ]level\s+)?game\b|\bmodel\s+game\b/i;
const VERDICT_RE =
  /\b(?:why\s+(?:was|is|did|does|wasn'?t|isn'?t)|mistake|blunder|inaccura\w+|bad\s+move|good\s+move|best\s+move|what\s+(?:went|was)\s+wrong|wrong\s+with|what\s+happened|how\s+bad|was\s+(?:that|it|this)\s+(?:bad|good|ok|okay|fine|right|correct|a\s+mistake)|went\s+wrong|lost\s+the\s+game|threw\s+(?:away|it)|losing\s+move|winning\s+move|what\s+did\s+i\s+miss)\b/i;

function sideWord(word: string | undefined): IntentSide | undefined {
  const w = (word ?? "").toLowerCase();
  if (w === "white") return "w";
  if (w === "black") return "b";
  return undefined;
}

/** Moves written in notation, pawn pushes only when cued by a number or a move verb. */
function notatedMoves(text: string): string[] {
  const out: string[] = [];
  for (const m of Array.from(text.matchAll(SAN_RE))) {
    const san = m[1];
    const numbered = /\d\s*\.{1,3}\s*$/.test(
      text.slice(
        Math.max(0, m.index ?? 0),
        (m.index ?? 0) + m[0].length - san.length
      )
    );
    if (PAWN_PUSH_RE.test(san) && !numbered) {
      const before = text.slice(0, m.index ?? 0);
      if (
        !/\b(?:play|played|plays|playing|push|pushed|move|moved|with|after|instead of|rather than|why not|about|if|or|vs\.?|versus)\s*$/i.test(
          before
        )
      )
        continue;
    }
    if (!PIECE_SAN_RE.test(san) && !PAWN_PUSH_RE.test(san)) continue;
    if (!out.includes(san)) out.push(san);
  }
  return out;
}

function resolveAction(
  text: string,
  ctx: IntentContext
): IntentResolution | null {
  const slash = SLASH_RE.exec(text);
  if (slash)
    return {
      intent: "action",
      rule: "action:slash",
      action: { kind: "slash", command: slash[1].toLowerCase() },
    };
  if (FLIP_RE.test(text))
    return {
      intent: "action",
      rule: "action:flip",
      action: { kind: "flip_board" },
    };
  if (GO_TO_START_RE.test(text))
    return {
      intent: "action",
      rule: "action:go_to_start",
      action: { kind: "go_to_start" },
    };
  if (GO_TO_END_RE.test(text))
    return {
      intent: "action",
      rule: "action:go_to_end",
      action: { kind: "go_to_end" },
    };
  const goTo = GO_TO_MOVE_RE.exec(text);
  if (goTo) {
    const n = Number(goTo[1] ?? goTo[2]);
    const index = (n - 1) * 2 + (ctx.playerColor === "b" ? 1 : 0);
    if (Number.isFinite(n) && n >= 1 && index < ctx.moves.length)
      return {
        intent: "action",
        rule: "action:go_to_move",
        action: { kind: "go_to_ply", ply: index + 1 },
      };
    // A move number the game never reached is an ask the app cannot do; the coach says so.
    return null;
  }
  const step = STEP_RE.exec(text);
  if (step) {
    const back = /\b(?:previous|prev|last|back)\b/i.test(step[0]);
    return {
      intent: "action",
      rule: "action:step",
      action: { kind: "step", delta: back ? -1 : 1 },
    };
  }
  if (REPLAY_RE.test(text))
    return {
      intent: "action",
      rule: "action:replay",
      action: { kind: "replay_line" },
    };
  if (BACK_TO_GAME_RE.test(text))
    return {
      intent: "action",
      rule: "action:back_to_game",
      action: { kind: "back_to_game" },
    };
  return null;
}

/**
 * The intent of one follow-up, by rule where a rule can be sure, else
 * `unknown` with rule "none". Never throws; an empty message is unknown.
 */
export function resolveQuestionIntent(
  question: string,
  ctx: IntentContext
): IntentResolution {
  const text = (question ?? "").trim();
  if (!text) return { intent: "unknown", rule: "none" };

  // 1. Actions and slash commands first, and only when the verb opens the message.
  const action = resolveAction(text, ctx);
  if (action) return action;

  // 2. A greeting or thanks: the whole message, nothing asked.
  if (GREETING_RE.test(text)) return { intent: "greeting", rule: "greeting" };

  // 3. Preferences: a standing instruction, not a question about this game.
  const prefSide = PREF_SIDE_RE.exec(text);
  if (prefSide)
    return {
      intent: "preference",
      rule: "preference:side",
      side: sideWord(prefSide[1] ?? prefSide[2]),
    };
  if (PREF_BACK_RE.test(text))
    return { intent: "preference", rule: "preference:back", side: "player" };
  const prefLength = PREF_LENGTH_RE.exec(text);
  if (prefLength) {
    const word = (prefLength[1] ?? prefLength[2] ?? "").toLowerCase();
    return {
      intent: "preference",
      rule: "preference:length",
      length: /short|brief/.test(word) ? "short" : "long",
    };
  }

  // 4. The other side's view of this game.
  const perspectiveSide = PERSPECTIVE_SIDE_RE.exec(text);
  if (perspectiveSide) {
    const side = sideWord(
      perspectiveSide[1] ?? perspectiveSide[2] ?? perspectiveSide[3]
    );
    if (side) return { intent: "perspective", rule: "perspective:side", side };
  }
  if (PERSPECTIVE_OPP_RE.test(text))
    return {
      intent: "perspective",
      rule: "perspective:opponent",
      side: "opponent",
    };

  // 5. Mode entries and the walkthrough, before any move-shaped reading.
  if (DEFEND_IT_RE.test(text))
    return { intent: "defend_it", rule: "defend_it" };
  if (QUIZ_RE.test(text)) return { intent: "quiz", rule: "quiz" };
  if (TRY_IT_RE.test(text)) return { intent: "try_it", rule: "try_it" };
  if (isWalkthroughQuestion(text))
    return { intent: "walkthrough", rule: "walkthrough" };

  // 6. Two moves set against each other.
  const compare = COMPARE_JOIN_RE.exec(text);
  if (compare && compare[1].toLowerCase() !== compare[2].toLowerCase()) {
    return {
      intent: "compare",
      rule: "compare:or",
      moves: [compare[1], compare[2]],
    };
  }

  // 7. An alternative to what was played: the anchor read one, or the phrase plus a move.
  const named = notatedMoves(text);
  if (ctx.anchor?.askedSan)
    return {
      intent: "what_if",
      rule: "what_if:asked_san",
      moves: [ctx.anchor.askedSan],
    };
  if (WHAT_IF_RE.test(text) && named.length > 0)
    return { intent: "what_if", rule: "what_if:phrase", moves: named };

  // 8. No-board asks whose words give them away.
  if (MASTER_GAME_RE.test(text))
    return { intent: "master_game", rule: "master_game" };
  if (OPENING_RE.test(text)) return { intent: "opening", rule: "opening" };
  if (PROGRESS_RE.test(text)) return { intent: "progress", rule: "progress" };
  if (ENDGAME_RE.test(text)) return { intent: "endgame", rule: "endgame" };
  if (PLAN_RE.test(text)) return { intent: "plan", rule: "plan" };
  if (CONCEPT_RE.test(text) && !ctx.anchor && named.length === 0)
    return { intent: "concept", rule: "concept" };

  // 9. A question about a move that was played.
  if (ctx.anchor && VERDICT_RE.test(text))
    return { intent: "verdict", rule: "verdict:anchor" };
  if (ctx.anchor) return { intent: "verdict", rule: "verdict:anchor_only" };

  return { intent: "unknown", rule: "none" };
}
