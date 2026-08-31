import { useEffect, useState } from "react";
import type { GetStaticPaths, GetStaticProps, InferGetStaticPropsType } from "next";
import Head from "next/head";
import NextLink from "next/link";
import { Box, Button, Chip, Link as MuiLink, Typography } from "@mui/material";
import { getPuzzleCorpus } from "@/lib/puzzle-feed/loadPuzzles";
import {
  InteractivePuzzleBoard,
  StaticBoardDiagram,
  toLandingPuzzle,
  type LandingPuzzle,
} from "@/components/puzzle/landingPuzzle";
import { PuzzleSignInGate } from "@/components/puzzle/PuzzleSignInGate";
import { useViewer } from "@/hooks/useViewer";

/**
 * /puzzles/<rating> — statically generated SEO landing pages, one per
 * 100-point rating band from 600 to 2200. Each page ships 8 real puzzles
 * from the band in its prerendered HTML (board diagram + theme + rating),
 * because that HTML is what gets indexed.
 *
 * Band semantics: /puzzles/1000 means rating ∈ [1000, 1100) — inclusive
 * lower, exclusive upper — implemented as ratingMin 1000 / ratingMax 1099
 * against the corpus's inclusive-both-ends filter.
 *
 * Deliberately getStaticPaths + getStaticProps with fallback: false, NOT
 * getServerSideProps: the sign-in gate over puzzles 4+ is a client-side
 * conversion prompt (the data is CC0 Lichess), crawlers must see all 8
 * puzzles, and nothing may re-enter the 18MB CSV path per-request. The
 * corpus is read via fs inside getStaticProps only — per the Vercel deploy
 * contract in loadPuzzles.ts it must never be statically imported, and it
 * must never reach a client bundle.
 *
 * Piece images on this page are the "cburnett" set (GPLv2+, credited
 * below). The app-default "maestro" is CC BY-NC-SA — non-commercial — so
 * it must not be widened onto these public landing pages.
 */

const BANDS = Array.from({ length: 17 }, (_, i) => 600 + i * 100);
const PUZZLES_PER_PAGE = 8;
const FREE_PUZZLE_COUNT = 3;
const SITE_BASE = "https://chessmasti.com";

interface PuzzleRatingPageProps {
  band: number;
  puzzles: LandingPuzzle[];
}

/* ------------------------------------------------------------------ */
/* Build-time data                                                     */
/* ------------------------------------------------------------------ */

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: BANDS.map((band) => ({ params: { rating: String(band) } })),
  // Anything off the 17-band grid (/puzzles/1547, /puzzles/banana) is a
  // plain 404. /puzzles and /puzzles/sessions are static routes and win
  // over this dynamic one, so they are unaffected.
  fallback: false,
});

export const getStaticProps: GetStaticProps<
  PuzzleRatingPageProps,
  { rating: string }
> = async ({ params }) => {
  const band = Number(params?.rating);
  // fallback: false already guarantees membership; keep the guard so a
  // future fallback change can't silently serve an off-grid band.
  if (!BANDS.includes(band)) return { notFound: true };
  const bandMax = band + 99;

  const { puzzles: corpus } = await getPuzzleCorpus();
  const candidates = corpus.filter(
    (p) => p.rating >= band && p.rating <= bandMax,
  );
  // The eight most satisfying puzzles of the WHOLE band, not of an
  // arbitrary sample: popularity, then play volume; id as the final
  // tiebreak so two builds of the same commit emit identical pages.
  candidates.sort(
    (a, b) =>
      b.popularity - a.popularity ||
      b.nbPlays - a.nbPlays ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  const picked: LandingPuzzle[] = [];
  for (const p of candidates) {
    if (picked.length === PUZZLES_PER_PAGE) break;
    // Validate the full line at build time; a malformed puzzle is skipped
    // here, never shipped as a frozen board.
    const landing = toLandingPuzzle(p);
    if (landing) picked.push(landing);
  }

  return { props: { band, puzzles: picked } };
};

/* ------------------------------------------------------------------ */
/* Cards + page                                                        */
/* ------------------------------------------------------------------ */

const CARD_SX = {
  p: 2,
  borderRadius: "1.5rem",
  background: "rgba(20, 22, 28, 0.66)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(12px)",
} as const;

const GRID_SX = {
  display: "grid",
  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
  gap: 2.5,
} as const;

function PuzzleCard({
  puzzle,
  index,
  interactive,
}: {
  puzzle: LandingPuzzle;
  index: number;
  interactive: boolean;
}) {
  const sideLabel = puzzle.sideToMove === "white" ? "White" : "Black";
  return (
    <Box sx={CARD_SX}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          mb: 1.5,
        }}
      >
        <Typography
          component="h2"
          sx={{ fontSize: "0.9rem", fontWeight: 700, minWidth: 0 }}
          noWrap
        >
          <Box component="span" sx={{ color: "rgba(255,255,255,0.4)", mr: 0.75 }}>
            #{index + 1}
          </Box>
          {puzzle.themeLabel}
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          label={`Rated ${puzzle.rating}`}
          sx={{
            color: "rgba(255,255,255,0.75)",
            borderColor: "rgba(255,255,255,0.2)",
            flexShrink: 0,
          }}
        />
      </Box>

      {interactive ? (
        <InteractivePuzzleBoard puzzle={puzzle} />
      ) : (
        <>
          <StaticBoardDiagram
            displayFen={puzzle.displayFen}
            orientation={puzzle.sideToMove}
            label={`Chess puzzle rated ${puzzle.rating}, ${sideLabel} to move`}
            eager={index === 0}
          />
          <Typography
            sx={{
              mt: 1,
              textAlign: "center",
              fontSize: "0.82rem",
              fontWeight: 600,
              color: "rgba(255,255,255,0.6)",
            }}
          >
            {sideLabel} to move
          </Typography>
        </>
      )}
    </Box>
  );
}

