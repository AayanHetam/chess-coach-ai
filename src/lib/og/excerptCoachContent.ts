/**
 * Distill a coach response down to a short excerpt suitable for the
 * social-share OG card. The raw coach output contains markdown, SAN
 * move references, and the bracketed `[INSIGHT:Title|why|...]` tags
 * the carousel renders from — none of which look right in a 1200×630
 * static image.
 *
 * Strategy:
 *   1. Strip `[INSIGHT:...]` tags (including their content).
 *   2. Strip markdown emphasis, headers, links — keep the link text only.
 *   3. Collapse whitespace.
 *   4. Take the first sentence (or first N chars, whichever is shorter).
 */
export function excerptCoachContent(raw: string, maxLen = 180): string {
  if (!raw) return "";
  // 1. INSIGHT tags
  let s = raw.replace(/\[INSIGHT:[^\]]*\]/g, " ");
  // 2a. Markdown headers (#, ##, ###)
  s = s.replace(/^#{1,6}\s+/gm, "");
  // 2b. Bold / italic / code
  s = s.replace(/[*_`]+/g, "");
  // 2c. Links: [text](url) → text
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // 2d. List bullets / blockquote prefixes
  s = s.replace(/^[\s]*[-*+>]\s+/gm, "");
  // 3. Whitespace collapse + trim
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";
  // 4. If the whole thing fits, ship it untouched.
  if (s.length <= maxLen) return s;
  // 5. Otherwise prefer cutting at the latest sentence boundary that
  // still fits under maxLen (graceful: keeps full thoughts intact).
  // The `(\s|$)` guard avoids matching mid-abbreviation periods like
  // "e.g." or "vs.".
  const window = s.slice(0, maxLen);
  let lastSentenceEnd = -1;
  const sentenceRe = /[.!?](?:\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = sentenceRe.exec(window)) !== null) {
    lastSentenceEnd = m.index;
  }
  // Only honor the sentence boundary if it's far enough in to make the
  // card feel substantive — avoids "OK." or "Hmm." as the whole excerpt.
  if (lastSentenceEnd > 30) {
    return s.slice(0, lastSentenceEnd + 1);
  }
  // 6. Fallback: hard-truncate on a word boundary near the limit.
  const lastSpace = window.lastIndexOf(" ");
  return (lastSpace > maxLen - 30 ? window.slice(0, lastSpace) : window) + "…";
}
