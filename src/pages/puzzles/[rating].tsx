import { useEffect, useRef, useState } from "react";
import type { GetStaticPaths, GetStaticProps, InferGetStaticPropsType } from "next";
import Head from "next/head";
import dynamic from "next/dynamic";
import NextLink from "next/link";
import { Chess } from "chess.js";
import { Box, Button, Chip, Link as MuiLink, Typography } from "@mui/material";
import { getPuzzleCorpus } from "@/lib/puzzle-feed/loadPuzzles";
import { parseSolutionMoves } from "@/lib/puzzleSolution";
import { findThemeReference } from "@/lib/puzzle/themeReference";
import { usePuzzleBoardState } from "@/hooks/usePuzzleBoardState";
import { DEFAULT_PUZZLE_THEME } from "@/components/puzzle/boardTheme";
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
 * below). This page pinned cburnett while the app default was "maestro"
 * (CC BY-NC-SA, non-commercial); the app default is now cburnett too, but
 * the pin stays deliberate — a landing page is public and crawled, so its
 * assets should not be able to change under it when someone edits a default.
 * See src/lib/licensing/pieceSetLicenses.ts.
 */

const BANDS = Array.from({ length: 17 }, (_, i) => 600 + i * 100);
const PUZZLES_PER_PAGE = 8;
const FREE_PUZZLE_COUNT = 3;
const LANDING_PIECE_SET = "cburnett";
const SITE_BASE = "https://chessmasti.com";

interface LandingPuzzle {
  id: string;
  /** Lichess-convention FEN: the position BEFORE the opponent's setup move. */
  fen: string;
  /** UCI line; solution[0] is the opponent's setup move. */
  solution: string[];
  rating: number;
  themeLabel: string;
  /** Position AFTER the setup move — what the solver actually faces. */
  displayFen: string;
  /** Solver's colour, derived from displayFen's side to move. */
  sideToMove: "white" | "black";
}

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

/** Tags that describe length/outcome rather than the tactical motif, so
 *  they make poor headline labels when the glossary has no entry. */
const NON_MOTIF_TAGS = new Set([
  "oneMove",
  "short",
  "long",
  "veryLong",
  "advantage",
  "equality",
  "crushing",
]);

/** "backRankMate" → "Back Rank Mate", "mateIn2" → "Mate In 2". */
function humanizeTheme(theme: string): string {
  return theme
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function primaryThemeLabel(themes: string[]): string {
  const ref = findThemeReference(themes);
  if (ref) return ref.title;
  const pick = themes.find((t) => !NON_MOTIF_TAGS.has(t)) ?? themes[0];
  return pick ? humanizeTheme(pick) : "Tactic";
}

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
    const { parsed, error } = parseSolutionMoves(p.fen, p.solution);
    if (error || parsed.length < 2) continue;
    let displayFen: string;
    try {
      const game = new Chess(p.fen);
      if (!game.move(parsed[0])) continue;
      displayFen = game.fen();
    } catch {
      continue;
    }
    picked.push({
      id: p.id,
      fen: p.fen,
      solution: p.solution,
      rating: p.rating,
      themeLabel: primaryThemeLabel(p.themes),
      displayFen,
      sideToMove: displayFen.split(" ")[1] === "b" ? "black" : "white",
    });
  }

  return { props: { band, puzzles: picked } };
};

/* ------------------------------------------------------------------ */
/* Static board diagram — server-renderable                            */
/* ------------------------------------------------------------------ */

const PIECE_NAMES: Record<string, string> = {
  P: "pawn",
  N: "knight",
  B: "bishop",
  R: "rook",
  Q: "queen",
  K: "king",
};

function pieceAlt(code: string): string {
  const color = code[0] === "w" ? "white" : "black";
  return `${color} ${PIECE_NAMES[code[1]] ?? "piece"}`;
}

/** Expand a FEN placement field into an 8×8 grid of piece codes ("wK",
 *  "" for empty), ordered top-left → bottom-right from the given POV. */
