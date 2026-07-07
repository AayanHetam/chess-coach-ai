/**
 * Grammar-aware INSIGHT-block gate for the streaming path (PR-CI-3,
 * CONTRACT_INVERSION_PLAN.md §5).
 *
 * Two modes, one scanner:
 *
 *  - "shadow" (the ONLY mode CI-3 wires into serving, behind
 *    CONTRACT_REFEREE_SHADOW): the gate is a pure OBSERVER. The route keeps
 *    emitting every SSE delta itself, unchanged; push() only accumulates
 *    text and detects [INSIGHT]…[/INSIGHT] boundaries so the referee can run
 *    per completed block, LOG ONLY. Client-visible bytes are identical by
 *    construction (pinned by the SSE transcript byte-identity test).
 *
 *  - "enforce" (built + fixture-tested now, wired in CI-4): the gate OWNS
 *    emission. Prefix text before the first [INSIGHT: forwards immediately
 *    (TTFT unchanged); each block is held until [/INSIGHT] and then flushed
 *    as one burst; stream end with an unclosed block flushes everything
 *    buffered plus the truncation footnote — content is NEVER swallowed
 *    (plan risk #5, mandatory + fixture-tested).
 *
 * Grammar constants come from insightGrammar.ts — the same module the
 * renderer and referee use (one grammar, no duplicated regexes).
 *
 * Defense-in-depth: callbacks are wrapped in try/catch — a referee bug must
 * never break streaming (same posture as runStreamingStage9Validators).
 */
import { INSIGHT_CLOSE_TOKEN, INSIGHT_OPEN_PREFIX } from "./insightGrammar";

export interface CompletedBlock {
  /** Raw header text between "[INSIGHT:" and the first "]". */
  headerRaw: string;
  /** Body between the header "]" and "[/INSIGHT]". */
  body: string;
  /** Full block text including both markers. */
  text: string;
}

export interface PartialBlock {
  /** Everything from "[INSIGHT:" to stream end (close token never arrived). */
  text: string;
  /** Header text if its closing "]" arrived; null otherwise. */
  headerRaw: string | null;
}

export interface InsightBlockGateOpts {
  mode: "shadow" | "enforce";
  /**
   * Client-bound sink. REQUIRED in enforce mode (the gate owns emission
   * order); IGNORED in shadow mode (the route keeps emitting directly and
   * the gate only observes).
   */
  forward?: (text: string) => void;
  /** Invoked once per completed [INSIGHT]…[/INSIGHT] block, in order. */
  onBlock?: (block: CompletedBlock) => void;
  /** Invoked from end() when the stream stopped inside an unclosed block. */
  onUnclosedBlock?: (partial: PartialBlock) => void;
  /**
   * Enforce-mode only: appended after the flushed remainder when the stream
   * ends inside an unclosed block (max_tokens truncation footnote, plan §5).
   */
  truncationFootnote?: string;
}

function safeCall(fn: (() => void) | undefined): void {
  if (!fn) return;
  try {
    fn();
  } catch {
    /* observer/callback bugs must never break the stream */
  }
}

/**
 * Longest suffix of `text` that is a proper prefix of `token` — the bytes
 * that might turn out to be the start of `token` once more deltas arrive.
 */
function ambiguousTailLength(text: string, token: string): number {
  const max = Math.min(token.length - 1, text.length);
  for (let len = max; len > 0; len--) {
    if (text.endsWith(token.slice(0, len))) return len;
  }
  return 0;
}

export class InsightBlockGate {
  private readonly mode: "shadow" | "enforce";
  private readonly forward: (text: string) => void;
  private readonly opts: InsightBlockGateOpts;
  /** Unclassified text: outside a block it is at most the ambiguous tail
   * (shadow discards / enforce forwards the rest eagerly); inside a block it
   * is the whole block-so-far. */
  private pending = "";
  private state: "outside" | "inside" = "outside";
  private ended = false;
  /** Completed blocks seen (telemetry convenience for callers). */
  public blocksSeen = 0;

  constructor(opts: InsightBlockGateOpts) {
    this.mode = opts.mode;
    this.opts = opts;
    this.forward = opts.forward ?? (() => {});
  }

  push(delta: string): void {
    if (this.ended || !delta) return;
    this.pending += delta;
    this.scan();
  }

  /**
   * Stream ended. Enforce mode flushes every held byte (+ truncation
   * footnote if a block was left unclosed) — content is never swallowed.
   * Shadow mode reports the unclosed partial (bytes already reached the
   * client via the route's own emission).
   */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.state === "inside") {
      const partial = this.pending;
      const headerEnd = partial.indexOf("]");
      const headerRaw =
        headerEnd > INSIGHT_OPEN_PREFIX.length
          ? partial.slice(INSIGHT_OPEN_PREFIX.length, headerEnd)
          : null;
      safeCall(() => this.opts.onUnclosedBlock?.({ text: partial, headerRaw }));
      if (this.mode === "enforce") {
        this.forward(partial + (this.opts.truncationFootnote ?? ""));
      }
    } else if (this.mode === "enforce" && this.pending) {
      // Outside-tail (an ambiguous open-marker prefix that never completed).
      this.forward(this.pending);
    }
    this.pending = "";
  }

  private scan(): void {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.state === "outside") {
        const idx = this.pending.indexOf(INSIGHT_OPEN_PREFIX);
        if (idx === -1) {
          // Keep only the tail that could still become an open marker.
          const tail = ambiguousTailLength(this.pending, INSIGHT_OPEN_PREFIX);
          const settled = this.pending.slice(0, this.pending.length - tail);
          if (settled && this.mode === "enforce") this.forward(settled);
          this.pending = tail > 0 ? this.pending.slice(this.pending.length - tail) : "";
          return;
        }
        const before = this.pending.slice(0, idx);
        if (before && this.mode === "enforce") this.forward(before);
        this.pending = this.pending.slice(idx);
        this.state = "inside";
        continue;
      }
      // inside: hold everything until the close token.
      const closeIdx = this.pending.indexOf(INSIGHT_CLOSE_TOKEN);
      if (closeIdx === -1) return;
      const blockEnd = closeIdx + INSIGHT_CLOSE_TOKEN.length;
      const text = this.pending.slice(0, blockEnd);
      const headerEnd = text.indexOf("]");
      const headerRaw = text.slice(INSIGHT_OPEN_PREFIX.length, headerEnd);
      const body = text.slice(headerEnd + 1, closeIdx);
      this.blocksSeen += 1;
      safeCall(() => this.opts.onBlock?.({ headerRaw, body, text }));
      if (this.mode === "enforce") this.forward(text);
      this.pending = this.pending.slice(blockEnd);
      this.state = "outside";
    }
  }
}
