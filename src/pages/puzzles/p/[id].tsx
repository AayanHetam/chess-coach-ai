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

/**
 * /puzzles/p/<id> — permalink to ONE puzzle from the bundled Lichess
 * corpus. This is the destination for per-puzzle links on reels and
 * social posts: the exact position from the video, playable.
 *
 * ISR with fallback:"blocking" — ~100k corpus ids is far too many to
 * prerender, so each page is generated on its first request and cached
 * for the life of the deployment (no revalidate: the corpus only
 * changes with a deploy). Unknown ids 404. Because generation happens
 * at REQUEST time, the CSV must be traced into this route's serverless
 * function — see the /puzzles/p/[id] entry in next.config.js. (The band
 * pages get away without one only because fallback:false reads the CSV
 * at build time.)
 *
 * No sign-in gate here, deliberately: a viewer arriving from a reel was
 * promised this exact puzzle. Gating the single thing the link offers
 * converts nobody; the band page below the board carries the funnel.
 *
 * Piece images are the "cburnett" set (GPLv2+, credited below) — the
 * app-default "maestro" is CC BY-NC-SA and must not be widened onto
 * public landing pages.
 */

const SITE_BASE = "https://chessmasti.com";
const BAND_MIN = 600;
const BAND_MAX = 2200;

interface PuzzlePermalinkProps {
  puzzle: LandingPuzzle;
  /** The 100-point band the puzzle falls in, clamped to the landing
   *  pages' 600–2200 grid so the band link never 404s. */
  band: number;
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: [],
  fallback: "blocking",
});

export const getStaticProps: GetStaticProps<
  PuzzlePermalinkProps,
  { id: string }
> = async ({ params }) => {
  const id = params?.id;
  // Lichess puzzle ids are short alphanumerics; reject anything else
  // before it reaches the corpus scan.
  if (!id || !/^[A-Za-z0-9]{4,8}$/.test(id)) return { notFound: true };

  const { puzzles } = await getPuzzleCorpus();
  const found = puzzles.find((p) => p.id === id);
  if (!found) return { notFound: true };

  const puzzle = toLandingPuzzle(found);
  if (!puzzle) return { notFound: true };

  const band = Math.min(
    BAND_MAX,
    Math.max(BAND_MIN, Math.floor(puzzle.rating / 100) * 100),
  );
  return { props: { puzzle, band } };
};

export default function PuzzlePermalinkPage({
  puzzle,
  band,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  // Server HTML and the first client render show the static diagram
  // (mounted false ⇒ no hydration mismatch); the interactive board
  // swaps in after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const sideLabel = puzzle.sideToMove === "white" ? "White" : "Black";
  const title = `${puzzle.themeLabel} Puzzle · Rated ${puzzle.rating} · Chess Masti`;
  const description = `${sideLabel} to move — a ${puzzle.themeLabel.toLowerCase()} puzzle rated ${puzzle.rating} from the Lichess database. Solve it right in your browser.`;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${SITE_BASE}/puzzles/p/${puzzle.id}`} />
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#0A0907" />
      </Head>

      <Box sx={{ maxWidth: 560, mx: "auto", px: { xs: 1, sm: 2 }, py: { xs: 2, md: 4 } }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            mb: 1,
          }}
        >
          <Typography
            component="h1"
            sx={{ fontSize: "1.35rem", fontWeight: 800, letterSpacing: "-0.02em", minWidth: 0 }}
            noWrap
          >
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
        <Typography sx={{ color: "rgba(255,255,255,0.6)", mb: 2.5 }}>
          {sideLabel} to move. Tap or drag a piece — the board tells you if
          you found it.
        </Typography>

        <Box
          sx={{
            p: 2,
            borderRadius: "1.5rem",
            background: "rgba(20, 22, 28, 0.66)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(12px)",
          }}
        >
          {mounted ? (
            <InteractivePuzzleBoard puzzle={puzzle} />
          ) : (
            <>
              <StaticBoardDiagram
                displayFen={puzzle.displayFen}
                orientation={puzzle.sideToMove}
                label={`Chess puzzle rated ${puzzle.rating}, ${sideLabel} to move`}
                eager
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

        <Box
          sx={{
            mt: 3,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <Button
            component={NextLink}
            href={`/puzzles/${band}`}
            variant="contained"
            sx={{
              textTransform: "none",
              fontWeight: 700,
              borderRadius: "12px",
              px: 3,
              py: 1.1,
            }}
          >
            More puzzles rated {band}–{band + 99}
          </Button>
          <MuiLink
            component={NextLink}
            href="/puzzles"
            sx={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.7)" }}
          >
            Train endless puzzles in the Puzzle Coach
          </MuiLink>
        </Box>

        <Typography
          sx={{ mt: 4, fontSize: "0.72rem", color: "rgba(255,255,255,0.4)" }}
        >
          Puzzle from the{" "}
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
