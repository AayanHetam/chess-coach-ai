/**
 * opponent_prep generator. Picks an opponent fixture (real or stub),
 * composes the prep-context block, calls the opponent_prep_seeker
 * persona to generate the student question. Returns bodyExtensions
 * with opponentUsername + opponentPlatform so the harness's POST to
 * /api/enhanced-analysis carries the right fields.
 *
 * Real fixtures exercise the live scoutFetch integration; stub
 * fixtures test the no-Scout-data degraded path (coach should NOT
 * fabricate tendencies for an unknown opponent).
 */

import { type Generator, pickOne } from "./index";

const PERSONA_NAME = "opponent_prep_seeker";

export const opponentPrepGenerator: Generator = async (ctx) => {
  const personaPrompt = ctx.personas[PERSONA_NAME];
  if (!personaPrompt) {
    throw new Error(
      `opponentPrepGenerator: ${PERSONA_NAME} persona not loaded — check scripts/synthetic-tester/personas/`,
    );
  }
  if (ctx.fixtures.opponents.length === 0) {
    throw new Error("opponentPrepGenerator: opponents fixture is empty");
  }

  const opp = pickOne(ctx.rng, ctx.fixtures.opponents);

  const userPrompt = [
    `Upcoming opponent: ${opp.username}`,
    `Platform: ${opp.platform}`,
    `Profile: ${opp.profile_summary}`,
    `Scout data availability: ${opp.expected_scout === "has_data" ? "has live Scout profile" : "no Scout profile available"}`,
    "",
    "Ask ONE specific prep question about this opponent, in the opponent_prep_seeker persona's voice.",
    "Reply with ONLY the message text.",
  ].join("\n");

  const res = await ctx.llmCall({
    systemPrompt: personaPrompt,
    userPrompt,
    generatorTag: "opponentPrep",
  });
  if (!res.ok) {
    throw new Error(
      `opponentPrepGenerator LLM call failed: ${res.errorMessage || "unknown error"}`,
    );
  }

  return {
    question: res.text,
    personaUsed: PERSONA_NAME,
    bodyExtensions: {
      opponentUsername: opp.username,
      opponentPlatform: opp.platform,
    },
    metadata: {
      fixture_id: opp.fixture_id,
      handle_kind: opp.handle_kind,
      expected_scout: opp.expected_scout,
    },
  };
};
