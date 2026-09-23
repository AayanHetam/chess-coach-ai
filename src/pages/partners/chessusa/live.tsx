"use client";

/**
 * /partners/chessusa/live — the honest render.
 *
 * This is what sits inside the preview shell's iframe. No controls, no
 * preview chrome, nothing that says "preview": it is the real page so the
 * advertiser judges the slot in its real surroundings. All of the preview
 * apparatus lives in the sibling index.tsx.
 *
 * WHY PAGES ROUTER, given the brief said app/: the real nav is NavPill, and
 * NavPill (plus the AppDrawer it renders) imports useRouter from next/router,
 * which throws "NextRouter was not mounted" inside an App Router tree. It
 * also reads AuthContext and AuthDialogContext, whose providers are mounted
 * only by src/pages/_app.tsx. An App Router version of this page could not
 * import the real header, only fork it, which is the one thing the brief
 * ruled out. src/app/layout.tsx does not render the site header at all.
 *
 * Route registration: this path is listed in SELF_CHROMED_ROUTES in
 * src/sections/layout/index.tsx, so Layout hands over the tree and does not
 * stack a second NavPill and GradientBackdrop on top of the ones here.
 */

import type { GetServerSideProps } from "next";
import Head from "next/head";
import dynamic from "next/dynamic";
import { Box, Stack, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";

import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
import { PartnerBanner } from "@/components/ads/PartnerBanner";
import { FONT_HREF } from "@/components/ads/PartnerSlot";
import {
  CHESSUSA_HREF,
  chessusaCreative,
  chessusaUtm,
} from "@/components/ads/chessusaCreative";
import {
  isPageId,
  isVariantId,
  type PageId,
  type VariantId,
} from "@/components/ads/previewOptions";

// The real homepage sections, imported rather than copied. A copy would drift
// from the live page invisibly, and a sales asset that quietly stops being
// true is worse than no asset.
import { Hero } from "@/components/landing/Hero";
import {
  homeColumnSx,
  homeRootSx,
  launchTheme,
} from "@/components/landing/launchTheme";
import LearnPage from "@/pages/learn";
import { ChessgroundBoardPlaceholder } from "@/components/ui/ChessgroundBoardPlaceholder";

const ChessgroundBoard = dynamic(
  () =>
    import("@/components/ui/ChessgroundBoard").then((m) => m.ChessgroundBoard),
  {
    ssr: false,
    // A board always occupies its square, even before its chunk lands —
    // see ChessgroundBoardPlaceholder.
    loading: () => <ChessgroundBoardPlaceholder />,
  }
);

interface LiveProps {
  variant: VariantId;
  page: PageId;
}

/* ─────────────────────────────────────────────────────────────────────────
   home — real components throughout.

   Mirrors the shape of LandingPage in src/pages/index.tsx: same launchTheme,
   same one-screen frame (homeRootSx / homeColumnSx; the home page has had
   no backdrop and no scroll since the 2026-09-23 simplification), same
   NavPill active="launch". The banner goes where it would go live, directly
   under the nav; it costs the height it costs, so this copy may scroll a
   little where the real page does not.
   ───────────────────────────────────────────────────────────────────────── */
function HomeSurface({ banner }: { banner: React.ReactNode }) {
  return (
    <ThemeProvider theme={launchTheme}>
      <Box sx={homeRootSx}>
        <NavPill active="launch" />
        {banner}
        <Box sx={homeColumnSx}>
          <Hero />
        </Box>
      </Box>
    </ThemeProvider>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   learn — real components throughout.

   /learn is not in SELF_CHROMED_ROUTES, so LearnPage renders no nav of its
   own and drops straight in under the banner. The padding below matches
   Layout's <main> so the column lines up with the real route.
   ───────────────────────────────────────────────────────────────────────── */
function LearnSurface({ banner }: { banner: React.ReactNode }) {
  return (
    <>
      <GradientBackdrop />
      <Box
        sx={{
          minHeight: "100vh",
          width: "100%",
          maxWidth: "100vw",
          overflowX: "hidden",
          boxSizing: "border-box",
          padding: "0.75rem 1rem 2rem",
        }}
      >
        <NavPill active="learn" />
        {banner}
        <LearnPage />
      </Box>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   analyze — STATIC SNAPSHOT, and called that deliberately.

   The live /analysis surface is AnalysisImpl (~8400 lines, ssr:false). It
   boots the Stockfish WASM worker and needs a loaded game before it renders
   anything an advertiser would recognise, and the engine bridge is explicitly
   out of scope for this branch. So this is a snapshot of that surface, not
   the surface.

   What is real here: the NavPill (the actual component, carrying page context
   in its slots exactly as /analysis does) and the ChessgroundBoard (the
   actual board component). What is static: the position, the evaluation, the
   move list and the coach panel.

   Position is the Ruy Lopez, Morphy Defence after 3...a6, verified against
   chess.js rather than typed from memory. It decides no chess and claims no
   evaluation the engine did not give.
   ───────────────────────────────────────────────────────────────────────── */
const SNAPSHOT_FEN =
  "r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4";

const SNAPSHOT_MOVES = [
  ["1.", "e4", "e5"],
  ["2.", "Nf3", "Nc6"],
  ["3.", "Bb5", "a6"],
];

function SnapshotContext() {
  return (
    <Stack
      direction="row"
      spacing={1.25}
      alignItems="center"
      sx={{ minWidth: 0, color: "rgba(255,255,255,0.8)" }}
    >
      <Typography
        sx={{ fontSize: "0.84rem", fontWeight: 600, whiteSpace: "nowrap" }}
      >
        Morphy — Anderssen
      </Typography>
      <Typography
        sx={{
          fontSize: "0.78rem",
          color: "rgba(255,255,255,0.5)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        Ruy Lopez, Morphy Defence
      </Typography>
    </Stack>
  );
}

function AnalyzeSurface({ banner }: { banner: React.ReactNode }) {
  return (
    <>
      <GradientBackdrop />
      <Box
        sx={{
          minHeight: "100vh",
          width: "100%",
          boxSizing: "border-box",
          pt: 1.5,
          pb: 4,
          px: { xs: 2, md: 3 },
        }}
      >
        <NavPill
          active="analysis"
          sx={{ position: "static", top: "auto", mb: { xs: 2, lg: 1.25 } }}
          contextSlot={<SnapshotContext />}
        />
        {banner}
        <Box
          sx={{
            maxWidth: 1400,
            mx: "auto",
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "minmax(0,1fr) 340px" },
            gap: 3,
            alignItems: "start",
          }}
        >
          <Box sx={{ maxWidth: 560, width: "100%", mx: { xs: "auto", md: 0 } }}>
            <ChessgroundBoard
              fen={SNAPSHOT_FEN}
              orientation="white"
              lastMove={["a7", "a6"]}
              viewOnly
            />
          </Box>

          <Box
            sx={{
              background: "rgba(20,22,28,0.55)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "14px",
              p: 2.5,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            <Typography
              sx={{
                fontSize: "0.68rem",
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.45)",
              }}
            >
              Moves
            </Typography>
            <Box sx={{ mt: 1.25, mb: 3 }}>
              {SNAPSHOT_MOVES.map(([num, white, black]) => (
                <Stack
                  key={num}
                  direction="row"
                  spacing={2}
                  sx={{ py: 0.4, fontSize: "0.88rem" }}
                >
                  <Box sx={{ width: 24, color: "rgba(255,255,255,0.4)" }}>
                    {num}
                  </Box>
                  <Box sx={{ width: 64, fontWeight: 600 }}>{white}</Box>
                  <Box sx={{ width: 64, fontWeight: 600 }}>{black}</Box>
                </Stack>
              ))}
            </Box>

            <Typography
              sx={{
                fontSize: "0.68rem",
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.45)",
              }}
            >
              Coach
            </Typography>
            <Typography
              sx={{
                mt: 1.25,
                fontSize: "0.88rem",
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.75)",
              }}
            >
              3...a6 asks the bishop a question. The point is not to win the
              pawn on e5 — after 4.Bxc6 dxc6 5.Nxe5 Qd4 Black takes it straight
              back — it is to gain the tempo that makes the pin temporary.
            </Typography>
          </Box>
        </Box>
      </Box>
    </>
  );
}

export default function PartnerPreviewLive({ variant, page }: LiveProps) {
  const banner = (
    <PartnerBanner
      creative={chessusaCreative(variant)}
      href={CHESSUSA_HREF}
      utm={chessusaUtm(variant)}
      advertiser="ChessUSA"
    />
  );

  return (
    <>
      <Head>
        {/* Duplicates homepage content and carries a sponsored link. The
            matching X-Robots-Tag goes out in getServerSideProps below, so the
            directive survives even where the meta tag is never parsed. */}
        <meta name="robots" content="noindex, nofollow" />
        <title>ChessUSA placement preview — Chess Masti</title>
        {/* The Turn-2 units are set in Archivo and IBM Plex Mono. Under the
            /partners/chessusa/N prefix the boot script appends this link; this
            route is not a numeric-option path, so it links the faces itself.
            Without it the shell fell back to system fonts and stopped being a
            faithful preview of the production creative. */}
        <link rel="stylesheet" href={FONT_HREF} />
      </Head>
      {page === "home" && <HomeSurface banner={banner} />}
      {page === "learn" && <LearnSurface banner={banner} />}
      {page === "analyze" && <AnalyzeSurface banner={banner} />}
    </>
  );
}

/**
 * Server-rendered purely so `variant` and `page` are correct on the FIRST
 * paint. Without it Next statically optimises the route, router.query is
 * empty until isReady, and the iframe visibly flashes the default creative
 * before the selected one — which in a side-by-side creative review is the
 * one artifact guaranteed to be mistaken for the ad being slow.
 */
export const getServerSideProps: GetServerSideProps<LiveProps> = async (
  ctx
) => {
  ctx.res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const rawVariant = ctx.query.v;
  const rawPage = ctx.query.page;
  const v = Array.isArray(rawVariant) ? rawVariant[0] : rawVariant;
  const p = Array.isArray(rawPage) ? rawPage[0] : rawPage;
  return {
    props: {
      variant: isVariantId(v) ? v : "editorial",
      page: isPageId(p) ? p : "home",
    },
  };
};
