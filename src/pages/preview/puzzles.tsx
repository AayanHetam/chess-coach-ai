"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { Chess } from "chess.js";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { motion } from "framer-motion";
import Head from "next/head";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import {
  Check,
  ChevronRight,
  Lightbulb,
  RotateCcw,
  Shuffle,
  Sparkles,
  X,
} from "lucide-react";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
import { PuzzleCoachPanel } from "@/components/puzzle/PuzzleCoachPanel";
import type {
  CoachHighlight,
  MentionColor,
} from "@/lib/validation/puzzleHintSchemas";
import { pieceSetAtom } from "@/components/board/states";
import {
  DemoMoveDialog,
  DEMO_SPEED_MS,
  type DemoSpeedKey,
} from "@/components/puzzle/DemoMoveDialog";
import { parseSolutionMoves } from "@/lib/puzzleSolution";
import { usePuzzleFeed } from "@/hooks/usePuzzleFeed";
import type {
  PuzzleOutcome,
  PuzzleContext,
} from "@/lib/validation/puzzleChatSchemas";
import { useAuth } from "@/contexts/AuthContext";
import { puzzleStatsAtom, updatePuzzleStats } from "@/lib/puzzleRating";
import {
  puzzleResumeAtom,
  isResumeFresh,
  type PuzzleResumeState,
} from "@/lib/curriculum/resume";

const PuzzleBoardSurface = dynamic(
  () =>
    import("@/components/puzzle/PuzzleBoardSurface").then(
      (m) => m.PuzzleBoardSurface,
    ),
  { ssr: false },
);

/** Per-color fill for coach-triggered square overlays (was in PuzzleBoard.tsx).
 *  Translucent so the piece glyph still reads on top. Painted on the shared
 *  board via the generic `underlaySquareStyles` seam. */
const COACH_HIGHLIGHT_BG: Record<MentionColor, string> = {
  red: "rgba(239, 68, 68, 0.45)",
  blue: "rgba(59, 130, 246, 0.45)",
  yellow: "rgba(251, 191, 36, 0.45)",
  green: "rgba(34, 197, 94, 0.45)",
  orange: "rgba(255, 122, 26, 0.45)",
};

interface ActiveDemo {
  /** SAN sequence the coach asked us to play. */
  moves: string[];
  /** Anchor FEN — positions[i] = startFen then apply moves[0..i]. */
  startFen: string;
  /** Where to return when the demo finishes / is cancelled. */
  resumeFen: string;
  /** Per-move dwell. */
  speedMs: number;
  /** How many moves have been applied to startFen so far. 0 = anchor. */
  idx: number;
  /** True once idx === moves.length — banner replaces the timer. */
  finished: boolean;
}

/**
 * /preview/puzzles — dedicated puzzle-solving page with the interactive
 * Puzzle Coach as the primary right-column surface.
 *
 * Puzzles come from /api/puzzle-feed (static-CSV-backed, 100k Lichess
 * puzzles, no Neo4j required). The feed hook owns the queue + prefetch;
 * this page is just the board + filter UI + coach mount.
 */

const puzzleTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#FF7A1A" },
    secondary: { main: "#FB923C" },
    background: { default: "#0A0907", paper: "rgba(22,18,14,0.55)" },
    text: {
      primary: "rgba(255,240,224,0.94)",
      secondary: "rgba(255,240,224,0.55)",
    },
    divider: "rgba(255,255,255,0.06)",
  },
  typography: {
    fontFamily: "Inter, sans-serif",
    h1: { fontWeight: 800, letterSpacing: "-0.035em" },
    h2: { fontWeight: 700, letterSpacing: "-0.025em" },
    button: { textTransform: "none", fontWeight: 600 },
  },
});

const EASE_OUT_STRONG: [number, number, number, number] = [0.23, 1, 0.32, 1];

type AttemptStatus = "playing" | "wrong" | "solved";

/**
 * A compact set of the most-pedagogically-useful Lichess themes for
 * the filter chip row. The catalogue has 60+; surfacing all of them
 * would clutter the UI and most are rare. "All" = no theme filter.
 *
 * Names match the Lichess CSV theme column (camelCase, space-separated
 * within the cell) — see /api/puzzle-feed for the full catalogue.
 */
const QUICK_THEMES: Array<{ id: string | null; label: string }> = [
  { id: null, label: "All" },
  { id: "fork", label: "Fork" },
  { id: "pin", label: "Pin" },
  { id: "skewer", label: "Skewer" },
  { id: "discoveredAttack", label: "Discovered attack" },
  { id: "mateIn1", label: "Mate in 1" },
  { id: "mateIn2", label: "Mate in 2" },
  { id: "mateIn3", label: "Mate in 3" },
  { id: "backRankMate", label: "Back rank" },
  { id: "sacrifice", label: "Sacrifice" },
  { id: "endgame", label: "Endgame" },
  { id: "middlegame", label: "Middlegame" },
];

interface RatingBand {
  id: string;
  label: string;
  min: number;
  max: number;
}

const RATING_BANDS: RatingBand[] = [
  { id: "all", label: "Any", min: 400, max: 3000 },
  { id: "beginner", label: "<1200", min: 400, max: 1199 },
  { id: "intermediate", label: "1200–1599", min: 1200, max: 1599 },
  { id: "advanced", label: "1600–1999", min: 1600, max: 1999 },
  { id: "expert", label: "2000+", min: 2000, max: 3000 },
];

