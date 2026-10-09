import { Chess } from "chess.js";
import { NextRequest, NextResponse } from "next/server";
import {
  getAnalysisContext,
  buildCondensedContext,
} from "@/lib/analysisContextCache";
import { buildFenPositionFacts } from "@/lib/mastermind/positionFacts";
import { renderContractCompact } from "@/lib/contract/followUp";
import {
  refereeFollowUp,
  type FollowUpRefereeInput,
  type LicensedLine,
} from "@/lib/contract/followUpReferee";
import { FOLLOWUP_REDUCED_GROUNDING_NOTE } from "@/lib/prompts/followupGrounding";
import {
  FOLLOWUP_BUDGET,
  FOLLOWUP_LEAN_BUDGET,
  FOLLOWUP_PROMPT_VERSION,
  isFollowUpLean,
  getFollowUpPromptMode,
  getFollowUpSystemPromptStable,
  followUpSubjectClause,
  followUpTurnReminder,
  type FollowUpSubject,
} from "@/lib/prompts/followUpPrompt";
import {
  FIELDED_PROMPT_VERSION,
  fieldedTurnReminder,
  getFieldedFollowUpSystemPromptStable,
} from "@/lib/prompts/fieldedFollowUpPrompt";
import { planFieldedTurn } from "@/lib/coach/fieldedFacts";
import {
  fieldedAsRegenerateResult,
  fieldedCallsCostUsd,
  runFieldedTurn,
  type FieldedTurnResult,
} from "@/lib/coach/fieldedTurn";
import {
  MOMENT_OUTPUT_SCHEMA,
  sameProjection,
  type MomentProse,
} from "@/lib/coach/moment";
import {
  confirmedSideOf,
  softenPerspectiveLine,
} from "@/lib/prompts/coachChatPrompt";
import {
  PERSPECTIVE_CLAUSE_VERSION,
  asksAboutMistakes,
  isPerspectiveEnabled,
  resolveTurnSubject,
  type TurnSubject,
} from "@/lib/coach/questionPerspective";
import {
  anchorAtIndex,
  namesAMove,
  resolveQuestionAnchor,
} from "@/lib/coach/questionAnchor";
import { fensAlongGame } from "@/lib/contract/chessFormat";
import {
  isWhatIfEvalsEnabled,
  verifyClientEvals,
  type ClientEvalsOutcome,
  type VerifiedWhatIf,
} from "@/lib/coach/clientEvals";
import { resolveQuestionIntent } from "@/lib/coach/questionIntent";
import {
  pageTurnKind,
  parsePageTurn,
  readPageTurnKinds,
} from "@/lib/coach/pageActions";
import {
  buildAnchorBlock,
  anchorAlternativeFen,
  anchorLicensedLines,
  buildFollowUpCondensedContext,
  buildSubjectMomentsBlock,
  whatIfLicensedLines,
  whatIfLicensedEvals,
} from "@/lib/coach/followUpContext";
import { buildRelationalFacts } from "@/lib/relational/relationalFactsBuilder";
import { validateAIResponse } from "@/lib/aiResponseValidator";
import { chatSchema, validateRequest } from "@/lib/validation/schemas";
import {
  callLLM,
  callLLMStream,
  LLMError,
  PUBLIC_LLM_ERROR,
  toSafeLLMError,
  type CallLLMOptions,
  type LLMMessage,
} from "@/lib/llmProvider";
import { recordLLMCall } from "@/lib/llmStatsAggregator";
import { requireSession } from "@/lib/auth/session";
import { logger, logErrorToSentry, extractRequestId } from "@/lib/logging";
// ── Stage B (PR 1.C) Mastermind validator pipeline imports ──────────
// All flag-gated by getMastermindEnv().validatorsEnabled. Flag-off path
// remains byte-identical to today.
import { getMastermindEnv } from "@/env";
import {
  runValidationPipeline,
  POSITION_ANCHORED_VALIDATOR_CATEGORIES,
} from "@/lib/mastermind/validators";
import {
  withPipelineTimeout,
  readPipelineTimeoutMs,
  type PipelineResultWithTimeout,
} from "@/lib/mastermind/pipelineTimeout";
import {
  prepareMastermindContext,
  forwardPipelineTelemetryForRoute,
} from "@/lib/mastermind/routeHelpers";
import {
  deferRelationalShadow,
  fieldedProseValidator,
} from "@/lib/mastermind/validators/fielded";
import { aiRefusal } from "@/lib/coach/aiGate";

const log = logger.child({ module: "chat" });

/** Prior messages replayed under the follow-up prompt: four exchanges. */
const FOLLOWUP_HISTORY_MESSAGES = 8;
/** The viewed-board facts' heading (positionFacts.ts), re-headed under a key-moments block. */
const CURRENT_POSITION_HEADER_RE = /^## CURRENTLY VIEWED POSITION \([^\n]*\)/;
/** "what was Black thinking?", "... thinking here": the question ends at the verb. */
const THINKING_AT_END_RE =
  /\b(?:thinking|planning|trying|hoping|going\s+for|aiming\s+for|after|up\s+to)\s*(?:(?:here|now|there|with\s+(?:this|that)(?:\s+move)?)\s*)?[?.!]*\s*$/i;

/** Two FENs with the same pieces and side to move. */
function samePosition(a: string, b: string | undefined): boolean {
  if (!b) return false;
  const key = (f: string) => f.split(" ").slice(0, 2).join(" ");
  return key(a) === key(b);
}

/**
 * The prior turns replayed to the model, in order: the client's history
 * without the entry that IS the initial analysis (it goes first on its own),
 * cut to the last FOLLOWUP_HISTORY_MESSAGES on the follow-up prompt and
 * trimmed to start on a user turn so the roles keep alternating.
 *
 * D1 (SILENT_SUBSTITUTION_HANDOFF §3 Group D): this used to skip the FIRST
 * assistant entry positionally, on the assumption that it was the initial
 * analysis already injected. On the live client the first assistant entry
 * is a GREETING, not the analysis, so the greeting was dropped and the raw,
 * uncorrected analysis sailed through and landed as the model's most recent
 * statement, directly after the corrected copy; the model then defended the
 * uncorrected line. De-duped on content identity instead: whichever entry
 * actually IS the initial analysis, wherever it sits, and only once. The
 * client now swaps in the corrected text (D1 client half), so a matching
 * entry is the corrected one; this is belt-and-braces for older clients.
 *
 * Deep in a conversation every earlier answer is replayed as the model's own
 * words, and it imitates them: six essays in, the seventh is an essay. The
 * follow-up prompt keeps the last four exchanges; the review and the
 * contract carry everything older that matters.
 */
/**
 * The light validator (aiResponseValidator.ts) against the board under
 * discussion and, on a turn about the other side's key moments, against the
 * moments' boards too: the block told the model about those boards, so a
 * piece claim that holds on one of them is no error. Without such boards
 * the result is validateAIResponse's own.
 */
function validateOnBoards(
  content: string,
  fen: string,
  moreFens: readonly string[]
): ReturnType<typeof validateAIResponse> {
  const first = validateAIResponse(content, fen);
  if (first.isValid || moreFens.length === 0) return first;
  const holdsElsewhere = (issue: (typeof first.issues)[number]) =>
    issue.type === "wrong_piece_on_square" &&
    moreFens.some((f) =>
      validateAIResponse(issue.original, f).issues.every(
        (i) => i.severity !== "error"
      )
    );
  const remaining = first.issues.filter(
    (i) => i.severity !== "error" || !holdsElsewhere(i)
  );
  if (remaining.some((i) => i.severity === "error")) return first;
  const warnings = remaining.length;
  return {
    isValid: true,
    correctedResponse: content,
    issues: remaining,
    score: Math.max(0, 1 - warnings * 0.05),
  };
}

