/**
 * Full AI-conversation capture is permanently disabled.
 *
 * This tombstone deliberately imports neither the tracking environment nor a
 * Supabase client. Keeping a hard no-op at the former module path prevents an
 * old or downstream import from restoring prompt/response writes merely by
 * setting TRACKING_ENABLED=true.
 */
export function captureLLMCall(..._discarded: unknown[]): void {
  // Intentionally empty. Do not add persistence or logging here.
}
