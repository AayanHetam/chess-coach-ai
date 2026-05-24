/**
 * concept_explanation generator. Picks a concept from the scraped
 * Yusupov + Silman + Watson fixture (270 entries) and asks the
 * concept_curious persona to generate a question framed around it.
 *
 * No body extensions — concept questions are pure context-free chat
 * (the route's classifier routes them to concept_explanation, which
 * has no validator wired in this PR per O7's "8 turns, qualitative
 * review only" budget). Citation rate for this category is null by
 * design; deferred to PR 1.D.
 */

import { type Generator, pickOne } from "./index";

const PERSONA_NAME = "concept_curious";

export const conceptExplanationGenerator: Generator = async (ctx) => {
  const personaPrompt = ctx.personas[PERSONA_NAME];
  if (!personaPrompt) {
    throw new Error(
      `conceptExplanationGenerator: ${PERSONA_NAME} persona not loaded`,
    );
  }
  if (ctx.fixtures.concepts.length === 0) {
    throw new Error(
      "conceptExplanationGenerator: concepts fixture is empty",
    );
  }

  const concept = pickOne(ctx.rng, ctx.fixtures.concepts);

  const levelHint = concept.level && concept.level !== "all"
    ? `Difficulty level (from source): ${concept.level}`
    : "Difficulty level (from source): general";
  const categoryHint = concept.category
    ? `Domain: ${concept.category}`
    : "Domain: not specified";

  const userPrompt = [
    `Target concept: ${concept.name}`,
    `Source: ${concept.source}`,
    levelHint,
    categoryHint,
    `Notes from source: ${concept.notes.slice(0, 200)}`,
    "",
    "Ask ONE question about this concept in the concept_curious persona's voice.",
    "Vary your framing across turns: definition, concrete example, when to apply, how it relates to your level.",
    "Reply with ONLY the message text.",
  ].join("\n");

  const res = await ctx.llmCall({
    systemPrompt: personaPrompt,
    userPrompt,
    generatorTag: "conceptExplanation",
  });
  if (!res.ok) {
    throw new Error(
      `conceptExplanationGenerator LLM call failed: ${res.errorMessage || "unknown error"}`,
    );
  }

  return {
    question: res.text,
    personaUsed: PERSONA_NAME,
    bodyExtensions: {},
    metadata: {
      concept_id: concept.concept_id,
      concept_name: concept.name,
      source: concept.source,
      level: concept.level,
      category: concept.category,
    },
  };
};