/**
 * A fielded answer's fields, sent beside its text (pathway 3.3) so a page
 * can draw them: only when the text served is still their projection, so
 * a sentence the referee dropped after the turn, a template or a draft is
 * never drawn from fields it no longer matches.
 */
function servedMoment(
  out: FieldedTurnResult | undefined,
  analysis: string
): MomentProse | null {
  if (out?.served !== "fielded" || !out.prose) return null;
  return sameProjection(analysis, out.text) ? out.prose : null;
}

function keptHistoryTurns(
  conversationHistory: unknown,
  initialAnalysis: string | undefined,
  useFollowUpPrompt: boolean,
  /**
   * The review is not replayed (COACH_FOLLOWUP_LEAN with a contract): the
   * turns it answered go with it, so the model never meets the question
   * the review answered as one still open beside this turn's.
   */
  dropAnswered = false
): LLMMessage[] {
  if (!conversationHistory || !Array.isArray(conversationHistory)) return [];
  const canonical = initialAnalysis?.trim();
  let droppedCanonical = false;
  const priorTurns: LLMMessage[] = [];
  for (const msg of conversationHistory as {
    role?: string;
    content?: unknown;
  }[]) {
    if (
      !droppedCanonical &&
      msg.role === "assistant" &&
      canonical &&
      typeof msg.content === "string" &&
      msg.content.trim() === canonical
    ) {
      droppedCanonical = true;
      if (dropAnswered) priorTurns.length = 0;
      continue;
    }
    if (msg.role && msg.content) {
      priorTurns.push({
        role: msg.role as "user" | "assistant",
        content: msg.content as string,
      });
    }
  }
  let kept = useFollowUpPrompt
    ? priorTurns.slice(-FOLLOWUP_HISTORY_MESSAGES)
    : priorTurns;
  while (kept.length > 0 && kept[0].role !== "user") kept = kept.slice(1);
  return kept;
}

/**
 * Lightweight chat endpoint for follow-up messages.
 *
 * Two modes:
 * 1. **With contextId** (fast path): Uses cached analysis context from a prior
 *    /api/enhanced-analysis call. Sends a condensed context + conversation history
 *    to gpt-4o-mini for near-instant responses (2-5 seconds).
 *
 * 2. **Without contextId** (fallback): Plain passthrough to OpenAI, same as before.
 */
/**
 * Follow-up referee (2026-09-05). The reply to a follow-up is checked
 * sentence by sentence against the review's compact contract and the board
 * under discussion (see followUpReferee.ts): a tactical word, a move in
 * notation or an eval figure the review never carried and the board does not
 * show is dropped, never hedged — the same founder rule turn 1 lives by.
 * Legacy contexts (no compact contract) pass through untouched.
 *
 * The per-move eval table the chat context already shows the model is
 * licensed too, so "you were +7.16 after move 5" survives when the table says
 * so. Pulled from the rendered context rather than re-derived, so the licence
 * and the evidence are the same bytes.
 */
function refereeChatReply(
  reply: string,
  context: {
    compactContract?: import("@/lib/contract/followUp").CompactContract;
    compactGameContext?: string;
    playedMoves?: string[];
  },
  activeFen: string,
  requestId: string,
  /**
   * The move the question named (questionAnchor.ts): its two boards license
   * piece-on-square claims and its narrated lines license moves and tactical
   * words, exactly as a reviewed insight's do. Without this, a follow-up
   * about a move that was never a card had every board claim deleted.
   */
  anchorLicence?: {
    fens: readonly string[];
    text: string;
    /** The ply of `activeFen`, so a sentence's moves are read as a line from it. */
    activePly?: number;
    /** The anchor's engine line, for numbered moves cited from it. */
    lines?: readonly LicensedLine[];
    /** A verified what-if's numbers, each licensed only beside its own move. */
    evalsByMove?: readonly { eval: string; san: string }[];
  },
  /**
   * Spans a Mastermind validator contradicted in this very reply, when the
   * reply is a draft the pipeline rejected: the referee drops the sentence
   * each one is about.
   */
  flaggedSpans?: readonly string[]
): string {
  if (!context.compactContract) return reply;
  try {
    const input = refereeInputFor(context, activeFen, anchorLicence)!;
    const result = refereeFollowUp({ reply, ...input, flaggedSpans });
    if (result.dropped.length > 0) {
      log.info("followup_referee_dropped", {
        requestId,
        contractId: context.compactContract.contractId,
        sentences: result.sentences,
        dropped: result.dropped.map((d) => d.reason),
      });
    }
    return result.text;
  } catch {
    return reply;
  }
}

/**
 * Everything the follow-up referee is given on a turn but the reply and the
 * flagged spans: what refereeChatReply passes, and what the fielded turn's
 * pre-pass (fieldedTurn.ts) passes, so the two judge alike. Null without a
 * contract.
 */
function refereeInputFor(
  context: Parameters<typeof refereeChatReply>[1],
  activeFen: string,
  anchorLicence?: Parameters<typeof refereeChatReply>[4]
): Omit<FollowUpRefereeInput, "reply" | "flaggedSpans"> | null {
  if (!context.compactContract) return null;
  const evalSource = `${context.compactGameContext ?? ""}\n${anchorLicence?.text ?? ""}`;
  const licensedEvals = Array.from(
    evalSource.matchAll(
      /(?<![A-Za-z0-9.])([+-]\d+(?:\.\d{1,2})?|M[+-]?\d+)(?![A-Za-z0-9.%])/g
    )
  ).map((m) => m[1]);
  return {
    compact: context.compactContract,
    activeFen,
    moveHistory: context.playedMoves ?? [],
    licensedEvals,
    licensedEvalsByMove: anchorLicence?.evalsByMove,
    extraFens: anchorLicence?.fens,
    extraLicensedText: anchorLicence?.text,
    activePly: anchorLicence?.activePly,
    extraLines: anchorLicence?.lines,
  };
}

