/**
 * System Prompt Templates
 * Centralized location for all AI coach system prompts
 */

import { SYSTEM_PROMPT_TEMPLATE, getSystemPrompt } from "../chessPrinciples";

// Re-export for convenience
export { SYSTEM_PROMPT_TEMPLATE, getSystemPrompt };

/**
 * Get a specialized system prompt for a specific analysis type
 * This is a wrapper around getSystemPrompt for better organization
 */
export const getSpecializedPrompt = (analysisType: string): string => {
  return getSystemPrompt(analysisType);
};

/**
 * Prompt version for tracking and A/B testing
 */
export const PROMPT_VERSION = "2.0";
