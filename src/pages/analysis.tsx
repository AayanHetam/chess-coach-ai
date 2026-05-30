// Canonical analysis surface. The implementation lives in
// `src/components/preview-analysis/AnalysisImpl.tsx` (~5400 lines) and
// is loaded via `next/dynamic` with `ssr: false`. This keeps Next.js's
// build-time "Collecting page data" phase from having to parse +
// type-check the heavy file (Vercel was hanging indefinitely on this).
//
// Trade-off: no SSR'd HTML for /analysis — users see a brief loading
// state while the implementation chunk hydrates. That's fine for an
// authenticated analysis surface (no SEO value lost, no first-paint
// regression that matters for the actual workflow).
//
// History: was promoted from /preview/analysis on 2026-05-30 as the
// canonical analysis surface after PR #56 cutover and PR #60 validator
// hardening. Legacy implementation archived at
// `src/_legacy/analysis.legacy.tsx` for rollback reference.
import dynamic from "next/dynamic";

const AnalysisImpl = dynamic(
  () => import("@/components/preview-analysis/AnalysisImpl"),
  { ssr: false }
);

export default function AnalysisPage() {
  return <AnalysisImpl />;
}
