/**
 * What the coach is told it previously said (Group D, SILENT_SUBSTITUTION_HANDOFF §3).
 *
 * `conversationHistory` is replayed to the model as its OWN prior turns. The
 * model treats those as authoritative and will defend and extend them, so
 * anything wrong in here does not just produce one bad answer — it produces a
 * persistent one. That is what makes Group D compounding rather than additive.
 *
 * Three kinds of text were reaching the model as things it had said:
 *
 *   D2 — a hardcoded demo exchange with hand-written eval numbers
 *        ("eval jumps from +2.4 to +4.7", "Kasparov calculated 15+ ply").
 *        A human wrote those. The model reads them as its own analysis.
 *   D3 — UI-authored strings: error banners ("**Coach is offline** (HTTP 502)"),
 *        load greetings, and a suggestion pill that fabricates an entire
 *        user+coach exchange with NO API call behind it.
 *   D4 — answers cut off mid-stream, which enter history looking complete.
 *
 * The fix is a property on the message rather than a filter that pattern-matches
 * text: whoever WRITES a turn knows whether the model produced it, and no
 * downstream string check can recover that once it is lost.
 */

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CoachHistoryMessage {
  role: "user" | "coach";
  content: string;
  /**
   * True when this turn was authored by the UI, not by the model (or by the
   * user). Seeded demo content, greetings, error banners, and the suggestion
   * pill's fabricated exchange all set this.
   *
   * These still RENDER — the user should see the error banner — they are just
   * never replayed to the model as something it said.
   */
  synthetic?: boolean;
  /**
   * True when the stream ended without a `done` event, so the text is a
   * fragment. It renders with a truncation indicator, but must not be replayed:
   * a half-finished sentence read back as a completed thought is worse than
   * having no history at all.
   */
  incomplete?: boolean;
}

/**
 * Build the history the server replays to the model.
 *
 * Order is preserved. Empty turns are dropped — a placeholder bubble exists in
 * `messages` while a stream is still filling it, and sending `content: ""` as
 * an assistant turn is both useless and, on some providers, an error.
 */
export function buildConversationHistory(
  messages: readonly CoachHistoryMessage[],
): ChatTurn[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "coach")
    .filter((m) => !m.synthetic)
    .filter((m) => !m.incomplete)
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({
      role: m.role === "coach" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));
}
