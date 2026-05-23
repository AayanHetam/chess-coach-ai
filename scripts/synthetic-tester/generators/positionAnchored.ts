/**
 * Position-anchored generator — wraps the existing checkpoint pipeline
 * for game_review + position_analysis. Reuses run.ts's existing persona
 * pool (confused_beginner / curious_advanced / hinglish_learner /
 * tilted_intermediate / trick_questioner) since each persona's category-
 * aware addendum (Step 2.3.1) tells them how to frame for game_review vs
 * position_analysis.
 *
 * The harness's run.ts main loop already builds the position context;
 * this generator just composes it into a user-prompt and dispatches the
 * LLM call.
 */

import type { Generator, PositionAnchorContext } from "./index";

const GAME_REVIEW_TEMPLATE = (ctx: PositionAnchorContext) => [
  `Game: ${ctx.gameId}`,
  `Recent moves: ${ctx.recentSan}`,
  `FEN after last move: ${ctx.fenAfter}`,
  `Engine classification of the last move: ${ctx.classification}`,
  "",
  "The chess coach has given you this analysis of the game:",
  ctx.initialAnalysis.slice(0, 1200),
  "",
  `# Framing: game_review`,
  "Anchor your question on a SPECIFIC move number you've been told was a mistake or blunder. Reference the move directly.",
  "Reply with ONE question/comment in your persona's voice. Reply with ONLY the message text.",
].join("\n");

const POSITION_ANALYSIS_TEMPLATE = (ctx: PositionAnchorContext) => [
  `Game: ${ctx.gameId}`,
  `Recent moves: ${ctx.recentSan}`,
  `FEN of current position: ${ctx.fenAfter}`,
  `Side to move: ${ctx.fenAfter.split(" ")[1] === "w" ? "White" : "Black"}`,
  "",
  "The chess coach has given you this analysis of the position:",
  ctx.initialAnalysis.slice(0, 1200),
  "",
  `# Framing: position_analysis`,
  "Ask about the PRESENT position — threats, candidate moves, structural features, safety of pieces. Do NOT reference past moves as mistakes; focus on what the side to move should consider.",
  "Reply with ONE question/comment in your persona's voice. Reply with ONLY the message text.",
].join("\n");

export const positionAnchoredGenerator: Generator = async (ctx) => {
  if (!ctx.persona || !ctx.fenAfter || !ctx.initialAnalysis) {
    throw new Error(
      "positionAnchoredGenerator: missing persona / fenAfter / initialAnalysis context",
    );
  }
  const sub = ctx.subcategory ?? (ctx.category === "game_review" ? "game_review" : "position_analysis");
  const fullCtx: PositionAnchorContext = {
    fenAfter: ctx.fenAfter,
    fenBefore: ctx.fenBefore,
    moveHistory: ctx.moveHistory ?? [],
    gameEval: ctx.gameEval as PositionAnchorContext["gameEval"],
    playerColor: ctx.playerColor ?? "w",
    recentSan: ctx.recentSan ?? "",
    classification: ctx.classification ?? "unknown",
    initialAnalysis: ctx.initialAnalysis,
    persona: ctx.persona,
    subcategory: sub,
    gameId: ctx.gameId ?? "(unknown game)",
  };

  const personaPrompt = ctx.personas[ctx.persona];
  if (!personaPrompt) {
    throw new Error(`positionAnchoredGenerator: persona ${ctx.persona} not loaded`);
  }
  const userPrompt = sub === "game_review"
    ? GAME_REVIEW_TEMPLATE(fullCtx)
    : POSITION_ANALYSIS_TEMPLATE(fullCtx);

  const res = await ctx.llmCall({
    systemPrompt: personaPrompt,
    userPrompt,
    generatorTag: `positionAnchored:${sub}`,
  });
  if (!res.ok) {
    throw new Error(
      `positionAnchoredGenerator LLM call failed: ${res.errorMessage || "unknown error"}`,
    );
  }

  return {
    question: res.text,
    personaUsed: ctx.persona,
    bodyExtensions: {
      // No extensions — the existing moveHistory + fen + gameEval body
      // fields cover position_anchored cases.
    },
    metadata: {
      subcategory: sub,
      gameId: fullCtx.gameId,
      fenAfter: fullCtx.fenAfter,
      classification: fullCtx.classification,
    },
  };
};
