"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Chess } from "chess.js";
import {
  Alert,
  Box,
  Button,
  IconButton,
  Divider,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { Loader } from "@/components/ui/Loader";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { motion } from "framer-motion";
import Head from "next/head";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import {
  Check,
  ChevronDown,
  Eye,
  Flag,
  Lightbulb,
  Network,
  RotateCcw,
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
import {
  puzzleStatsAtom,
  updatePuzzleStats,
  calculateNewRating,
} from "@/lib/puzzleRating";
import { SessionRecapDialog } from "@/components/puzzle/SessionRecapDialog";
import { PuzzleSessionRail } from "@/components/puzzle/PuzzleSessionRail";
import { answerModeAtom, confirmMovesAtom } from "@/lib/puzzlePrefs";
import { buildMoveChoices } from "@/lib/puzzle/moveChoices";
import { MoveChoiceList } from "@/components/puzzle/MoveChoiceList";
import { stepDifficulty } from "@/lib/puzzleDifficulty";
import { useRecordTrainingDay } from "@/lib/curriculum/useTrainingDay";
import {
  type SessionResult,
  type SessionEndReason,
  puzzleSessionHistoryAtom,
  puzzlePracticeQueueAtom,
  buildSavedSession,
  appendSession,
  appendSessionToStorage,
  postSessionToServer,
  SESSION_IDLE_MS,
} from "@/lib/puzzleSession";
import type { FlashState } from "@/components/puzzle/FlashOverlay";
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

/**
 * Lichess tags that describe a puzzle's shape rather than its motif. The Neo4j
 * loader turns these into node *properties* (gamePhase, evaluation,
 * puzzleLength) instead of :Theme nodes, so sending them to /api/similar-puzzles
 * matches nothing. Filter before calling, or "similar" silently returns empty.
 */
const NON_GRAPH_THEMES = new Set([
  "middlegame",
  "endgame",
  "opening",
  "crushing",
  "advantage",
  "equality",
  "short",
  "long",
  "veryLong",
  "oneMove",
  "master",
  "masterVsMaster",
  "superGM",
]);

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
  const { user, profile, updateProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [confirmMoves, setConfirmMoves] = useAtom(confirmMovesAtom);
  const [answerMode, setAnswerMode] = useAtom(answerModeAtom);
  const recordTrainingDay = useRecordTrainingDay();
  const [stats, setStats] = useAtom(puzzleStatsAtom);
  const [resume, setResume] = useAtom(puzzleResumeAtom);
  const pieceSet = useAtomValue(pieceSetAtom);
  const setSessionHistory = useSetAtom(puzzleSessionHistoryAtom);
  const [practiceQueueAtomVal, setPracticeQueueAtom] = useAtom(
    puzzlePracticeQueueAtom,
  );

  const [activeTheme, setActiveTheme] = useState<string | null>(null);
  const [activeBand, setActiveBand] = useState<string>("all");

  // Re-practice queue: when the user taps "Practice missed" in session history,
  // the page drills through these specific puzzles (taking precedence over the
  // feed) then reverts. practiceList is the snapshot; practiceIdx walks it.
  const [practiceList, setPracticeList] = useState<PuzzleContext[] | null>(null);
  const [practiceIdx, setPracticeIdx] = useState(0);

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
      // A manual filter pick exits "resume"/"practice" mode — fresh stream.
      setResumeOverride(null);
      setPracticeList(null);
      setActiveTheme(id);
      applyFilters(id, activeBand);
    },
    [activeBand, applyFilters],
  );

  const handleBandClick = useCallback(
    (bandId: string) => {
      setResumeOverride(null);
      setPracticeList(null);
      setActiveBand(bandId);
      applyFilters(activeTheme, bandId);
    },
    [activeTheme, applyFilters],
  );

  // Consume an injected re-practice queue once it hydrates from storage: snapshot
  // it into local state and clear the atom so a refresh doesn't replay it.
  useEffect(() => {
    if (
      practiceQueueAtomVal &&
      practiceQueueAtomVal.length > 0 &&
      !practiceList
    ) {
      setPracticeList(practiceQueueAtomVal);
      setPracticeIdx(0);
      setPracticeQueueAtom(null);
    }
  }, [practiceQueueAtomVal, practiceList, setPracticeQueueAtom]);

  // Puzzle precedence: re-practice queue > resumed puzzle > feed. The resume
  // effect sets its override synchronously on mount, before the feed's first
  // (async) batch resolves, so there's no wrong-puzzle flash.
  const puzzle =
    practiceList?.[practiceIdx] ?? resumeOverride ?? feed.currentPuzzle;

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
          promotion: opp.length > 4 ? opp.slice(4, 5).toLowerCase() : undefined,
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
  // Per-move reinforcement: the square a correct move just landed on (painted
  // green) + a flash ring re-triggered via flashKey on every attempt.
  const [correctSquare, setCorrectSquare] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashState>("idle");
  const [flashKey, setFlashKey] = useState(0);
  // Confirm-move staging. Non-null means the user has placed a move but not
  // committed it: the board renders `fen`, grading hasn't run, and Submit is
  // armed. Only ever set for the USER's own moves — opponent replies are
  // applied directly inside the reply timer and bypass this entirely.
  const [staged, setStaged] = useState<{
    from: string;
    to: string;
    fen: string;
  } | null>(null);
  const [difficultyAnchor, setDifficultyAnchor] =
    useState<HTMLElement | null>(null);
  // SAN of the choice-mode option tried and rejected for the CURRENT ply.
  // Cleared whenever the position advances so a stale red row can't bleed onto
  // the next question.
  const [wrongChoiceSan, setWrongChoiceSan] = useState<string | null>(null);
  const [similarLoading, setSimilarLoading] = useState(false);
  // Non-empty when the graph lookup couldn't be honoured — surfaced in a
  // snackbar so we never silently pass a CSV puzzle off as a graph match.
  const [similarNote, setSimilarNote] = useState("");
  // Pending opponent auto-reply timer. Tracked in a ref so a puzzle swap /
  // reset / unmount cancels it — otherwise a stale closure fires its old-puzzle
  // setGame/setStatus onto the NEXT puzzle (and can phantom-grade it solved).
  const oppReplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session tracking: every graded puzzle (solve or skip) appends a result.
  // Counts drive the top-right HUD; the list powers the Finish recap graph.
  // Rating itself auto-saves per puzzle via setStats — Finish is purely a
  // recap + reset gesture, no save dependency.
  const [sessionResults, setSessionResults] = useState<SessionResult[]>([]);
  const [recapOpen, setRecapOpen] = useState(false);
  // Frozen copy the recap renders, so Finish can reset the live session
  // immediately (preventing a double-save if the user then goes idle).
  const [recapResults, setRecapResults] = useState<SessionResult[]>([]);
  const [lastSessionMsg, setLastSessionMsg] = useState<string | undefined>(
    undefined,
  );
  const [idleSavedOpen, setIdleSavedOpen] = useState(false);
  // Fresh-stats mirror so grading reads the current rating/attempts without
  // adding `stats` to every grade callback's dep list.
  const statsRef = useRef(stats);
  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);
  // Mirror of sessionResults for timer/unmount closures that must read the
  // current list without being re-created on every grade.
  const sessionResultsRef = useRef<SessionResult[]>([]);
  useEffect(() => {
    sessionResultsRef.current = sessionResults;
  }, [sessionResults]);
  // Session identity — stamped lazily on the first graded puzzle, cleared when
  // the session is saved/reset. Lets us persist a coherent start→end record.
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef<number>(0);
  // 15-minute idle timer; re-armed on every interaction (see bumpActivity).
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Auth mirror so save closures (timer/unload) can decide whether to also
  // sync the session to the server without being re-created on auth change.
  const authedRef = useRef(false);
  useEffect(() => {
    authedRef.current = !!user;
  }, [user]);

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
    // Cancel any pending opponent reply from the previous puzzle so it can't
    // write its stale move/status onto this one.
    if (oppReplyTimerRef.current) {
      clearTimeout(oppReplyTimerRef.current);
      oppReplyTimerRef.current = null;
    }
    setGame(new Chess(studentStartFen));
    setMoveIdx(0);
    setStatus("playing");
    setLastMove(null);
    setWrongSquare(null);
    setLastWrongSan(null);
    setWrongAttempts(0);
    setCorrectSquare(null);
    setFlash("idle");
    setPendingDemoMoves(null);
    setActiveDemo(null);
    setCoachHighlights(null);
    setStaged(null);
    setWrongChoiceSan(null);
  }, [studentStartFen]);

  // Cancel a pending opponent reply on unmount.
  useEffect(
    () => () => {
      if (oppReplyTimerRef.current) clearTimeout(oppReplyTimerRef.current);
    },
    [],
  );

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

  // Single grade path: updates the persisted rating AND appends a session
  // result (rating before → after) so the HUD counts + Finish graph stay in
  // sync with the saved Elo. Callers own the one-grade-per-puzzle guard.
  const recordGrade = useCallback(
    (solved: boolean) => {
      if (!puzzle) return;
      const s = statsRef.current;
      // Feed puzzles always carry a rating; fall back to the player's own
      // (neutral Elo) on the rare untagged puzzle.
      const puzzleRating = puzzle.rating ?? s.rating;
      const before = s.rating;
      // Mirror updatePuzzleStats's internal Elo calc so the session graph's
      // ratingAfter matches the value that gets persisted.
      const after = calculateNewRating(
        before,
        puzzleRating,
        solved,
        s.totalAttempts,
      );
      const theme = pickPrimaryTheme(puzzle.themes);
      const timeMs = Math.max(0, Date.now() - startTimeRef.current);
      // Stamp the session identity on its first graded puzzle.
      if (!sessionIdRef.current) {
        sessionIdRef.current = `s-${Date.now()}-${Math.floor(
          Math.random() * 1e6,
        )}`;
        sessionStartRef.current = Date.now();
      }
      setStats((prev) =>
        updatePuzzleStats(prev, {
          puzzleId: puzzle.id,
          puzzleRating,
          solved,
          timeMs,
          theme,
          timestamp: Date.now(),
        }),
      );
      // A graded puzzle here is real training and must count toward the daily
      // streak. Before the program-first restructure, bumpStreak fired ONLY in
      // SessionRunner — so solving fifty puzzles on this page advanced nothing
      // and /plan's streak tile disagreed with what the user had just done.
      recordTrainingDay(theme);
      setSessionResults((prev) => [
        ...prev,
        {
          id: puzzle.id,
          ratingBefore: before,
          ratingAfter: after,
          solved,
          theme,
          timeMs,
          puzzle,
        },
      ]);
    },
    [puzzle, setStats, recordTrainingDay],
  );

  // Grade the rating on solve (first-try only counts as solved, mirroring
  // SessionRunner so a wrong-then-solved is a miss). One grade per puzzle.
  useEffect(() => {
    if (status !== "solved" || !puzzle) return;
    if (gradedRef.current === puzzle.id) return;
    gradedRef.current = puzzle.id;
    recordGrade(wrongAttempts === 0);
  }, [status, puzzle, wrongAttempts, recordGrade]);

  // Persist the current session to history (newest first). Save-only — the
  // counters are cleared separately by resetSession so the recap can still read
  // them after a Finish.
  const persistSession = useCallback(
    (reason: SessionEndReason) => {
      const results = sessionResultsRef.current;
      if (results.length === 0 || !sessionIdRef.current) return;
      const session = buildSavedSession(results, {
        id: sessionIdRef.current,
        startedAt: sessionStartRef.current || Date.now(),
        endedAt: Date.now(),
        endReason: reason,
      });
      setSessionHistory((prev) => appendSession(prev, session));
      // Mirror to the server for cross-device history (best-effort; anon no-op).
      if (authedRef.current) postSessionToServer(session);
    },
    [setSessionHistory],
  );

  // Clear the live session (counters back to zero + new identity next grade).
  const resetSession = useCallback(() => {
    setSessionResults([]);
    sessionIdRef.current = null;
    sessionStartRef.current = 0;
  }, []);

  // Re-arm the 15-minute idle timer. Called on every interaction. When it fires
  // and the session has ≥1 solved puzzle, the session auto-saves to history and
  // a snackbar confirms it. A session with 0 solves is not worth saving, so the
  // timer simply lapses (the next interaction re-arms it).
  const bumpActivity = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      const solved = sessionResultsRef.current.filter((r) => r.solved).length;
      if (solved >= 1) {
        persistSession("idle");
        resetSession();
        setIdleSavedOpen(true);
      }
    }, SESSION_IDLE_MS);
  }, [persistSession, resetSession]);

  // Arm the idle timer on mount; clear it on unmount.
  useEffect(() => {
    bumpActivity();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [bumpActivity]);

  // Tab close / navigate away with a live session (≥1 solved) → save it.
  // Writes localStorage synchronously (survives unload) and mirrors to the
  // server with a keepalive request. Stable handler; reads refs only.
  useEffect(() => {
    const handler = () => {
      const results = sessionResultsRef.current;
      if (!sessionIdRef.current) return;
      if (results.filter((r) => r.solved).length < 1) return;
      const session = buildSavedSession(results, {
        id: sessionIdRef.current,
        startedAt: sessionStartRef.current || Date.now(),
        endedAt: Date.now(),
        endReason: "closed",
      });
      appendSessionToStorage(session);
      if (authedRef.current) postSessionToServer(session);
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Drop the green reinforcement highlight shortly after each correct move so
  // it reads as a pulse, not a persistent paint. Keyed on flashKey so every
  // correct move restarts the window.
  useEffect(() => {
    if (!correctSquare) return;
    const t = setTimeout(() => setCorrectSquare(null), 850);
    return () => clearTimeout(t);
  }, [correctSquare, flashKey]);

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

  // "Show solution" — reset to the puzzle's initial position and replay the
  // full solution (opponent setup + both sides) to the end. Anchored at
  // puzzle.fen so it always starts from the very beginning, regardless of how
  // far the user got. resumeFen returns them to their own attempt when done.
  const handleShowSolution = useCallback(() => {
    if (!puzzle) return;
    bumpActivity();
    const sanMoves: string[] = [];
    try {
      const g = new Chess(puzzle.fen);
      for (const uci of puzzle.solution) {
        const r = g.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.length > 4 ? uci.slice(4, 5).toLowerCase() : undefined,
        });
        if (!r) break;
        sanMoves.push(r.san);
      }
    } catch {
      return;
    }
    if (sanMoves.length === 0) return;
    setCoachHighlights(null);
    setActiveDemo({
      moves: sanMoves,
      startFen: puzzle.fen,
      resumeFen: game.fen(),
      speedMs: DEMO_SPEED_MS.normal,
      idx: 0,
      finished: false,
    });
  }, [puzzle, game, bumpActivity]);

  // Session: counts for the HUD + Finish recap. Rating already auto-saves per
  // puzzle, so Finish is purely a recap + reset gesture.
  const sessionSolved = sessionResults.filter((r) => r.solved).length;
  const sessionTotal = sessionResults.length;
  const sessionWrong = sessionTotal - sessionSolved;

  // Rail heading — the subject of this session. Mirrors the active theme chip
  // so the rail and the filter row never disagree about what you're drilling.
  // Unfiltered is "All" in the chip row, which is a filter state, not a
  // subject — the rail says "Tactics" there instead.
  const railHeading = activeTheme
    ? QUICK_THEMES.find((t) => t.id === activeTheme)?.label ?? "Tactics"
    : "Tactics";

  const handleFinishSession = useCallback(() => {
    const results = sessionResultsRef.current;
    if (results.length === 0) return;
    persistSession("finished");
    // Freeze the results for the recap, then end the live session right away so
    // the idle timer can't persist the same session a second time.
    setRecapResults(results);
    resetSession();
    setRecapOpen(true);
  }, [persistSession, resetSession]);

  // The session was already saved + reset on Finish; closing the recap just
  // dismisses it. Persisted rating is untouched.
  const handleRecapClose = useCallback(() => {
    setRecapOpen(false);
  }, []);

  // Session HUD (correct / wrong / total + Finish). Rendered at the board
  // card's top-right so it stays visible while solving — the page header
  // scrolls away once you focus the board.
  const sessionHud = (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          px: 1.5,
          py: 0.55,
          borderRadius: "999px",
          background: "rgba(10,9,7,0.6)",
          border: "1px solid rgba(255,255,255,0.1)",
          fontFamily: "Monaco, Menlo, monospace",
          fontSize: "0.86rem",
          fontWeight: 800,
          lineHeight: 1,
        }}
        aria-label={`${sessionSolved} correct, ${sessionWrong} wrong, ${sessionTotal} total`}
      >
        <Box component="span" sx={{ color: "#4ade80" }}>
          {sessionSolved}
        </Box>
        <Box component="span" sx={{ color: "rgba(255,240,224,0.3)" }}>
          /
        </Box>
        <Box component="span" sx={{ color: "#f87171" }}>
          {sessionWrong}
        </Box>
        <Box component="span" sx={{ color: "rgba(255,240,224,0.3)" }}>
          /
        </Box>
        <Box component="span" sx={{ color: "rgba(255,240,224,0.55)" }}>
          {sessionTotal}
        </Box>
      </Box>
      <Button
        onClick={handleFinishSession}
        disabled={sessionTotal === 0}
        startIcon={<Flag size={13} />}
        sx={{
          px: 1.75,
          py: 0.5,
          minHeight: 0,
          borderRadius: "999px",
          background: "linear-gradient(135deg, #FF7A1A, #EF4444)",
          color: "#fff",
          fontSize: "0.8rem",
          fontWeight: 800,
          textTransform: "none",
          boxShadow: "0 8px 24px -10px rgba(239,68,68,0.6)",
          "&:hover": {
            background: "linear-gradient(135deg, #FB923C, #DC2626)",
          },
          "&.Mui-disabled": {
            background: "rgba(22,18,14,0.7)",
            color: "rgba(255,240,224,0.35)",
            boxShadow: "none",
          },
        }}
      >
        Finish
      </Button>
    </Stack>
  );

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
  // Multiple-choice options for the move the user owes right now. Rebuilt per
  // ply so multi-move puzzles keep asking a real question rather than only
  // quizzing the first move.
  const expectedMove = parsedMoves[moveIdx];
  const moveChoices = useMemo(() => {
    if (answerMode !== "choice" || !expectedMove) return [];
    return buildMoveChoices(
      game.fen(),
      `${expectedMove.from}${expectedMove.to}${expectedMove.promotion ?? ""}`,
    );
  }, [answerMode, expectedMove, game]);

  // A position we cannot build a sound question for (no legal moves, or the
  // solution isn't legal from here) falls back to the board instead of
  // rendering an empty or unanswerable question.
  const choiceModeActive = answerMode === "choice" && moveChoices.length > 0;

  const displayFen = useMemo(() => {
    // A staged move is shown on the board even though it hasn't been graded —
    // that preview IS the "you picked this, now commit" affordance. Demo
    // playback still wins, since it repositions the board wholesale.
    if (!activeDemo && staged) return staged.fen;
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
  }, [activeDemo, game, staged]);

  // Last-move highlight: during demo, the most recently played ply; outside,
  // the user's last accepted move.
  const displayLastMove = useMemo<[string, string] | null>(() => {
    // Highlight the staged move so the user can see what they're about to
    // commit — same treatment an accepted move gets.
    if (!activeDemo && staged) return [staged.from, staged.to];
    if (!activeDemo) return lastMove;
    // First demo frame is the anchor position — don't bleed the user's stale
    // last-move highlight onto it (it's from a different position).
    if (activeDemo.idx === 0) return null;
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
  }, [activeDemo, lastMove, staged]);

  const handleMove = useCallback(
    (orig: string, dest: string): boolean => {
      if (status === "solved") return false;
      // A move attempt is activity — re-arm the idle auto-close timer.
      bumpActivity();
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
        setCorrectSquare(null);
        setFlash("red");
        setFlashKey((k) => k + 1);
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
      // Per-move reinforcement: green-flash the square the correct move just
      // landed on — fires on EVERY correct move, not only the final solve.
      setCorrectSquare(expected.to);
      setFlash("green");
      setFlashKey((k) => k + 1);

      const nextIdx = moveIdx + 1;
      if (nextIdx >= parsedMoves.length) {
        setMoveIdx(nextIdx);
        setStatus("solved");
        return true;
      }

      const opp = parsedMoves[nextIdx];
      if (oppReplyTimerRef.current) clearTimeout(oppReplyTimerRef.current);
      oppReplyTimerRef.current = setTimeout(() => {
        oppReplyTimerRef.current = null;
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
    [game, moveIdx, parsedMoves, status, bumpActivity],
  );

  const handleReset = useCallback(() => {
    if (!studentStartFen) return;
    if (oppReplyTimerRef.current) {
      clearTimeout(oppReplyTimerRef.current);
      oppReplyTimerRef.current = null;
    }
    setGame(new Chess(studentStartFen));
    setMoveIdx(0);
    setStatus("playing");
    setLastMove(null);
    setWrongSquare(null);
    setLastWrongSan(null);
    setWrongAttempts(0);
    setCorrectSquare(null);
    setFlash("idle");
    setStaged(null);
    setWrongChoiceSan(null);
  }, [studentStartFen]);

  const handleNextPuzzle = useCallback(() => {
    bumpActivity();
    // Every puzzle, solved or not, moves the rating: an unsolved skip counts as
    // a miss (unless it was already graded by solving).
    if (puzzle && gradedRef.current !== puzzle.id) {
      gradedRef.current = puzzle.id;
      recordGrade(false);
    }
    // Advance through the active source: re-practice queue, then resume, then
    // feed. When a finite source runs out, fall back to the live feed.
    if (practiceList) {
      if (practiceIdx < practiceList.length - 1) {
        setPracticeIdx((i) => i + 1);
      } else {
        setPracticeList(null);
        setPracticeIdx(0);
      }
    } else if (resumeOverride) {
      setResumeOverride(null);
    } else {
      feed.advance();
    }
  }, [puzzle, resumeOverride, recordGrade, feed, practiceList, practiceIdx, bumpActivity]);

  // "New puzzle ⌄" → Easier / Same / Harder. Same just advances; the other two
  // shift the active rating band one step and let the refetch deliver a puzzle
  // at the new difficulty (changing filters resets the queue, so there's no
  // advance() to pair with it). "Any" isn't a difficulty, so when the band is
  // unset we locate the current puzzle's own band and step from there.
  const handleNewPuzzleAtDifficulty = useCallback(
    (delta: -1 | 0 | 1) => {
      if (delta === 0) {
        handleNextPuzzle();
        return;
      }
      const target = stepDifficulty(
        RATING_BANDS.filter((b) => b.id !== "all"),
        activeBand,
        puzzle?.rating ?? stats.rating,
        delta,
      );
      // Already at the floor/ceiling — serve another at this difficulty rather
      // than silently doing nothing.
      if (!target) {
        handleNextPuzzle();
        return;
      }
      handleBandClick(target.id);
    },
    [activeBand, puzzle, stats.rating, handleBandClick, handleNextPuzzle],
  );

  // "Neo4j similar puzzle" — same motif, same difficulty, served from the
  // puzzle graph rather than the CSV feed this page normally reads.
  //
  // Worth knowing: /puzzles' feed is a static CSV, and Neo4j is a SEPARATE
  // store with a different (kebab-case, inferred) theme vocabulary. The route
  // kebabs camelCase input itself, but structural Lichess tags — middlegame,
  // endgame, crushing, short — have no Theme node at all and would match
  // nothing, so they're filtered out before the call. If nothing tactical is
  // left we don't pretend: we say so and serve a normal same-difficulty puzzle.
  const handleNeo4jSimilar = useCallback(async () => {
    if (!puzzle || similarLoading) return;
    bumpActivity();
    const themes = puzzle.themes.filter(
      (t) => !NON_GRAPH_THEMES.has(t),
    );
    if (themes.length === 0) {
      setSimilarNote(
        "This puzzle has no tactical motif tagged, so the graph has nothing to match. Served a same-difficulty puzzle instead.",
      );
      handleNextPuzzle();
      return;
    }
    setSimilarLoading(true);
    try {
      const res = await fetch("/api/similar-puzzles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen: puzzle.fen,
          themes,
          userRating: puzzle.rating ?? stats.rating,
          limit: 1,
          solutionUci: puzzle.solution,
          excludeIds: [
            puzzle.id,
            ...sessionResultsRef.current.map((r) => r.id),
          ],
        }),
      });
      if (res.status === 503) {
        setSimilarNote(
          "Puzzle graph is unavailable right now. Served a same-difficulty puzzle instead.",
        );
        handleNextPuzzle();
        return;
      }
      if (!res.ok) throw new Error(`similar-puzzles ${res.status}`);
      const data = await res.json();
      const hit = data?.puzzles?.[0];
      if (!hit?.puzzleId || !hit?.fen || !hit?.moves) {
        setSimilarNote(
          "No close match in the graph for this motif. Served a same-difficulty puzzle instead.",
        );
        handleNextPuzzle();
        return;
      }
      // Graph shape → feed shape: `moves` is one space-separated UCI string.
      setResumeOverride({
        id: hit.puzzleId,
        fen: hit.fen,
        solution: String(hit.moves).trim().split(/\s+/),
        rating: typeof hit.rating === "number" ? hit.rating : undefined,
        themes: Array.isArray(hit.themes) ? hit.themes : [],
      });
      setPracticeList(null);
    } catch {
      setSimilarNote(
        "Couldn't reach the puzzle graph. Served a same-difficulty puzzle instead.",
      );
      handleNextPuzzle();
    } finally {
      setSimilarLoading(false);
    }
  }, [puzzle, similarLoading, stats.rating, handleNextPuzzle, bumpActivity]);

  // Drill menu → "Open on board". Bring the chosen upcoming puzzle to the
  // front of the feed and drop any resume override so it becomes current.
  // The just-solved puzzle was already graded, so no extra grade here.
  const handlePickDrillPuzzle = useCallback(
    (id: string) => {
      bumpActivity();
      feed.jumpTo(id);
      setResumeOverride(null);
      setPracticeList(null);
    },
    [feed, bumpActivity],
  );

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
  // Locked while a move is staged. The board is rendering the *staged*
  // position, so a second drag would report squares that don't exist in the
  // real position and get rejected confusingly. "Change move" unstages first.
  const interactive =
    status !== "solved" &&
    !!puzzle &&
    !activeDemo &&
    !staged &&
    !choiceModeActive;
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
  // registering as a wrong attempt — then either stage the move (confirm mode)
  // or hand off to handleMove for immediate grading.
  const onBoardMove = useCallback(
    (from: string, to: string): boolean => {
      let stagedFen: string;
      try {
        const probe = new Chess(game.fen());
        if (!probe.move({ from, to, promotion: "q" })) return false;
        stagedFen = probe.fen();
      } catch {
        return false;
      }
      if (!confirmMoves) return handleMove(from, to);
      // Stage it: show the resulting position and arm Submit. Grading is
      // deliberately NOT run here — `game` still holds the pre-move position,
      // so handleMove works unchanged when Submit fires.
      bumpActivity();
      setStaged({ from, to, fen: stagedFen });
      return true;
    },
    [game, handleMove, confirmMoves, bumpActivity],
  );

  // A new ply is a new question: the previous ply's rejected option must not
  // stay painted red under a fresh set of choices.
  useEffect(() => {
    setWrongChoiceSan(null);
  }, [moveIdx]);

  // Turning confirm-mode off mid-puzzle must not leave a move stranded on the
  // board with no Submit button to commit it.
  useEffect(() => {
    if (!confirmMoves) setStaged(null);
  }, [confirmMoves]);

  // Submit the staged move — the only path from staged → graded.
  const handleSubmitMove = useCallback(() => {
    if (!staged) return;
    const { from, to } = staged;
    setStaged(null);
    handleMove(from, to);
  }, [staged, handleMove]);

  // Take it back before committing. Returns the board to the real position.
  const handleUnstageMove = useCallback(() => setStaged(null), []);

  // Choice mode: tapping a row IS the deliberate act confirm-move exists to
  // create, so it grades immediately and never stages. Asking the user to
  // confirm a tap they just made would be friction with no safety gained.
  const handlePickChoice = useCallback(
    (choice: { san: string; uci: string; isSolution: boolean }) => {
      if (status === "solved" || activeDemo) return;
      bumpActivity();
      setWrongChoiceSan(choice.isSolution ? null : choice.san);
      handleMove(choice.uci.slice(0, 2), choice.uci.slice(2, 4));
    },
    [status, activeDemo, handleMove, bumpActivity],
  );

  return (
    <ThemeProvider theme={puzzleTheme}>
      <Head>
        <title>Puzzle Coach · Chess Masti</title>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#0A0907" />
        <style>{`
          /* body-only on purpose — see src/pages/index.tsx: an <html>
             background blocks body→canvas propagation and paints over
             fixed zIndex:-1 backdrops. */
          html { color-scheme: dark; }
          body { background-color: #0A0907; color-scheme: dark; margin: 0; }
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
        <NavPill active="practice" />

        {/* Widened from 1500 for the three-region layout — at 1500 the rail's
            240px minimum ate into the board column. */}
        <Box sx={{ maxWidth: 1640, mx: "auto", mt: 3 }}>
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

          {/* Re-practice banner — visible while drilling a saved session's
              missed puzzles. */}
          {practiceList && practiceList.length > 0 && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                mb: 2,
                px: 2,
                py: 1,
                borderRadius: "999px",
                background:
                  "linear-gradient(135deg, rgba(255,122,26,0.16), rgba(255,140,66,0.06))",
                border: "1px solid rgba(255,122,26,0.35)",
              }}
            >
              <RotateCcw size={15} color="#FFD1A8" />
              <Typography
                sx={{ fontSize: "0.85rem", fontWeight: 600, color: "#FFD1A8" }}
              >
                Re-practicing missed puzzles ·{" "}
                {Math.min(practiceIdx + 1, practiceList.length)} of{" "}
                {practiceList.length}
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Button
                onClick={() => {
                  setPracticeList(null);
                  setPracticeIdx(0);
                }}
                size="small"
                sx={{
                  px: 1.5,
                  py: 0.3,
                  minHeight: 0,
                  borderRadius: "999px",
                  color: "rgba(255,240,224,0.7)",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  textTransform: "none",
                  "&:hover": { color: "#FFD1A8" },
                }}
              >
                Exit
              </Button>
            </Box>
          )}

          {/* Main grid: board + coach */}
          <Box
            sx={{
              display: "grid",
              // Three regions, Acely format (docs/PUZZLE_TRAINING_LAYOUT_SPEC.md):
              // session rail | the one puzzle | the coach. The rail is dropped
              // below lg rather than stacked — on a phone the queue is noise
              // under the board, and the session HUD already carries progress.
              gridTemplateColumns: {
                xs: "1fr",
                lg: "minmax(240px, 17%) minmax(0, 1fr) minmax(380px, 30%)",
              },
              gap: { xs: 3, lg: 3 },
              alignItems: "stretch",
              minHeight: { lg: "clamp(540px, 70vh, 740px)" },
            }}
          >
            {/* Session rail */}
            <Box sx={{ display: { xs: "none", lg: "block" }, minHeight: 0 }}>
              <PuzzleSessionRail
                heading={railHeading}
                results={sessionResults}
                currentPuzzle={puzzle}
                upcoming={feed.upcoming}
                onJumpTo={handlePickDrillPuzzle}
              />
            </Box>

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
                    {/* Session HUD — pinned to the board's top-right so it
                        stays in view while solving. */}
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "flex-end",
                        mb: 1.5,
                      }}
                    >
                      {sessionHud}
                    </Box>
                    <Box
                      sx={{
                        position: "relative",
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
                        // Tapping the board takes back an uncommitted move.
                        // Only wired while something IS staged, so a tap
                        // during a demo or on a solved board stays inert.
                        onCancel={staged ? handleUnstageMove : undefined}
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
                        correctSquare={activeDemo ? null : correctSquare}
                        flash={
                          activeDemo ? null : { state: flash, flashKey }
                        }
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

                    {choiceModeActive && (
                      <MoveChoiceList
                        choices={moveChoices}
                        wrongSan={wrongChoiceSan}
                        revealed={status === "solved" || !!activeDemo}
                        disabled={status === "solved" || !!activeDemo}
                        onPick={handlePickChoice}
                      />
                    )}

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
                        onClick={handleShowSolution}
                        disabled={!!activeDemo}
                        startIcon={<Eye size={14} />}
                        sx={{
                          px: 1.75,
                          py: 0.6,
                          borderRadius: "999px",
                          background: "rgba(22,18,14,0.7)",
                          color: "rgba(255,240,224,0.85)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          fontSize: "0.82rem",
                          fontWeight: 600,
                          "&:hover": {
                            background: "rgba(22,18,14,0.85)",
                            borderColor: "rgba(255,122,26,0.3)",
                            color: "#FFD1A8",
                          },
                          "&.Mui-disabled": {
                            color: "rgba(255,240,224,0.3)",
                          },
                        }}
                      >
                        Show solution
                      </Button>

                    </Stack>

                    {/* Action bar — Acely's commit/escape pair, bottom-anchored
                        under a divider. Submit is the only path from a staged
                        move to a graded one; "New puzzle" is deliberately just
                        as heavy, because skipping shouldn't feel punished. */}
                    <Box
                      sx={{
                        mt: "auto",
                        pt: 2.5,
                        borderTop: "1px solid rgba(255,255,255,0.07)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 1.5,
                        flexWrap: "wrap",
                      }}
                    >
                      {/* Board-only. In choice mode a tap grades
                          immediately, so a Submit button would be a dead
                          control sitting next to the real answer. */}
                      {confirmMoves && !choiceModeActive && (
                        <>
                          <Button
                            onClick={handleSubmitMove}
                            disabled={!staged}
                            sx={{
                              px: 3,
                              py: 1,
                              borderRadius: "0.6rem",
                              background: staged
                                ? "linear-gradient(135deg, #FF7A1A, #FB923C)"
                                : "rgba(255,255,255,0.05)",
                              color: staged ? "#0A0907" : undefined,
                              fontSize: "0.9rem",
                              fontWeight: 700,
                              minWidth: 172,
                              "&:hover": {
                                background: staged
                                  ? "linear-gradient(135deg, #FB923C, #FBBF24)"
                                  : "rgba(255,255,255,0.05)",
                              },
                              "&.Mui-disabled": {
                                color: "rgba(255,240,224,0.32)",
                              },
                            }}
                          >
                            Submit move
                          </Button>
                          {staged && (
                            <Button
                              onClick={handleUnstageMove}
                              sx={{
                                px: 1.5,
                                py: 1,
                                borderRadius: "0.6rem",
                                color: "rgba(255,240,224,0.6)",
                                fontSize: "0.82rem",
                                fontWeight: 600,
                                "&:hover": {
                                  color: "#FFD1A8",
                                  background: "rgba(255,122,26,0.08)",
                                },
                              }}
                            >
                              Change move
                            </Button>
                          )}
                        </>
                      )}

                      {/* Split control, like Acely's "New Hard Question ⌄":
                          the body is the action (next puzzle, same
                          difficulty), the chevron opens the difficulty menu.
                          Keeping the body clickable preserves the one-tap
                          "Next puzzle" this replaced — burying the most common
                          action behind a menu would be a regression. */}
                      <Box
                        sx={{
                          display: "inline-flex",
                          borderRadius: "0.6rem",
                          overflow: "hidden",
                          border:
                            status === "solved"
                              ? "1px solid transparent"
                              : "1px solid rgba(255,255,255,0.12)",
                          background:
                            status === "solved"
                              ? "linear-gradient(135deg, #FF7A1A, #FB923C)"
                              : "rgba(22,18,14,0.7)",
                          "&:hover": {
                            borderColor:
                              status === "solved"
                                ? "transparent"
                                : "rgba(255,122,26,0.35)",
                          },
                        }}
                      >
                        <Button
                          onClick={handleNextPuzzle}
                          sx={{
                            px: 2.5,
                            py: 1,
                            borderRadius: 0,
                            color:
                              status === "solved"
                                ? "#0A0907"
                                : "rgba(255,240,224,0.9)",
                            fontSize: "0.9rem",
                            fontWeight: 700,
                            "&:hover": { background: "rgba(255,255,255,0.06)" },
                          }}
                        >
                          New puzzle
                        </Button>
                        <Box
                          sx={{
                            width: "1px",
                            my: 0.9,
                            background:
                              status === "solved"
                                ? "rgba(10,9,7,0.25)"
                                : "rgba(255,255,255,0.12)",
                          }}
                        />
                        <IconButton
                          onClick={(e) => setDifficultyAnchor(e.currentTarget)}
                          aria-label="Choose difficulty"
                          sx={{
                            borderRadius: 0,
                            px: 1,
                            color:
                              status === "solved"
                                ? "#0A0907"
                                : "rgba(255,240,224,0.9)",
                            "&:hover": { background: "rgba(255,255,255,0.06)" },
                          }}
                        >
                          <ChevronDown size={15} />
                        </IconButton>
                      </Box>
                      <Menu
                        anchorEl={difficultyAnchor}
                        open={Boolean(difficultyAnchor)}
                        onClose={() => setDifficultyAnchor(null)}
                        anchorOrigin={{
                          vertical: "top",
                          horizontal: "center",
                        }}
                        transformOrigin={{
                          vertical: "bottom",
                          horizontal: "center",
                        }}
                      >
                        {(
                          [
                            ["Easier", -1],
                            ["Same difficulty", 0],
                            ["Harder", 1],
                          ] as Array<[string, -1 | 0 | 1]>
                        ).map(([label, delta]) => (
                          <MenuItem
                            key={label}
                            onClick={() => {
                              setDifficultyAnchor(null);
                              handleNewPuzzleAtDifficulty(delta);
                            }}
                            sx={{ fontSize: "0.86rem", fontWeight: 600 }}
                          >
                            {label}
                          </MenuItem>
                        ))}
                        <Divider sx={{ my: 0.5 }} />
                        <MenuItem
                          disabled={similarLoading}
                          onClick={() => {
                            setDifficultyAnchor(null);
                            void handleNeo4jSimilar();
                          }}
                          sx={{ fontSize: "0.86rem", fontWeight: 700 }}
                        >
                          <Network size={14} style={{ marginRight: 8 }} />
                          {similarLoading
                            ? "Searching graph…"
                            : "Neo4j similar puzzle"}
                        </MenuItem>
                      </Menu>
                    </Box>

                    {/* The moment you want confirm-mode off is the moment it
                        just slowed you down — so the toggle lives here, not
                        only in profile settings. */}
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "center",
                        mt: 1,
                      }}
                    >
                      <Button
                        onClick={() =>
                          setAnswerMode((m) =>
                            m === "choice" ? "board" : "choice",
                          )
                        }
                        sx={{
                          px: 1,
                          py: 0.25,
                          minHeight: 0,
                          color: "rgba(255,240,224,0.4)",
                          fontSize: "0.74rem",
                          fontWeight: 600,
                          "&:hover": {
                            color: "rgba(255,240,224,0.75)",
                            background: "transparent",
                          },
                        }}
                      >
                        {answerMode === "choice"
                          ? "Answer: multiple choice"
                          : "Answer: on the board"}
                      </Button>
                      {!choiceModeActive && (
                      <Button
                        onClick={() => setConfirmMoves((v) => !v)}
                        sx={{
                          px: 1,
                          py: 0.25,
                          minHeight: 0,
                          color: "rgba(255,240,224,0.4)",
                          fontSize: "0.74rem",
                          fontWeight: 600,
                          "&:hover": {
                            color: "rgba(255,240,224,0.75)",
                            background: "transparent",
                          },
                        }}
                      >
                        {confirmMoves
                          ? "Confirm each move: on"
                          : "Confirm each move: off"}
                      </Button>
                      )}
                    </Box>
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
                        <Loader size={44} showLabel={false} />
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
                  drillPuzzles={feed.upcoming}
                  onPickDrillPuzzle={handlePickDrillPuzzle}
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

      <SessionRecapDialog
        open={recapOpen}
        results={recapResults}
        onClose={handleRecapClose}
        lastMessage={lastSessionMsg}
        onMessagePicked={setLastSessionMsg}
      />

      {/* Fires only when the graph lookup fell back. The menu item promises a
          Neo4j match, so a silent CSV substitution would make the label a lie. */}
      <Snackbar
        open={similarNote !== ""}
        autoHideDuration={7000}
        onClose={() => setSimilarNote("")}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="warning"
          icon={<Network size={16} />}
          onClose={() => setSimilarNote("")}
          sx={{
            bgcolor: "rgba(22,18,14,0.96)",
            color: "rgba(255,240,224,0.94)",
            border: "1px solid rgba(255,122,26,0.35)",
            borderRadius: "0.85rem",
            "& .MuiAlert-icon": { color: "#FFD1A8" },
          }}
        >
          {similarNote}
        </Alert>
      </Snackbar>

      <Snackbar
        open={idleSavedOpen}
        autoHideDuration={6000}
        onClose={() => setIdleSavedOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="info"
          icon={<Flag size={16} />}
          onClose={() => setIdleSavedOpen(false)}
          action={
            <Button
              size="small"
              onClick={() => router.push("/puzzles/sessions")}
              sx={{ color: "#FFD1A8", fontWeight: 700, textTransform: "none" }}
            >
              View
            </Button>
          }
          sx={{
            bgcolor: "rgba(22,18,14,0.96)",
            color: "rgba(255,240,224,0.94)",
            border: "1px solid rgba(255,122,26,0.35)",
            borderRadius: "0.85rem",
            "& .MuiAlert-icon": { color: "#FFD1A8" },
          }}
        >
          Session auto-saved after 15 min idle.
        </Alert>
      </Snackbar>
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
