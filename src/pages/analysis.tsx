import type { GetServerSideProps } from "next";
import dynamic from "next/dynamic";

import { PageTitle } from "@/components/pageTitle";
import { getInsight } from "@/lib/insights";
import { excerptCoachContent } from "@/lib/og/excerptCoachContent";

/**
 * /analysis — the canonical analysis surface (cutover from
 * /preview/analysis, 2026-06-04).
 *
 * The implementation lives in `@/components/preview-analysis/AnalysisImpl`
 * (~8400 lines) and is loaded via `next/dynamic` with `ssr: false`. This
 * keeps Next.js's build-time "Collecting page data" phase from having to
 * parse + type-check the heavy file (Vercel was hanging indefinitely on
 * this prior to the dynamic-import).
 *
 * The page itself stays SSR-able so `getServerSideProps` can populate
 * `insightOg` on `?insightId=N` URLs — that drives the social-share
 * unfurl meta (Twitter / LinkedIn / Discord / Slack). Without SSR meta,
 * link previews would show the generic brand card instead of the
 * per-insight coach excerpt + dynamic OG image.
 *
 * Old legacy implementation (Board / PanelToolBar / atoms) is preserved
 * in git history pre-cutover; recover via `git show` if rollback needed.
 */

const AnalysisImpl = dynamic(
  () => import("@/components/preview-analysis/AnalysisImpl"),
  { ssr: false },
);

interface AnalysisPageProps {
  // Populated only when ?insightId=N is in the URL — drives the
  // social-share unfurl on Twitter / LinkedIn / Discord / Slack.
  // Null on the no-insight case so the page falls back to default brand
  // meta (handled by <PageTitle> defaults).
  insightOg: {
    title: string;
    description: string;
    image: string;
    url: string;
  } | null;
}

const SITE_URL = "https://chessmasti.com";

export default function AnalysisPage({ insightOg }: AnalysisPageProps) {
  return (
    <>
      <PageTitle
        title={insightOg?.title ?? "Chess Masti AI - Game Analysis"}
        description={insightOg?.description}
        url={insightOg?.url}
        image={insightOg?.image}
      />
      <AnalysisImpl />
    </>
  );
}

// Server-side: only do work when ?insightId= is present, so the no-insight
// path stays as cheap as a CSR page. When present, fetch the insight and
// emit per-share OG meta tags so unfurls show the coach excerpt + the
// dynamic /api/og/insight/[id] card instead of the generic brand image.
export const getServerSideProps: GetServerSideProps<AnalysisPageProps> = async (
  ctx,
) => {
  const raw = ctx.query.insightId;
  const insightId = Array.isArray(raw) ? raw[0] : raw;
  if (!insightId || typeof insightId !== "string" || insightId.length > 64) {
    return { props: { insightOg: null } };
  }
  try {
    const insight = await getInsight(insightId);
    if (!insight) return { props: { insightOg: null } };
    const excerpt =
      excerptCoachContent(insight.coachContent, 200) ||
      "An AI chess coach explanation, grounded in Stockfish.";
    const url = `${SITE_URL}/analysis?insightId=${encodeURIComponent(insightId)}`;
    return {
      props: {
        insightOg: {
          title: "Chess Masti — coach insight",
          description: excerpt,
          image: `${SITE_URL}/api/og/insight/${encodeURIComponent(insightId)}`,
          url,
        },
      },
    };
  } catch (err) {
    console.error("[analysis getServerSideProps] insight fetch failed", err);
    return { props: { insightOg: null } };
  }
};