/**
 * Maps onboarding/placement focus-theme ids — canonical kebab Neo4j `:Theme.id`
 * values (see quizThemes.ts) — to the feed's Lichess theme vocabulary
 * (camelCase) so the stream can be seeded from the user's stated weaknesses.
 */
const FEED_THEME_BY_FOCUS: Record<string, string> = {
  "hanging-piece": "hangingPiece",
  fork: "fork",
  "double-attack": "fork",
  pin: "pin",
  skewer: "skewer",
  "discovered-attack": "discoveredAttack",
  "back-rank": "backRankMate",
  "exposed-king": "kingsideAttack",
  "mating-attack": "mate",
  sacrifice: "sacrifice",
  endgame: "endgame",
  promotion: "promotion",
  "advanced-pawn": "advancedPawn",
};

/**
 * Inverse mapping — records /puzzles solves under the curriculum's kebab theme
 * keys so per-theme mastery stays unified with the placement test +
 * SessionRunner (both of which read themeStats by kebab `:Theme.id`).
 */
const FEED_TO_CURRICULUM_THEME: Record<string, string> = {
  hangingPiece: "hanging-piece",
  fork: "fork",
  pin: "pin",
  skewer: "skewer",
  discoveredAttack: "discovered-attack",
  backRankMate: "back-rank",
  exposedKing: "exposed-king",
  kingsideAttack: "exposed-king",
  mate: "mating-attack",
  mateIn1: "mating-attack",
  mateIn2: "mating-attack",
  mateIn3: "mating-attack",
  sacrifice: "sacrifice",
  endgame: "endgame",
  promotion: "promotion",
  advancedPawn: "advanced-pawn",
};

/** First focus theme that maps to a feed theme, or undefined. */
function firstFeedThemeForFocus(
  focus: string[] | undefined,
): string | undefined {
  if (!focus) return undefined;
  for (const f of focus) {
    const mapped = FEED_THEME_BY_FOCUS[f];
    if (mapped) return mapped;
  }
  return undefined;
}

/**
 * Picks the most pedagogically-meaningful theme from a feed puzzle's theme
 * list for per-theme stat tracking. Prefers a curriculum-mapped motif, then a
 * quick-filter theme, else the first listed (Lichess mixes in noise themes
 * like "crushing"/"short").
 */
function pickPrimaryTheme(themes: string[] | undefined): string {
  if (!themes || themes.length === 0) return "tactics";
  const mapped = themes.find((t) => FEED_TO_CURRICULUM_THEME[t]);
  if (mapped) return FEED_TO_CURRICULUM_THEME[mapped];
  const quick = themes.find((t) => QUICK_THEMES.some((q) => q.id === t));
  if (quick) return quick;
  return themes[0];
}

