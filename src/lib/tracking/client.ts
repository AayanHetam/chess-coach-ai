/**
 * Client-side tracking SDK (TRK-4).
 *
 * `track(name, props)` batches interaction events and flushes them to
 * /api/track via navigator.sendBeacon (which survives page unload), falling
 * back to fetch(keepalive). Puzzle attempts and analysis sessions get typed
 * helpers that post to their dedicated endpoints.
 *
 * Everything is SSR-safe: off-browser calls are inert no-ops. The server gates
 * on TRACKING_ENABLED (and, in TRK-6, consent), so the client can fire freely;
 * when tracking is off the endpoints just 204.
 */

import { clientHasConsent } from "./consent";

const TRACK_ENDPOINT = "/api/track";
const PUZZLE_ENDPOINT = "/api/track/puzzle";
const ANALYSIS_ENDPOINT = "/api/track/analysis-session";
const SESSION_KEY = "cm_track_session";
const BATCH_MAX = 20;
const FLUSH_DELAY_MS = 2000;

interface QueuedEvent {
  name: string;
  props?: Record<string, unknown>;
  surface?: string;
  sessionId?: string;
  ts: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function nowIso(): string {
  return new Date().toISOString();
}

function sessionId(): string {
  if (!isBrowser()) return "";
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `s_${nowIso()}_${Math.floor(Math.random() * 1e9)}`;
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;

function bindFlushListeners(): void {
  if (listenersBound || !isBrowser()) return;
  listenersBound = true;
  const onHide = () => flushTrackingQueue(true);
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushTrackingQueue(true);
  });
}

function scheduleFlush(): void {
  if (flushTimer || !isBrowser()) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushTrackingQueue(false);
  }, FLUSH_DELAY_MS);
}

/** POST a JSON payload that should survive unload. Beacon first, fetch fallback. */
function sendPayload(url: string, payload: unknown, preferBeacon: boolean): void {
  if (!isBrowser()) return;
  // Consent gate (TRK-6): don't even emit pre-consent / under GPC. The server
  // enforces the same check, but skipping the beacon avoids needless requests.
  if (!clientHasConsent()) return;
  const body = JSON.stringify(payload);
  try {
    if (preferBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }
    void fetch(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  } catch {
    // Tracking must never break the page.
  }
}

/** Flush the queued interaction events. `useBeacon` on unload paths. */
export function flushTrackingQueue(useBeacon = false): void {
  if (!isBrowser() || queue.length === 0) return;
  const events = queue;
  queue = [];
  sendPayload(TRACK_ENDPOINT, { events }, useBeacon);
}

/** Queue one interaction event. Batched + flushed automatically. */
export function track(
  name: string,
  props?: Record<string, unknown>,
  surface?: string,
): void {
  if (!isBrowser()) return;
  // Don't even queue pre-consent — those events should never be captured.
  if (!clientHasConsent()) return;
  bindFlushListeners();
  queue.push({
    name,
    props,
    surface: surface ?? window.location?.pathname,
    sessionId: sessionId(),
    ts: nowIso(),
  });
  if (queue.length >= BATCH_MAX) flushTrackingQueue(true);
  else scheduleFlush();
}

export interface ClientPuzzleAttempt {
  puzzleId: string;
  source?: string;
  fen?: string;
  themes?: string[];
  rating?: number;
  userMoves?: string[];
  correct?: boolean;
  solvedWithoutHint?: boolean;
  hintsUsed?: number;
  msToSolve?: number;
  attemptIndex?: number;
}

/** Record a finished puzzle attempt. Fire-and-forget. */
export function trackPuzzleAttempt(input: ClientPuzzleAttempt): void {
  sendPayload(PUZZLE_ENDPOINT, input, true);
}

export interface ClientAnalysisSession {
  status: "completed" | "abandoned";
  startedAt?: string;
  gamePgn?: string;
  movesQueried?: number;
  chatTurns?: number;
  requestId?: string;
}

/** Record an ended analysis session. Use on completion or pagehide (abandon). */
export function trackAnalysisSession(input: ClientAnalysisSession): void {
  sendPayload(ANALYSIS_ENDPOINT, input, true);
}
