/**
 * A deliberate, announced pause on the AI features.
 *
 * When the Anthropic balance ran out on 2026-08-19, the product did not stop
 * working — it started lying. `/api/puzzle-hint` returned
 * `AI_PROVIDER_UNAVAILABLE` ("temporarily unavailable, please try again"),
 * which reads like a blip you should retry, when the real state was "this will
 * not work until somebody pays a bill". Users would have retried, waited, and
 * concluded the app was broken.
 *
 * The distinction this module exists to make is the same one that runs through
 * the whole silent-substitution programme: *a system that cannot do the thing
 * must say so plainly, not fail in a way that resembles doing the thing.*
 *
 * Two halves, both required:
 *
 *   - `AI_COACH_DISABLED` (server) is the ENFORCEMENT. Every LLM-backed route
 *     refuses before it spends anything. This is the half that has to be true,
 *     because a stale client, a direct API call or a cached page must all hit
 *     the same wall.
 *   - `NEXT_PUBLIC_AI_COACH_DISABLED` (client) is the COURTESY. It lets the UI
 *     say so up front instead of letting someone type out a question and
 *     receive an error.
 *
 * The health routes are deliberately NOT gated: `/api/health/llm` is how you
 * find out the credits are back, so switching the coach off must not switch
 * off the instrument that tells you when to switch it on.
 */
import { NextResponse } from "next/server";

/** Server-side switch. Any value other than "true" leaves the AI enabled. */
export function isAiDisabled(): boolean {
  return process.env.AI_COACH_DISABLED === "true";
}

/**
 * Client-side mirror. Separate variable because `NEXT_PUBLIC_*` is inlined at
 * build time and the server flag is read at runtime — one cannot stand in for
 * the other, and the server one is the one that actually enforces.
 */
export function isAiDisabledPublic(): boolean {
  return process.env.NEXT_PUBLIC_AI_COACH_DISABLED === "true";
}

/**
 * A distinct code from `AI_PROVIDER_UNAVAILABLE`. That one means "something
 * broke, retrying may help"; this one means "switched off on purpose, retrying
 * will not help". A client that cannot tell them apart will show a spinner and
 * a retry button for a state that has neither.
 */
export const AI_DISABLED_ERROR = {
  code: "AI_TEMPORARILY_DISABLED",
  message:
    "AI coaching is switched off for a few days while we sort out API costs. The board, engine analysis and puzzles all still work.",
} as const;

/** 503 + Retry-After. Honest status: the service exists and is coming back. */
export function aiDisabledResponse(): NextResponse {
  return NextResponse.json(
    { error: AI_DISABLED_ERROR.message, code: AI_DISABLED_ERROR.code },
    { status: 503, headers: { "Retry-After": "86400" } },
  );
}

/**
 * A THIRD state, distinct from both of the above. "Broke, retry" and "switched
 * off for days" are both wrong for a ceiling: the coach is fine, it is coming
 * back at midnight UTC, and retrying before then will not help. Anything that
 * watches the coach — the hourly heartbeat included — must be able to tell a
 * self-imposed ceiling from an outage, because one is the system working.
 */
export const AI_BUDGET_ERROR = {
  code: "AI_DAILY_BUDGET_REACHED",
  message:
    "The coach has hit today's usage limit. It comes back tomorrow — the board, engine analysis and puzzles all still work.",
} as const;

export function aiBudgetResponse(): NextResponse {
  return NextResponse.json(
    { error: AI_BUDGET_ERROR.message, code: AI_BUDGET_ERROR.code },
    { status: 503, headers: { "Retry-After": "3600" } },
  );
}