function fenToGrid(
  displayFen: string,
  orientation: "white" | "black",
): string[] {
  const placement = displayFen.split(" ")[0] ?? "";
  const rows = placement
    .split("/")
    .slice(0, 8)
    .map((rank) => {
      const cells: string[] = [];
      for (const ch of rank) {
        const n = Number(ch);
        if (Number.isInteger(n) && n > 0) {
          for (let k = 0; k < n && cells.length < 8; k++) cells.push("");
        } else if (cells.length < 8) {
          cells.push(`${ch === ch.toUpperCase() ? "w" : "b"}${ch.toUpperCase()}`);
        }
      }
      while (cells.length < 8) cells.push("");
      return cells;
    });
  while (rows.length < 8) rows.push(Array<string>(8).fill(""));
  if (orientation === "black") rows.reverse().forEach((r) => r.reverse());
  return rows.flat();
}

/**
 * Pure-DOM board diagram: CSS grid + piece <img>s, no react-chessboard.
 * This is what lands in the prerendered HTML (PuzzleBoardSurface cannot
 * SSR — react-chessboard + a localStorage-backed piece-set atom), and it
 * doubles as the inert board under the sign-in gate's blur.
 */
function StaticBoardDiagram({
  displayFen,
  orientation,
  label,
  eager,
}: {
  displayFen: string;
  orientation: "white" | "black";
  label: string;
  eager?: boolean;
}) {
  const cells = fenToGrid(displayFen, orientation);
  return (
    <Box
      role="img"
      aria-label={label}
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(8, 1fr)",
        width: "100%",
        maxWidth: 420,
        mx: "auto",
        aspectRatio: "1 / 1",
        borderRadius: DEFAULT_PUZZLE_THEME.radius,
        overflow: "hidden",
      }}
    >
      {cells.map((code, i) => {
        const light = (Math.floor(i / 8) + (i % 8)) % 2 === 0;
        return (
          <Box
            key={i}
            sx={{
              position: "relative",
              backgroundColor: light
                ? DEFAULT_PUZZLE_THEME.light
                : DEFAULT_PUZZLE_THEME.dark,
            }}
          >
            {code && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/piece/${LANDING_PIECE_SET}/${code}.svg`}
                alt={pieceAlt(code)}
                loading={eager ? undefined : "lazy"}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* Interactive board — mounts client-side only                         */
/* ------------------------------------------------------------------ */

const PuzzleBoardSurface = dynamic(
  () =>
    import("@/components/puzzle/PuzzleBoardSurface").then(
      (m) => m.PuzzleBoardSurface,
    ),
  { ssr: false },
);

const BOARD_MIN_WIDTH = 220;
const BOARD_MAX_WIDTH = 420;

function InteractivePuzzleBoard({ puzzle }: { puzzle: LandingPuzzle }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(320);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const w = Math.max(
        BOARD_MIN_WIDTH,
        Math.min(BOARD_MAX_WIDTH, Math.floor(el.clientWidth)),
      );
      setBoardWidth(w);
    };
    compute();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const board = usePuzzleBoardState({ puzzle });

  const turn = board.game.turn();
  const statusText = board.puzzleError
    ? "Puzzle data error — try another one."
    : board.status === "loading"
      ? "Loading…"
      : board.status === "solved"
        ? "Solved!"
        : board.status === "wrong"
          ? "Not quite — try again."
          : turn === "w"
            ? "White to move"
            : "Black to move";
  const statusColor =
    board.status === "solved"
      ? "success.main"
      : board.status === "wrong"
        ? "error.main"
        : "rgba(255,255,255,0.6)";

  return (
    <Box ref={containerRef}>
      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <PuzzleBoardSurface
          boardId={`PuzzleLanding-${puzzle.id}`}
          fen={board.game.fen()}
          orientation={board.boardOrientation}
          interactive={board.status === "playing" || board.status === "wrong"}
          onPieceDrop={board.onPieceDrop}
          lastMove={board.lastMoveSquares}
          wrongSquare={board.wrongSquare}
          flash={{ state: board.flash, flashKey: board.flashKey }}
          boardWidth={boardWidth}
          pieceSet={LANDING_PIECE_SET}
          animationMs={200}
        />
      </Box>
      <Typography
        sx={{
          mt: 1,
          textAlign: "center",
          fontSize: "0.82rem",
          fontWeight: 600,
          color: statusColor,
        }}
      >
        {statusText}
      </Typography>
    </Box>
  );
}

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
