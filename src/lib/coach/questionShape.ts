/**
 * The shape of a question, read from its words alone.
 *
 * Shared by the follow-up prompt (the budget it sets for the longer form)
 * and the intent router, and now by the client, which decides before any
 * fetch whether a question names an alternative (coachWhatIf.ts). It lives
 * apart from the prompt module so the client can read the shape without
 * carrying the prompt text.
 */

/**
 * "walk me through", "step by step": the player asked for the longer form,
 * which the prompt budgets at FOLLOWUP_WALKTHROUGH_WORD_BUDGET.
 */
export function isWalkthroughQuestion(question: string): boolean {
  return /\bwalk\s+(?:me\s+)?through\b|\bstep[\s-]by[\s-]step\b|\b(?:go|take\s+me)\s+through\s+the\s+(?:whole\s+|entire\s+)?line\b|\bexplain\s+the\s+(?:whole\s+|entire\s+)?line\b/i.test(
    question
  );
}
