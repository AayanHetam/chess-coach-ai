/**
 * Option vocabulary shared by the partner preview shell and the framed page.
 *
 * Deliberately a leaf module with no React, no MUI and no page imports. The
 * shell at /partners/chessusa needs the ids and the labels to draw its
 * toggles; if it reached into ./live for them, webpack would pull the entire
 * homepage and Learn module graphs into the shell's chunk, and the first page
 * the advertiser loads would download two product surfaces it never renders.
 */

/* ── creative variants (?v=) ─────────────────────────────────────────────── */

export type VariantId = "editorial" | "bold" | "three";

export const VARIANT_IDS: readonly VariantId[] = [
  "editorial",
  "bold",
  "three",
] as const;

export function isVariantId(value: unknown): value is VariantId {
  return typeof value === "string" && VARIANT_IDS.includes(value as VariantId);
}

/** Names the rendering path, not just the look, so the reviewer knows which
 *  variant is exercising <picture> and which is live DOM. */
export const VARIANT_LABELS: Record<VariantId, string> = {
  // The ids are historical; the creative behind each is the production one.
  editorial: "1 · 2a Board Party",
  bold: "2 · 2b Sticker",
  three: "3 · 2c Neon Board",
};

/* ── page contexts (?page=) ──────────────────────────────────────────────── */

export type PageId = "home" | "analyze" | "learn";

export const PAGE_IDS: readonly PageId[] = [
  "home",
  "analyze",
  "learn",
] as const;

export function isPageId(value: unknown): value is PageId {
  return typeof value === "string" && PAGE_IDS.includes(value as PageId);
}

export const PAGE_LABELS: Record<PageId, string> = {
  home: "Homepage",
  analyze: "Analysis",
  learn: "Learn",
};

/**
 * Stated in the UI rather than buried in a handover email: the advertiser
 * should know which surfaces are the live components and which one is a
 * snapshot, because it changes how much the preview proves.
 */
export const PAGE_FIDELITY: Record<PageId, string> = {
  home: "live homepage components",
  analyze: "static snapshot — real nav and real board, fixed position",
  learn: "live Learn components",
};