export async function POST(request: NextRequest) {
  // Wall clock for the whole request: what the player waits for, auth and
  // parsing included. Reported as `timing.elapsedMs` on the fast path.
  const startedAt = Date.now();
  // AI is switched off on purpose (see lib/coach/aiAvailability). Refuse
  // BEFORE any work, auth or spend, and with a code that says "off", not
  // "broken" — the difference decides whether the user retries forever.
  {
    const refusal = await aiRefusal();
    if (refusal) return refusal;
  }
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  // Same `reportFatal` helper as /api/enhanced-analysis: fire a structured
  // Sentry event from each fatal catch block without re-deriving the
  // abort-vs-real-error guard at every site. AbortError is the user
  // closing the connection mid-stream — filter it; everything else
  // (LLMError, FD failures, validator pipeline blowups) gets paged.
  const reportFatal = (
    err: unknown,
    phase: string,
    extra?: Record<string, unknown>
  ) => {
    const e = err instanceof Error ? err : new Error(String(err));
    if (e.name === "AbortError") return;
    logErrorToSentry(err, {
      route: "/api/chat",
      requestId: extractRequestId(request.headers),
      phase,
      ...extra,
    });
  };
  try {
    const body = await request.json();

    const parsed = validateRequest(chatSchema, body);
    if (!parsed.success) return parsed.response;
    const {
      messages,
      contextId,
      userMessage,
      conversationHistory,
      fen: clientFen,
      moveIndex,
      clientEvals: clientEvalsRaw,
      pageActions: pageActionsRaw,
      perspective: perspectiveRaw,
    } = parsed.data;

    // API-key presence is validated inside callLLM(); both Anthropic and
    // OpenAI are accepted, with automatic fallback from one to the other.

    // === FAST PATH: Context-cached follow-up ===
    if (contextId && userMessage) {
      // An order the sending page can carry out itself ("flip the board",
      // "go to move 20": lib/coach/pageActions.ts) is answered here, with no
      // model call, before the context, the anchor and everything after
      // them. Only for a page that said which orders it can do, and only for
      // a whole-message order of one of those kinds; a colour on its own
      // needs the page's own state (is it asking which side?), so it is
      // left to the page. The page reads the words first itself, so this is
      // the backstop for a page whose reading is older than this one; the
      // response carries the order, never words that claim it was done: the
      // page writes its own acknowledgement.
      const pageKinds = readPageTurnKinds(pageActionsRaw);
      if (pageKinds.length > 0) {
        const turn = parsePageTurn(userMessage);
        if (
          turn &&
          pageKinds.includes(pageTurnKind(turn)) &&
          !(
            turn.type === "preference" &&
            turn.preference.kind === "side" &&
            turn.preference.bare
          )
        ) {
          const requestId = extractRequestId(request.headers);
          const timing = {
            elapsedMs: Date.now() - startedAt,
            prepMs: 0,
            llmMs: 0,
            refereeMs: 0,
            retryCount: 0,
          };
          log.info("followup_page_turn", {
            requestId,
            kind: pageTurnKind(turn),
          });
          // Its own branch, so these turns stay out of the follow-up latency medians.
          log.info("chat_fastpath_timing", {
            requestId,
            branch: "page",
            ...timing,
          });
          return NextResponse.json({
            gameAnalysis: {
              analysis: "",
              served: "page",
              ...(turn.type === "action"
                ? { actions: [turn.action] }
                : { preference: turn.preference }),
              cached: false,
              fastPath: true,
              timing,
            },
          });
        }
      }

      const context = getAnalysisContext(contextId);
      if (!context) {
        // Context expired or not found — tell client to fall back to full analysis
        return NextResponse.json(
          {
            error: "context_expired",
            message: "Analysis context expired. Re-analyzing.",
          },
          { status: 404 }
        );
      }

      // System prompt split:
      //   - cached prefix:  context.systemPromptStable (persona-stable across
      //     users who share a personalityId). Falls back to the full joined
      //     systemPrompt for legacy cache entries created before the split
      //     landed.
      //   - uncached suffix: context.systemPromptSuffix (the per-user tail —
      //     username, rating, coaching prefs) + the per-turn condensed game
      //     context. Both vary per call so they ride uncached.
      // When the new fields are absent (legacy contextId) we send everything
      // as the cacheable block — the worst case is just that two users with
      // different names share a cache miss, same behaviour as before.
      // ── Position under discussion ────────────────────────────────────
      // The client sends the FEN currently displayed on its board. Before
      // this, every follow-up was grounded and validated against the
      // analysis-time final position (context.fen) — navigate to move 12,
      // ask "what should I play here?", and the answer (plus all validators)
      // referenced move 40's board. Invalid/absent client FENs fall back to
      // the stored context.
      let activeFen = context.fen;
      if (clientFen) {
        try {
          activeFen = new Chess(clientFen).fen();
        } catch {
          // unparseable client FEN — keep context.fen
        }
      }
      let effectiveMoveIndex = moveIndex;

      const playerColorLetter: "w" | "b" =
        context.playerColor === "b" || context.playerColor === "black"
          ? "b"
          : "w";
      const followUpMode = getFollowUpPromptMode();
      // The fielded mode is the follow-up prompt on every turn it does not
      // field (fieldedFacts.ts), byte for byte.
      const useFollowUpPrompt = followUpMode !== "legacy";
      const fieldedMode = followUpMode === "fielded";
      // COACH_FOLLOWUP_LEAN (pathway 3.2): the follow-up at the bar. Sixty
      // words and a 350-token cap, the review no longer replayed when a
      // contract carries its facts, and no validator retry on this path.
      const lean = useFollowUpPrompt && isFollowUpLean();
      const budget = lean ? FOLLOWUP_LEAN_BUDGET : FOLLOWUP_BUDGET;
      // Lean, with a contract the review's facts ride in the suffix, so the
      // review itself is not replayed, and neither is the turn it answered.
      const reviewReplayed = !(lean && context.compactContract);

      // The side this turn looks at the game from (questionPerspective.ts):
      // the question's words, else the page's standing choice. The player
      // stays "you" whichever it is, so the player's colour is never
      // replaced by it (the anchor block's "the player's move", the
      // referee's "your", the validators' perspective). Only on the
      // follow-up prompt: the legacy prompt's rules are the player's side
      // alone, and its rollback stays byte for byte.
      const keptHistory = keptHistoryTurns(
        conversationHistory,
        context.initialAnalysis,
        useFollowUpPrompt
      );
      const perspectiveOn = useFollowUpPrompt && isPerspectiveEnabled();
      // Confirmed only when the stored tail names the side the context was
      // stored for and does not say it is unconfirmed.
      const sideConfirmed =
        confirmedSideOf(context.systemPromptSuffix) === playerColorLetter;
      const subject: TurnSubject | null = perspectiveOn
        ? resolveTurnSubject({
            message: userMessage,
            field: perspectiveRaw,
            player: playerColorLetter,
            sideConfirmed,
            history: keptHistory
              .filter((m) => m.role === "user")
              .map((m) => m.content as string),
          })
        : null;

      // The move the question names wins over the board the client shows.
      // "Why was 8. Nc7+ a mistake?" asked from the start position used to be
      // grounded, validated and refereed against the start position. The
      // anchor moves everything — facts, pipeline ply, referee boards — to the
      // move in question, and the response tells the client to put that
      // position on the board.
      // Under COACH_PERSPECTIVE the words' owners are read too ("Black's
      // move 20", "my 12th move", "after Black's move 7"), and a bare
      // "move N" is the subject's when the words or the page named it
      // (never the other side's in its place when the words did); a side
      // the history carried leaves it the player's, where the page's own
      // "go to move N" lands.
      const missing: { moveNumber: number; color: "w" | "b" }[] = [];
      let resolvedAnchor = resolveQuestionAnchor(
        userMessage,
        context.playedMoves ?? [],
        playerColorLetter,
        moveIndex,
        perspectiveOn
          ? {
              defaultSide:
                subject && subject.source !== "history" && !subject.yielded
                  ? subject.side
                  : playerColorLetter,
              sideConfirmed,
              strictDefault: subject?.source === "words",
              preferDefaultSide:
                !!subject && subject.source !== "history" && !subject.yielded,
              onMissing: (m) => {
                missing.push(m);
              },
            }
          : undefined
      );
      // "What was Black thinking?" with no move named, while the board
      // shows the game's position after a Black move: that move. Not with
      // a move named (even one never played), a scope ("in the opening",
      // "this whole game"), or a board that is not the game's (an
      // exploration).
      const playedFens = perspectiveOn
        ? fensAlongGame(context.playedMoves ?? [])
        : [];
      const boardIsGames =
        typeof moveIndex === "number" &&
        moveIndex < playedFens.length &&
        samePosition(activeFen, playedFens[moveIndex]);
      if (
        !resolvedAnchor &&
        subject?.source === "words" &&
        /_thinking$/.test(subject.rule) &&
        missing.length === 0 &&
        !namesAMove(userMessage) &&
        THINKING_AT_END_RE.test(userMessage) &&
        boardIsGames &&
        typeof moveIndex === "number" &&
        moveIndex > 0 &&
        ((moveIndex - 1) % 2 === 0 ? "w" : "b") === subject.side
      ) {
        const atCursor = anchorAtIndex(
          context.playedMoves ?? [],
          moveIndex - 1
        );
        if (atCursor) resolvedAnchor = { ...atCursor, matched: "cursor" };
      }
      let anchor = resolvedAnchor;

      // The client's what-if for this question (lib/coach/clientEvals.ts):
      // its own search's numbers for the alternative, the game's move and
      // the review's best there. Verified against the stored game, never
      // trusted; when it holds, the turn is about the move the board shows
      // (the anchor moves to its ply, with the alternative asked about), its
      // lines and numbers are licensed like the review's, and the eval
      // validator checks a claim naming one of its moves against that move.
      let whatIf: VerifiedWhatIf | null = null;
      let clientEvalsOutcome: ClientEvalsOutcome =
        clientEvalsRaw === undefined
          ? { status: "absent" }
          : isWhatIfEvalsEnabled()
            ? { status: "dropped", reason: "shape" }
            : { status: "off" };
      if (clientEvalsRaw !== undefined && isWhatIfEvalsEnabled()) {
        const verdict = verifyClientEvals(clientEvalsRaw, {
          playedMoves: context.playedMoves ?? [],
          gameEval: context.gameEval as never,
        });
        if (!verdict.ok) {
          clientEvalsOutcome = { status: "dropped", reason: verdict.reason };
        } else {
          const asked = verdict.value.moves.find((m) => m.role === "asked")!;
          // The alternative asked about, unless it is the game's own move
          // there ("what about 8. Nc7+?").
          const whatIfAnchor = anchorAtIndex(
            context.playedMoves ?? [],
            verdict.value.index,
            asked.san
          );
          if (!whatIfAnchor) {
            clientEvalsOutcome = {
              status: "dropped",
              reason: "final_position",
            };
          } else {
            whatIf = verdict.value;
            anchor = whatIfAnchor;
            clientEvalsOutcome = {
              status: "verified",
              index: verdict.value.index,
              depth: verdict.value.depth,
            };
          }
        }
      }
      if (anchor) {
        activeFen = anchor.fenAfter;
        effectiveMoveIndex = anchor.ply;
      }
      // A side the page or the history set yields to a move of the
      // player's own the turn is anchored on ("why not Qxc1 instead?" on
      // White's 8th under a Black standing side): the turn is about that
      // move, so it is served about the player, and the echo says so.
      const yielded: "words" | "anchor" | null = subject?.yielded
        ? "words"
        : !!subject &&
            subject.source !== "words" &&
            !!anchor &&
            anchor.color === playerColorLetter
          ? "anchor"
          : null;
      // The other side, when the turn is about it: what changes the facts.
      const otherSide =
        subject && !yielded && subject.side !== playerColorLetter
          ? subject.side
          : null;
      const otherSubject = otherSide
        ? { side: otherSide, confirmed: sideConfirmed }
        : null;
      const promptSubject: FollowUpSubject | null =
        subject && !yielded
          ? {
              side: subject.side,
              player: playerColorLetter,
              confirmed: sideConfirmed,
            }
          : null;
      // What the player is asking for (questionIntent.ts), by rule where a
      // rule can be sure, on the anchor the turn is served on. SHADOW: logged
      // and echoed beside the anchor so the distribution can be measured,
      // and nothing served differently. The classifier below keeps deciding
      // the validators' category.
      const intent = resolveQuestionIntent(userMessage, {
        anchor,
        moves: context.playedMoves ?? [],
        playerColor: playerColorLetter,
      });

      // Per-turn oracle facts for the position under discussion. The system
      // prompt forbids any attack/capture/pin/fork claim not present in a
      // VERIFIED POSITION FACTS block, so one is injected on every turn
      // (audit §3.4). With an anchor, the block is about THAT move: both
      // boards, the relational read, the eval swing, the engine's line and
      // the game's continuation, each narrated ply by ply.
      let perTurnFacts = "";
      let anchorBlock = "";
      // What the referee licenses from the block: the block itself, but
      // without a what-if's search, whose moves are licensed only along
      // their own line (the referee's roots) and whose numbers are passed
      // as they stand, so no other line can borrow its replies.
      let anchorLicenceText = "";
      try {
        if (anchor) {
          anchorBlock = buildAnchorBlock(
            anchor,
            context.playedMoves ?? [],
            context.gameEval as never,
            playerColorLetter,
            whatIf,
            otherSubject
          );
          anchorLicenceText = whatIf
            ? buildAnchorBlock(
                anchor,
                context.playedMoves ?? [],
                context.gameEval as never,
                playerColorLetter,
                null,
                otherSubject
              )
            : anchorBlock;
          const relationalAfter = buildRelationalFacts(anchor.fenAfter).summary;
          perTurnFacts = [
            anchorBlock,
            relationalAfter
              ? `VERIFIED POSITION FACTS after ${anchor.san}:\n${relationalAfter}`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n");
        } else {
          const boardFacts = buildFenPositionFacts(activeFen);
          const relational = buildRelationalFacts(activeFen);
          perTurnFacts = [boardFacts, relational.summary]
            .filter(Boolean)
            .join("\n\n");
        }
      } catch {
        // oracle failure — proceed without per-turn facts (legacy behavior)
      }
      // A turn about the other side that names no move and asks about its
      // mistakes ("from Black's side, what went wrong?"): that side's
      // costliest moments with their lines, first, licensed like an
      // anchored move's, and the board on screen kept below them for
      // reference only.
      let subjectMoments: ReturnType<typeof buildSubjectMomentsBlock> = null;
      try {
        if (
          otherSide &&
          !anchor &&
          !subject!.rule.endsWith("_best") &&
          asksAboutMistakes(userMessage)
        ) {
          subjectMoments = buildSubjectMomentsBlock(
            context,
            otherSide,
            sideConfirmed
          );
          if (subjectMoments)
            perTurnFacts = [
              subjectMoments.text,
              perTurnFacts.replace(
                CURRENT_POSITION_HEADER_RE,
                "## BOARD ON SCREEN (for reference: this turn is about the moments above, not this position. Use these exact facts and never reconstruct the board from the move list.)"
              ),
            ]
              .filter(Boolean)
              .join("\n\n");
        }
      } catch {
        // oracle failure — proceed without per-turn facts (legacy behavior)
      }
      // A move the words name that the side never played ("Black's move
      // 44" in a game White ended on move 44): said, so it is not invented.
      {
        const moves = context.playedMoves ?? [];
        const gone = missing[0];
        // Only for a game that replays from the start: a game set up from
        // a position numbers its moves from another root.
        const replays = playedFens.every(
          (f, i) => i === 0 || f !== playedFens[i - 1]
        );
        if (!anchor && gone && moves.length > 0 && replays) {
          const last = moves.length - 1;
          const lastLabel = `${Math.floor(last / 2) + 1}${last % 2 === 0 ? "." : "..."} ${moves[last]}`;
          perTurnFacts = [
            `${gone.color === "w" ? "White" : "Black"} played no move ${gone.moveNumber}. The game ended after ${lastLabel}.`,
            perTurnFacts,
          ]
            .filter(Boolean)
            .join("\n\n");
        }
      }
      log.info("followup_anchor", {
        requestId: extractRequestId(request.headers),
        matched: anchor?.matched ?? null,
        ply: anchor?.ply ?? null,
        askedSan: anchor?.askedSan ?? null,
        intent: intent.intent,
        intentRule: intent.rule,
        clientEvals: clientEvalsOutcome.status,
        ...(clientEvalsOutcome.status === "dropped"
          ? { clientEvalsReason: clientEvalsOutcome.reason }
          : {}),
        // Where the question's words put the move, when the client's
        // verified what-if put it elsewhere: kept so the two resolvers can
        // be brought together.
        ...(whatIf
          ? {
              wordsPly: resolvedAnchor?.ply ?? null,
              wordsAskedSan: resolvedAnchor?.askedSan ?? null,
            }
          : {}),
        ...(subject
          ? {
              perspective: subject.side,
              perspectiveSource: subject.source,
              perspectiveRule: subject.rule,
              perspectiveVersion: PERSPECTIVE_CLAUSE_VERSION,
              ...(yielded ? { perspectiveYielded: yielded } : {}),
              subjectMoments: subjectMoments
                ? subjectMoments.lines.length
                : null,
            }
          : {}),
        ...(missing.length > 0 ? { missingMove: missing[0] } : {}),
      });

      // PR-CI-6a — follow-up grounding. When the review above was served
      // through the enforced contract path, the SAME facts that survived the
      // referee ride into this turn: engine lines behind each verdict, the
      // tactical vocabulary each insight licenses, and the claim classes a
      // degraded source forbids. Absent (legacy-served review, or a context
      // cached before this landed) it renders to "" and the turn behaves
      // exactly as before.
      // With an anchor the block is focused: the engine line and its story
      // for the move asked about alone, the other findings' verdicts and
      // evals without their lines (followUp.ts, ContractFocus). Live, the
      // other moments' lines were where a borrowed "9...Kxc7" came from.
      // A turn about the other side with no move named withholds every
      // line: the findings are the player's, and their lines were where a
      // borrowed move came from.
      const contractBlock = context.compactContract
        ? renderContractCompact(
            context.compactContract,
            undefined,
            anchor
              ? {
                  moveNumber: anchor.moveNumber,
                  color: anchor.color,
                  ...(whatIf ? { whatIf: true } : {}),
                }
              : otherSide
                ? { subject: otherSide }
                : undefined
          )
        : "";

      // The follow-up prompt (followUpPrompt.ts): the verdict / proof /
      // lesson shape with a word budget, per attitude, cached like turn 1.
      // `COACH_FOLLOWUP_PROMPT=legacy` puts the turn-1 prompt back here.
      // A turn about one move under COACH_FOLLOWUP_PROMPT=fielded is answered
      // as the moment envelope (fieldedTurn.ts); every other turn, and every
      // turn in any other mode, as before.
      const fieldedPlan = fieldedMode
        ? planFieldedTurn({
            anchor,
            otherSide,
            compact: context.compactContract,
            question: userMessage,
            playedMoves: context.playedMoves ?? [],
            gameEval: context.gameEval as never,
            playerColor: playerColorLetter,
            whatIf,
          })
        : null;
      const fielded = fieldedPlan?.eligible ? fieldedPlan.facts : null;
      if (fieldedPlan && !fieldedPlan.eligible)
        log.info("followup_fielded", {
          requestId: extractRequestId(request.headers),
          version: FIELDED_PROMPT_VERSION,
          eligible: false,
          reason: fieldedPlan.reason,
        });
      const personality = context.personalityId ?? "friendly";
      const cachedSystemPrompt = fielded
        ? getFieldedFollowUpSystemPromptStable(personality, budget)
        : useFollowUpPrompt
          ? getFollowUpSystemPromptStable(personality, budget)
          : (context.systemPromptStable ?? context.systemPrompt);
      // Half-moves of the position under discussion, for the windowed table.
      const centerPly = anchor
        ? anchor.ply
        : typeof moveIndex === "number"
          ? moveIndex
          : null;
      const condensedContext = [
        useFollowUpPrompt
          ? buildFollowUpCondensedContext(
              context,
              centerPly,
              otherSubject,
              reviewReplayed
            )
          : buildCondensedContext(context),
        contractBlock,
        perTurnFacts,
        // T3 option A: this turn made no fresh external lookups — the prompt
        // says so instead of letting the model invent book/tablebase/level
        // claims. Decision + the measurement behind it live with the constant.
        FOLLOWUP_REDUCED_GROUNDING_NOTE,
      ]
        .filter(Boolean)
        .join("\n\n");
      // A turn about the other side: the stored tail's "always analyze from
      // the player's side" line says this turn looks from the other, and
      // the clause after it (followUpPrompt.ts) turns the cached prompt's
      // "coach the side named in USER CONTEXT" for this answer. Neither is
      // there on any other turn.
      const perUserTail =
        otherSide && context.systemPromptSuffix
          ? softenPerspectiveLine(context.systemPromptSuffix, otherSide)
          : (context.systemPromptSuffix ?? "");
      const subjectClause =
        otherSide && promptSubject ? followUpSubjectClause(promptSubject) : "";
      const uncachedSuffix =
        useFollowUpPrompt || context.systemPromptStable
          ? `${perUserTail}${subjectClause ? `\n\n${subjectClause}` : ""}\n\n${condensedContext}`.trim()
          : condensedContext;
      // Output cap. The follow-up prompt budgets FOLLOWUP_WORD_BUDGET words;
      // the cap is several times that so only a runaway answer is ever cut
      // mid-sentence.
      const outputCap = useFollowUpPrompt ? budget.maxTokens : 3000;

      const nonSystemMessages: LLMMessage[] = [];

      // The initial deep analysis as the first assistant message — gives the
      // LLM full continuity without re-sending the raw game data.
      // Lean, with a contract the review's facts ride in the suffix, so the
      // review itself is not replayed (and the de-dupe below keeps the
      // client's copy out of the history too).
      if (reviewReplayed)
        nonSystemMessages.push({
          role: "assistant",
          content: context.initialAnalysis,
        });

      // Prior conversation turns (excluding the initial analysis which is
      // already injected above); see keptHistoryTurns.
      nonSystemMessages.push(
        ...(reviewReplayed
          ? keptHistory
          : keptHistoryTurns(
              conversationHistory,
              context.initialAnalysis,
              useFollowUpPrompt,
              true
            ))
      );

      // The player's question, with the budget under it on the follow-up
      // path (followUpPrompt.ts): the model's copy of the turn only. The
      // transcript the client keeps, the anchor and the referee all see the
      // question as typed.
      const v1Question = useFollowUpPrompt
        ? `${userMessage}\n\n${followUpTurnReminder(userMessage, promptSubject, budget)}`
        : userMessage;
      nonSystemMessages.push({
        role: "user",
        content: fielded
          ? `${userMessage}\n\n${fieldedTurnReminder(fielded, promptSubject, budget)}`
          : v1Question,
      });

      const systemText = cachedSystemPrompt;
      // What the client needs to put the discussed position on the board,
      // and what the referee needs to license claims about it.
      const anchorFields = {
        ...(anchor
          ? {
              anchor: {
                ply: anchor.ply,
                moveNumber: anchor.moveNumber,
                color: anchor.color,
                san: anchor.san,
                ...(anchor.askedSan ? { askedSan: anchor.askedSan } : {}),
              },
            }
          : {}),
        // The shadow router's reading of the question; the client ignores it
        // today, and the synthetic tester can count it.
        intent,
        followUpPrompt: fielded
          ? FIELDED_PROMPT_VERSION
          : useFollowUpPrompt
            ? FOLLOWUP_PROMPT_VERSION
            : "legacy",
        // The budget the prompt stated, only when it is not the default.
        ...(lean ? { followUpBudget: "lean" } : {}),
        // What happened to the client's what-if numbers; the client ignores
        // it, the synthetic tester and the logs read it.
        clientEvals: clientEvalsOutcome,
        // The side the turn looked at the game from, when one was in
        // effect; absent otherwise, so an ordinary response is unchanged.
        ...(subject
          ? {
              perspective: {
                side: subject.side,
                source: subject.source,
                rule: subject.rule,
                version: PERSPECTIVE_CLAUSE_VERSION,
                ...(yielded ? { yielded } : {}),
              },
            }
          : {}),
      };
      const altFen = anchor ? anchorAlternativeFen(anchor) : null;
      const anchorLicence = anchor
        ? {
            fens: [
              anchor.fenBefore,
              anchor.fenAfter,
              ...(altFen ? [altFen] : []),
            ],
            text: anchorLicenceText,
            activePly: anchor.ply,
            lines: [
              ...anchorLicensedLines(anchor, context.gameEval as never),
              ...(whatIf ? whatIfLicensedLines(whatIf) : []),
            ],
            evalsByMove: whatIf ? whatIfLicensedEvals(whatIf) : [],
          }
        : subjectMoments
          ? {
              fens: subjectMoments.fens,
              text: subjectMoments.licenceText,
              activePly:
                typeof effectiveMoveIndex === "number"
                  ? effectiveMoveIndex
                  : undefined,
              lines: subjectMoments.lines,
            }
          : {
              fens: [],
              text: "",
              activePly:
                typeof effectiveMoveIndex === "number"
                  ? effectiveMoveIndex
                  : undefined,
            };

      // The fielded turn's two requests: its own (the fielded system prompt,
      // reminder and schema on the v1 request), and the v1 request on the
      // same turn, for a reply it cannot read at all. Its referee pre-pass
      // gets the second net's very inputs and logs nothing.
      const fieldedRequest: CallLLMOptions | null = fielded
        ? {
            tier: "fast",
            system: systemText,
            systemSuffix: uncachedSuffix,
            messages: nonSystemMessages,
            temperature: 0.7,
            maxTokens: outputCap,
            cacheSystem: true,
            outputSchema: MOMENT_OUTPUT_SCHEMA,
          }
        : null;
      const v1Request: CallLLMOptions | null = fielded
        ? {
            tier: "fast",
            system: getFollowUpSystemPromptStable(personality, budget),
            systemSuffix: uncachedSuffix,
            messages: [
              ...nonSystemMessages.slice(0, -1),
              { role: "user", content: v1Question },
            ],
            temperature: 0.7,
            maxTokens: outputCap,
            cacheSystem: true,
          }
        : null;
      const fieldedRefereeInput = fielded
        ? refereeInputFor(context, activeFen, anchorLicence)
        : null;
      const fieldedReferee = (text: string) =>
        refereeFollowUp({ reply: text, ...fieldedRefereeInput! });

      // Stage B insertion (§3.7.9 chat-equivalent of A): single env read.
      const { validatorsEnabled } = getMastermindEnv();
      const requestId = extractRequestId(request.headers);
      // The fielded turn's log line: content-free, on both wings.
      const logFielded = (
        branch: "pipeline" | "flag-off",
        out: FieldedTurnResult | undefined,
        timedOut = false
      ) => {
        if (!fielded) return;
        log.info("followup_fielded", {
          requestId,
          branch,
          version: FIELDED_PROMPT_VERSION,
          ...(lean ? { lean: true } : {}),
          eligible: true,
          turnKind: fielded.reviewed ? "reviewed" : "unreviewed",
          whatIf: !!whatIf,
          ...(out ? out.counter : {}),
          served: timedOut ? "timeout" : (out?.served ?? "none"),
        });
      };

      // ── Stage B flag-on wing for /api/chat fast path ────────────────
      // Per §3.4: chat path uses degraded mode (no scout — chat fast-path
      // has no opponent context; userHistory stays enabled for
      // improvement_strategy / meta_motivational follow-ups).
      // Per Q3 ratified default: no-contextId fallback path stays
      // unchanged (handled outside this block).
      if (validatorsEnabled) {
        const playerPerspective: "white" | "black" =
          context.playerColor === "b" || context.playerColor === "black"
            ? "black"
            : "white";
        // Anchor the pipeline to the viewed ply when the client supplies
        // moveIndex (position after half-move k = gameEval.positions[k], so
        // slicing the history to k keeps eval indexing aligned). Without it,
        // the pipeline stays last-move-anchored (legacy behavior).
        const effectiveMoveHistory =
          typeof effectiveMoveIndex === "number" &&
          Array.isArray(context.playedMoves) &&
          effectiveMoveIndex <= context.playedMoves.length
            ? context.playedMoves.slice(0, effectiveMoveIndex)
            : context.playedMoves;
        const prep = await prepareMastermindContext({
          userMessage,
          moveHistory: effectiveMoveHistory,
          fen: activeFen,
          // (γ-route, 2026-05-23): gameEval is now persisted into
          // AnalysisContext at /api/enhanced-analysis store-sites and
          // threaded through here. Legacy cache entries created before
          // this change have gameEval: undefined; in that case the (β)
          // skip path in validateEvalClaim emits a no_stockfish_eval
          // telemetry event rather than firing false-positive
          // eval_mismatch_* events.
          gameEval: context.gameEval,
          playerPerspective,
          correlationId: requestId,
          uid: guard.session.uid,
          // analysisContext doesn't carry a userName today — fall back
          // to session uid for detectUserColor matching (single-identifier
          // MVP per Stage A.7 detectUserColor design).
          userName: guard.session.uid,
          // §3.4: skip scout in chat fast-path; opponent context isn't
          // typically set on chat requests.
          opponentUsername: undefined,
          opponentPlatform: undefined,
        });

        if (prep.dataSources) {
          // Capture narrowed dataSources locally so the factory closure
          // below preserves the non-null type (TS loses control-flow
          // narrowing across function boundaries).
          const dataSources = prep.dataSources;
          const pipelineStartedAt = Date.now();
          // The v1 pipeline on this turn, for the v1 request or, when the
          // fielded reply could not be read, for the v1 request that answers
          // it instead.
          const pipelineFor = (
            initialRequest: CallLLMOptions,
            signal: AbortSignal
          ) =>
            runValidationPipeline({
              initialRequest,
              stockfishEval: prep.moveCtx.stockfishEval,
              positionEvals: whatIf
                ? whatIf.moves.map((m) => ({
                    san: m.san,
                    cp: m.cp,
                    mate: m.mate,
                    review: m.review,
                    moveNumber: whatIf!.moveNumber,
                    color: whatIf!.color,
                    // A bare "Qxc1" is this move only when the game
                    // never played that SAN at another ply.
                    playedElsewhere: (context.playedMoves ?? []).some(
                      (san, k) =>
                        k !== whatIf!.index &&
                        san.replace(/[+#]/g, "") === m.san.replace(/[+#]/g, "")
                    ),
                  }))
                : undefined,
              featureDelta: dataSources.featureDelta,
              pieceRoleDiff: dataSources.pieceRoleDiff,
              threatTree: dataSources.threatTree,
              playerPerspective,
              fen: prep.moveCtx.fenAfter,
              moveSan: prep.moveCtx.moveSan,
              correlationId: requestId,
              category: prep.category,
              // §10.4 + §3.4: chat retry budget is tighter than
              // enhanced-analysis (1 retry max) to keep follow-up
              // latency in chat tolerance; none at the bar (lean).
              maxRetries: lean ? 0 : 1,
              dataSources: {
                scout: dataSources.scout,
                userHistory: dataSources.userHistory,
              },
              signal,
            });
          let pipelineResult: PipelineResultWithTimeout;
          // The fielded turn, run in the pipeline's place inside the same
          // timeout race; read back only when the race did not time out.
          const fieldedBox: { out?: FieldedTurnResult } = {};
          try {
            pipelineResult = await withPipelineTimeout(
              (signal) =>
                fielded && fieldedRequest && v1Request
                  ? runFieldedTurn({
                      request: fieldedRequest,
                      v1Request,
                      fx: fielded,
                      referee: fieldedReferee,
                      callLLM,
                      signal,
                      checkProse: fieldedProseValidator({
                        dataSources,
                        correlationId: requestId,
                      }),
                      budget: lean ? budget : undefined,
                      deferV1: true,
                    }).then((out) => {
                      fieldedBox.out = out;
                      // A reply with no object to read is answered by the
                      // v1 request, checked by the v1 pipeline as any v1
                      // turn is; call 1's cost rides on its total.
                      if (out.served === "v1_fallback")
                        return pipelineFor(v1Request, signal).then((r) => ({
                          ...r,
                          totalCostUsd:
                            r.totalCostUsd + fieldedCallsCostUsd(out),
                        }));
                      return fieldedAsRegenerateResult(out, {
                        correlationId: requestId,
                        fen: fielded.fenAfter,
                        moveSan: fielded.label,
                        playerPerspective,
                      });
                    })
                  : pipelineFor(
                      {
                        tier: "fast",
                        system: systemText,
                        systemSuffix: uncachedSuffix,
                        messages: nonSystemMessages,
                        temperature: 0.7,
                        maxTokens: outputCap,
                        cacheSystem: true,
                      },
                      signal
                    ),
              {
                correlationId: requestId,
                timeoutMs: readPipelineTimeoutMs(prep.category),
                fallbackResponse:
                  "Still thinking — the deep-validation pass took longer than expected. Try asking again.",
              }
            );
          } catch (err) {
            const e = err instanceof LLMError ? err : new Error(String(err));
            log.error("Mastermind pipeline failed for chat", {
              message: e.message,
            });
            reportFatal(err, "non-stream:mastermind-pipeline");
            return NextResponse.json(
              { error: PUBLIC_LLM_ERROR.message, code: PUBLIC_LLM_ERROR.code },
              { status: 502 }
            );
          }

          // The pipeline's fallback is a template about the position ("What
          // changed: … What to look at: …") that answers no question. It was
          // built for the review, where a template beats a hallucinated
          // card. The follow-up reply has a sentence-level referee of its
          // own, so when the validators rejected the model's draft the draft
          // is served instead, minus every sentence a validator contradicted
          // (the spans ride with the issues), and the referee licenses the
          // rest. A pipeline that timed out or never got a draft, the legacy
          // prompt, and a context with no contract to referee against still
          // serve the template. Live (2026-09-26) the template stood in for
          // two of six answers.
          const pipelineMs = Date.now() - pipelineStartedAt;
          const isFallbackUsed =
            pipelineResult.finalOutcome === "fallback_used";
          const draft =
            useFollowUpPrompt &&
            isFallbackUsed &&
            !pipelineResult.timedOut &&
            context.compactContract
              ? pipelineResult.lastDraft
              : undefined;
          const fieldedOut = pipelineResult.timedOut
            ? undefined
            : fieldedBox.out;
          const flaggedSpans = draft
            ? pipelineResult.cumulativeIssues
                .filter((i) => i.severity === "error")
                .map((i) => i.llm_span)
                .filter((span) => typeof span === "string" && span.length > 0)
            : fieldedOut?.flaggedSpans;
          if (draft) {
            log.info("followup_draft_served", {
              requestId,
              retryCount: pipelineResult.retryCount,
              issues: pipelineResult.cumulativeIssues.map((i) => i.check_name),
            });
          }
          const rawContent =
            draft ||
            pipelineResult.finalResponse ||
            "I couldn't generate a response.";
          const validation = validateOnBoards(
            rawContent,
            activeFen,
            subjectMoments?.fens ?? []
          );

          forwardPipelineTelemetryForRoute({
            pipelineResult,
            dataSources: prep.dataSources,
            category: prep.category,
            routeKind: "/api/chat",
            userId: guard.session.uid,
            sessionId: contextId,
            responseId: requestId,
          });

          // 2026-05-26 fix-game-review-false-positives: chess.js
          // disclaimer skipped for non-position-anchored categories
          // (mirrors enhanced-analysis flag-on behavior). The validator
          // still runs above for observability (logged via validation
          // object); we just don't annotate user-visible prose with the
          // generic "may be inaccurate" footnote when false positives
          // are systematic.
          //
          // 2026-05-30 fix-fallback-prose-disclaimer: extend the gate to
          // also suppress on `pipelineResult.finalOutcome === "fallback_used"`.
          // buildFallbackResponse prose cites pre-move position state by
          // design (role changes from featureDelta), while validateAIResponse
          // checks against post-move FEN → systematic false positive.
          const servedTemplate = isFallbackUsed && !draft;
          // A fielded answer's fields are checked one by one: a field that
          // failed is gone, never hedged with the validator's footnote.
          const usePositionAnchoredAnnotation =
            !servedTemplate &&
            POSITION_ANCHORED_VALIDATOR_CATEGORIES.has(prep.category) &&
            fieldedOut?.served !== "fielded";
          const refereeStartedAt = Date.now();
          const analysis = refereeChatReply(
            usePositionAnchoredAnnotation && !validation.isValid
              ? validation.correctedResponse
              : rawContent,
            context,
            activeFen,
            requestId,
            anchorLicence,
            flaggedSpans
          );
          // Where the follow-up's time went. The response is not streamed,
          // so elapsedMs is also the time to the first byte the client sees;
          // llmMs covers the pipeline's generate / validate / regenerate.
          const timing = {
            elapsedMs: Date.now() - startedAt,
            prepMs: prep.prepMs,
            llmMs: pipelineMs,
            refereeMs: Date.now() - refereeStartedAt,
            retryCount: pipelineResult.retryCount,
          };
          logFielded("pipeline", fieldedOut, pipelineResult.timedOut);
          // The relational parser over the two prose lines, after the
          // response, counted and never acted on.
          if (
            fielded &&
            fieldedOut?.served === "fielded" &&
            fieldedOut.envelope1
          ) {
            const env1 = fieldedOut.envelope1;
            deferRelationalShadow({
              idea: env1.idea,
              happens: env1.happens,
              fen: fielded.fenAfter,
              correlationId: requestId,
              onDone: (r) =>
                log.info("followup_fielded_relational", { requestId, ...r }),
            });
          }
          log.info("chat_fastpath_timing", {
            requestId,
            branch: "pipeline",
            ...(lean ? { lean: true } : {}),
            category: prep.category,
            finalOutcome: pipelineResult.finalOutcome,
            timedOut: pipelineResult.timedOut,
            classifierCostUsd: prep.classifierCostUsd,
            ...timing,
          });
          const moment = servedMoment(fieldedOut, analysis);
          return NextResponse.json({
            gameAnalysis: {
              analysis,
              position: activeFen,
              ...anchorFields,
              // The prompt that wrote the answer: v1's when the fielded
              // reply could not be read.
              ...(fieldedOut?.served === "v1_fallback"
                ? { followUpPrompt: FOLLOWUP_PROMPT_VERSION }
                : {}),
              ...(moment ? { moment } : {}),
              validationScore: validation.score,
              cached: false,
              fastPath: true,
              timing,
              pipeline: {
                finalOutcome: pipelineResult.finalOutcome,
                retryCount: pipelineResult.retryCount,
                // The classifier's own call, beside the pipeline's total so
                // neither number changes meaning.
                classifierCostUsd: prep.classifierCostUsd,
                // True when the validators' rejected draft was served,
                // refereed, in place of the template.
                servedDraft: !!draft,
                totalCostUsd: pipelineResult.totalCostUsd,
                category: prep.category,
                classifierConfidence: prep.classifierConfidence,
                prepMs: prep.prepMs,
                timedOut: pipelineResult.timedOut,
                // Stage C telemetry expose (Follow-up B, 2026-05-23): preview
                // env only. Mirrors the /api/enhanced-analysis extension from
                // Follow-up A. Production responses do not include the
                // telemetry array — events still emit through the structured
                // logger to Vercel Log Drain on every env.
                ...(process.env.VERCEL_ENV === "preview"
                  ? { telemetry: pipelineResult.telemetry }
                  : {}),
              },
            },
          });
        }
        // prep.dataSources === null → FD failure; fall through to flag-off
        // callLLM below for this turn (§3.2 contract).
      }

      // Fast tier (Haiku primary, gpt-4o-mini fallback)
      // maxTokens here is the OUTPUT cap; raised so answers about long games
      // (many moves discussed) don't get truncated mid-explanation.
      let llmResult;
      let fieldedOut: FieldedTurnResult | undefined;
      try {
        if (fielded && fieldedRequest && v1Request) {
          fieldedOut = await runFieldedTurn({
            request: fieldedRequest,
            v1Request,
            fx: fielded,
            referee: fieldedReferee,
            callLLM,
            budget: lean ? budget : undefined,
          });
          llmResult = fieldedOut.calls[fieldedOut.calls.length - 1];
        } else {
          llmResult = await callLLM({
            tier: "fast",
            system: systemText,
            systemSuffix: uncachedSuffix,
            messages: nonSystemMessages,
            temperature: 0.7,
            maxTokens: outputCap,
            cacheSystem: true,
          });
        }
      } catch (err) {
        const e = toSafeLLMError(err);
        console.error("LLM chat call failed:", e.message);
        reportFatal(e, "non-stream:fast-path", {
          provider: e instanceof LLMError ? e.provider : undefined,
          status: e instanceof LLMError ? e.status : undefined,
        });
        return NextResponse.json(
          { error: PUBLIC_LLM_ERROR.message, code: PUBLIC_LLM_ERROR.code },
          { status: 502 }
        );
      }
      if (fieldedOut) fieldedOut.calls.forEach((c) => recordLLMCall(c));
      else recordLLMCall(llmResult);
      const rawContent =
        (fieldedOut ? fieldedOut.text : llmResult.content) ||
        "I couldn't generate a response.";

      // Light validation against the position under discussion
      const validation = validateOnBoards(
        rawContent,
        activeFen,
        subjectMoments?.fens ?? []
      );

      const refereeStartedAt = Date.now();
      const analysis = refereeChatReply(
        validation.isValid || fieldedOut?.served === "fielded"
          ? rawContent
          : validation.correctedResponse,
        context,
        activeFen,
        requestId,
        anchorLicence,
        fieldedOut?.flaggedSpans
      );
      // Same shape as the pipeline branch. No prep ran here (the classifier
      // and the data fetch belong to the validators), so prepMs is 0.
      const timing = {
        elapsedMs: Date.now() - startedAt,
        prepMs: 0,
        llmMs: fieldedOut
          ? fieldedOut.calls.reduce((sum, c) => sum + c.elapsedMs, 0)
          : llmResult.elapsedMs,
        refereeMs: Date.now() - refereeStartedAt,
        retryCount: fieldedOut?.retryCount ?? 0,
      };
      logFielded("flag-off", fieldedOut);
      log.info("chat_fastpath_timing", {
        requestId,
        branch: "flag-off",
        ...(lean ? { lean: true } : {}),
        provider: fieldedOut
          ? fieldedOut.calls[0].provider
          : llmResult.provider,
        ...timing,
      });

      const moment = servedMoment(fieldedOut, analysis);
      return NextResponse.json({
        gameAnalysis: {
          analysis,
          position: activeFen,
          ...anchorFields,
          ...(fieldedOut?.served === "v1_fallback"
            ? { followUpPrompt: FOLLOWUP_PROMPT_VERSION }
            : {}),
          ...(moment ? { moment } : {}),
          validationScore: validation.score,
          cached: false,
          fastPath: true,
          timing,
        },
      });
    }

    // === FALLBACK: Plain passthrough (no context) ===
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 }
      );
    }

    // Separate system messages from user/assistant messages for the unified provider
    const fallbackSystem = messages
      .filter((m: { role: string }) => m.role === "system")
      .map((m: { content: string }) => m.content)
      .join("\n\n");
    const fallbackMessages: LLMMessage[] = messages
      .filter(
        (m: { role: string }) => m.role === "user" || m.role === "assistant"
      )
      .map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // Opt-in SSE streaming. When ?stream=1 is set on the URL, the fallback
    // path streams text deltas from Anthropic (or falls back to OpenAI as a
    // single-chunk pseudo-stream). Existing JSON callers unaffected.
    const wantsStream = request.nextUrl.searchParams.get("stream") === "1";

    const fbCallOptions = {
      tier: "fast" as const,
      system: fallbackSystem || "You are a helpful chess coach.",
      messages:
        fallbackMessages.length > 0
          ? fallbackMessages
          : ([{ role: "user", content: "Hello" }] as LLMMessage[]),
      // Clamp to Anthropic's valid range [0, 1]. chatSchema accepts up to 2
      // (OpenAI's range); forwarding 1.5 to Anthropic 400s the request, which
      // is a user-facing failure in single-provider mode (audit §3.8).
      temperature: Math.max(0, Math.min(1, parsed.data.temperature ?? 0.7)),
      // Clamped for the same reason as temperature above, one line later than
      // it should have been: max_tokens is the OUTPUT budget, chatSchema lets
      // a client ask for 16000, and this forwarded it verbatim — so the caller
      // set its own bill. 3000 is the server's own budget everywhere else on
      // this route; a client asking for less (InlinePuzzleCoach sends 800)
      // still gets what it asked for.
      maxTokens: Math.min(parsed.data.max_tokens ?? 3000, 3000),
    };

    if (wantsStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const ev of callLLMStream(fbCallOptions)) {
              const payload =
                ev.type === "text"
                  ? { type: "text", delta: ev.delta }
                  : { type: "done" };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
              );
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch (err) {
            const e = toSafeLLMError(err);
            console.error("LLM stream call failed:", e.message);
            reportFatal(e, "stream:fallback");
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "error", error: PUBLIC_LLM_ERROR.message, code: PUBLIC_LLM_ERROR.code })}\n\n`
              )
            );
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    let fbResult;
    try {
      fbResult = await callLLM(fbCallOptions);
    } catch (err) {
      const e = toSafeLLMError(err);
      console.error("LLM fallback call failed:", e.message);
      reportFatal(e, "non-stream:fallback", {
        provider: e instanceof LLMError ? e.provider : undefined,
        status: e instanceof LLMError ? e.status : undefined,
      });
      return NextResponse.json(
        { error: PUBLIC_LLM_ERROR.message, code: PUBLIC_LLM_ERROR.code },
        { status: 502 }
      );
    }

    recordLLMCall(fbResult);
    // Return in OpenAI-compatible format so the client doesn't need changes
    return NextResponse.json({
      choices: [
        { message: { role: "assistant", content: fbResult.content || "" } },
      ],
    });
  } catch (error) {
    console.error("Chat API error:", error);
    reportFatal(error, "non-stream:uncaught");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