export default function PuzzleRatingLandingPage({
  band,
  puzzles,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const bandMax = band + 99;
  const { user, loading } = useViewer();

  // Server HTML and the first client render show static diagrams
  // everywhere (mounted false ⇒ no hydration mismatch); interactive
  // boards swap in after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Gate states, in order of the auth lifecycle:
  //   loading      → cards 4+ render as plain static diagrams. NOTHING
  //                  gate-related mounts, so a signed-in visitor can never
  //                  see a flash of the gate.
  //   signed out   → cards 4+ blurred behind one PuzzleSignInGate card.
  //   signed in    → all cards interactive; the gate never mounts.
  const gateVisible = !loading && !user;
  const signedIn = !loading && !!user;

  const freePuzzles = puzzles.slice(0, FREE_PUZZLE_COUNT);
  const lockedPuzzles = puzzles.slice(FREE_PUZZLE_COUNT);

  const title = `Chess Puzzles Rated ${band}–${bandMax} · Chess Masti`;
  const description = `Solve free interactive chess puzzles rated ${band}–${bandMax} from the Lichess database — the most-played tactics in this band, playable right in your browser.`;

  const lockedGrid = (
    <Box sx={GRID_SX}>
      {lockedPuzzles.map((p, i) => (
        <PuzzleCard
          key={p.id}
          puzzle={p}
          index={FREE_PUZZLE_COUNT + i}
          interactive={mounted && signedIn}
        />
      ))}
    </Box>
  );

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${SITE_BASE}/puzzles/${band}`} />
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#0A0907" />
      </Head>

      <Box sx={{ maxWidth: 1100, mx: "auto", px: { xs: 1, sm: 2 }, py: { xs: 2, md: 4 } }}>
        <Typography
          component="h1"
          variant="h4"
          sx={{ fontWeight: 800, letterSpacing: "-0.02em", mb: 1 }}
        >
          Chess Puzzles Rated {band}–{bandMax}
        </Typography>
        <Typography
          sx={{ color: "rgba(255,255,255,0.6)", maxWidth: 640, mb: 3.5 }}
        >
          Eight of the most-played Lichess puzzles rated {band}–{bandMax}.
          Solve them right here — tap or drag a piece to move.
        </Typography>

        <Box sx={GRID_SX}>
          {freePuzzles.map((p, i) => (
            <PuzzleCard
              key={p.id}
              puzzle={p}
              index={i}
              interactive={mounted}
            />
          ))}
        </Box>

        <Box sx={{ mt: 2.5 }}>
          {gateVisible ? (
            <PuzzleSignInGate remainingCount={lockedPuzzles.length}>
              {lockedGrid}
            </PuzzleSignInGate>
          ) : (
            lockedGrid
          )}
        </Box>

        <Box sx={{ mt: 5, textAlign: "center" }}>
          <Button
            component={NextLink}
            href="/puzzles"
            variant="contained"
            sx={{
              textTransform: "none",
              fontWeight: 700,
              borderRadius: "12px",
              px: 3,
              py: 1.1,
            }}
          >
            Train endless puzzles in the Puzzle Coach
          </Button>
        </Box>

        <Box component="nav" aria-label="Puzzles by rating" sx={{ mt: 5 }}>
          <Typography
            sx={{
              fontSize: "0.8rem",
              fontWeight: 700,
              color: "rgba(255,255,255,0.5)",
              mb: 1,
            }}
          >
            Puzzles by rating
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {BANDS.map((b) =>
              b === band ? (
                <Chip
                  key={b}
                  size="small"
                  label={b}
                  sx={{
                    fontWeight: 700,
                    color: "#FB923C",
                    backgroundColor: "rgba(249,115,22,0.14)",
                  }}
                />
              ) : (
                <Chip
                  key={b}
                  size="small"
                  clickable
                  component={NextLink}
                  href={`/puzzles/${b}`}
                  label={b}
                  sx={{
                    color: "rgba(255,255,255,0.7)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                  }}
                />
              ),
            )}
          </Box>
        </Box>

        <Typography
          sx={{ mt: 4, fontSize: "0.72rem", color: "rgba(255,255,255,0.4)" }}
        >
          Puzzles from the{" "}
          <MuiLink
            href="https://database.lichess.org/#puzzles"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: "inherit" }}
          >
            Lichess puzzle database
          </MuiLink>{" "}
          (CC0). Piece images: “cburnett” set by Colin M.L. Burnett, GPL v2+.
        </Typography>
      </Box>
    </>
  );
}
