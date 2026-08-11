/**
 * Shared font stacks.
 *
 * The app has no webfont pipeline — nothing loads from fonts.googleapis.com and
 * the MUI theme just names Inter with a system fallback. So the display face
 * here is a *system* serif stack chosen to look elegant without a network
 * request: Iowan Old Style ships with macOS/iOS and is genuinely beautiful at
 * display sizes, Palatino covers older Apple and Windows, Georgia is the
 * universal floor.
 *
 * SERIF_DISPLAY is for content and brand moments only — the puzzle prompt, the
 * coach wordmark, theme names. Chrome (buttons, labels, tools) stays sans; that
 * split is what makes the puzzle read as the artifact and the rest as the app.
 * See docs/PUZZLE_TRAINING_LAYOUT_SPEC.md §1.4.
 */
export const SERIF_DISPLAY =
  '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
