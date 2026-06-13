/**
 * localStorage helpers for the onboarding flush payload — the single profile
 * patch written after auth completes. Centralized so the writer (result screen
 * / page) and the reader (QuizPersistenceFlush) agree on the shape, and so all
 * access is wrapped in try/catch (Safari private mode etc. can throw).
 *
 * These read/remove localStorage DIRECTLY and are NOT the useLocalStorage hook
 * — the flush runs in an effect that fires before any hook would hydrate.
 */

import type { UserProfileUpdates } from "@/lib/firestoreUsers";
import { DRAFT_STORAGE_KEY, FLUSH_STORAGE_KEY } from "./quizConfig";

export interface FlushEnvelope {
  payload: UserProfileUpdates;
  createdAt: number;
}

export function writeFlushPayload(payload: UserProfileUpdates): void {
  try {
    const envelope: FlushEnvelope = { payload, createdAt: Date.now() };
    window.localStorage.setItem(FLUSH_STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function readFlushPayload(): FlushEnvelope | null {
  try {
    const raw = window.localStorage.getItem(FLUSH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FlushEnvelope;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.payload ||
      typeof parsed.payload !== "object" ||
      Object.keys(parsed.payload).length === 0
    ) {
      clearFlushPayload();
      return null;
    }
    return parsed;
  } catch {
    clearFlushPayload();
    return null;
  }
}

export function clearFlushPayload(): void {
  try {
    window.localStorage.removeItem(FLUSH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Clear the in-progress draft (resume state). */
export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Wipe all local onboarding state — called once the quiz is fully done. */
export function clearAllQuizStorage(): void {
  clearFlushPayload();
  clearDraft();
}

/** Pending flush considered "fresh" (an active funnel) within this window. */
export const FLUSH_FRESH_MS = 60 * 60 * 1000;

export function hasFreshPendingFlush(): boolean {
  const env = readFlushPayload();
  if (!env) return false;
  return Date.now() - env.createdAt < FLUSH_FRESH_MS;
}