export default function PreviewPuzzlesPage() {
  const { profile, updateProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useAtom(puzzleStatsAtom);
  const [resume, setResume] = useAtom(puzzleResumeAtom);
  const pieceSet = useAtomValue(pieceSetAtom);

  const [activeTheme, setActiveTheme] = useState<string | null>(null);
  const [activeBand, setActiveBand] = useState<string>("all");

  // Snapshot any fresh "continue where you left off" entry at mount, before
  // the persist effect below can overwrite it with the feed's first puzzle.
  const initialResumeRef = useRef<PuzzleResumeState | null>(null);
  const resumeReadRef = useRef(false);
  if (!resumeReadRef.current) {
    resumeReadRef.current = true;
    initialResumeRef.current = isResumeFresh(resume, Date.now()) ? resume : null;
  }

  // The resumed puzzle takes precedence over the feed until the user moves on.
  const [resumeOverride, setResumeOverride] = useState<PuzzleContext | null>(
    null,
  );
  // One-shot guards: resume is applied synchronously on mount; the rating +
  // focus-theme seed waits for auth to resolve.
  const resumeAppliedRef = useRef(false);
  const focusSeededRef = useRef(false);

  // Grading bookkeeping (mirrors SessionRunner): one grade per puzzle id, and
  // a per-puzzle start clock for solve time.
  const gradedRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  // Debounced live-rating → profile mirror.
  const mirrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMirroredRef = useRef<number | null>(null);

  // Seed the feed from the user's live rating window (single-rating model).
  // The seeding effect below refines this with focus themes / resume once auth
  // resolves; reading stats here is best-effort (localStorage-hydrated).
  const feed = usePuzzleFeed({
    themes: undefined,
    ratingMin: Math.max(400, stats.rating - 150),
    ratingMax: Math.min(3000, stats.rating + 150),
  });

  // Push filter changes into the feed hook.
  const applyFilters = useCallback(
    (themeId: string | null, bandId: string) => {
      const band = RATING_BANDS.find((b) => b.id === bandId) ?? RATING_BANDS[0];
      feed.setFilters({
        themes: themeId ? [themeId] : undefined,
        ratingMin: band.min,
        ratingMax: band.max,
      });
    },
    [feed],
  );

  const handleThemeClick = useCallback(
    (id: string | null) => {
      // A manual filter pick exits "resume" mode — the user wants a new stream.
      setResumeOverride(null);
      setActiveTheme(id);
      applyFilters(id, activeBand);
    },
    [activeBand, applyFilters],
  );

  const handleBandClick = useCallback(
    (bandId: string) => {
      setResumeOverride(null);
      setActiveBand(bandId);
      applyFilters(activeTheme, bandId);
    },
    [activeTheme, applyFilters],
  );

  // The resumed puzzle wins until cleared; otherwise the feed's current puzzle.
  // The resume effect sets the override synchronously on mount, before the
  // feed's first (async) batch resolves, so there's no wrong-puzzle flash.
  const puzzle = resumeOverride ?? feed.currentPuzzle;

  // Apply the opponent's setup move (solution[0]) to get the student's
  // starting position. Board always renders from this FEN.
  const studentStartFen = useMemo(() => {
    if (!puzzle) return null;
    try {
      const g = new Chess(puzzle.fen);
      const opp = puzzle.solution[0];
      if (opp) {
        g.move({
          from: opp.slice(0, 2),
          to: opp.slice(2, 4),
          promotion: opp.length > 4 ? opp.slice(4, 5) : undefined,
        });
      }
      return g.fen();
    } catch {
      return puzzle.fen;
    }
  }, [puzzle]);

  // Parse the user-side solution moves. solution[1..] in UCI.
  const parsedMoves = useMemo(() => {
    if (!puzzle || !studentStartFen) return [];
    return parseSolutionMoves(studentStartFen, puzzle.solution.slice(1)).parsed;
  }, [puzzle, studentStartFen]);

  // Board state.
  const [game, setGame] = useState<Chess>(() => new Chess());
  const [moveIdx, setMoveIdx] = useState(0);
  const [status, setStatus] = useState<AttemptStatus>("playing");
  const [lastMove, setLastMove] = useState<[string, string] | null>(null);
  const [wrongSquare, setWrongSquare] = useState<string | null>(null);
  const [lastWrongSan, setLastWrongSan] = useState<string | null>(null);
  const [wrongAttempts, setWrongAttempts] = useState(0);

  // Coach demo state — coach asks "show on board", user picks speed in
  // the dialog, then `activeDemo` runs the moves on the main board while
  // the user's puzzle attempt is paused. resumeFen flips it back when done.
  const [pendingDemoMoves, setPendingDemoMoves] = useState<string[] | null>(
    null,
  );
  const [activeDemo, setActiveDemo] = useState<ActiveDemo | null>(null);

  // PR-C.3: coach-triggered square overlays. When the user taps a chess-
  // term chip in a hint reply and the term carries a structured mention,
  // we set this; the board renders translucent overlays. Cleared on next
  // attempt / puzzle change / another highlight click.
  const [coachHighlights, setCoachHighlights] = useState<CoachHighlight | null>(
    null,
  );

  // Reset board state whenever the puzzle changes.
  useEffect(() => {
    if (!studentStartFen) return;
    setGame(new Chess(studentStartFen));
    setMoveIdx(0);
    setStatus("playing");
    setLastMove(null);
    setWrongSquare(null);
    setLastWrongSan(null);
    setWrongAttempts(0);
    setPendingDemoMoves(null);
    setActiveDemo(null);
    setCoachHighlights(null);
  }, [studentStartFen]);

  // Reset the grading clock + guard whenever a new puzzle is shown.
  useEffect(() => {
    gradedRef.current = null;
    startTimeRef.current = Date.now();
  }, [puzzle?.id]);

  // Resume the last puzzle (independent of auth) so we never flash a different
  // puzzle first — unless the URL carries an explicit ?theme= deep-link, which
  // takes the user straight into that theme instead of their saved spot.
  useEffect(() => {
    if (resumeAppliedRef.current || !router.isReady) return;
    resumeAppliedRef.current = true;
    if (router.query.theme) return;
    const saved = initialResumeRef.current;
    if (saved) {
      setResumeOverride(saved.puzzle);
      feed.setFilters(saved.filters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // Seed the feed once auth + router resolve: an explicit ?theme= wins, else
  // the user's rating window + top focus theme (skipped when a resumed puzzle
  // is driving the stream). One-shot so a later solve can't reseed mid-session.
  useEffect(() => {
    if (focusSeededRef.current || authLoading || !router.isReady) return;
    focusSeededRef.current = true;
    const queryTheme =
      typeof router.query.theme === "string" ? router.query.theme : undefined;
    // A saved resume drives the stream unless the user deep-linked a theme.
    if (!queryTheme && initialResumeRef.current) return;
    const focusTheme = queryTheme
      ? FEED_THEME_BY_FOCUS[queryTheme] ?? queryTheme
      : firstFeedThemeForFocus(profile?.focusThemes);
    feed.setFilters({
      themes: focusTheme ? [focusTheme] : undefined,
      ratingMin: Math.max(400, stats.rating - 150),
      ratingMax: Math.min(3000, stats.rating + 150),
    });
    if (focusTheme && QUICK_THEMES.some((t) => t.id === focusTheme)) {
      setActiveTheme(focusTheme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, router.isReady]);

  // Grade the rating on solve (first-try only counts as solved, mirroring
  // SessionRunner so a wrong-then-solved is a miss). One grade per puzzle.
  useEffect(() => {
    if (status !== "solved" || !puzzle) return;
    if (gradedRef.current === puzzle.id) return;
    gradedRef.current = puzzle.id;
    setStats((prev) =>
      updatePuzzleStats(prev, {
        puzzleId: puzzle.id,
        // Feed puzzles always carry a rating; fall back to the player's own
        // (neutral Elo) on the rare untagged puzzle.
        puzzleRating: puzzle.rating ?? prev.rating,
        solved: wrongAttempts === 0,
        timeMs: Math.max(0, Date.now() - startTimeRef.current),
        theme: pickPrimaryTheme(puzzle.themes),
        timestamp: Date.now(),
      }),
    );
  }, [status, puzzle, wrongAttempts, setStats]);

  // Constant save: persist the active puzzle + filters so a returning user
  // resumes exactly here.
  useEffect(() => {
    if (!puzzle) return;
    setResume({ puzzle, filters: feed.filters, updatedAt: Date.now() });
  }, [puzzle, feed.filters, setResume]);

  // Mirror the live rating to the profile (cross-device + reminder copy),
  // debounced so rapid solves coalesce into a single write.
  useEffect(() => {
    if (!profile) return;
    if (lastMirroredRef.current === stats.rating) return;
    if (mirrorTimerRef.current) clearTimeout(mirrorTimerRef.current);
    mirrorTimerRef.current = setTimeout(() => {
      lastMirroredRef.current = stats.rating;
      void updateProfile({
        liveRatingSnapshot: stats.rating,
        liveRatingSnapshotAt: Date.now(),
      }).catch(() => {});
    }, 4000);
    return () => {
      if (mirrorTimerRef.current) clearTimeout(mirrorTimerRef.current);
    };
  }, [stats.rating, profile, updateProfile]);

  // "wrong" status auto-reverts to "playing" so the user can retry without
  // any "reset" gesture. Re-keys on wrongAttempts so each new wrong move
  // restarts the flash window. The board's wrongSquare highlight also
  // clears when the flash ends. coachOutcome stays "wrong" via wrongAttempts
  // — the coach should keep reacting to the wrong attempt even after the
  // visual flash fades.
  useEffect(() => {
    if (status !== "wrong") return;
    const t = setTimeout(() => {
      setStatus("playing");
      setWrongSquare(null);
    }, 1400);
    return () => clearTimeout(t);
  }, [status, wrongAttempts]);

  const orientation = useMemo<"white" | "black">(() => {
    if (!studentStartFen) return "white";
    try {
      return new Chess(studentStartFen).turn() === "w" ? "white" : "black";
    } catch {
      return "white";
    }
  }, [studentStartFen]);

  // Coach asks to demo a line via [SHOW_MOVE:...]. Stash the moves so the
  // dialog opens with confirmation + speed pick.
  const handleShowCoachHighlight = useCallback(
    (highlight: CoachHighlight) => {
      setCoachHighlights(highlight);
    },
    [],
  );

  const handleCoachDemoRequest = useCallback((moves: string[]) => {
    if (moves.length === 0) return;
    setPendingDemoMoves(moves);
  }, []);

  // Confirmed in the dialog. Snapshot resumeFen now (where the user was
  // mid-attempt) so we can restore it cleanly when the demo finishes.
  const handleDemoConfirm = useCallback(
    (speed: DemoSpeedKey) => {
      const moves = pendingDemoMoves;
      setPendingDemoMoves(null);
      if (!moves || moves.length === 0) return;
      setActiveDemo({
        moves,
        startFen: game.fen(),
        resumeFen: game.fen(),
        speedMs: DEMO_SPEED_MS[speed],
        idx: 0,
        finished: false,
      });
    },
    [pendingDemoMoves, game],
  );

  const handleDemoCancel = useCallback(() => {
    setPendingDemoMoves(null);
  }, []);

  const handleDemoEnd = useCallback(() => {
    setActiveDemo(null);
  }, []);

  // Advance the demo by one move every speedMs until exhausted. Cleanup
  // cancels the pending tick if the demo finishes / is cancelled / unmounts.
  useEffect(() => {
    if (!activeDemo) return;
    if (activeDemo.idx >= activeDemo.moves.length) {
      if (!activeDemo.finished) {
        setActiveDemo((d) => (d ? { ...d, finished: true } : null));
      }
      return;
    }
    const t = setTimeout(() => {
      setActiveDemo((d) => (d ? { ...d, idx: d.idx + 1 } : null));
    }, activeDemo.speedMs);
    return () => clearTimeout(t);
  }, [activeDemo]);

  // FEN the board renders. During an active demo, walks through the SAN
  // sequence in real time (react-chessboard animates each transition).
  // Outside of demo mode, this is just the user's attempt position.
  const displayFen = useMemo(() => {
    if (!activeDemo) return game.fen();
    const g = new Chess(activeDemo.startFen);
    for (let i = 0; i < activeDemo.idx; i++) {
      try {
        const r = g.move(activeDemo.moves[i]);
        if (!r) break;
      } catch {
        break;
      }
    }
    return g.fen();
  }, [activeDemo, game]);

  // Last-move highlight: during demo, the most recently played ply; outside,
  // the user's last accepted move.
  const displayLastMove = useMemo<[string, string] | null>(() => {
    if (!activeDemo || activeDemo.idx === 0) return lastMove;
    const g = new Chess(activeDemo.startFen);
    let last: { from: string; to: string } | null = null;
    for (let i = 0; i < activeDemo.idx; i++) {
      try {
        const r = g.move(activeDemo.moves[i]);
        if (!r) break;
        last = { from: r.from, to: r.to };
      } catch {
        break;
      }
    }
    return last ? [last.from, last.to] : lastMove;
  }, [activeDemo, lastMove]);

  const handleMove = useCallback(
    (orig: string, dest: string): boolean => {
      if (status === "solved") return false;
      // Any attempt clears the coach overlay — it was a hint for THIS
      // move, not the next one.
      setCoachHighlights(null);
      const expected = parsedMoves[moveIdx];
      if (!expected) return false;
      const isCorrect = orig === expected.from && dest === expected.to;
      if (!isCorrect) {
        let attemptedSan: string | null = null;
        try {
          const probe = new Chess(game.fen());
          const r = probe.move({ from: orig, to: dest, promotion: "q" });
          if (r) attemptedSan = r.san;
        } catch {
          /* ignore */
        }
        setLastWrongSan(attemptedSan);
        setWrongSquare(dest);
        setWrongAttempts((n) => n + 1);
        // "wrong" is a transient flash, not a terminal lock — the auto-revert
        // effect below flips status back to "playing" after ~1.4s so the user
        // can retry as many times as they want. `coachOutcome` separately
        // sticks to "wrong" via the wrongAttempts counter, so the coach still
        // knows the user made a wrong attempt.
        setStatus("wrong");
        return false;
      }

      const next = new Chess(game.fen());
      const userMove = next.move({
        from: expected.from,
        to: expected.to,
        promotion: expected.promotion,
      });
      if (!userMove) return false;
      setGame(next);
      setLastMove([expected.from, expected.to]);
      setWrongSquare(null);

      const nextIdx = moveIdx + 1;
      if (nextIdx >= parsedMoves.length) {
        setMoveIdx(nextIdx);
        setStatus("solved");
        return true;
      }

      const opp = parsedMoves[nextIdx];
      setTimeout(() => {
        const g2 = new Chess(next.fen());
        const oppMove = g2.move({
          from: opp.from,
          to: opp.to,
          promotion: opp.promotion,
        });
        if (!oppMove) return;
        setGame(g2);
        setLastMove([opp.from, opp.to]);
        const after = nextIdx + 1;
        setMoveIdx(after);
        setStatus(after >= parsedMoves.length ? "solved" : "playing");
      }, 420);

      setMoveIdx(nextIdx);
      setStatus("playing");
      return true;
    },
    [game, moveIdx, parsedMoves, status],
  );

  const handleReset = useCallback(() => {
    if (!studentStartFen) return;
    setGame(new Chess(studentStartFen));
    setMoveIdx(0);
    setStatus("playing");
    setLastMove(null);
    setWrongSquare(null);
    setLastWrongSan(null);
    setWrongAttempts(0);
  }, [studentStartFen]);

  const handleNextPuzzle = useCallback(() => {
    // Every puzzle, solved or not, moves the rating: an unsolved skip counts as
    // a miss (unless it was already graded by solving).
    if (puzzle && gradedRef.current !== puzzle.id) {
      gradedRef.current = puzzle.id;
      setStats((prev) =>
        updatePuzzleStats(prev, {
          puzzleId: puzzle.id,
          puzzleRating: puzzle.rating ?? prev.rating,
          solved: false,
          timeMs: Math.max(0, Date.now() - startTimeRef.current),
          theme: pickPrimaryTheme(puzzle.themes),
          timestamp: Date.now(),
        }),
      );
    }
    // Clearing the resume override reveals the feed's next puzzle; otherwise
    // advance the feed itself.
    if (resumeOverride) {
      setResumeOverride(null);
    } else {
      feed.advance();
    }
  }, [puzzle, resumeOverride, setStats, feed]);

  const coachOutcome: PuzzleOutcome = useMemo(() => {
    if (status === "solved") return "solved";
    // Sticky on wrongAttempts (not on transient status === "wrong") so the
    // coach keeps seeing "wrong" after the visual flash fades.
    if (wrongAttempts > 0) return "wrong";
    return "unattempted";
  }, [status, wrongAttempts]);

  // Demo locks out interaction — the coach is driving. The wrong-square
  // flash is also suppressed during demo so red overlays don't bleed into
  // a teaching moment.
  const interactive = status !== "solved" && !!puzzle && !activeDemo;
  const boardWrongSquare =
    !activeDemo && wrongSquare && status === "wrong" ? wrongSquare : null;

  // Convert coach-triggered highlights into the shared board's generic
  // underlay-style seam (the board has no coach concept of its own).
  const coachUnderlay = useMemo(() => {
    if (activeDemo || !coachHighlights || coachHighlights.squares.length === 0) {
      return undefined;
    }
    const fill = COACH_HIGHLIGHT_BG[coachHighlights.color];
    const styles: Record<string, { background: string }> = {};
    for (const sq of coachHighlights.squares) {
      if (/^[a-h][1-8]$/.test(sq)) styles[sq] = { background: fill };
    }
    return styles;
  }, [activeDemo, coachHighlights]);

  // Board → page move sink. The shared board doesn't judge legality (each
  // surface owns its own move semantics), so we replicate the legality probe
  // PuzzleBoard.tsx used to do — illegal drags snap back silently rather than
  // registering as a wrong attempt — then hand off to handleMove.
  const onBoardMove = useCallback(
    (from: string, to: string): boolean => {
      try {
        const probe = new Chess(game.fen());
        if (!probe.move({ from, to, promotion: "q" })) return false;
      } catch {
        return false;
      }
      return handleMove(from, to);
    },
    [game, handleMove],
  );

  return (
    <ThemeProvider theme={puzzleTheme}>
      <Head>
        <title>Puzzle Coach · Chess Masti</title>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#0A0907" />
        <style>{`
          html, body { background-color: #0A0907; color-scheme: dark; margin: 0; }
          ::-webkit-scrollbar { width: 8px; height: 8px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb {
            background: rgba(255,122,26,0.18);
            border-radius: 4px;
          }
        `}</style>
      </Head>

      <GradientBackdrop />

      <Box
        sx={{
          minHeight: "100vh",
          color: "rgba(255,240,224,0.94)",
          pt: 2,
          pb: 4,
          px: { xs: 2, md: 3 },
        }}
      >
        <NavPill active="practice" badge={{ label: "Puzzle Coach" }} />

        <Box sx={{ maxWidth: 1500, mx: "auto", mt: 3 }}>
          {/* Page header — compact, doesn't compete with the board */}
          <Box sx={{ mb: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={1.5} mb={1.25}>
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 1,
                  px: 1.5,
                  py: 0.6,
                  borderRadius: "999px",
                  background: "rgba(255,122,26,0.08)",
                  border: "1px solid rgba(255,122,26,0.22)",
                }}
              >
                <Sparkles size={12} color="#FFD1A8" />
                <Typography
                  sx={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    letterSpacing: "0.18em",
                    color: "#FFD1A8",
                    textTransform: "uppercase",
                  }}
                >
                  Puzzle Coach
                </Typography>
              </Box>
              {feed.totalAvailable !== null && (
                <Typography
                  sx={{
                    fontSize: "0.74rem",
                    color: "rgba(255,240,224,0.45)",
                    fontFamily: "Monaco, Menlo, monospace",
                  }}
                >
                  {feed.totalAvailable.toLocaleString()} matching
                </Typography>
              )}
            </Stack>
            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: "1.8rem", md: "2.4rem" },
                color: "rgba(255,240,224,0.96)",
                lineHeight: 1.05,
                maxWidth: 760,
              }}
            >
              Solve. Then{" "}
              <Box
                component="span"
                sx={{
                  background:
                    "linear-gradient(135deg, #FF7A1A, #FB923C, #FBBF24)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                understand why.
              </Box>
            </Typography>
          </Box>

          {/* Filter row — themes + rating band */}
          <Box
            sx={{
              mb: 3,
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              gap: { xs: 1.5, md: 3 },
              alignItems: { xs: "flex-start", md: "center" },
            }}
          >
            <FilterChipRow
              label="Theme"
              chips={QUICK_THEMES.map((t) => ({
                id: t.id === null ? "__all__" : t.id,
                label: t.label,
                active: activeTheme === t.id,
              }))}
              onClick={(id) =>
                handleThemeClick(id === "__all__" ? null : id)
              }
            />
            <Box sx={{ flex: 1 }} />
            <FilterChipRow
              label="Rating"
              chips={RATING_BANDS.map((b) => ({
                id: b.id,
                label: b.label,
                active: activeBand === b.id,
              }))}
              onClick={handleBandClick}
            />
          </Box>

          {/* Main grid: board + coach */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                lg: "minmax(0, 1fr) minmax(440px, 540px)",
              },
              gap: { xs: 3, lg: 3.5 },
              alignItems: "stretch",
              minHeight: { lg: "clamp(540px, 70vh, 740px)" },
            }}
          >
            {/* Board column */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box
                sx={{
                  position: "relative",
                  borderRadius: "1.5rem",
                  background:
                    "linear-gradient(135deg, rgba(255,122,26,0.04), rgba(22,18,14,0.6))",
                  backdropFilter: "blur(16px) saturate(150%)",
                  WebkitBackdropFilter: "blur(16px) saturate(150%)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow:
                    status === "solved"
                      ? "0 24px 64px -16px rgba(34,197,94,0.25), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(34,197,94,0.32)"
                      : status === "wrong"
                      ? "0 24px 64px -16px rgba(239,68,68,0.2), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(239,68,68,0.32)"
                      : "0 24px 64px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
                  transition:
                    "box-shadow 320ms cubic-bezier(0.23, 1, 0.32, 1)",
                  p: { xs: 2, md: 3 },
                  minHeight: 540,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {puzzle && studentStartFen ? (
                  <>
                    <Box
                      sx={{
                        maxWidth: { xs: "100%", md: 540 },
                        mx: "auto",
                        width: "100%",
                        borderRadius: "0.85rem",
                        overflow: "hidden",
                        boxShadow: "0 0 0 1px rgba(255,255,255,0.06)",
                      }}
                    >
                      <PuzzleBoardSurface
                        boardId="PuzzleBoard"
                        fen={displayFen}
                        orientation={orientation}
                        interactive={interactive}
                        onPieceDrop={onBoardMove}
                        lastMove={
                          displayLastMove
                            ? {
                                from: displayLastMove[0],
                                to: displayLastMove[1],
                              }
                            : null
                        }
                        wrongSquare={boardWrongSquare}
                        underlaySquareStyles={coachUnderlay}
                        pieceSet={pieceSet}
                      />
                      {activeDemo && (
                        <Box
                          sx={{
                            position: "absolute",
                            top: 12,
                            left: "50%",
                            transform: "translateX(-50%)",
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            px: 1.5,
                            py: 0.75,
                            borderRadius: "999px",
                            background: "rgba(22,18,14,0.92)",
                            backdropFilter: "blur(10px)",
                            border: "1px solid rgba(255,122,26,0.32)",
                            boxShadow:
                              "0 12px 32px -10px rgba(0,0,0,0.5)",
                            zIndex: 5,
                          }}
                        >
                          <Sparkles size={12} color="#FFD1A8" />
                          <Typography
                            sx={{
                              fontSize: "0.74rem",
                              fontWeight: 600,
                              color: "rgba(255,240,224,0.92)",
                            }}
                          >
                            {activeDemo.finished
                              ? "Demo finished"
                              : `Coach is showing • ${activeDemo.idx}/${activeDemo.moves.length}`}
                          </Typography>
                          <Button
                            onClick={handleDemoEnd}
                            size="small"
                            sx={{
                              ml: 0.5,
                              px: 1.25,
                              py: 0.2,
                              minHeight: 0,
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              borderRadius: "999px",
                              color: "#FFD1A8",
                              background: "rgba(255,122,26,0.14)",
                              border: "1px solid rgba(255,122,26,0.32)",
                              textTransform: "none",
                              "&:hover": {
                                background: "rgba(255,122,26,0.22)",
                              },
                            }}
                          >
                            {activeDemo.finished
                              ? "Back to your move"
                              : "Stop"}
                          </Button>
                        </Box>
                      )}
                    </Box>

                    {/* Status row */}
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1.5}
                      sx={{ mt: 2, flexWrap: "wrap" }}
                    >
                      <Box
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 0.75,
                          px: 1.5,
                          py: 0.6,
                          borderRadius: "999px",
                          background:
                            status === "solved"
                              ? "rgba(34,197,94,0.14)"
                              : status === "wrong"
                              ? "rgba(239,68,68,0.14)"
                              : "rgba(255,122,26,0.1)",
                          border:
                            status === "solved"
                              ? "1px solid rgba(34,197,94,0.35)"
                              : status === "wrong"
                              ? "1px solid rgba(239,68,68,0.35)"
                              : "1px solid rgba(255,122,26,0.28)",
                        }}
                      >
                        {status === "solved" ? (
                          <Check size={13} color="#86efac" />
                        ) : status === "wrong" ? (
                          <X size={13} color="#fca5a5" />
                        ) : (
                          <Lightbulb size={13} color="#FFD1A8" />
                        )}
                        <Typography
                          sx={{
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            color:
                              status === "solved"
                                ? "#86efac"
                                : status === "wrong"
                                ? "#fca5a5"
                                : "#FFD1A8",
                          }}
                        >
                          {status === "solved"
                            ? "Solved"
                            : status === "wrong"
                            ? "Try again"
                            : `${
                                game.turn() === "w" ? "White" : "Black"
                              } to move`}
                        </Typography>
                      </Box>

                      <Typography
                        sx={{
                          fontSize: "0.78rem",
                          color: "rgba(255,240,224,0.5)",
                          fontFamily: "Monaco, Menlo, monospace",
                        }}
                      >
                        #{puzzle.id}
                        {puzzle.rating ? ` · ${puzzle.rating}` : ""}
                      </Typography>

                      <Box sx={{ flex: 1 }} />

                      <IconButton
                        size="small"
                        onClick={handleReset}
                        sx={{
                          color: "rgba(255,240,224,0.55)",
                          "&:hover": {
                            color: "#FFD1A8",
                            background: "rgba(255,122,26,0.08)",
                          },
                        }}
                        aria-label="Reset puzzle"
                      >
                        <RotateCcw size={15} />
                      </IconButton>

                      <Button
                        onClick={handleNextPuzzle}
                        endIcon={
                          status === "solved" ? (
                            <ChevronRight size={15} />
                          ) : (
                            <Shuffle size={14} />
                          )
                        }
                        sx={{
                          px: 2,
                          py: 0.75,
                          borderRadius: "999px",
                          background:
                            status === "solved"
                              ? "linear-gradient(135deg, #FF7A1A, #FB923C)"
                              : "rgba(22,18,14,0.7)",
                          color:
                            status === "solved"
                              ? "#0A0907"
                              : "rgba(255,240,224,0.85)",
                          border:
                            status === "solved"
                              ? "none"
                              : "1px solid rgba(255,255,255,0.08)",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          "&:hover": {
                            background:
                              status === "solved"
                                ? "linear-gradient(135deg, #FB923C, #FBBF24)"
                                : "rgba(22,18,14,0.85)",
                            borderColor: "rgba(255,122,26,0.3)",
                          },
                        }}
                      >
                        Next puzzle
                      </Button>
                    </Stack>
                  </>
                ) : (
                  <Box
                    sx={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                      color: "rgba(255,240,224,0.55)",
                      textAlign: "center",
                      px: 2,
                    }}
                  >
                    {feed.loading ? (
                      <>
                        <CircularProgress
                          size={28}
                          sx={{ color: "#FF7A1A" }}
                        />
                        <Typography
                          sx={{ fontSize: "0.92rem", fontWeight: 600 }}
                        >
                          Loading puzzles…
                        </Typography>
                      </>
                    ) : feed.error ? (
                      <>
                        <Typography
                          sx={{
                            color: "#fca5a5",
                            fontSize: "0.92rem",
                            fontWeight: 600,
                          }}
                        >
                          Couldn&apos;t load puzzles
                        </Typography>
                        <Typography
                          sx={{
                            color: "rgba(255,240,224,0.45)",
                            fontSize: "0.78rem",
                            fontFamily: "Monaco, Menlo, monospace",
                          }}
                        >
                          {feed.error}
                        </Typography>
                        <Button
                          onClick={feed.refresh}
                          sx={{
                            mt: 1,
                            px: 2,
                            py: 0.75,
                            borderRadius: "999px",
                            background: "rgba(255,122,26,0.12)",
                            border: "1px solid rgba(255,122,26,0.35)",
                            color: "#FFD1A8",
                            fontSize: "0.82rem",
                            fontWeight: 600,
                          }}
                        >
                          Try again
                        </Button>
                      </>
                    ) : (
                      <>
                        <Typography
                          sx={{ fontSize: "0.92rem", fontWeight: 600 }}
                        >
                          No puzzles match these filters
                        </Typography>
                        <Typography
                          sx={{
                            color: "rgba(255,240,224,0.45)",
                            fontSize: "0.82rem",
                            maxWidth: 320,
                          }}
                        >
                          Try a different theme or rating band, or hit
                          &quot;Any&quot; to reset.
                        </Typography>
                      </>
                    )}
                  </Box>
                )}
              </Box>
            </Box>

            {/* Coach column */}
            <motion.div
              initial={{ opacity: 0, transform: "translateY(8px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              transition={{
                duration: 0.36,
                delay: 0.12,
                ease: EASE_OUT_STRONG,
              }}
              style={{
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {puzzle ? (
                <PuzzleCoachPanel
                  puzzle={puzzle}
                  outcome={coachOutcome}
                  userAttemptSan={lastWrongSan}
                  onRequestMorePuzzles={handleNextPuzzle}
                  onResetPuzzle={handleReset}
                  onCoachDemoRequest={handleCoachDemoRequest}
                  onShowCoachHighlight={handleShowCoachHighlight}
                />
              ) : (
                <Box
                  sx={{
                    flex: 1,
                    minHeight: 320,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "1.5rem",
                    background: "rgba(22,18,14,0.5)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    color: "rgba(255,240,224,0.4)",
                    fontSize: "0.85rem",
                  }}
                >
                  Coach activates with the first puzzle.
                </Box>
              )}
            </motion.div>
          </Box>
        </Box>
      </Box>

      <DemoMoveDialog
        open={pendingDemoMoves !== null}
        moves={pendingDemoMoves ?? []}
        resumeAfter={status !== "solved"}
        onConfirm={handleDemoConfirm}
        onCancel={handleDemoCancel}
      />
    </ThemeProvider>
  );
}

/**
 * Compact chip row used for both theme + rating filters. Single visual
 * pattern keeps the header tight.
 */
function FilterChipRow({
  label,
  chips,
  onClick,
}: {
  label: string;
  chips: Array<{ id: string; label: string; active: boolean }>;
  onClick: (id: string) => void;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        flexWrap: "wrap",
      }}
    >
      <Typography
        sx={{
          fontSize: "0.68rem",
          fontWeight: 700,
          letterSpacing: "0.18em",
          color: "rgba(255,240,224,0.45)",
          textTransform: "uppercase",
          mr: 0.5,
        }}
      >
        {label}
      </Typography>
      {chips.map((c) => (
        <Box
          key={c.id}
          component="button"
          type="button"
          onClick={() => onClick(c.id)}
          sx={{
            px: 1.25,
            py: 0.45,
            borderRadius: "999px",
            border: c.active
              ? "1px solid rgba(255,122,26,0.5)"
              : "1px solid rgba(255,255,255,0.08)",
            background: c.active
              ? "linear-gradient(135deg, rgba(255,122,26,0.22), rgba(255,140,66,0.1))"
              : "rgba(22,18,14,0.65)",
            color: c.active ? "#FFE6CC" : "rgba(255,240,224,0.7)",
            fontSize: "0.78rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 160ms ease",
            "&:hover": {
              borderColor: "rgba(255,122,26,0.4)",
              color: "#FFD1A8",
            },
          }}
        >
          {c.label}
        </Box>
      ))}
    </Box>
  );
}
