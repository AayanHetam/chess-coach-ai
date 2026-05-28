// Thin entry point — the implementation lives in
// `src/components/preview-analysis/AnalysisImpl.tsx` (~5400 lines) and
// is loaded via `next/dynamic` with `ssr: false`. This keeps Next.js's
// build-time "Collecting page data" phase from having to parse +
// type-check the heavy file (Vercel was hanging indefinitely on this).
//
// Trade-off: no SSR'd HTML for /preview/analysis or /analysis — users
// see a brief loading state while the implementation chunk hydrates.
// That's fine for an authenticated analysis surface (no SEO value lost,
// no first-paint regression that matters for the actual workflow).
//
// The shell is page-component-shaped so Next.js still routes here.
import dynamic from "next/dynamic";

const AnalysisImpl = dynamic(
  () => import("@/components/preview-analysis/AnalysisImpl"),
  { ssr: false }
);

export default function AnalysisPage() {
  return <AnalysisImpl />;
}
