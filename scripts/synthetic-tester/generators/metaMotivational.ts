/**
 * meta_motivational generator. Three context flavors per O3 ratification:
 *   - 40% performance trajectory (cold context, plateau / improvement framing)
 *   - 30% loss-anchored (a 1-line specific recent loss attached)
 *   - 30% existential (no chess context — questions about chess itself)
 *
 * Picks the register via weighted RNG, builds the matching context for
 * the reflective_learner persona, and dispatches the LLM call. Sets
 * bodyExtensions.username when trajectory/loss flavors fire (the route's
 * flag-on user-history fetch is still relevant for these — meta_
 * motivational's primary citation source is user_history per
 * citationRate's CATEGORY_PRIMARY_SOURCE mapping).
 */

import { type Generator, pickOne, weightedPick } from "./index";

const PERSONA_NAME = "reflective_learner";

type Register = "trajectory" | "loss" | "existential";

function pickRegister(rng: () => number): Register {
  return weightedPick<Register>(rng, [
    { value: "trajectory", weight: 4 },
    { value: "loss", weight: 3 },
    { value: "existential", weight: 3 },
  ]);
}

function buildTrajectoryContext(): string {
  return [
    "# Context flavor: performance trajectory (cold context)",
    "You are reflecting on your recent chess journey at a high level — no specific game, no specific opponent.",
    "Possible framings: plateau (stuck at a rating for months), suspected improvement-or-not, time-commitment question, what 'improving at chess' even means.",
    "",
    "Ask ONE reflective question in the trajectory flavor, in the reflective_learner persona's voice.",
    "Reply with ONLY the message text.",
  ].join("\n");
}

function buildLossContext(lossText: string): string {
  return [
    "# Context flavor: loss-anchored",
    "You played a game recently and lost (or drew when you should have won). Reflecting on it now.",
    "",
    "The specific game: " + lossText,
    "",
    "Ask ONE reflective question anchored on this loss, in the reflective_learner persona's voice.",
    "The question should touch on the emotional / habit angle rather than just the chess mechanics.",
    "Reply with ONLY the message text.",
  ].join("\n");
}

function buildExistentialContext(): string {
  return [
    "# Context flavor: existential",
    "You are musing about chess itself as an activity — not your performance, not a specific game. Pure 'why am I doing this' framing.",
    "Possible angles: boredom with theory, repetitiveness, meaning, whether time spent on chess is worth it, comparisons to other pursuits.",
    "Avoid the trajectory / plateau framing of the other flavor — this is about chess as a thing, not you as a player.",
    "",
    "Ask ONE existential question in the reflective_learner persona's existential voice.",
    "Reply with ONLY the message text.",
  ].join("\n");
}

export const metaMotivationalGenerator: Generator = async (ctx) => {
  const personaPrompt = ctx.personas[PERSONA_NAME];
  if (!personaPrompt) {
    throw new Error(
      `metaMotivationalGenerator: ${PERSONA_NAME} persona not loaded`,
    );
  }

  const register = pickRegister(ctx.rng);
  let userPrompt: string;
  let lossSnippetId: string | undefined;

  if (register === "trajectory") {
    userPrompt = buildTrajectoryContext();
  } else if (register === "loss") {
    if (ctx.fixtures.lossSummaries.length === 0) {
      throw new Error(
        "metaMotivationalGenerator: loss flavor picked but loss_summaries fixture is empty",
      );
    }
    const loss = pickOne(ctx.rng, ctx.fixtures.lossSummaries);
    lossSnippetId = loss.snippet_id;
    userPrompt = buildLossContext(loss.text);
  } else {
    userPrompt = buildExistentialContext();
  }

  // For trajectory + loss flavors, attach username so the route's
  // user_history fetch lands meaningful aggregate data. For existential,
  // omit username so the route degrades and the question doesn't pretend
  // to be anchored on history it doesn't reference.
  const availableUsers = Object.keys(ctx.fixtures.userHistories).filter(
    (u) => !ctx.fixtures.userHistories[u].loadFailed && ctx.fixtures.userHistories[u].games.length > 0,
  );
  const usernameForBody =
    register !== "existential" && availableUsers.length > 0
      ? pickOne(ctx.rng, availableUsers)
      : undefined;

  const res = await ctx.llmCall({
    systemPrompt: personaPrompt,
    userPrompt,
    generatorTag: `metaMotivational:${register}`,
  });
  if (!res.ok) {
    throw new Error(
      `metaMotivationalGenerator LLM call failed: ${res.errorMessage || "unknown error"}`,
    );
  }

  return {
    question: res.text,
    personaUsed: PERSONA_NAME,
    bodyExtensions: usernameForBody ? { username: usernameForBody } : {},
    metadata: {
      register,
      username: usernameForBody ?? null,
      loss_snippet_id: lossSnippetId ?? null,
    },
  };
};
