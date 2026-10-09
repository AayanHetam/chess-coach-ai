/**
 * The rules the live router acts on (pathway PR 3.4).
 *
 * The shadow reading (questionIntent.ts) was built to be measured, not
 * served, and it reads some questions as orders: "go to move 8 and tell me
 * why it was bad", "next move?" and "would you play it?" came back as
 * actions, "keep it short" as a preference. Here an order or a preference
 * comes only through parsePageTurn, which takes the whole message or
 * nothing, so any question left over goes to the coach.
 *
 * Then exact rules for every question the page writes itself (the strip's
 * Ask Masti, the pills, the Masters rows), then the 1.4 rules with their
 * action and preference rules switched off. A concept reading beside a word
 * about the board ("what's a pin in this position?") is set aside and the
 * router decides it, because a false concept costs the board answer.
 *
 * Pure and client-safe: no prompt module, no API route
 * (lib/coach/__tests__/whatIfClientChain.test.ts keeps it that way).
 */
import { pageTurnKind, parsePageTurn, type PageTurnKind } from "./pageActions";
import {
  resolveQuestionIntent,
  SAN_CORE,
  type IntentContext,
  type IntentResolution,
  type QuestionIntent,
} from "./questionIntent";

/** A word that ties a question to this game or the board on screen. */
export const BOARD_CUE_RE =
  /\b(?:here|now|this|that|these|those|my|your|move|moves|played|position|board|screen|game|best|good|bad|better|worse|strong|weak|safe|winning|losing|should)\b/i;

/** A move as the page writes it, numbered or not: "8. Nc7+", "8...Kd8", "Nf3". */
const MOVE = `(?:\\d{1,3}\\s*\\.{1,3}\\s*)?${SAN_CORE}`;

/** Words an opening's name carries. Title Case, as the PGN header and the detector write them. */
const OPENING_WORD =
  "(?:Opening|Defen[cs]e|Gambit|Countergambit|Game|Attack|System|Variation|Indian|Sicilian|French|Caro|Slav|Lopez|English|Dutch|Gr[uü]nfeld|Benoni|Pirc|Alekhine|Scandinavian|London|Catalan|R[ée]ti|Italian|Spanish|Scotch|Vienna|Petrov|Philidor|Najdorf|Dragon)";

/** A move in notation anywhere in a string, numbered or not. */
const NOTATION_RE = new RegExp(
  `(?<![A-Za-z0-9])(?:\\d{1,3}\\s*\\.{1,3}\\s*)?${SAN_CORE}(?![A-Za-z0-9])`
);

/**
 * The questions the page writes, each matched whole. Their sources are
 * MoveAnalysisCard's questionFor, generateSuggestions, the takeover in
 * AnalysisImpl and MasterGamesPanel's coachQuestionFor
 * (uiQuestions.pin.test.ts holds them to these rules).
 */
export const UI_RULES: readonly {
  rule: string;
  intent: QuestionIntent;
  re: RegExp;
}[] = [
  {
    rule: "ui:analyze_game",
    intent: "verdict",
    re: /^analy[sz]e my game[.!]?$/i,
  },
  // "a inaccuracy" on purpose: the strip writes `a ${label}`.
  {
    rule: "ui:why_was",
    intent: "verdict",
    re: new RegExp(`^why was ${MOVE} an? [a-z]+\\?$`, "i"),
  },
  {
    rule: "ui:why_strong",
    intent: "verdict",
    re: new RegExp(`^why was ${MOVE} (?:so strong|brilliant)\\?$`, "i"),
  },
  {
    rule: "ui:missed",
    intent: "verdict",
    re: new RegExp(`^what did (?:i|my opponent) miss with ${MOVE}\\?$`, "i"),
  },
  {
    rule: "ui:idea_behind",
    intent: "verdict",
    re: new RegExp(`^what was the idea behind ${MOVE}\\?$`, "i"),
  },
  {
    rule: "ui:inaccuracies",
    intent: "verdict",
    re: /^which inaccuracies hurt me the most\?$/i,
  },
  {
    rule: "ui:key_moment",
    intent: "verdict",
    re: /^what'?s the most important moment in this game\?$/i,
  },
  {
    rule: "ui:improvement",
    intent: "progress",
    re: /^show me one improvement to study[.!?]?$/i,
  },
  {
    rule: "ui:pieces_now",
    intent: "plan",
    re: /^what is each of my pieces doing right now\?$/i,
  },
  {
    rule: "ui:opening",
    intent: "opening",
    re: new RegExp(
      `^[Tt]ell me about the (?=[^\\n]*\\b${OPENING_WORD}\\b)[A-Z][^\\n]{1,80}$`
    ),
  },
  {
    rule: "ui:masters",
    intent: "what_if",
    re: new RegExp(
      `^tell me about (${SAN_CORE}) from this position(?![A-Za-z])`,
      "i"
    ),
  },
];

export interface LiveIntent extends IntentResolution {
  /** "rule" when a rule decided, "none" when the router is to be asked. */
  source: "rule" | "none";
  /** A concept reading set aside beside a word about the board. */
  veto?: "concept_on_board";
  /** The order or preference parsePageTurn read, when the page did not serve it. */
  page?: PageTurnKind;
}

/** Quotes made plain, one line, the ends trimmed. */
function uiText(question: string): string {
  return question
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function uiRule(text: string): (typeof UI_RULES)[number] | null {
  for (const r of UI_RULES) {
    if (!r.re.test(text)) continue;
    // An opening's name with a move in it is not the pill's question.
    if (
      r.rule === "ui:opening" &&
      NOTATION_RE.test(text.replace(/^tell me about the /i, ""))
    )
      continue;
    return r;
  }
  return null;
}

/**
 * The live reading of one follow-up. A rule decides (source "rule") or the
 * router is to be asked (source "none"). Never an order the page did not
 * read, never a preference about length. Never throws.
 */
export function resolveLiveIntent(
  question: string,
  ctx: IntentContext
): LiveIntent {
  const raw = typeof question === "string" ? question : "";
  if (!raw.trim()) return { intent: "unknown", rule: "none", source: "none" };

  // An order or a preference the page reads, which it did not serve here.
  const turn = parsePageTurn(raw);
  if (turn) {
    const kind = pageTurnKind(turn);
    return {
      intent: turn.type === "action" ? "action" : "preference",
      rule: `page:${kind}`,
      source: "rule",
      page: kind,
    };
  }

  const ui = uiRule(uiText(raw));
  if (ui) return { intent: ui.intent, rule: ui.rule, source: "rule" };

  const r = resolveQuestionIntent(raw, ctx, { live: true });
  if (r.intent === "concept" && BOARD_CUE_RE.test(raw))
    return {
      intent: "unknown",
      rule: "none",
      source: "none",
      veto: "concept_on_board",
    };
  return { ...r, source: r.rule === "none" ? "none" : "rule" };
}

/**
 * The router's intent as the table may use it. A model never chooses an
 * order or a setting, and a concept beside a word about the board is set
 * aside as the rules set it aside.
 */
export function intentFromModel(
  intent: QuestionIntent,
  question: string
): {
  intent: QuestionIntent;
  overridden?: "action" | "preference" | "concept_on_board";
} {
  if (intent === "action" || intent === "preference")
    return { intent: "unknown", overridden: intent };
  if (intent === "concept" && BOARD_CUE_RE.test(question ?? ""))
    return { intent: "unknown", overridden: "concept_on_board" };
  return { intent };
}
