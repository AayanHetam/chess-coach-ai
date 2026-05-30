"use client";

import { Chess, type Move } from "chess.js";
import {
  Box,
  Button,
  IconButton,
  Menu,
  Modal,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { motion, AnimatePresence } from "framer-motion";
import {
  MasterGamesTakeover,
  getMasterCandidates,
  type MasterCandidate,
} from "@/components/ui/MasterGamesTakeover";
import type { DrawShape } from "@/components/ui/ChessgroundBoard";
import {
  BoardArrowToggles,
  DEFAULT_ARROW_TOGGLES,
  ARROW_PALETTE,
  type ArrowToggleState,
} from "@/components/ui/BoardArrowToggles";
import { OnboardingHelp } from "@/components/ui/OnboardingHelp";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  List as ListIcon,
  MessageCircle,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Command,
  Crown,
  Eye,
  Flame,
  GitBranch,
  Lightbulb,
  MousePointerClick,
  RefreshCw,
  RotateCw,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  cloneElement,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BorderBeam } from "@/components/ui/BorderBeam";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill as SharedNavPill } from "@/components/ui/NavPill";
import { Lc0DownloadBanner } from "@/components/Lc0DownloadBanner";
import { OpeningExplorer } from "@/components/ui/OpeningExplorer";
import {
  CommandPalette,
  CommandIcons,
  type CommandGroup,
} from "@/components/ui/CommandPalette";
import { useEngine } from "@/hooks/useEngine";
import { EngineName, MoveClassification } from "@/types/enums";
import type { PositionEval, LineEval } from "@/types/eval";
import { getMovesClassification } from "@/lib/engine/helpers/moveClassification";
import { ContextualPuzzleRecommendations } from "@/components/ContextualPuzzleRecommendations";
import { useGameDatabase } from "@/hooks/useGameDatabase";
import { useViewer } from "@/hooks/useViewer";
import type { GameEval } from "@/types/eval";
import { FlagButton } from "@/components/intern/FlagButton";
import {
  coachPersonalities,
  defaultPersonalityId,
  getPersonalityById,
} from "@/config/coachPersonalities";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  parseInsights,
  type InsightData,
} from "@/components/AICoachInsights";
import {
  recordPuzzleAttempt,
  getAllAttempts,
} from "@/lib/repetitTraining";
import { useSetAtom } from "jotai";
import { savedEvalsAtom } from "@/sections/analysis/states";
import type { SavedEvals } from "@/types/eval";
import {
  extractImportedGameInfo,
  detectUserColor,
} from "@/lib/smartColorDetection";
import { getEvaluateGameParams } from "@/lib/chess";
import { getPositionWinPercentage } from "@/lib/engine/helpers/winPercentage";
import { LoadGameDialog } from "@/components/ui/LoadGameDialog";
import { CoachShareDialog } from "@/components/ui/CoachShareDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { setContext as setSentryContext } from "@sentry/react";

const ChessgroundBoard = dynamic(
  () =>
    import("@/components/ui/ChessgroundBoard").then((m) => m.ChessgroundBoard),
  { ssr: false }
);

// ───────────────────────────────────────────────────────────────────────────────
// Theme
// ───────────────────────────────────────────────────────────────────────────────

const analysisTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#F97316" },
    secondary: { main: "#FB923C" },
    background: {
      default: "#08090C",
      paper: "rgba(20,22,28,0.6)",
    },
    text: {
      primary: "rgba(255,255,255,0.94)",
      secondary: "rgba(255,255,255,0.62)",
    },
    divider: "rgba(255,255,255,0.08)",
    success: { main: "#22c55e" },
    error: { main: "#ef4444" },
    warning: { main: "#EA580C" },
  },
  typography: {
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    h1: { fontWeight: 800, letterSpacing: "-0.03em" },
    h2: { fontWeight: 700, letterSpacing: "-0.02em" },
    h3: { fontWeight: 700, letterSpacing: "-0.015em" },
    button: {
      textTransform: "none",
      fontWeight: 600,
      letterSpacing: "0.005em",
    },
  },
});

// ───────────────────────────────────────────────────────────────────────────────
// Pre-loaded demo game — Kasparov vs Topalov, Wijk aan Zee 1999
// "Kasparov's Immortal" — picked for dramatic eval swings + brilliancies
// ───────────────────────────────────────────────────────────────────────────────

const DEMO_PGN = `[Event "Hoogovens Group A"]
[Site "Wijk aan Zee NED"]
[Date "1999.01.20"]
[White "Garry Kasparov"]
[Black "Veselin Topalov"]
[Result "1-0"]
[Opening "Pirc Defense, Austrian Attack"]

1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7 8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O 14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5 20. Qf4+ Ka7 21. Rhe1 d4 22. Nd5 Nbxd5 23. exd5 Qd6 24. Rxd4 cxd4 25. Re7+ Kb6 26. Qxd4+ Kxa5 27. b4+ Ka4 28. Qc3 Qxd5 29. Ra7 Bb7 30. Rxb7 Qc4 31. Qxf6 Kxa3 32. Qxa6+ Kxb4 33. c3+ Kxc3 34. Qa1+ Kd2 35. Qb2+ Kd1 36. Bf1 Rd2 37. Rd7 Rxd7 38. Bxc4 bxc4 39. Qxh8 Rd3 40. Qa8 c3 41. Qa4+ Ke1 42. f4 f5 43. Kc1 Rd2 44. Qa7 1-0`;

// Mock eval data — plausible curve for the Kasparov game (rises, dips during
// the rook sac at move 24, then climbs to mate). Replaces real Stockfish for
// this demo. Values are cp/100 from White's perspective.
function buildMockEval(plyCount: number): number[] {
  const arr: number[] = [];
  for (let i = 0; i < plyCount; i++) {
    let v: number;
    if (i < 10) v = Math.sin(i * 0.4) * 0.25;
    else if (i < 22) v = 0.4 + Math.sin(i * 0.6) * 0.35;
    else if (i < 36) v = 1.0 + Math.sin(i * 0.5) * 0.8 + i * 0.04;
    else if (i < 48) {
      // Rook sac dip — eval looks scary for a moment then resolves
      const t = (i - 36) / 12;
      v = 2.5 + Math.sin(t * Math.PI) * 1.5 + Math.sin(i * 0.3) * 0.5;
    } else if (i < 60) v = 3.5 + (i - 48) * 0.3 + Math.sin(i * 0.2) * 0.4;
    else v = Math.min(15, 7 + (i - 60) * 0.4);
    arr.push(Number(v.toFixed(2)));
  }
  return arr;
}

// Key moments — manually authored against the actual game. In production
// these come from move classification (mistake/blunder/brilliancy detection).
interface KeyMoment {
  ply: number;
  label: string;
  kind: "opening" | "mistake" | "brilliant" | "winning" | "neutral";
}

const KEY_MOMENTS: KeyMoment[] = [
  { ply: 14, label: "8.Bh6 — sharp trade", kind: "neutral" },
  { ply: 26, label: "13...O-O-O — castling long", kind: "neutral" },
  { ply: 36, label: "18.Na5! — eyes on the king", kind: "brilliant" },
  { ply: 47, label: "24.Rxd4‼ — the rook sac", kind: "brilliant" },
  { ply: 53, label: "27.b4+! — king hunt", kind: "brilliant" },
  { ply: 67, label: "34.Qa1+ — net closes", kind: "winning" },
  { ply: 87, label: "44.Qa7 1-0", kind: "winning" },
];

// ───────────────────────────────────────────────────────────────────────────────
// Move classification — chess.com-style win% delta thresholds, computed from
// Stockfish positions[]. Production uses src/lib/engine/helpers/moveClassification
// with the same scale; we replicate the cheap, deterministic version here
// (no brilliancy heuristics, no Lichess-style accuracy curve — just the four
// tiers users actually care about for navigation).
// ───────────────────────────────────────────────────────────────────────────────

// Re-export of the production enum so the rest of this file (and the
// callers downstream of MovesListPanel) can refer to MoveLabel exactly
// the way the existing UI does, without having to chase
// MoveClassification through every prop type. Identity rebrand —
// MoveLabel is MoveClassification.
type MoveLabel = MoveClassification;

const CLASSIFICATION_COLORS: Record<MoveLabel, string> = {
  [MoveClassification.Brilliant]: "#14B8A6", // teal
  [MoveClassification.Great]: "#22c55e", // green
  [MoveClassification.Best]: "#86efac", // light green
  [MoveClassification.Excellent]: "#A3E635", // lime
  [MoveClassification.Good]: "#FACC15", // yellow
  [MoveClassification.Okay]: "rgba(255,255,255,0.6)",
  [MoveClassification.Forced]: "rgba(255,255,255,0.45)",
  [MoveClassification.Opening]: "#60A5FA", // blue
  [MoveClassification.Inaccuracy]: "#FBBF24", // amber
  [MoveClassification.Mistake]: "#FB923C", // orange
  [MoveClassification.Miss]: "#F87171", // light red
  [MoveClassification.Blunder]: "#ef4444", // red
};
const CLASSIFICATION_GLYPHS: Record<MoveLabel, string> = {
  [MoveClassification.Brilliant]: "‼",
  [MoveClassification.Great]: "!",
  [MoveClassification.Best]: "✓",
  [MoveClassification.Excellent]: "✓",
  [MoveClassification.Good]: "",
  [MoveClassification.Okay]: "",
  [MoveClassification.Forced]: "□",
  [MoveClassification.Opening]: "▸",
  [MoveClassification.Inaccuracy]: "?!",
  [MoveClassification.Mistake]: "?",
  [MoveClassification.Miss]: "✕",
  [MoveClassification.Blunder]: "??",
};
const CLASSIFICATION_LABELS: Record<MoveLabel, string> = {
  [MoveClassification.Brilliant]: "Brilliant",
  [MoveClassification.Great]: "Great",
  [MoveClassification.Best]: "Best",
  [MoveClassification.Excellent]: "Excellent",
  [MoveClassification.Good]: "Good",
  [MoveClassification.Okay]: "Okay",
  [MoveClassification.Forced]: "Forced",
  [MoveClassification.Opening]: "Opening",
  [MoveClassification.Inaccuracy]: "Inaccuracy",
  [MoveClassification.Mistake]: "Mistake",
  [MoveClassification.Miss]: "Missed opportunity",
  [MoveClassification.Blunder]: "Blunder",
};

/**
 * Look up a move's classification from a classified positions array.
 * The array must have been produced by `getMovesClassification(...)`
 * upstream — see `classifiedPositions` useMemo in AnalysisPage. The
 * production classifier produces 11 classes (Brilliant/Great/Best/
 * Excellent/Good/Okay/Forced/Opening/Inaccuracy/Mistake/Miss/Blunder)
 * vs the simplified 5-class version we shipped at /preview launch.
 *
 * Indexing: positions[i+1].moveClassification is the classification of
 * the move at moveIdx i (the move that transformed positions[i] into
 * positions[i+1]).
 */
function classifyMove(
  positions: PositionEval[] | null,
  moveIdx: number
): MoveLabel | null {
  if (!positions) return null;
  return positions[moveIdx + 1]?.moveClassification ?? null;
}

// Keep the win-% helper reachable so future inline classification logic
// (e.g. a heatmap overlay) doesn't have to re-import. Calling it has no
// side effects so this is just a soft tree-shake hint.
void getPositionWinPercentage;

// ───────────────────────────────────────────────────────────────────────────────
// Mock arrow data per ply — Engine best + Maia at various ELO ranges.
// Plies are 0-indexed from the start of the game (ply 0 = before any moves).
// uci format = "fromsq + tosq" e.g. "e2e4".
// Real wiring would source these from Stockfish + the Maia microservice.
// ───────────────────────────────────────────────────────────────────────────────

const ENGINE_BEST: Record<number, string> = {
  0: "e2e4",
  1: "c7c5",
  2: "g1f3",
  3: "d7d6",
  4: "d2d4",
  5: "g7g6",
  6: "c1e3",
  7: "f8g7",
  8: "d1d2",
  9: "c7c6",
  10: "f2f3",
  11: "b7b5",
  12: "g1e2",
  13: "b8d7",
  14: "e3h6",
};

// G8: real Maia is wired via /api/maia-predict. The hand-curated
// MAIA_MOVES table below is the cold-start fallback for the Kasparov
// demo (so the arrow shows immediately while the API request is in
// flight, and stays useful if MAIA_API_URL is unconfigured at runtime).
const MAIA_MOVES: Record<number, Record<number, string>> = {
  0: { 1100: "e2e4", 1500: "e2e4", 1800: "d2d4", 2200: "g1f3" },
  1: { 1100: "e7e5", 1500: "e7e5", 1800: "c7c5", 2200: "d7d6" },
  2: { 1100: "f1c4", 1500: "g1f3", 1800: "d2d4", 2200: "g1f3" },
  3: { 1100: "g7g6", 1500: "g8f6", 1800: "g8f6", 2200: "g8f6" },
  4: { 1100: "f1c4", 1500: "b1c3", 1800: "b1c3", 2200: "b1c3" },
  5: { 1100: "f8g7", 1500: "g7g6", 1800: "g7g6", 2200: "g7g6" },
  6: { 1100: "f2f4", 1500: "f2f4", 1800: "c1e3", 2200: "c1e3" },
  7: { 1100: "e8g8", 1500: "f8g7", 1800: "f8g7", 2200: "f8g7" },
  8: { 1100: "g1f3", 1500: "d1d2", 1800: "d1d2", 2200: "d1d2" },
  9: { 1100: "e8g8", 1500: "c7c6", 1800: "c7c6", 2200: "c7c6" },
  10: { 1100: "g1f3", 1500: "h2h3", 1800: "f2f3", 2200: "f2f3" },
};

function findMaiaMoveFromTable(ply: number, elo: number): string | undefined {
  const map = MAIA_MOVES[ply];
  if (!map) return undefined;
  const elos = Object.keys(map).map(Number).sort((a, b) => a - b);
  let closest = elos[0];
  let minDiff = Math.abs(elo - elos[0]);
  for (const e of elos) {
    const diff = Math.abs(elo - e);
    if (diff < minDiff) {
      closest = e;
      minDiff = diff;
    }
  }
  return map[closest];
}

function uciToShape(uci: string, brush: string): DrawShape {
  return { orig: uci.slice(0, 2), dest: uci.slice(2, 4), brush };
}

// ───────────────────────────────────────────────────────────────────────────────
// Real coach wiring — POST to /api/chat with conversation + position context
// ───────────────────────────────────────────────────────────────────────────────

// Fetch up to N Neo4j-backed puzzles for a given tactical theme from the
// current board position. Returns drill-ready puzzles (opp setup move
// pre-applied, solution sliced) — or null if the endpoint is unavailable
// (no Neo4j) / returns no matches.
async function fetchPuzzlesForTheme(
  fen: string,
  theme: string,
  userRating = 1500,
  limit = 3,
  excludeIds: string[] = []
): Promise<DrillPuzzle[] | null> {
  const themes = [theme]; // future: accept multi-theme conjunctions
  const res = await fetch("/api/similar-puzzles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fen,
      themes,
      userRating,
      limit,
      candidatePoolSize: Math.max(limit * 5, 20),
      excludeIds,
    }),
  });
  if (!res.ok) {
    const code = res.status;
    throw new Error(
      code === 503
        ? "puzzle store offline (Neo4j unconfigured)"
        : `puzzle store returned HTTP ${code}`
    );
  }
  const data = (await res.json()) as { puzzles?: LichessPuzzleResponse[] };
  const raw = data.puzzles ?? [];
  const mapped: DrillPuzzle[] = [];
  for (const p of raw) {
    const d = lichessToDrillPuzzle(p);
    if (d && d.solution.length > 0) mapped.push(d);
    if (mapped.length >= limit) break;
  }
  return mapped.length > 0 ? mapped : null;
}

// G14: try the adaptive-puzzles endpoint when we have a signed-in user.
// Returns null if Neo4j is unconfigured (503), the user has no struggled-
// theme history yet, or the request fails for any reason — callers fall
// back to fetchPuzzlesForTheme (similar-puzzles).
async function fetchAdaptivePuzzles(
  userId: string,
  theme: string,
  limit = 3,
  excludeIds: string[] = []
): Promise<DrillPuzzle[] | null> {
  try {
    const res = await fetch("/api/adaptive-puzzles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        themes: [theme],
        limit,
        excludePuzzleIds: excludeIds,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { puzzles?: LichessPuzzleResponse[] };
    const raw = data.puzzles ?? [];
    if (raw.length === 0) return null;
    const mapped: DrillPuzzle[] = [];
    for (const p of raw) {
      const d = lichessToDrillPuzzle(p);
      if (d && d.solution.length > 0) mapped.push(d);
      if (mapped.length >= limit) break;
    }
    return mapped.length > 0 ? mapped : null;
  } catch {
    return null;
  }
}

class CoachAuthError extends Error {}
class CoachApiError extends Error {
  constructor(public status: number) {
    super(`Coach API returned ${status}`);
  }
}

/** Build a one-line position context blurb to embed in the user's message.
 *  The /api/chat schema doesn't allow `role: "system"` from clients
 *  (Phase 1.4 hardening) — so we inline the FEN + recent moves into the
 *  user turn instead. Server sees: "[Position: ...]\n\n<user question>" */
function buildContextBlurb(
  fen: string,
  currentPly: number,
  allMoves: Move[]
): string {
  const turnColor = fen.includes(" w ") ? "White" : "Black";
  const recent =
    currentPly > 0
      ? allMoves
          .slice(Math.max(0, currentPly - 6), currentPly)
          .map((m) => m.san)
          .join(" ")
      : "(starting position)";
  return `[Position FEN: ${fen}\nRecent moves: ${recent}\nTo move: ${turnColor}]`;
}

/**
 * Production-parity two-tier coach call (mirrors AICoachChat.tsx:2421+):
 *
 * - **Deep path** — `/api/enhanced-analysis` (SSE). Fires on the very
 *   first message of a session (or after the contextId cache expires).
 *   Builds the rich Stage-B analysis context that the LLM grounds
 *   subsequent answers against. Returns a contextId in the final SSE
 *   metadata event.
 * - **Fast path** — `/api/chat` (non-SSE). Fires on every follow-up
 *   message that has a live contextId. Cheap and quick because the
 *   server reuses the cached deep context.
 *
 * The caller passes a `contextIdRef` so we can read/update across calls
 * without retriggering React renders. Returns the final accumulated
 * content (the caller doesn't need it — onDelta drives the UI — but
 * we use it to look for [INSIGHT:...] tags in G5).
 */
async function streamCoachReply(params: {
  prevMessages: CoachMessage[];
  userText: string;
  fen: string;
  currentPly: number;
  allMoves: Move[];
  loadedGame: Chess;
  enginePositions: PositionEval[] | null;
  /** Full GameEval (accuracy + estimatedElo + settings + positions) captured
   *  from engine.evaluateGame. When present, this is what the server actually
   *  uses to compose the overview section of the system prompt
   *  (route.ts:362-363 → `Accuracy: …`, `Estimated Elo: …`). Without it the
   *  LLM is blind to the user's skill level and the reply quality drops to
   *  generic. */
  gameEvalFull?: GameEval | null;
  contextIdRef: { current: string | null };
  userRating?: number;
  /** "w" | "b" — production's playerColor field, lifted into the system
   *  prompt as "You're coaching <White|Black>". Derived from board
   *  orientation when no explicit picker exists. */
  playerColor?: "w" | "b";
  /** Explicit display string for the player's color. Server uses this for
   *  prompt-side address rather than re-deriving from playerColor. */
  playerColorName?: "white" | "black";
  /** Bottom-of-board side as seen by the user. Production also threads this
   *  in so personality prompts can phrase from the right perspective. */
  boardOrientation?: "white" | "black";
  /** Display name / chess username for personalization. */
  username?: string;
  chesscomUsername?: string;
  lichessUsername?: string;
  /** Coach persona id ("friendly", "grandmaster", etc.). Server's
   *  getCoachChatSystemPrompt() looks this up via getPersonalityById
   *  and merges the persona's tone-and-style block into the prompt. */
  personalityId?: string;
  onDelta: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const {
    prevMessages,
    userText,
    fen,
    currentPly,
    allMoves,
    loadedGame,
    enginePositions,
    gameEvalFull,
    contextIdRef,
    userRating,
    playerColor,
    playerColorName,
    boardOrientation,
    username,
    chesscomUsername,
    lichessUsername,
    personalityId,
    onDelta,
    signal,
  } = params;

  const conversationHistory = prevMessages
    .filter((m) => m.role === "user" || m.role === "coach")
    .map((m) => ({
      role: m.role === "coach" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

  const hasContext =
    contextIdRef.current !== null &&
    conversationHistory.some((m) => m.role === "assistant");

  // ─── FAST PATH: follow-up via /api/chat (cached deep context) ───
  if (hasContext) {
    const chatRes = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        contextId: contextIdRef.current,
        userMessage: userText,
        conversationHistory,
      }),
      signal,
    });
    if (chatRes.status === 404) {
      // contextId expired — fall through to deep path
      contextIdRef.current = null;
    } else if (chatRes.status === 401) {
      throw new CoachAuthError();
    } else if (!chatRes.ok) {
      throw new CoachApiError(chatRes.status);
    } else {
      const data = await chatRes.json();
      const text: string =
        data.message ??
        data.response ??
        data.gameAnalysis?.analysis ??
        "";
      // Emit as a single chunk so the UI animates the same way
      onDelta(text);
      return text;
    }
  }

  // ─── DEEP PATH: /api/enhanced-analysis (SSE) ───
  // moveHistory is the FULL game (matches production /api/enhanced-analysis
  // callers in src/components/AICoachChat.tsx:2483 — game.history()). fen
  // is the cursor position so the server can ground "what's happening here"
  // questions. Previously sliced to currentPly, which made "analyze my
  // game" land on the server with zero moves when the user was sitting at
  // ply 0 — the coach would helpfully respond "I see we're starting from
  // the initial position".
  const moveHistory = allMoves.map((m) => m.san);
  // Prefer the full GameEval (with accuracy + estimatedElo + settings) when
  // available — that's what production sends and what the route's overview
  // composer expects. Fall back to the bare-positions wrap only when the
  // user is asking before Stockfish finished (analysisActive should already
  // block this path now, but defensive nonetheless).
  const gameEvalPayload =
    gameEvalFull ??
    (enginePositions ? { positions: enginePositions } : undefined);
  const requestBody: Record<string, unknown> = {
    userMessage: userText,
    moveHistory,
    fen,
    gameEval: gameEvalPayload,
    conversationHistory,
    userRating: userRating ?? 1500,
    // Production-parity personalization fields (AICoachChat:2459-2487).
    // All are optional server-side and round-trip via the enhanced-analysis
    // zod schema; the LLM's system prompt only gets richer with each one.
    playerColor,
    playerColorName,
    boardOrientation,
    username,
    chesscomUsername,
    lichessUsername,
    personalityId,
    stream: true,
  };
  // Personality / username left undefined — server falls back gracefully
  // and the new page hasn't surfaced the personality picker yet.

  const res = await fetch("/api/enhanced-analysis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    credentials: "include",
    body: JSON.stringify(requestBody),
    signal,
  });

  if (res.status === 401) throw new CoachAuthError();
  if (!res.ok) throw new CoachApiError(res.status);
  if (!res.body) throw new CoachApiError(res.status);

  // The route emits either SSE or JSON depending on whether `stream:true`
  // was honored. Detect from content-type.
  const isStream = res.headers
    .get("content-type")
    ?.includes("text/event-stream");

  if (!isStream) {
    const data = await res.json();
    if (data.gameAnalysis?.contextId) {
      contextIdRef.current = data.gameAnalysis.contextId;
    }
    const text: string = data.gameAnalysis?.analysis ?? data.message ?? "";
    onDelta(text);
    return text;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const ev of events) {
      const line = ev.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return accumulated;
      try {
        const parsed = JSON.parse(payload);
        if (parsed.type === "text" && typeof parsed.delta === "string") {
          accumulated += parsed.delta;
          onDelta(parsed.delta);
        } else if (parsed.type === "done" || parsed.type === "metadata") {
          // Final event carries contextId + validation + puzzle recs
          if (parsed.contextId) contextIdRef.current = parsed.contextId;
          if (parsed.metadata?.contextId)
            contextIdRef.current = parsed.metadata.contextId;
        } else if (parsed.type === "error") {
          throw new CoachApiError(502);
        }
      } catch (e) {
        if (e instanceof CoachApiError) throw e;
        // ignore malformed lines
      }
    }
  }
  return accumulated;
}

// Silence the unused-warning until other deep-context callers consume it.
void buildContextBlurb;

// ───────────────────────────────────────────────────────────────────────────────
// Drill puzzles — Neo4j-backed in production, hand-curated for the preview demo.
// Each puzzle solves in 1 move from the given FEN. The drill flow promotes the
// puzzle onto the main board, validates the user's move via chess.js, and after
// 3 puzzles surfaces "More puzzles" / "Return to game" while preserving chat.
// ───────────────────────────────────────────────────────────────────────────────

interface DrillPuzzle {
  id: string;
  title: string;
  hint: string;
  fen: string;
  // UCI move list — solution[0] is the user's first move. For mate-in-1
  // puzzles this is a single entry; multi-move puzzles alternate user/opp.
  solution: string[];
  rating: number;
  themes: string[];
}

const DEMO_PUZZLES: DrillPuzzle[] = [
  {
    id: "demo-back-rank",
    title: "Back-rank breakthrough",
    hint: "Two rooks lock the eighth rank. The pawns trap the king.",
    fen: "R5k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1",
    solution: ["e1e8"],
    rating: 1200,
    themes: ["backRankMate", "mateIn1"],
  },
  {
    id: "demo-queen-mate",
    title: "Queen-and-king finish",
    hint: "The white king already covers the escape. Bring the queen home.",
    fen: "7k/8/5P1K/8/8/8/8/3Q4 w - - 0 1",
    solution: ["d1d8"],
    rating: 1100,
    themes: ["queenMate", "mateIn1"],
  },
  {
    id: "demo-rook-corner",
    title: "Lift the rook",
    hint: "King opposition is already there. Deliver the back-rank check.",
    fen: "7k/8/7K/8/8/8/8/R7 w - - 0 1",
    solution: ["a1a8"],
    rating: 1000,
    themes: ["rookMate", "mateIn1"],
  },
];

interface PuzzlePack {
  theme: string;
  displayTheme: string;
  puzzles: DrillPuzzle[];
  /** undefined = hand-curated/synchronous; otherwise reflects fetch state */
  status?: "loading" | "ready" | "error";
  error?: string;
}

// Lichess puzzle shape returned by `/api/similar-puzzles`
interface LichessPuzzleResponse {
  puzzleId: string;
  fen: string;
  moves: string; // space-separated UCI
  rating: number;
  themes: string[];
}

// Lichess convention: moves[0] is the opponent's setup move (auto-played
// to reach the actual puzzle starting position); user solves moves[1..N].
function lichessToDrillPuzzle(p: LichessPuzzleResponse): DrillPuzzle | null {
  const movesArr = p.moves.split(/\s+/).filter(Boolean);
  if (movesArr.length < 1) return null;
  try {
    const g = new Chess(p.fen);
    if (movesArr.length >= 2) {
      const setup = movesArr[0];
      const res = g.move({
        from: setup.slice(0, 2),
        to: setup.slice(2, 4),
        promotion: setup[4] ?? "q",
      });
      if (!res) return null;
    }
    const solution = movesArr.length >= 2 ? movesArr.slice(1) : movesArr;
    const theme = p.themes[0] ?? "tactics";
    return {
      id: p.puzzleId,
      title: titleFromThemes(p.themes),
      hint: hintFromThemes(p.themes, p.rating),
      fen: g.fen(),
      solution,
      rating: p.rating,
      themes: p.themes,
    };
  } catch {
    return null;
  }
}

const THEME_TITLES: Record<string, string> = {
  fork: "Find the fork",
  pin: "Find the pin",
  skewer: "Find the skewer",
  "discovered-attack": "Discovered attack",
  "discoveredAttack": "Discovered attack",
  "double-attack": "Double attack",
  "back-rank": "Back-rank pressure",
  backRankMate: "Back-rank mate",
  smotheredMate: "Smothered mate",
  "knight-fork": "Knight fork",
  "queen-knight-fork": "Queen-and-knight fork",
  deflection: "Deflection",
  decoy: "Decoy the defender",
  sacrifice: "Sacrifice for tempo",
  trappedPiece: "Trap the piece",
  mateIn1: "Mate in 1",
  mateIn2: "Mate in 2",
  mateIn3: "Mate in 3",
};

function titleFromThemes(themes: string[]): string {
  for (const t of themes) {
    if (THEME_TITLES[t]) return THEME_TITLES[t];
  }
  // Title-case the first theme as a fallback
  const first = themes[0] ?? "Tactic";
  return first
    .replace(/-/g, " ")
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function hintFromThemes(themes: string[], rating: number): string {
  const motif = themes.find((t) => THEME_TITLES[t]) ?? themes[0] ?? "tactic";
  return `Rated ${rating} · ${motif.replace(/-/g, " ")}`;
}

// Parse [PRACTICE:theme:displayName] markers from coach content. Mirrors the
// production pattern (`/\[PRACTICE:([^:\]]+):([^\]]+)\]/g`). Returns the
// stripped content + the matched tags so the bubble can render clean text
// while the analysis layer triggers a real /api/similar-puzzles fetch.
const PRACTICE_TAG_RE = /\[PRACTICE:([^:\]]+):([^\]]+)\]/g;

interface PracticeTag {
  theme: string;
  displayTheme: string;
}

function extractPracticeTags(content: string): {
  stripped: string;
  tags: PracticeTag[];
} {
  const tags: PracticeTag[] = [];
  const stripped = content.replace(PRACTICE_TAG_RE, (_, theme, display) => {
    tags.push({ theme: String(theme), displayTheme: String(display) });
    return "";
  });
  return { stripped: stripped.trim(), tags };
}

// G5: [INSIGHT:...] tags. Production AICoachChat.tsx:2038-2047 looks
// for these in coach replies — the payload is the headline for the
// shareable SVG card, and the presence of any tag is the signal that
// gates the autoAnalyzeState machine (G6) from
// "sent-awaiting-insights" → "done".
const INSIGHT_TAG_RE = /\[INSIGHT:([^\]]+)\]/g;

function extractInsightTags(content: string): {
  stripped: string;
  insights: string[];
} {
  const insights: string[] = [];
  const stripped = content.replace(INSIGHT_TAG_RE, (_, payload) => {
    insights.push(String(payload));
    return "";
  });
  return { stripped: stripped.trim(), insights };
}

interface DrillState {
  puzzles: DrillPuzzle[];
  currentIndex: number;
  currentMoveIndex: number;
  currentFen: string;
  status: "solving" | "wrong" | "solved" | "complete";
  wrongAttempts: number;
  lastMove: { from: string; to: string } | null;
  savedPly: number;
  savedOrientation: "white" | "black";
}

const DEMO_PUZZLE_PACK: PuzzlePack = {
  theme: "mating-patterns",
  displayTheme: "Mating patterns",
  puzzles: DEMO_PUZZLES,
};

// Pre-loaded coach exchange — what an excellent first interaction looks like
interface CoachMessage {
  role: "user" | "coach";
  content: string;
  ply?: number; // links message to a board position
  insight?: { tag: string; eval?: string; classification?: string };
  // When set, a puzzle pack card renders below the bubble with a
  // "Move to big board" CTA per puzzle.
  puzzlePack?: PuzzlePack;
}

const SEED_MESSAGES: CoachMessage[] = [
  {
    role: "coach",
    content:
      "Loaded **Kasparov vs Topalov, 1999** — one of the most famous games of all time. Want me to walk you through it, or jump to a specific moment? **24.Rxd4** is the most analyzed move in chess history if you want to start there.",
    ply: 0,
  },
  {
    role: "user",
    content: "Why is 24.Rxd4 considered brilliant?",
    ply: 47,
  },
  {
    role: "coach",
    content:
      "Stockfish 17 sees it as the only winning move — eval jumps from +2.4 to +4.7 after **24.Rxd4 cxd4 25.Re7+!** The rook is *lost* but the second rook delivers check, and after **25...Kb6 26.Qxd4+** the black king walks into a mating net on a4 with no defenders. Kasparov calculated 15+ ply to see this would work.\n\nWant to drill the underlying patterns? I picked three mating-net positions in the same family — you can solve them right here, or move any one onto the big board.",
    ply: 47,
    insight: {
      tag: "24.Rxd4 — brilliancy",
      eval: "+4.7",
      classification: "Best move (only win)",
    },
    puzzlePack: DEMO_PUZZLE_PACK,
  },
];

const SUGGESTION_PILLS = [
  "Show the forced mate line",
  "What was Black's best defense?",
  "Find me puzzles with rook sacrifices",
  "Why did Kasparov sac on move 24?",
];

// ───────────────────────────────────────────────────────────────────────────────
// Board square styling
// ───────────────────────────────────────────────────────────────────────────────

// Warm wood-tone squares — calibrated for readability against the
// near-black page background while staying in the orange/black family.
// Contrast ratio between light & dark ≈ 5.5:1.
const DARK_SQUARE = "#5C4630";
const LIGHT_SQUARE = "#F0D9B5";
const LAST_MOVE_FROM = "rgba(249, 115, 22, 0.32)";
const LAST_MOVE_TO = "rgba(249, 115, 22, 0.48)";

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────

interface MoveDisplay {
  moveNum: number;
  color: "white" | "black" | null; // null = start of game
  label: string;
}

const plyToMoveDisplay = (ply: number): MoveDisplay => {
  if (ply === 0) return { moveNum: 0, color: null, label: "Start" };
  const moveNum = Math.ceil(ply / 2);
  const color: "white" | "black" = ply % 2 === 1 ? "white" : "black";
  return { moveNum, color, label: String(moveNum) };
};

const formatEval = (cp: number): string => {
  if (Math.abs(cp) >= 10) return cp > 0 ? "M" : "-M";
  const sign = cp > 0 ? "+" : "";
  return `${sign}${cp.toFixed(1)}`;
};

// ───────────────────────────────────────────────────────────────────────────────
// Components
// ───────────────────────────────────────────────────────────────────────────────

function NavPill() {
  return (
    <Box
      component="header"
      sx={{
        position: "sticky",
        top: 16,
        zIndex: 50,
        mx: "auto",
        maxWidth: 1680,
        px: { xs: 2, md: 3 },
        py: 1.25,
        mb: 3,
        borderRadius: "999px",
        background: "rgba(12,14,20,0.6)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        gap: 2,
      }}
    >
      <Box
        component={Link}
        href="/preview/launch"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          fontWeight: 800,
          color: "rgba(255,255,255,0.94)",
          letterSpacing: "-0.02em",
          textDecoration: "none",
        }}
      >
        <Box
          sx={{
            width: 26,
            height: 26,
            borderRadius: "8px",
            background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 16px rgba(249,115,22,0.4)",
          }}
        >
          <Sparkles size={14} color="#0A0A0A" />
        </Box>
        Chess Masti
      </Box>

      <Box sx={{ flex: 1 }} />

      <Stack
        direction="row"
        spacing={3}
        sx={{ display: { xs: "none", md: "flex" } }}
      >
        {[
          { label: "Play", href: "/play" },
          { label: "Practice", href: "/practice" },
          { label: "Scout", href: "/scout" },
        ].map((item) => (
          <Typography
            key={item.label}
            component={Link}
            href={item.href}
            sx={{
              fontSize: "0.88rem",
              fontWeight: 500,
              color: "rgba(255,255,255,0.7)",
              textDecoration: "none",
              "&:hover": { color: "rgba(255,255,255,1)" },
            }}
          >
            {item.label}
          </Typography>
        ))}
      </Stack>

      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          px: 1.5,
          py: 0.5,
          borderRadius: "999px",
          background: "rgba(249,115,22,0.12)",
          border: "1px solid rgba(249,115,22,0.3)",
        }}
      >
        <Zap size={12} color="#F97316" />
        <Typography
          sx={{
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            color: "#FB923C",
            textTransform: "uppercase",
          }}
        >
          Analysis
        </Typography>
      </Box>
    </Box>
  );
}

function GameHeader({
  whiteName,
  blackName,
  event,
  year,
  opening,
  currentEval,
  currentPly,
  totalPlies,
  onLoadGameClick,
  engineDepth,
  onEngineDepthChange,
  engineName,
  onEngineNameChange,
  onSaveGameClick,
  saveState,
}: {
  whiteName: string;
  blackName: string;
  event: string;
  year: string;
  opening: string;
  currentEval: number;
  currentPly: number;
  totalPlies: number;
  onLoadGameClick?: () => void;
  engineDepth?: number;
  onEngineDepthChange?: (d: number) => void;
  engineName?: EngineName;
  onEngineNameChange?: (n: EngineName) => void;
  /**
   * G4: surface a Save button when the user is signed in. Click → calls
   * useGameDatabase().addGame upstream. Undefined = button hidden (guest
   * mode); defined = button visible with the current state badge.
   */
  onSaveGameClick?: () => void;
  saveState?: "idle" | "saving" | "saved" | "error";
}) {
  const [enginePopoverAnchor, setEnginePopoverAnchor] =
    useState<HTMLElement | null>(null);
  const evalPositive = currentEval >= 0;
  return (
    <Box
      sx={{
        mb: 3,
        px: { xs: 3, md: 4 },
        py: 2.5,
        borderRadius: "1.5rem",
        background:
          "linear-gradient(135deg, rgba(249,115,22,0.06), rgba(20,22,28,0.55))",
        backdropFilter: "blur(14px) saturate(150%)",
        WebkitBackdropFilter: "blur(14px) saturate(150%)",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "auto 1fr auto" },
        gap: { xs: 2, md: 4 },
        alignItems: "center",
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: "10px",
            background:
              "linear-gradient(135deg, rgba(249,115,22,0.18), rgba(234,88,12,0.18))",
            border: "1px solid rgba(249,115,22,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Crown size={18} color="#F97316" />
        </Box>
        <Box>
          <Typography
            sx={{
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.16em",
              color: "rgba(255,255,255,0.5)",
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            Now analyzing
          </Typography>
          <Typography
            sx={{
              fontSize: "1.05rem",
              fontWeight: 700,
              color: "rgba(255,255,255,0.94)",
              lineHeight: 1.3,
              mt: 0.5,
            }}
          >
            {whiteName} <Box component="span" sx={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>vs</Box> {blackName}
          </Typography>
        </Box>
      </Stack>

      <Stack
        direction="row"
        spacing={3}
        sx={{
          color: "rgba(255,255,255,0.55)",
          fontSize: "0.85rem",
          flexWrap: "wrap",
          justifyContent: { xs: "flex-start", md: "center" },
        }}
      >
        <Box>
          <Box component="span" sx={{ color: "rgba(255,255,255,0.4)" }}>Event · </Box>
          {event} {year}
        </Box>
        <Box sx={{ display: { xs: "none", md: "block" } }}>·</Box>
        <Box>
          <Box component="span" sx={{ color: "rgba(255,255,255,0.4)" }}>Opening · </Box>
          {opening}
        </Box>
      </Stack>

      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        sx={{
          flexWrap: "wrap",
          rowGap: 1,
          justifyContent: { xs: "flex-start", md: "flex-end" },
        }}
      >
        <Stack direction="row" alignItems="baseline" spacing={0.5}>
          <Typography
            sx={{
              fontSize: "1.4rem",
              fontWeight: 800,
              color: "rgba(255,255,255,0.96)",
              lineHeight: 1,
              fontFamily: "Monaco, Menlo, monospace",
            }}
          >
            {currentPly}
          </Typography>
          <Typography
            sx={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.4)" }}
          >
            / {totalPlies}
          </Typography>
        </Stack>

        <Box
          sx={{
            px: 1.75,
            py: 0.75,
            borderRadius: "10px",
            background: evalPositive
              ? "rgba(249,115,22,0.12)"
              : "rgba(255,255,255,0.06)",
            border: evalPositive
              ? "1px solid rgba(249,115,22,0.3)"
              : "1px solid rgba(255,255,255,0.1)",
            minWidth: 64,
            textAlign: "center",
          }}
        >
          <Typography
            sx={{
              fontSize: "1rem",
              fontWeight: 700,
              color: evalPositive ? "#FB923C" : "rgba(255,255,255,0.85)",
              fontFamily: "Monaco, Menlo, monospace",
              lineHeight: 1,
            }}
          >
            {formatEval(currentEval)}
          </Typography>
        </Box>

        {engineDepth !== undefined && (
          <Tooltip title="Stockfish engine settings — depth and variant">
            <Button
              onClick={(e) => setEnginePopoverAnchor(e.currentTarget)}
              startIcon={<Activity size={13} />}
              sx={{
                px: 1.5,
                py: 0.75,
                borderRadius: "10px",
                fontSize: "0.78rem",
                fontWeight: 700,
                fontFamily: "Monaco, Menlo, monospace",
                textTransform: "none",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.78)",
                "&:hover": {
                  background: "rgba(255,255,255,0.08)",
                  borderColor: "rgba(255,255,255,0.2)",
                },
              }}
            >
              d{engineDepth}
            </Button>
          </Tooltip>
        )}
        {onLoadGameClick && (
          <Tooltip title="Load a new PGN, FEN, or import from Lichess/Chess.com">
            <Button
              onClick={onLoadGameClick}
              startIcon={<RefreshCw size={13} />}
              sx={{
                px: 1.5,
                py: 0.75,
                borderRadius: "10px",
                fontSize: "0.78rem",
                fontWeight: 700,
                textTransform: "none",
                background:
                  "linear-gradient(135deg, rgba(249,115,22,0.18), rgba(251,146,60,0.12))",
                border: "1px solid rgba(249,115,22,0.35)",
                color: "#FB923C",
                "&:hover": {
                  background:
                    "linear-gradient(135deg, rgba(249,115,22,0.28), rgba(251,146,60,0.18))",
                  borderColor: "rgba(249,115,22,0.55)",
                },
              }}
            >
              Load game
            </Button>
          </Tooltip>
        )}
        {onSaveGameClick && (
          <Tooltip
            title={
              saveState === "saved"
                ? "Saved to your library"
                : saveState === "saving"
                ? "Saving…"
                : saveState === "error"
                ? "Save failed — check sign-in"
                : "Save this game to your library"
            }
          >
            <span>
              <Button
                onClick={onSaveGameClick}
                disabled={saveState === "saving" || saveState === "saved"}
                sx={{
                  px: 1.5,
                  py: 0.75,
                  borderRadius: "10px",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  textTransform: "none",
                  background:
                    saveState === "saved"
                      ? "rgba(34,197,94,0.18)"
                      : "rgba(255,255,255,0.06)",
                  border:
                    saveState === "saved"
                      ? "1px solid rgba(34,197,94,0.35)"
                      : "1px solid rgba(255,255,255,0.12)",
                  color:
                    saveState === "saved" ? "#86efac" : "rgba(255,255,255,0.78)",
                  "&:hover": {
                    background:
                      saveState === "saved"
                        ? "rgba(34,197,94,0.24)"
                        : "rgba(255,255,255,0.1)",
                  },
                  "&.Mui-disabled": {
                    color:
                      saveState === "saved"
                        ? "#86efac"
                        : "rgba(255,255,255,0.4)",
                  },
                }}
              >
                {saveState === "saved"
                  ? "✓ Saved"
                  : saveState === "saving"
                  ? "Saving…"
                  : "Save game"}
              </Button>
            </span>
          </Tooltip>
        )}
      </Stack>
      <EngineSettingsPopover
        anchorEl={enginePopoverAnchor}
        onClose={() => setEnginePopoverAnchor(null)}
        depth={engineDepth ?? 12}
        onDepthChange={onEngineDepthChange}
        engineName={engineName ?? EngineName.Stockfish17Lite}
        onEngineNameChange={onEngineNameChange}
      />
    </Box>
  );
}

function EngineSettingsPopover({
  anchorEl,
  onClose,
  depth,
  onDepthChange,
  engineName,
  onEngineNameChange,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  depth: number;
  onDepthChange?: (d: number) => void;
  engineName: EngineName;
  onEngineNameChange?: (n: EngineName) => void;
}) {
  if (!anchorEl) return null;
  return (
    <Modal
      open={Boolean(anchorEl)}
      onClose={onClose}
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: "rgba(8,9,12,0.55)",
            backdropFilter: "blur(4px)",
          },
        },
      }}
    >
      <Box
        sx={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 360,
          maxWidth: "92vw",
          p: 2.5,
          borderRadius: "1.25rem",
          background:
            "linear-gradient(180deg, rgba(20,22,28,0.94), rgba(12,14,20,0.94))",
          backdropFilter: "blur(20px) saturate(150%)",
          WebkitBackdropFilter: "blur(20px) saturate(150%)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          outline: "none",
        }}
      >
        <Stack spacing={2}>
          <Box>
            <Typography
              sx={{
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: "0.14em",
                color: "rgba(255,255,255,0.55)",
                textTransform: "uppercase",
                mb: 0.75,
              }}
            >
              Engine
            </Typography>
            <Stack direction="row" spacing={0.85}>
              {[
                {
                  id: EngineName.Stockfish17Lite,
                  label: "17 Lite",
                  sub: "fast · single-thread",
                },
                {
                  id: EngineName.Stockfish17,
                  label: "17 Full",
                  sub: "slower · NNUE",
                },
              ].map((opt) => {
                const isActive = engineName === opt.id;
                return (
                  <Box
                    key={opt.id}
                    onClick={() => onEngineNameChange?.(opt.id)}
                    sx={{
                      flex: 1,
                      px: 1.5,
                      py: 1,
                      borderRadius: "10px",
                      cursor: onEngineNameChange ? "pointer" : "default",
                      background: isActive
                        ? "linear-gradient(135deg, rgba(249,115,22,0.18), rgba(251,146,60,0.12))"
                        : "rgba(255,255,255,0.03)",
                      border: isActive
                        ? "1px solid rgba(249,115,22,0.4)"
                        : "1px solid rgba(255,255,255,0.08)",
                      transition: "all 160ms ease",
                      "&:hover": {
                        background: isActive
                          ? "linear-gradient(135deg, rgba(249,115,22,0.24), rgba(251,146,60,0.16))"
                          : "rgba(255,255,255,0.06)",
                      },
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: "0.86rem",
                        fontWeight: 700,
                        color: isActive ? "#FB923C" : "rgba(255,255,255,0.92)",
                        lineHeight: 1.2,
                      }}
                    >
                      {opt.label}
                    </Typography>
                    <Typography
                      sx={{
                        mt: 0.25,
                        fontSize: "0.7rem",
                        color: "rgba(255,255,255,0.45)",
                        fontFamily: "Monaco, Menlo, monospace",
                      }}
                    >
                      {opt.sub}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          </Box>

          <Box>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ mb: 0.75 }}
            >
              <Typography
                sx={{
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  color: "rgba(255,255,255,0.55)",
                  textTransform: "uppercase",
                }}
              >
                Depth
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Typography
                sx={{
                  fontSize: "0.74rem",
                  color: "#FB923C",
                  fontFamily: "Monaco, Menlo, monospace",
                  fontWeight: 700,
                }}
              >
                d{depth}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={0.5}>
              {[10, 12, 14, 16].map((d) => {
                const isActive = depth === d;
                return (
                  <Box
                    key={d}
                    onClick={() => onDepthChange?.(d)}
                    sx={{
                      flex: 1,
                      py: 0.85,
                      textAlign: "center",
                      borderRadius: "8px",
                      cursor: onDepthChange ? "pointer" : "default",
                      background: isActive
                        ? "linear-gradient(135deg, #F97316, #FB923C)"
                        : "rgba(255,255,255,0.03)",
                      border: isActive
                        ? "1px solid rgba(249,115,22,0.5)"
                        : "1px solid rgba(255,255,255,0.08)",
                      color: isActive ? "#0A0A0A" : "rgba(255,255,255,0.78)",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      fontFamily: "Monaco, Menlo, monospace",
                      transition: "all 160ms ease",
                      "&:hover": {
                        background: isActive
                          ? "linear-gradient(135deg, #FB923C, #FCD34D)"
                          : "rgba(255,255,255,0.06)",
                      },
                    }}
                  >
                    {d}
                  </Box>
                );
              })}
            </Stack>
            <Typography
              sx={{
                mt: 0.85,
                fontSize: "0.72rem",
                color: "rgba(255,255,255,0.45)",
                lineHeight: 1.4,
              }}
            >
              Higher depth = better tactics, slower analysis. Changing this
              re-runs Stockfish on the loaded game.
            </Typography>
          </Box>
        </Stack>
      </Box>
    </Modal>
  );
}

function DrillBanner({
  state,
  onExit,
  onRestart,
  onSkip,
}: {
  state: DrillState;
  onExit: () => void;
  onRestart: () => void;
  onSkip: () => void;
}) {
  const total = state.puzzles.length;
  const puzzle = state.puzzles[state.currentIndex];
  const isComplete = state.status === "complete";
  const isWrong = state.status === "wrong";
  const isSolved = state.status === "solved";

  // Accent color shifts with status — purple = drill, green = solved, red = wrong
  const accent = isComplete
    ? "#22c55e"
    : isSolved
    ? "#22c55e"
    : isWrong
    ? "#ef4444"
    : "#A855F7";
  const accentSoft = isComplete
    ? "rgba(34,197,94,0.12)"
    : isSolved
    ? "rgba(34,197,94,0.12)"
    : isWrong
    ? "rgba(239,68,68,0.12)"
    : "rgba(168,85,247,0.12)";
  const accentBorder = isComplete
    ? "rgba(34,197,94,0.35)"
    : isSolved
    ? "rgba(34,197,94,0.35)"
    : isWrong
    ? "rgba(239,68,68,0.4)"
    : "rgba(168,85,247,0.35)";

  return (
    <motion.div
      key="drill-banner"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
      style={{ marginBottom: 12 }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderRadius: "1rem",
          background: `linear-gradient(135deg, ${accentSoft}, rgba(20,22,28,0.6))`,
          backdropFilter: "blur(12px) saturate(150%)",
          WebkitBackdropFilter: "blur(12px) saturate(150%)",
          border: `1px solid ${accentBorder}`,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          flexWrap: { xs: "wrap", md: "nowrap" },
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            flexShrink: 0,
            borderRadius: "10px",
            background: accentSoft,
            border: `1px solid ${accentBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isComplete ? (
            <Flame size={16} color={accent} />
          ) : (
            <Lightbulb size={16} color={accent} />
          )}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography
              sx={{
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: accent,
                lineHeight: 1,
              }}
            >
              {isComplete
                ? "Drill complete"
                : `Drill · puzzle ${state.currentIndex + 1} of ${total}`}
            </Typography>
            {!isComplete && (
              <Stack direction="row" spacing={0.5}>
                {state.puzzles.map((_, i) => (
                  <Box
                    key={i}
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background:
                        i < state.currentIndex
                          ? "#22c55e"
                          : i === state.currentIndex
                          ? accent
                          : "rgba(255,255,255,0.18)",
                    }}
                  />
                ))}
              </Stack>
            )}
          </Stack>
          <Typography
            sx={{
              mt: 0.5,
              fontSize: "0.88rem",
              fontWeight: 600,
              color: "rgba(255,255,255,0.92)",
              lineHeight: 1.2,
            }}
          >
            {isComplete
              ? "Three for three — nice work."
              : isSolved
              ? `${puzzle?.title ?? "Puzzle"} — solved`
              : isWrong
              ? "Not the move — try again."
              : puzzle?.title ?? "Puzzle"}
          </Typography>
          {!isComplete && puzzle && state.status === "solving" && (
            <Typography
              sx={{
                mt: 0.25,
                fontSize: "0.74rem",
                color: "rgba(255,255,255,0.55)",
                lineHeight: 1.35,
              }}
            >
              {puzzle.hint}
            </Typography>
          )}
          {!isComplete &&
            state.status === "solving" &&
            state.wrongAttempts >= 2 && (
              <Typography
                sx={{
                  mt: 0.25,
                  fontSize: "0.72rem",
                  color: "rgba(239,68,68,0.85)",
                  fontStyle: "italic",
                }}
              >
                Stuck? Skip ahead, or ask the coach on the right.
              </Typography>
            )}
        </Box>

        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ flexShrink: 0 }}
        >
          {!isComplete && state.wrongAttempts >= 2 && (
            <Button
              size="small"
              onClick={onSkip}
              sx={{
                px: 1.25,
                py: 0.5,
                borderRadius: "0.6rem",
                fontSize: "0.74rem",
                fontWeight: 600,
                color: "rgba(255,255,255,0.6)",
                textTransform: "none",
                "&:hover": {
                  background: "rgba(255,255,255,0.05)",
                  color: "rgba(255,255,255,0.85)",
                },
              }}
            >
              Skip
            </Button>
          )}
          {isComplete && (
            <Button
              size="small"
              startIcon={<RotateCw size={14} />}
              onClick={onRestart}
              sx={{
                px: 1.5,
                py: 0.5,
                borderRadius: "0.6rem",
                fontSize: "0.78rem",
                fontWeight: 700,
                background: "rgba(168,85,247,0.18)",
                border: "1px solid rgba(168,85,247,0.4)",
                color: "#E9D5FF",
                "&:hover": {
                  background: "rgba(168,85,247,0.3)",
                  borderColor: "rgba(168,85,247,0.6)",
                },
              }}
            >
              More puzzles
            </Button>
          )}
          <Button
            size="small"
            startIcon={<ArrowLeft size={14} />}
            onClick={onExit}
            sx={{
              px: 1.5,
              py: 0.5,
              borderRadius: "0.6rem",
              fontSize: "0.78rem",
              fontWeight: 700,
              background: isComplete
                ? "linear-gradient(135deg, #F97316, #FB923C)"
                : "rgba(255,255,255,0.05)",
              border: isComplete
                ? "1px solid rgba(249,115,22,0.4)"
                : "1px solid rgba(255,255,255,0.12)",
              color: isComplete ? "#0A0A0A" : "rgba(255,255,255,0.92)",
              "&:hover": {
                background: isComplete
                  ? "linear-gradient(135deg, #FB923C, #FCD34D)"
                  : "rgba(255,255,255,0.08)",
              },
            }}
          >
            Return to game
          </Button>
        </Stack>
      </Box>
    </motion.div>
  );
}

function BoardArea({
  fen,
  lastMove,
  boardOrientation,
  isInCheck,
  shapes,
  interactive = false,
  movableColor,
  dests,
  onMove,
  syncTick,
}: {
  fen: string;
  lastMove: Move | null;
  boardOrientation: "white" | "black";
  isInCheck: boolean;
  shapes?: DrawShape[];
  interactive?: boolean;
  movableColor?: "white" | "black" | "both";
  dests?: Map<string, string[]>;
  onMove?: (from: string, to: string) => void;
  /** Bump to force chessground to re-sync to `fen` (rejected drag, etc.). */
  syncTick?: number;
}) {
  const lastMoveTuple = useMemo<[string, string] | undefined>(
    () => (lastMove ? [lastMove.from, lastMove.to] : undefined),
    [lastMove]
  );

  return (
    <Box
      sx={{
        position: "relative",
        borderRadius: "1.5rem",
        background:
          "linear-gradient(135deg, rgba(249,115,22,0.04), rgba(20,22,28,0.4))",
        backdropFilter: "blur(12px) saturate(140%)",
        WebkitBackdropFilter: "blur(12px) saturate(140%)",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow:
          "0 24px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
        p: { xs: 1.5, md: 2 },
      }}
    >
      <Box
        sx={{
          borderRadius: "14px",
          overflow: "hidden",
          boxShadow:
            "0 16px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)",
        }}
      >
        <ChessgroundBoard
          fen={fen}
          orientation={boardOrientation}
          lastMove={lastMoveTuple}
          check={isInCheck}
          viewOnly={!interactive}
          shapes={shapes}
          movableColor={movableColor}
          dests={dests}
          onMove={onMove}
          syncTick={syncTick}
        />
      </Box>
    </Box>
  );
}

// Dark warm square colors — applied as a global style override below
// because chessground's brown theme is the closest base we ship with.
function ChessgroundDarkSquareOverride() {
  return (
    <style>{`
      .cg-wrap { background: ${DARK_SQUARE} !important; }
      .cg-wrap cg-board { background-color: ${DARK_SQUARE} !important; }
      .cg-wrap cg-board square.light { background-color: ${LIGHT_SQUARE} !important; }
      .cg-wrap cg-board square.dark { background-color: ${DARK_SQUARE} !important; }
      .cg-wrap cg-board square.last-move {
        background-color: rgba(249, 115, 22, 0.42) !important;
        box-shadow: inset 0 0 0 2px rgba(249, 115, 22, 0.35);
      }
      .cg-wrap cg-board square.selected {
        background-color: rgba(249, 115, 22, 0.5) !important;
      }
      .cg-wrap cg-board square.check {
        background: radial-gradient(circle, rgba(239,68,68,0.85) 10%, rgba(239,68,68,0.4) 50%, transparent 80%) !important;
      }
      .cg-wrap coords,
      .cg-wrap coords coord {
        color: #FFFFFF !important;
        font-weight: 700;
        font-size: 0.72rem;
        letter-spacing: 0.05em;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85), 0 0 2px rgba(0, 0, 0, 0.6);
      }
    `}</style>
  );
}

function EvalSparkline({
  series,
  currentPly,
  onJumpTo,
  keyMoments,
  analyzing = false,
  progress = 0,
  errored = false,
}: {
  series: number[];
  currentPly: number;
  onJumpTo: (ply: number) => void;
  keyMoments: KeyMoment[];
  /** True while Stockfish is still computing — shows progress + dotted line. */
  analyzing?: boolean;
  progress?: number;
  /** True if the engine failed to start; sparkline falls back to mock data. */
  errored?: boolean;
}) {
  const width = 800;
  const height = 76;
  const padY = 8;
  const maxVal = Math.max(5, ...series.map(Math.abs));

  const xFor = (i: number) => (i / Math.max(1, series.length - 1)) * width;
  const yFor = (v: number) => {
    const clamped = Math.max(-maxVal, Math.min(maxVal, v));
    const t = (clamped + maxVal) / (2 * maxVal);
    return height - padY - t * (height - 2 * padY);
  };

  const midY = yFor(0);

  // Build area path (above zero = white advantage)
  const points = series.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" L ");
  const areaPath = `M 0,${midY} L ${points} L ${width},${midY} Z`;
  const linePath = `M ${points.split(" L ").join(" L ")}`;

  const currentX = xFor(currentPly);

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const targetPly = Math.round(relX * (series.length - 1));
    onJumpTo(Math.max(0, Math.min(series.length, targetPly)));
  };

  return (
    <Box
      sx={{
        mt: 2,
        p: 2,
        borderRadius: "1.25rem",
        background: "rgba(20,22,28,0.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} mb={1.5}>
        <TrendingUp size={14} color="#F97316" />
        <Typography
          sx={{
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            color: "rgba(255,255,255,0.55)",
            textTransform: "uppercase",
          }}
        >
          Evaluation arc
        </Typography>
        {analyzing && (
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.75}
            sx={{
              px: 1,
              py: 0.25,
              borderRadius: "999px",
              background: "rgba(249,115,22,0.12)",
              border: "1px solid rgba(249,115,22,0.3)",
            }}
          >
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#F97316",
                animation: "pulse 1.4s ease-in-out infinite",
                "@keyframes pulse": {
                  "0%, 100%": { opacity: 0.4, transform: "scale(0.85)" },
                  "50%": { opacity: 1, transform: "scale(1)" },
                },
              }}
            />
            <Typography
              sx={{
                fontSize: "0.66rem",
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: "#FB923C",
                fontFamily: "Monaco, Menlo, monospace",
              }}
            >
              Stockfish · {Math.round(progress)}%
            </Typography>
          </Stack>
        )}
        {errored && (
          <Typography
            sx={{
              px: 1,
              py: 0.25,
              borderRadius: "999px",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.25)",
              fontSize: "0.66rem",
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "#fca5a5",
              fontFamily: "Monaco, Menlo, monospace",
            }}
          >
            Engine offline — preview curve
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Typography
          sx={{
            fontSize: "0.7rem",
            color: "rgba(255,255,255,0.4)",
            fontFamily: "Monaco, Menlo, monospace",
          }}
        >
          Click to scrub
        </Typography>
      </Stack>
      <Box
        sx={{
          position: "relative",
          width: "100%",
          height,
          cursor: "pointer",
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          style={{ width: "100%", height: "100%", display: "block" }}
          onClick={handleClick}
        >
          <defs>
            <linearGradient id="evalGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F97316" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#F97316" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          {/* Grid line at eval=0 */}
          <line
            x1={0}
            y1={midY}
            x2={width}
            y2={midY}
            stroke="rgba(255,255,255,0.1)"
            strokeDasharray="2 4"
            strokeWidth={1}
          />
          {/* Area fill */}
          <path
            d={areaPath}
            fill="url(#evalGrad)"
            opacity={analyzing ? 0.55 : 1}
          />
          {/* Line stroke — dashed while engine is still computing */}
          <path
            d={linePath}
            fill="none"
            stroke="#FB923C"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={analyzing ? "3 4" : undefined}
            opacity={analyzing ? 0.7 : 1}
          />
          {/* Key moment markers */}
          {keyMoments.map((m) => (
            <circle
              key={m.ply}
              cx={xFor(m.ply)}
              cy={yFor(series[m.ply] ?? 0)}
              r={3.5}
              fill={
                m.kind === "brilliant"
                  ? "#22c55e"
                  : m.kind === "mistake"
                  ? "#ef4444"
                  : m.kind === "winning"
                  ? "#F97316"
                  : "rgba(255,255,255,0.4)"
              }
              stroke="#08090C"
              strokeWidth={1.5}
            />
          ))}
          {/* Current ply marker */}
          <line
            x1={currentX}
            y1={0}
            x2={currentX}
            y2={height}
            stroke="#F97316"
            strokeWidth={1.5}
          />
          <circle cx={currentX} cy={yFor(series[currentPly] ?? 0)} r={5} fill="#F97316" stroke="#08090C" strokeWidth={2} />
        </svg>
      </Box>
    </Box>
  );
}

function KeyMomentsRow({
  moments,
  currentPly,
  onJumpTo,
}: {
  moments: KeyMoment[];
  currentPly: number;
  onJumpTo: (ply: number) => void;
}) {
  return (
    <Box
      sx={{
        mt: 2,
        display: "flex",
        gap: 1,
        overflowX: "auto",
        pb: 1,
        "&::-webkit-scrollbar": { height: 4 },
        "&::-webkit-scrollbar-thumb": {
          background: "rgba(249,115,22,0.2)",
          borderRadius: "2px",
        },
      }}
    >
      {moments.map((m) => {
        const active = currentPly >= m.ply - 1 && currentPly <= m.ply + 1;
        const accentColor =
          m.kind === "brilliant"
            ? "#22c55e"
            : m.kind === "mistake"
            ? "#ef4444"
            : m.kind === "winning"
            ? "#F97316"
            : "rgba(255,255,255,0.55)";
        return (
          <Box
            key={m.ply}
            onClick={() => onJumpTo(m.ply)}
            sx={{
              flexShrink: 0,
              cursor: "pointer",
              px: 1.5,
              py: 1,
              borderRadius: "10px",
              background: active
                ? "rgba(249,115,22,0.14)"
                : "rgba(255,255,255,0.03)",
              border: active
                ? "1px solid rgba(249,115,22,0.4)"
                : "1px solid rgba(255,255,255,0.06)",
              transition: "all 180ms ease",
              "&:hover": {
                background: "rgba(255,255,255,0.06)",
                borderColor: "rgba(255,255,255,0.18)",
                transform: "translateY(-1px)",
              },
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: accentColor,
                  boxShadow: `0 0 8px ${accentColor}66`,
                  flexShrink: 0,
                }}
              />
              <Typography
                sx={{
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.92)",
                  whiteSpace: "nowrap",
                }}
              >
                {m.label}
              </Typography>
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Right-column tabs — Coach / Masters / Moves
// ───────────────────────────────────────────────────────────────────────────────

type RightTab = "coach" | "masters" | "moves" | "lines";

function TabStrip({
  active,
  onChange,
  movesBadge,
  mastersBadge,
}: {
  active: RightTab;
  onChange: (t: RightTab) => void;
  movesBadge?: string;
  mastersBadge?: string;
}) {
  const tabs: {
    id: RightTab;
    label: string;
    icon: typeof MessageCircle;
    badge?: string;
  }[] = [
    { id: "coach", label: "Coach", icon: MessageCircle },
    { id: "masters", label: "Masters", icon: BookOpen, badge: mastersBadge },
    { id: "moves", label: "Moves", icon: ListIcon, badge: movesBadge },
    { id: "lines", label: "Lines", icon: GitBranch },
  ];
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        p: 0.5,
        borderRadius: "1rem",
        background: "rgba(20,22,28,0.6)",
        backdropFilter: "blur(16px) saturate(150%)",
        WebkitBackdropFilter: "blur(16px) saturate(150%)",
        border: "1px solid rgba(255,255,255,0.07)",
        mb: 1.25,
      }}
    >
      {tabs.map((t) => {
        const isActive = active === t.id;
        const Icon = t.icon;
        return (
          <Box
            key={t.id}
            onClick={() => onChange(t.id)}
            sx={{
              position: "relative",
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 0.85,
              px: 1.5,
              py: 1,
              borderRadius: "0.65rem",
              cursor: "pointer",
              color: isActive ? "#0A0A0A" : "rgba(255,255,255,0.62)",
              fontSize: "0.84rem",
              fontWeight: 700,
              letterSpacing: "0.01em",
              transition:
                "color 180ms ease, background 180ms ease",
              "&:hover": {
                color: isActive ? "#0A0A0A" : "rgba(255,255,255,0.92)",
              },
            }}
          >
            {isActive && (
              <motion.div
                layoutId="rightTabIndicator"
                transition={{
                  type: "spring",
                  stiffness: 420,
                  damping: 34,
                }}
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "0.65rem",
                  background:
                    "linear-gradient(135deg, #F97316 0%, #FB923C 100%)",
                  boxShadow: "0 4px 16px rgba(249,115,22,0.35)",
                }}
              />
            )}
            <Box
              sx={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 0.85,
                zIndex: 1,
              }}
            >
              <Icon size={14} />
              <Box component="span">{t.label}</Box>
              {t.badge && (
                <Box
                  component="span"
                  sx={{
                    px: 0.7,
                    py: 0.1,
                    borderRadius: "999px",
                    background: isActive
                      ? "rgba(10,10,10,0.18)"
                      : "rgba(255,255,255,0.08)",
                    fontSize: "0.66rem",
                    fontFamily: "Monaco, Menlo, monospace",
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                  }}
                >
                  {t.badge}
                </Box>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function MovesListPanel({
  moves,
  currentPly,
  positions,
  onJumpTo,
  onAskCoach,
}: {
  moves: Move[];
  currentPly: number;
  positions: PositionEval[] | null;
  onJumpTo: (ply: number) => void;
  onAskCoach: (ply: number, san: string) => void;
}) {
  // Group moves into pairs (white, black) for two-column layout
  type Row = {
    moveNumber: number;
    white: { san: string; ply: number; classification: MoveLabel | null } | null;
    black: { san: string; ply: number; classification: MoveLabel | null } | null;
  };
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (let i = 0; i < moves.length; i += 2) {
      const moveNumber = Math.floor(i / 2) + 1;
      const w = moves[i];
      const b = moves[i + 1];
      out.push({
        moveNumber,
        white: w
          ? {
              san: w.san,
              ply: i + 1,
              classification: classifyMove(positions, i),
            }
          : null,
        black: b
          ? {
              san: b.san,
              ply: i + 2,
              classification: classifyMove(positions, i + 1),
            }
          : null,
      });
    }
    return out;
  }, [moves, positions]);

  const Cell = ({
    move,
    isCurrent,
  }: {
    move: { san: string; ply: number; classification: MoveLabel | null } | null;
    isCurrent: boolean;
  }) => {
    if (!move)
      return (
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            color: "rgba(255,255,255,0.18)",
            px: 0.85,
            py: 0.75,
            fontSize: "0.84rem",
            fontFamily: "Monaco, Menlo, monospace",
          }}
        >
          —
        </Box>
      );
    const color = move.classification
      ? CLASSIFICATION_COLORS[move.classification]
      : "rgba(255,255,255,0.92)";
    const glyph = move.classification
      ? CLASSIFICATION_GLYPHS[move.classification]
      : "";
    return (
      <Tooltip
        title={
          move.classification
            ? `${CLASSIFICATION_LABELS[move.classification]} · ${move.san}`
            : move.san
        }
        placement="top"
      >
        <Box
          onClick={() => onJumpTo(move.ply)}
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 0.85,
            py: 0.75,
            borderRadius: "0.45rem",
            cursor: "pointer",
            background: isCurrent
              ? "linear-gradient(135deg, rgba(249,115,22,0.22), rgba(251,146,60,0.12))"
              : "transparent",
            border: isCurrent
              ? "1px solid rgba(249,115,22,0.45)"
              : "1px solid transparent",
            color,
            fontSize: "0.86rem",
            fontWeight: 600,
            fontFamily: "Monaco, Menlo, monospace",
            transition: "all 150ms ease",
            position: "relative",
            "&:hover": {
              background: isCurrent
                ? "linear-gradient(135deg, rgba(249,115,22,0.3), rgba(251,146,60,0.18))"
                : "rgba(255,255,255,0.04)",
              "& .ask-coach-btn": { opacity: 1 },
            },
          }}
        >
          <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
            {move.san}
            {glyph && (
              <Box
                component="span"
                sx={{
                  ml: 0.4,
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                }}
              >
                {glyph}
              </Box>
            )}
          </Box>
          <Tooltip title="Ask the coach about this move">
            <IconButton
              className="ask-coach-btn"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onAskCoach(move.ply, move.san);
              }}
              sx={{
                opacity: isCurrent ? 0.8 : 0,
                width: 22,
                height: 22,
                p: 0,
                color: "rgba(255,255,255,0.75)",
                background: "rgba(255,255,255,0.06)",
                transition: "opacity 160ms ease, background 160ms ease",
                "&:hover": {
                  color: "#FB923C",
                  background: "rgba(249,115,22,0.18)",
                },
              }}
            >
              <MessageSquare size={11} />
            </IconButton>
          </Tooltip>
        </Box>
      </Tooltip>
    );
  };

  // Scroll active row into view when ply changes (without jank)
  const activeRowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [currentPly]);

  const activeRowIdx = Math.max(0, Math.ceil(currentPly / 2) - 1);
  const hasClassifications = positions !== null;

  return (
    <Box
      sx={{
        height: "100%",
        width: "100%",
        borderRadius: "1.5rem",
        background: "rgba(20,22,28,0.6)",
        backdropFilter: "blur(16px) saturate(150%)",
        WebkitBackdropFilter: "blur(16px) saturate(150%)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow:
          "0 16px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{
          px: 3,
          py: 2,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: "10px",
            background:
              "linear-gradient(135deg, rgba(249,115,22,0.18), rgba(251,146,60,0.18))",
            border: "1px solid rgba(249,115,22,0.32)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ListIcon size={14} color="#FB923C" />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography
            sx={{
              fontSize: "0.95rem",
              fontWeight: 700,
              color: "rgba(255,255,255,0.94)",
              lineHeight: 1.1,
            }}
          >
            Move list
          </Typography>
          <Typography
            sx={{
              fontSize: "0.72rem",
              color: "rgba(255,255,255,0.5)",
              fontFamily: "Monaco, Menlo, monospace",
              mt: 0.4,
            }}
          >
            {moves.length} plies ·{" "}
            {hasClassifications ? "engine-classified" : "awaiting Stockfish…"}
          </Typography>
        </Box>
      </Stack>

      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          px: 1.25,
          py: 1.25,
          "&::-webkit-scrollbar": { width: 6 },
          "&::-webkit-scrollbar-thumb": {
            background: "rgba(249,115,22,0.2)",
            borderRadius: "3px",
          },
        }}
      >
        <Stack spacing={0.25}>
          {rows.map((row, idx) => {
            const isActiveRow = idx === activeRowIdx;
            return (
              <Box
                key={row.moveNumber}
                ref={isActiveRow ? activeRowRef : undefined}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  px: 0.5,
                  py: 0.15,
                  borderRadius: "0.5rem",
                  background: isActiveRow
                    ? "rgba(255,255,255,0.02)"
                    : "transparent",
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    flexShrink: 0,
                    textAlign: "right",
                    pr: 0.75,
                    color: "rgba(255,255,255,0.4)",
                    fontSize: "0.78rem",
                    fontFamily: "Monaco, Menlo, monospace",
                  }}
                >
                  {row.moveNumber}.
                </Box>
                <Cell
                  move={row.white}
                  isCurrent={row.white?.ply === currentPly}
                />
                <Cell
                  move={row.black}
                  isCurrent={row.black?.ply === currentPly}
                />
              </Box>
            );
          })}
          {rows.length === 0 && (
            <Box
              sx={{
                px: 2,
                py: 4,
                textAlign: "center",
                color: "rgba(255,255,255,0.4)",
                fontSize: "0.85rem",
              }}
            >
              No moves loaded yet.
            </Box>
          )}
        </Stack>
      </Box>

      <Box
        sx={{
          px: 3,
          py: 1.5,
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{
            fontSize: "0.7rem",
            color: "rgba(255,255,255,0.5)",
            fontFamily: "Monaco, Menlo, monospace",
            flexWrap: "wrap",
          }}
        >
          {([
            MoveClassification.Brilliant,
            MoveClassification.Great,
            MoveClassification.Best,
            MoveClassification.Inaccuracy,
            MoveClassification.Mistake,
            MoveClassification.Blunder,
          ] as MoveLabel[]).map(
            (k) => (
              <Stack
                key={k}
                direction="row"
                alignItems="center"
                spacing={0.5}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: CLASSIFICATION_COLORS[k],
                  }}
                />
                <Box component="span">{CLASSIFICATION_LABELS[k]}</Box>
              </Stack>
            )
          )}
        </Stack>
      </Box>
    </Box>
  );
}

// G16: Engine Lines panel — shows the top PV lines for the current
// position. Each line is the engine's best continuation from this point;
// rendered as evaluation + the first few SAN moves of the principal
// variation. Empty state when analysis hasn't reached this ply yet.
function EngineLinesPanel({
  position,
  fen,
  engineName,
}: {
  position: PositionEval | null;
  fen: string;
  engineName: EngineName;
}) {
  const lines = position?.lines ?? [];
  const sanLines = useMemo(() => {
    return lines.slice(0, 3).map((line) => {
      try {
        const g = new Chess(fen);
        const sans: string[] = [];
        for (const uci of line.pv.slice(0, 8)) {
          const mv = g.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci.length >= 5 ? uci[4] : "q",
          });
          if (!mv) break;
          sans.push(mv.san);
        }
        return { line, sans };
      } catch {
        return { line, sans: line.pv.slice(0, 8) };
      }
    });
  }, [lines, fen]);

  const formatEval = (line: LineEval): string => {
    if (typeof line.mate === "number") {
      return `#${Math.abs(line.mate)}${line.mate > 0 ? "" : "−"}`;
    }
    if (typeof line.cp === "number") {
      const cp = line.cp / 100;
      return `${cp > 0 ? "+" : ""}${cp.toFixed(2)}`;
    }
    return "—";
  };

  return (
    <Box
      sx={{
        height: "100%",
        overflowY: "auto",
        background: "rgba(20,22,28,0.55)",
        backdropFilter: "blur(16px) saturate(150%)",
        WebkitBackdropFilter: "blur(16px) saturate(150%)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "1rem",
        p: 2,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1.5,
        }}
      >
        <Box
          sx={{
            color: "rgba(255,255,255,0.9)",
            fontSize: "0.92rem",
            fontWeight: 700,
            letterSpacing: "0.01em",
          }}
        >
          Engine lines
        </Box>
        <Box
          sx={{
            color: "rgba(255,255,255,0.42)",
            fontSize: "0.72rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {engineName}
        </Box>
      </Box>
      {sanLines.length === 0 ? (
        <Box
          sx={{
            color: "rgba(255,255,255,0.42)",
            fontSize: "0.84rem",
            py: 3,
            textAlign: "center",
          }}
        >
          Stockfish hasn't reached this position yet.
        </Box>
      ) : (
        <Stack spacing={1.25}>
          {sanLines.map(({ line, sans }, i) => (
            <Box
              key={i}
              sx={{
                p: 1.25,
                borderRadius: "0.6rem",
                background: "rgba(0,0,0,0.25)",
                border: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                gap: 1.25,
                alignItems: "baseline",
              }}
            >
              <Box
                sx={{
                  flexShrink: 0,
                  width: 56,
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  fontWeight: 700,
                  color:
                    typeof line.mate === "number"
                      ? "#FB923C"
                      : (line.cp ?? 0) >= 0
                      ? "#E2E8F0"
                      : "rgba(255,255,255,0.62)",
                  fontSize: "0.92rem",
                }}
              >
                {formatEval(line)}
              </Box>
              <Box
                sx={{
                  flex: 1,
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  color: "rgba(255,255,255,0.78)",
                  fontSize: "0.86rem",
                  lineHeight: 1.5,
                }}
              >
                {sans.join(" ")}
              </Box>
              <Box
                sx={{
                  flexShrink: 0,
                  color: "rgba(255,255,255,0.36)",
                  fontSize: "0.7rem",
                }}
              >
                d{line.depth}
              </Box>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}

function CoachPanel({
  messages,
  input,
  onChangeInput,
  onSend,
  onSuggestion,
  isThinking,
  onPromoteToBoard,
  allMoves,
  onMoveRefClick,
  onShareMessage,
  mistakeContext,
  userRating,
  coachContextIdProp,
  onPuzzleSolved,
  onPracticeConcept,
  analysisActive,
  enginePositions,
  loadedGame,
  personalityId,
  onChangePersonality,
}: {
  messages: CoachMessage[];
  input: string;
  onChangeInput: (v: string) => void;
  onSend: () => void;
  onSuggestion: (s: string) => void;
  isThinking: boolean;
  onPromoteToBoard?: (puzzles: DrillPuzzle[], startIndex: number) => void;
  allMoves?: Move[];
  onMoveRefClick?: (ply: number) => void;
  onShareMessage?: (msg: CoachMessage) => void;
  onPuzzleSolved?: (puzzle: DrillPuzzle, timeSpentSeconds: number) => void;
  onPracticeConcept?: (
    theme: string,
    displayName: string,
    messageIndex: number
  ) => void;
  /** Engine data for inline continuation widgets inside insight cards. */
  enginePositions?: PositionEval[] | null;
  loadedGame?: Chess;
  /** Current coach persona id + setter — drives the picker chip in the
   *  CoachPanel header and is threaded into the enhanced-analysis
   *  request body via the parent's coachExtras memo. */
  personalityId?: string;
  onChangePersonality?: (id: string) => void;
  /** True while Stockfish is still computing positions. Mirrors production's
   * `isAnalyzingGame` gate (AICoachChat:1705) — when set, the input is
   * disabled so the user can't fire deep-coach requests with no gameEval. */
  analysisActive?: boolean;
  /**
   * Production-parity mistake context — when set, mounts inline
   * ContextualPuzzleRecommendations above the message stream. Recomputed
   * by the parent on ply change. Null when the current ply isn't a
   * Mistake/Blunder/Miss.
   */
  mistakeContext?: {
    fen: string;
    movePlayed: string;
    correctMove: string;
    evalBefore: number;
    evalAfter: number;
    tacticalMotifs: string[];
  } | null;
  userRating?: number;
  /** G12: current analysis contextId so FlagButton can attach it to the
   *  flagged-message POST. Null when no deep analysis has run yet. */
  coachContextIdProp?: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Personality picker UI state — kept local to the panel; the actual
  // selection bubbles up via onChangePersonality.
  const personality = useMemo(
    () => getPersonalityById(personalityId ?? defaultPersonalityId),
    [personalityId]
  );
  const [personalityMenuOpen, setPersonalityMenuOpen] = useState(false);
  const personalityChipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, isThinking]);

  return (
    <Box
      sx={{
        position: "relative",
        // Height now controlled by the parent wrapper so swaps inherit it.
        height: "100%",
        width: "100%",
        borderRadius: "1.5rem",
        background: "rgba(20,22,28,0.6)",
        backdropFilter: "blur(16px) saturate(150%)",
        WebkitBackdropFilter: "blur(16px) saturate(150%)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow:
          "0 16px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <BorderBeam duration={20} colorFrom="#F97316" colorTo="#FB923C" />

      {/* Header */}
      <Box
        sx={{
          px: 3,
          py: 2,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          position: "relative",
          zIndex: 1,
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background:
              "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 20px rgba(249,115,22,0.45)",
          }}
        >
          <Sparkles size={16} color="#0A0A0A" />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography
            sx={{
              fontSize: "0.95rem",
              fontWeight: 700,
              color: "rgba(255,255,255,0.94)",
              lineHeight: 1.1,
            }}
          >
            AI Coach
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#22c55e",
                boxShadow: "0 0 8px rgba(34,197,94,0.6)",
              }}
            />
            <Typography
              sx={{
                fontSize: "0.72rem",
                color: "rgba(255,255,255,0.5)",
                fontFamily: "Monaco, Menlo, monospace",
              }}
            >
              Stockfish-grounded · Engine-validated
            </Typography>
          </Stack>
        </Box>
        {/* Personality picker chip — clicking opens a glass popover with
            the 6 coach voices. Closes the `personalityId` parity gap
            with /api/enhanced-analysis (final field). */}
        {onChangePersonality && (
          <Tooltip title={`Coach voice: ${personality.title}`}>
            <Box
              ref={personalityChipRef}
              onClick={() => setPersonalityMenuOpen((v) => !v)}
              sx={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 1,
                py: 0.4,
                borderRadius: "999px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                transition: "all 180ms ease",
                "&:hover": {
                  background: "rgba(249,115,22,0.08)",
                  borderColor: "rgba(249,115,22,0.32)",
                },
              }}
            >
              <Box
                sx={{
                  fontSize: "0.92rem",
                  lineHeight: 1,
                  filter:
                    "drop-shadow(0 0 4px rgba(249,115,22,0.32))",
                }}
              >
                {personality.avatar}
              </Box>
              <Typography
                sx={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.78)",
                  maxWidth: 90,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {personality.name}
              </Typography>
              <ChevronDown
                size={11}
                color="rgba(255,255,255,0.55)"
              />
            </Box>
          </Tooltip>
        )}
        <Menu
          anchorEl={personalityChipRef.current}
          open={personalityMenuOpen}
          onClose={() => setPersonalityMenuOpen(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{
            paper: {
              sx: {
                mt: 1,
                background: "rgba(20,22,28,0.92)",
                backdropFilter: "blur(16px) saturate(150%)",
                WebkitBackdropFilter: "blur(16px) saturate(150%)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "12px",
                minWidth: 280,
                maxWidth: 320,
                boxShadow:
                  "0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
              },
            },
          }}
          MenuListProps={{ sx: { py: 0.5 } }}
        >
          <Box
            sx={{
              px: 1.75,
              pt: 1,
              pb: 0.5,
              fontSize: "0.62rem",
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.42)",
            }}
          >
            Coach voice
          </Box>
          {coachPersonalities.map((p) => {
            const isActive = p.id === personality.id;
            return (
              <Box
                key={p.id}
                onClick={() => {
                  onChangePersonality?.(p.id);
                  setPersonalityMenuOpen(false);
                }}
                sx={{
                  cursor: "pointer",
                  px: 1.75,
                  py: 1,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 1.25,
                  transition: "background 160ms ease",
                  background: isActive
                    ? "rgba(249,115,22,0.08)"
                    : "transparent",
                  borderLeft: isActive
                    ? "2px solid #FB923C"
                    : "2px solid transparent",
                  "&:hover": {
                    background: "rgba(249,115,22,0.12)",
                  },
                }}
              >
                <Box
                  sx={{
                    fontSize: "1.4rem",
                    lineHeight: 1,
                    pt: 0.15,
                    filter: isActive
                      ? "drop-shadow(0 0 6px rgba(249,115,22,0.45))"
                      : "none",
                  }}
                >
                  {p.avatar}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    sx={{
                      fontSize: "0.84rem",
                      fontWeight: 700,
                      color: isActive ? "#FB923C" : "rgba(255,255,255,0.92)",
                      lineHeight: 1.2,
                    }}
                  >
                    {p.name}
                    <Box
                      component="span"
                      sx={{
                        ml: 0.6,
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.42)",
                      }}
                    >
                      {p.title}
                    </Box>
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "0.74rem",
                      color: "rgba(255,255,255,0.58)",
                      lineHeight: 1.4,
                      mt: 0.25,
                    }}
                  >
                    {p.description}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Menu>
        <Tooltip title="Every claim validated against the engine">
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 1.25,
              py: 0.5,
              borderRadius: "999px",
              background: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.25)",
            }}
          >
            <ShieldCheck size={12} color="#22c55e" />
            <Typography sx={{ fontSize: "0.68rem", color: "#86efac", fontWeight: 600 }}>
              Validated
            </Typography>
          </Box>
        </Tooltip>
      </Box>

      {/* Messages */}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          overflowY: "auto",
          px: 3,
          py: 2.5,
          position: "relative",
          zIndex: 1,
          "&::-webkit-scrollbar": { width: 6 },
          "&::-webkit-scrollbar-thumb": {
            background: "rgba(249,115,22,0.2)",
            borderRadius: "3px",
          },
        }}
      >
        <Stack spacing={2}>
          {mistakeContext && (
            <Box sx={{ alignSelf: "stretch" }}>
              <ContextualPuzzleRecommendations
                key={`${mistakeContext.fen}|${mistakeContext.movePlayed}`}
                fen={mistakeContext.fen}
                movePlayed={mistakeContext.movePlayed}
                correctMove={mistakeContext.correctMove}
                evalBefore={mistakeContext.evalBefore}
                evalAfter={mistakeContext.evalAfter}
                tacticalMotifs={mistakeContext.tacticalMotifs}
                userRating={userRating}
              />
            </Box>
          )}
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
                style={{
                  alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "90%",
                  marginLeft: msg.role === "user" ? "auto" : 0,
                }}
              >
                <CoachBubble
                  msg={msg}
                  onPromoteToBoard={onPromoteToBoard}
                  allMoves={allMoves}
                  onMoveRefClick={onMoveRefClick}
                  onShare={onShareMessage}
                  allMessages={messages}
                  messageIndex={i}
                  contextId={coachContextIdProp}
                  onPuzzleSolved={onPuzzleSolved}
                  onPracticeConcept={onPracticeConcept}
                  enginePositions={enginePositions}
                  loadedGame={loadedGame}
                />
              </motion.div>
            ))}
          </AnimatePresence>
          {isThinking && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ alignSelf: "flex-start", maxWidth: "60%" }}
            >
              <ThinkingBubble />
            </motion.div>
          )}
        </Stack>
      </Box>

      {/* Suggestion pills */}
      <Box
        sx={{
          px: 3,
          pt: 1.5,
          pb: 1,
          borderTop: "1px solid rgba(255,255,255,0.05)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
          {SUGGESTION_PILLS.map((s) => (
            <Box
              key={s}
              onClick={() => onSuggestion(s)}
              sx={{
                cursor: "pointer",
                px: 1.5,
                py: 0.6,
                borderRadius: "999px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontSize: "0.78rem",
                color: "rgba(255,255,255,0.78)",
                transition: "all 180ms ease",
                "&:hover": {
                  background: "rgba(249,115,22,0.12)",
                  borderColor: "rgba(249,115,22,0.3)",
                  color: "#FB923C",
                  transform: "translateY(-1px)",
                },
              }}
            >
              {s}
            </Box>
          ))}
        </Stack>
      </Box>

      {/* Input */}
      <Box
        sx={{
          px: 3,
          py: 2,
          borderTop: "1px solid rgba(255,255,255,0.06)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <TextField
            value={input}
            onChange={(e) => onChangeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (analysisActive || isThinking) return;
                onSend();
              }
            }}
            placeholder={
              analysisActive
                ? "Analyzing your game… coach unlocks when Stockfish finishes."
                : "Ask anything about this position..."
            }
            disabled={analysisActive}
            fullWidth
            multiline
            maxRows={3}
            sx={{
              "& .MuiOutlinedInput-root": {
                backgroundColor: "rgba(255,255,255,0.04)",
                borderRadius: "14px",
                fontSize: "0.92rem",
                "& fieldset": { borderColor: "rgba(255,255,255,0.1)" },
                "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2)" },
                "&.Mui-focused fieldset": {
                  borderColor: "rgba(249,115,22,0.5)",
                  borderWidth: "1px",
                },
              },
              "& .MuiOutlinedInput-input": {
                color: "rgba(255,255,255,0.95)",
                "&::placeholder": {
                  color: "rgba(255,255,255,0.4)",
                  opacity: 1,
                },
              },
            }}
          />
          <IconButton
            onClick={onSend}
            disabled={!input.trim() || isThinking || analysisActive}
            sx={{
              width: 44,
              height: 44,
              borderRadius: "12px",
              background:
                "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
              color: "#0A0A0A",
              boxShadow: "0 6px 18px rgba(249,115,22,0.4)",
              transition: "all 200ms ease",
              "&:hover": {
                background:
                  "linear-gradient(135deg, #FB923C 0%, #F97316 100%)",
                transform: "translateY(-1px)",
                boxShadow: "0 8px 24px rgba(249,115,22,0.55)",
              },
              "&.Mui-disabled": {
                background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.2)",
                boxShadow: "none",
              },
            }}
          >
            <Send size={18} />
          </IconButton>
        </Stack>
      </Box>
    </Box>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// InlinePuzzleSolver — mini ChessgroundBoard that solves a single DrillPuzzle
// inline (inside a coach bubble). Mirrors src/components/InlinePuzzleSet.tsx
// patterns (opponent setup auto-play, wrong/right flashes, skip-after-2) but
// uses chessground via our ChessgroundBoard wrapper, with `syncTick` to
// revert rejected moves the way react-chessboard's onPieceDrop=false would.
// ───────────────────────────────────────────────────────────────────────────────

type InlineStatus = "solving" | "wrong" | "solved";

function InlinePuzzleSolver({
  puzzle,
  onSolved,
  onPromote,
}: {
  puzzle: DrillPuzzle;
  onSolved: () => void;
  onPromote: () => void;
}) {
  const [game, setGame] = useState<Chess>(() => new Chess(puzzle.fen));
  const [moveIdx, setMoveIdx] = useState(0);
  const [status, setStatus] = useState<InlineStatus>("solving");
  const [wrongCount, setWrongCount] = useState(0);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [syncTick, setSyncTick] = useState(0);
  const [flash, setFlash] = useState<"idle" | "green" | "red">("idle");
  const puzzleIdRef = useRef(puzzle.id);

  // Reset when puzzle prop changes (defensive; usually we mount fresh)
  useEffect(() => {
    puzzleIdRef.current = puzzle.id;
    setGame(new Chess(puzzle.fen));
    setMoveIdx(0);
    setStatus("solving");
    setWrongCount(0);
    setLastMove(null);
    setFlash("idle");
    setSyncTick((t) => t + 1);
  }, [puzzle.id, puzzle.fen]);

  const fen = useMemo(() => game.fen(), [game]);
  const turn = useMemo<"white" | "black">(
    () => (new Chess(fen).turn() === "w" ? "white" : "black"),
    [fen]
  );
  const orientation = useMemo<"white" | "black">(() => {
    // Side-to-move at puzzle start sits at the bottom
    return new Chess(puzzle.fen).turn() === "w" ? "white" : "black";
  }, [puzzle.fen]);

  const dests = useMemo<Map<string, string[]>>(() => {
    const c = new Chess(fen);
    const m = new Map<string, string[]>();
    c.moves({ verbose: true }).forEach((mv) => {
      const arr = m.get(mv.from) ?? [];
      arr.push(mv.to);
      m.set(mv.from, arr);
    });
    return m;
  }, [fen]);

  const handleMove = useCallback(
    (orig: string, dest: string) => {
      if (status !== "solving") return;
      const expected = puzzle.solution[moveIdx];
      if (!expected) return;
      const expFrom = expected.slice(0, 2);
      const expTo = expected.slice(2, 4);
      const expPromo = expected.length >= 5 ? expected[4] : undefined;

      if (orig !== expFrom || dest !== expTo) {
        setSyncTick((t) => t + 1); // revert the chessground drag
        setStatus("wrong");
        setWrongCount((n) => n + 1);
        setFlash("red");
        setTimeout(() => {
          if (puzzleIdRef.current !== puzzle.id) return;
          setStatus("solving");
          setFlash("idle");
        }, 900);
        return;
      }

      const g = new Chess(fen);
      const userMove = g.move({
        from: orig,
        to: dest,
        promotion: expPromo ?? "q",
      });
      if (!userMove) {
        setSyncTick((t) => t + 1);
        return;
      }
      setGame(g);
      setLastMove(userMove);
      const next = moveIdx + 1;
      setMoveIdx(next);

      if (next >= puzzle.solution.length) {
        setStatus("solved");
        setFlash("green");
        setTimeout(() => {
          if (puzzleIdRef.current === puzzle.id) onSolved();
        }, 700);
        return;
      }

      // Schedule opponent reply
      setTimeout(() => {
        if (puzzleIdRef.current !== puzzle.id) return;
        const oppUci = puzzle.solution[next];
        if (!oppUci) return;
        const g2 = new Chess(g.fen());
        const oppMove = g2.move({
          from: oppUci.slice(0, 2),
          to: oppUci.slice(2, 4),
          promotion: oppUci.length >= 5 ? oppUci[4] : "q",
        });
        if (!oppMove) return;
        setGame(g2);
        setLastMove(oppMove);
        const nextAfter = next + 1;
        setMoveIdx(nextAfter);
        if (nextAfter >= puzzle.solution.length) {
          setStatus("solved");
          setFlash("green");
          setTimeout(() => {
            if (puzzleIdRef.current === puzzle.id) onSolved();
          }, 700);
        }
      }, 400);
    },
    [status, moveIdx, puzzle, fen, onSolved]
  );

  const statusLabel =
    status === "wrong"
      ? "Not the move — try again."
      : status === "solved"
      ? "Solved!"
      : turn === "white"
      ? "White to move"
      : "Black to move";
  const statusColor =
    status === "wrong"
      ? "#fca5a5"
      : status === "solved"
      ? "#86efac"
      : "rgba(255,255,255,0.7)";

  const flashShadow =
    flash === "green"
      ? "0 0 0 4px rgba(34,197,94,0.55)"
      : flash === "red"
      ? "0 0 0 4px rgba(239,68,68,0.55)"
      : "0 0 0 0 rgba(0,0,0,0)";

  return (
    <Box
      sx={{
        mt: 1,
        px: 1.25,
        py: 1.25,
        borderRadius: "0.6rem",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(168,85,247,0.18)",
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 280,
          mx: "auto",
          borderRadius: "10px",
          boxShadow: flashShadow,
          transition: "box-shadow 400ms ease",
          overflow: "hidden",
        }}
      >
        <ChessgroundBoard
          fen={fen}
          orientation={orientation}
          lastMove={lastMove ? [lastMove.from, lastMove.to] : undefined}
          movableColor={status === "solving" ? turn : undefined}
          dests={status === "solving" ? dests : undefined}
          onMove={status === "solving" ? handleMove : undefined}
          syncTick={syncTick}
          viewOnly={false}
        />
      </Box>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ mt: 1.25 }}
      >
        <Typography
          sx={{
            fontSize: "0.78rem",
            fontWeight: 600,
            color: statusColor,
            flex: 1,
          }}
        >
          {statusLabel}
        </Typography>
        {status === "solving" && wrongCount >= 2 && (
          <Button
            size="small"
            onClick={onSolved}
            sx={{
              px: 1,
              py: 0.4,
              fontSize: "0.72rem",
              fontWeight: 600,
              color: "rgba(255,255,255,0.6)",
              textTransform: "none",
              "&:hover": { color: "rgba(255,255,255,0.9)" },
            }}
          >
            Skip
          </Button>
        )}
        <Tooltip title="Load this position onto the main board">
          <Button
            size="small"
            onClick={onPromote}
            sx={{
              px: 1.25,
              py: 0.45,
              borderRadius: "0.5rem",
              fontSize: "0.72rem",
              fontWeight: 700,
              background: "rgba(168,85,247,0.15)",
              border: "1px solid rgba(168,85,247,0.32)",
              color: "#E9D5FF",
              "&:hover": {
                background: "rgba(168,85,247,0.28)",
                borderColor: "rgba(168,85,247,0.55)",
              },
            }}
          >
            Big board
          </Button>
        </Tooltip>
      </Stack>
    </Box>
  );
}

function CoachPuzzleCard({
  pack,
  onPromote,
  onSolved,
}: {
  pack: PuzzlePack;
  onPromote: (puzzles: DrillPuzzle[], startIndex: number) => void;
  onSolved?: (puzzle: DrillPuzzle, timeSpentSeconds: number) => void;
}) {
  // Which puzzle is currently expanded inline. Default to the first ready
  // puzzle so the user lands on a solvable board the moment the pack loads.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [solvedIds, setSolvedIds] = useState<Set<string>>(new Set());
  const startTimesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (expandedId !== null) return;
    if (pack.status === "ready" || pack.status === undefined) {
      const first = pack.puzzles[0];
      if (first) setExpandedId(first.id);
    }
  }, [pack.status, pack.puzzles, expandedId]);

  // Stamp a start time when a puzzle becomes the expanded one so we can
  // pass realistic timeSpentSeconds up to recordPuzzleAttempt.
  useEffect(() => {
    if (!expandedId) return;
    if (!startTimesRef.current[expandedId]) {
      startTimesRef.current[expandedId] = Date.now();
    }
  }, [expandedId]);

  const markSolved = useCallback(
    (id: string) => {
      setSolvedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      const puzzle = pack.puzzles.find((p) => p.id === id);
      if (puzzle && onSolved) {
        const startedAt = startTimesRef.current[id] ?? Date.now();
        onSolved(puzzle, (Date.now() - startedAt) / 1000);
      }
      // Auto-advance to next unsolved puzzle
      const idx = pack.puzzles.findIndex((p) => p.id === id);
      const nextUnsolved = pack.puzzles.find(
        (p, i) => i > idx && !solvedIds.has(p.id)
      );
      if (nextUnsolved) setExpandedId(nextUnsolved.id);
      else setExpandedId(null); // pack complete
    },
    [pack.puzzles, solvedIds, onSolved]
  );

  return (
    <Box
      sx={{
        mt: 1,
        p: 1.5,
        borderRadius: "0.85rem",
        background:
          "linear-gradient(135deg, rgba(168,85,247,0.08), rgba(168,85,247,0.02))",
        border: "1px solid rgba(168,85,247,0.25)",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ mb: 1.25 }}
      >
        <Lightbulb size={14} color="#C084FC" />
        <Typography
          sx={{
            fontSize: "0.76rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "#E9D5FF",
            textTransform: "uppercase",
          }}
        >
          {pack.displayTheme}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography
          sx={{
            fontSize: "0.7rem",
            color: "rgba(255,255,255,0.45)",
            fontFamily: "Monaco, Menlo, monospace",
          }}
        >
          {pack.status === "loading"
            ? "loading…"
            : pack.status === "error"
            ? "unavailable"
            : `${pack.puzzles.length} puzzle${pack.puzzles.length === 1 ? "" : "s"}`}
        </Typography>
      </Stack>
      {pack.status === "loading" && pack.puzzles.length === 0 && (
        <Stack spacing={0.85}>
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              sx={{
                height: 48,
                borderRadius: "0.6rem",
                background:
                  "linear-gradient(90deg, rgba(168,85,247,0.05) 0%, rgba(168,85,247,0.12) 50%, rgba(168,85,247,0.05) 100%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.6s ease-in-out infinite",
                "@keyframes shimmer": {
                  "0%": { backgroundPosition: "200% 0" },
                  "100%": { backgroundPosition: "-200% 0" },
                },
              }}
            />
          ))}
        </Stack>
      )}
      {pack.status === "error" && (
        <Box
          sx={{
            px: 1.5,
            py: 1.5,
            borderRadius: "0.6rem",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
          }}
        >
          <Typography
            sx={{
              fontSize: "0.8rem",
              color: "#fca5a5",
              lineHeight: 1.4,
            }}
          >
            Couldn't reach the puzzle store{pack.error ? ` — ${pack.error}` : ""}.
          </Typography>
        </Box>
      )}
      <Stack spacing={0.85}>
        {pack.puzzles.map((p, i) => {
          const isExpanded = expandedId === p.id;
          const isSolved = solvedIds.has(p.id);
          return (
            <Box key={p.id}>
              <Box
                onClick={() =>
                  setExpandedId((cur) => (cur === p.id ? null : p.id))
                }
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  px: 1.25,
                  py: 1,
                  borderRadius: isExpanded
                    ? "0.6rem 0.6rem 0 0"
                    : "0.6rem",
                  background: isExpanded
                    ? "rgba(168,85,247,0.08)"
                    : "rgba(255,255,255,0.03)",
                  border: isExpanded
                    ? "1px solid rgba(168,85,247,0.32)"
                    : "1px solid rgba(255,255,255,0.05)",
                  borderBottom: isExpanded
                    ? "none"
                    : "1px solid rgba(255,255,255,0.05)",
                  cursor: "pointer",
                  transition: "all 160ms ease",
                  "&:hover": {
                    background: isExpanded
                      ? "rgba(168,85,247,0.1)"
                      : "rgba(168,85,247,0.06)",
                    borderColor: "rgba(168,85,247,0.25)",
                  },
                }}
              >
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    flexShrink: 0,
                    borderRadius: "50%",
                    background: isSolved
                      ? "rgba(34,197,94,0.18)"
                      : "rgba(168,85,247,0.15)",
                    border: isSolved
                      ? "1px solid rgba(34,197,94,0.4)"
                      : "1px solid rgba(168,85,247,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    color: isSolved ? "#86efac" : "#C084FC",
                    fontFamily: "Monaco, Menlo, monospace",
                  }}
                >
                  {isSolved ? <Check size={12} /> : i + 1}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: "0.84rem",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.92)",
                      lineHeight: 1.2,
                    }}
                  >
                    {p.title}
                  </Typography>
                  <Typography
                    sx={{
                      mt: 0.25,
                      fontSize: "0.72rem",
                      color: "rgba(255,255,255,0.5)",
                      lineHeight: 1.35,
                    }}
                  >
                    {p.hint}
                  </Typography>
                </Box>
                <Tooltip title="Load this position onto the main board">
                  <Button
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPromote(pack.puzzles, i);
                    }}
                    sx={{
                      flexShrink: 0,
                      minWidth: 0,
                      px: 1.25,
                      py: 0.5,
                      borderRadius: "0.55rem",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                      background: "rgba(168,85,247,0.15)",
                      border: "1px solid rgba(168,85,247,0.35)",
                      color: "#E9D5FF",
                      "&:hover": {
                        background: "rgba(168,85,247,0.28)",
                        borderColor: "rgba(168,85,247,0.6)",
                      },
                    }}
                  >
                    Big board
                  </Button>
                </Tooltip>
                <Box
                  sx={{
                    flexShrink: 0,
                    color: "rgba(255,255,255,0.5)",
                    transition: "transform 200ms ease",
                    transform: isExpanded ? "rotate(180deg)" : "none",
                  }}
                >
                  <ChevronDown size={16} />
                </Box>
              </Box>
              {isExpanded && (
                <Box
                  sx={{
                    border: "1px solid rgba(168,85,247,0.32)",
                    borderTop: "none",
                    borderRadius: "0 0 0.6rem 0.6rem",
                    background: "rgba(168,85,247,0.04)",
                    p: 0.5,
                  }}
                >
                  <InlinePuzzleSolver
                    key={p.id}
                    puzzle={p}
                    onSolved={() => markSolved(p.id)}
                    onPromote={() => onPromote(pack.puzzles, i)}
                  />
                </Box>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

// G7: production-parity 4-tier move-reference parser. Mirrors
// AICoachChat.tsx:1323-1353. Patterns ordered by specificity (longer +
// more anchored first) so overlapping matches are resolved in favor of
// the more specific one.
const MOVE_REF_PATTERNS: Array<{
  re: RegExp;
  // Slot in match[] that holds (moveNumber, color?, san)
  numIdx: number;
  colorIdx?: number;
  sanIdx: number;
}> = [
  // Priority 1: AI parenthesized — "Move 3 (Nxd4)"
  {
    re: /Move\s+(\d+)\s*\([^)]*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)\)/gi,
    numIdx: 1,
    sanIdx: 2,
  },
  // Priority 2: "Move 3: Nxd4"
  {
    re: /Move\s+(\d+):\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/gi,
    numIdx: 1,
    sanIdx: 2,
  },
  // Priority 3: Standard "24.Rxd4" / "23...Nf6"
  {
    re: /(?<![A-Za-z0-9])(\d+)(\.{1,3})\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/g,
    numIdx: 1,
    colorIdx: 2, // 1-dot = white, 3-dot = black
    sanIdx: 3,
  },
  // Priority 4: "move 3 (w|b): Nxd4"
  {
    re: /move\s+(\d+)([wb])?:\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/gi,
    numIdx: 1,
    colorIdx: 2,
    sanIdx: 3,
  },
];

// Recommended-move detector. Case-insensitive so "BEST MOVE:" uppercase
// headings (which the coach emits inside structured cards) match too.
// Expanded beyond production's set to cover the phrasings Aayan's smoke
// tests surfaced on 2026-05-29: "only winning move", "winning continuation",
// "best move:" with colon-anchored headings, etc.
const RECOMMENDED_CONTEXT_RE =
  /best\s*(was|move|is|continuation|move\s*:)|should\s*have\s*(played|been)|instead\s*(of|,|:)|better\s*(was|move|is|alternative)|recommended|correct\s*move|improvement|only\s+(winning|good|playable|sensible)\s+move|winning\s+(move|continuation|line)|key\s+move/i;

interface MoveRefMatch {
  start: number;
  end: number;
  full: string;
  moveNumber: number;
  isBlack: boolean;
  san: string;
  recommended: boolean;
}

function findAllMoveRefs(
  text: string,
  forceRecommended = false
): MoveRefMatch[] {
  const matches: MoveRefMatch[] = [];
  for (const pat of MOVE_REF_PATTERNS) {
    const re = new RegExp(pat.re.source, pat.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const moveNumber = parseInt(m[pat.numIdx], 10);
      let isBlack = false;
      if (pat.colorIdx !== undefined) {
        const c = m[pat.colorIdx];
        // For priority 3 the slot holds dots ("." | ".." | "..."), so
        // length >= 3 means black. For priority 4 it's an explicit w|b.
        isBlack = c?.length === 3 || c === "b";
      }
      const san = m[pat.sanIdx];
      // Skip if a higher-priority match already covered this range.
      const overlaps = matches.some(
        (existing) => m!.index < existing.end && m!.index + m![0].length > existing.start
      );
      if (overlaps) continue;
      const contextBefore = text
        .slice(Math.max(0, m.index - 60), m.index)
        .toLowerCase();
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        full: m[0],
        moveNumber,
        isBlack,
        san,
        recommended:
          forceRecommended || RECOMMENDED_CONTEXT_RE.test(contextBefore),
      });
    }
  }
  matches.sort((a, b) => a.start - b.start);
  return matches;
}

const stripSanDecorators = (s: string) => s.replace(/[+#!?]/g, "").toLowerCase();

// Resolve a "moveNumber.san" reference (e.g., 24.Rxd4) to the half-move ply
// it points at. Returns null if the game doesn't have that move at that
// position (within ±1 tolerance for off-by-one moveNumber typos in coach
// output).
function findPlyForMoveRef(
  allMoves: Move[],
  moveNumber: number,
  isBlack: boolean,
  san: string
): number | null {
  const target = stripSanDecorators(san);
  const expectedPly = (moveNumber - 1) * 2 + (isBlack ? 2 : 1);
  const sanAt = (p: number) =>
    p >= 1 && p <= allMoves.length
      ? stripSanDecorators(allMoves[p - 1].san)
      : null;
  if (sanAt(expectedPly) === target) return expectedPly;
  for (const adj of [-1, 1, 2, -2]) {
    const p = expectedPly + adj;
    if (sanAt(p) === target) return p;
  }
  return null;
}

// ─── InsightBodyText ─────────────────────────────────────────────────────
// Beautifies the prose inside Why/Threats/Roles/Concept panels.
//   1. Drops `[CONTINUATION:X:c]` and `[MAIA_CONTINUATION:X:c]` markers —
//      production renders these as live engine + Maia line pulls, but
//      mounting EngineContinuation/MaiaContinuation requires the engine
//      atom which AnalysisImpl uses a local hook for. Surface them as
//      compact pills instead of raw tag soup; the user can hit the
//      Lines tab (G16) for the actual PV.
//   2. Recognises "Label: rest" lines (Idea / Problem / Solution /
//      Outcome are the canonical four the coach emits inside WHY) and
//      renders the label as an uppercase letter-spaced eyebrow above
//      the body — far more readable than the raw inline form.
//   3. Lists of "- foo" bullets get rendered as a real list.
const INSIGHT_LABEL_RE = /^(Idea|Problem|Solution|Outcome|Continuation)\s*:\s*(.+)$/i;
const CONTINUATION_TAG_RE =
  /\[(CONTINUATION|MAIA_CONTINUATION):(\d+):(w|b)\]/g;

function ContinuationPill({
  kind,
}: {
  kind: "CONTINUATION" | "MAIA_CONTINUATION";
}) {
  const isMaia = kind === "MAIA_CONTINUATION";
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.4,
        px: 0.85,
        py: 0.25,
        mx: 0.4,
        borderRadius: "999px",
        fontSize: "0.68rem",
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: isMaia ? "#C4B5FD" : "#FB923C",
        background: isMaia
          ? "rgba(196,181,253,0.08)"
          : "rgba(251,146,60,0.08)",
        border: isMaia
          ? "1px solid rgba(196,181,253,0.28)"
          : "1px solid rgba(251,146,60,0.28)",
      }}
    >
      {isMaia ? "Maia line" : "Engine line"}
    </Box>
  );
}

// Dark-themed counterpart to production's EngineContinuation
// (AICoachChat.tsx:716) and MaiaContinuation (:822). Reads PV directly
// from the local enginePositions[] (no atoms — the new surface uses
// component state). Falls back to the lightweight ContinuationPill +
// "open the Lines tab" footer when data isn't available.
function InsightContinuationInline({
  kind,
  moveNum,
  color,
  enginePositions,
  loadedGame,
  onJumpToPly,
  renderInline,
}: {
  kind: "CONTINUATION" | "MAIA_CONTINUATION";
  moveNum: number;
  color: "w" | "b";
  enginePositions: PositionEval[] | null;
  loadedGame: Chess;
  onJumpToPly?: (ply: number) => void;
  /** When provided, the PV's SAN moves get run through renderInline with
   *  forceRecommended=true so each "N. san" turns into a green 🔍
   *  clickable Box (same styling as recommended-move refs in prose).
   *  Caller passes CoachBubble's renderInline closure. */
  renderInline?: (text: string, forceRecommended?: boolean) => React.ReactNode[];
}) {
  // Half-move index inside enginePositions / loadedGame.history():
  // - white move N lands at ply 2N-1 (1-indexed) → index 2(N-1)
  // - black move N lands at ply 2N        (1-indexed) → index 2N-1
  const halfMoveIdx =
    color === "b" ? moveNum * 2 - 1 : (moveNum - 1) * 2;

  const isMaia = kind === "MAIA_CONTINUATION";
  const accent = isMaia ? "#C4B5FD" : "#FB923C";
  const bg = isMaia ? "rgba(196,181,253,0.08)" : "rgba(251,146,60,0.08)";
  const border = isMaia
    ? "rgba(196,181,253,0.28)"
    : "rgba(251,146,60,0.28)";
  const label = isMaia ? "Maia line" : "Engine line";

  const data = useMemo(() => {
    if (!enginePositions || halfMoveIdx < 0) return null;
    // The PV at index `halfMoveIdx` is the engine's best continuation
    // FROM that position. We want the line AT this move, which means
    // looking at the position BEFORE the move (halfMoveIdx itself).
    const posEval = enginePositions[halfMoveIdx];
    const pv = posEval?.lines?.[0];
    if (!pv?.pv || pv.pv.length === 0) return null;

    // Get FEN before this move by replaying loadedGame's history.
    let fenBefore: string | null = null;
    try {
      const tempGame = new Chess();
      const history = loadedGame.history();
      for (let i = 0; i < halfMoveIdx && i < history.length; i++) {
        tempGame.move(history[i]);
      }
      fenBefore = tempGame.fen();
    } catch {
      return null;
    }

    // Convert UCI PV → SAN. Bail at the first failure (corrupt UCI).
    const sans: string[] = [];
    try {
      const replay = new Chess(fenBefore);
      for (const uci of pv.pv.slice(0, 8)) {
        const mv = replay.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.length >= 5 ? uci[4] : "q",
        });
        if (!mv) break;
        sans.push(mv.san);
      }
    } catch {
      /* SAN conversion partial — render what we got */
    }
    if (sans.length === 0) return null;

    const evalStr =
      typeof pv.mate === "number"
        ? `M${pv.mate > 0 ? "+" : ""}${pv.mate}`
        : typeof pv.cp === "number"
        ? `${pv.cp >= 0 ? "+" : ""}${(pv.cp / 100).toFixed(2)}`
        : "";

    // Render as "14. e4 c5 15. Nf3 d6 16. d4 …" — chess.com-style
    // move-number-prefixed display, beginning at the right move number.
    const display: string[] = [];
    let m = moveNum;
    let isWhiteMove = color === "w";
    for (const san of sans) {
      if (isWhiteMove) display.push(`${m}.`);
      display.push(san);
      if (!isWhiteMove) m += 1;
      isWhiteMove = !isWhiteMove;
    }
    return { evalStr, displayText: display.join(" "), depth: pv.depth };
  }, [enginePositions, halfMoveIdx, color, moveNum, loadedGame]);

  if (!data) {
    // Engine data not ready or PV unavailable — fall back to the small
    // pill marker so the user still knows the coach referenced a line.
    return <ContinuationPill kind={kind} />;
  }

  return (
    <Box
      onClick={() => onJumpToPly?.(halfMoveIdx)}
      sx={{
        mt: 1,
        mb: 0.5,
        cursor: onJumpToPly ? "pointer" : "default",
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: "0.6rem",
        px: 1.25,
        py: 0.85,
        display: "flex",
        flexDirection: "column",
        gap: 0.4,
        transition: "all 180ms ease",
        "&:hover": onJumpToPly
          ? {
              background: isMaia
                ? "rgba(196,181,253,0.12)"
                : "rgba(251,146,60,0.12)",
              borderColor: accent,
            }
          : {},
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 0.75,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.6,
            fontSize: "0.66rem",
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: accent,
          }}
        >
          {label}
          {data.evalStr && (
            <Box
              component="span"
              sx={{
                color: "rgba(255,255,255,0.55)",
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                letterSpacing: "0.02em",
                textTransform: "none",
              }}
            >
              {data.evalStr}
            </Box>
          )}
        </Box>
        {typeof data.depth === "number" && (
          <Box
            sx={{
              fontSize: "0.62rem",
              color: "rgba(255,255,255,0.35)",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
            }}
          >
            d{data.depth}
          </Box>
        )}
      </Box>
      <Box
        sx={{
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          fontSize: "0.84rem",
          color: "rgba(255,255,255,0.86)",
          lineHeight: 1.4,
        }}
      >
        {renderInline
          ? renderInline(data.displayText, !isMaia)
          : data.displayText}
      </Box>
    </Box>
  );
}

function InsightBodyText({
  text,
  renderInline,
  enginePositions,
  loadedGame,
  onJumpToPly,
}: {
  text: string;
  renderInline: (text: string, forceRecommended?: boolean) => React.ReactNode[];
  /** Optional engine data — when present, [CONTINUATION:X:c] tokens
   *  render as inline PV widgets instead of being stripped + footer. */
  enginePositions?: PositionEval[] | null;
  loadedGame?: Chess;
  onJumpToPly?: (ply: number) => void;
}) {
  // Walk raw lines once. Each line becomes either:
  //   - a continuation block (line is *just* [CONTINUATION:N:c] / [MAIA_CONTINUATION:N:c] AND we have engine data to materialise it)
  //   - a labeled row (matches INSIGHT_LABEL_RE)
  //   - a bullet (joined with adjacent bullets)
  //   - a paragraph
  // Lines that aren't continuations still get their inline [CONTINUATION:…]
  // tags stripped so the literal token never leaks into prose.
  const canInline = !!enginePositions && !!loadedGame;
  const standaloneContinuationRe =
    /^\[(CONTINUATION|MAIA_CONTINUATION):(\d+):([wb])\]\s*$/i;
  type Continuation = {
    kind: "continuation";
    tagKind: "CONTINUATION" | "MAIA_CONTINUATION";
    moveNum: number;
    color: "w" | "b";
  };

  const rawLines = text.split(/\r?\n/).map((l) => l.trim());
  const blocks: Array<
    | { kind: "label"; label: string; body: string }
    | { kind: "bullets"; items: string[] }
    | { kind: "para"; body: string }
    | Continuation
  > = [];
  let bulletBuf: string[] = [];
  const flushBullets = () => {
    if (bulletBuf.length > 0) {
      blocks.push({ kind: "bullets", items: bulletBuf });
      bulletBuf = [];
    }
  };

  // Track whether any non-inlined continuation tags remained — drives the
  // footer pill fallback for when engine data isn't ready.
  let unInlinedContinuation = false;
  let unInlinedMaia = false;

  for (const rawLine of rawLines) {
    if (!rawLine) continue;
    const contM = standaloneContinuationRe.exec(rawLine);
    if (contM) {
      const tagKind = contM[1].toUpperCase() as Continuation["tagKind"];
      if (canInline) {
        flushBullets();
        blocks.push({
          kind: "continuation",
          tagKind,
          moveNum: parseInt(contM[2], 10),
          color: contM[3].toLowerCase() as "w" | "b",
        });
      } else {
        if (tagKind === "MAIA_CONTINUATION") unInlinedMaia = true;
        else unInlinedContinuation = true;
      }
      continue;
    }
    // Non-continuation line — strip any inline continuation tags so the
    // literal `[CONTINUATION:…]` text never reaches the renderer.
    let cleanedLine = rawLine.replace(CONTINUATION_TAG_RE, "").trim();
    if (!cleanedLine) continue;
    CONTINUATION_TAG_RE.lastIndex = 0;
    const labelM = INSIGHT_LABEL_RE.exec(cleanedLine);
    if (labelM) {
      flushBullets();
      blocks.push({ kind: "label", label: labelM[1], body: labelM[2] });
      continue;
    }
    if (/^[-•]\s+/.test(cleanedLine)) {
      bulletBuf.push(cleanedLine.replace(/^[-•]\s+/, ""));
      continue;
    }
    flushBullets();
    blocks.push({ kind: "para", body: cleanedLine });
  }
  flushBullets();

  // Backward-compat for the original footer-pill behaviour: only fires
  // when engine data wasn't ready at render time AND the coach actually
  // referenced a line. Keeps the name `hasContinuation`/`hasMaia` so the
  // existing footer JSX below works unchanged.
  const hasContinuation = unInlinedContinuation;
  const hasMaia = unInlinedMaia;

  return (
    <Box sx={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.88)", lineHeight: 1.55 }}>
      {blocks.map((b, i) => {
        if (b.kind === "label") {
          return (
            <Box
              key={i}
              sx={{
                mt: i === 0 ? 0 : 0.85,
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                columnGap: 1.25,
                rowGap: 0.25,
                alignItems: "baseline",
              }}
            >
              <Box
                sx={{
                  fontSize: "0.62rem",
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#FB923C",
                  whiteSpace: "nowrap",
                  pt: 0.15,
                }}
              >
                {b.label}
              </Box>
              <Box sx={{ color: "rgba(255,255,255,0.92)" }}>
                {/* G7 fix: SOLUTION / OUTCOME / CONTINUATION are the
                    labels under which the coach quotes its recommended
                    moves. Force-mark them so any move ref inside renders
                    green 🔍 instead of orange, even though the body
                    string itself doesn't carry a "best was" / "should
                    have" lookback context. IDEA + PROBLEM stay
                    unforced — those labels frame the played move, not
                    the recommended one. */}
                {renderInline(
                  b.body,
                  /^(Solution|Outcome|Continuation)$/i.test(b.label)
                )}
              </Box>
            </Box>
          );
        }
        if (b.kind === "bullets") {
          return (
            <Box
              key={i}
              component="ul"
              sx={{
                pl: 2.5,
                my: 0.75,
                "& li": { mb: 0.3, color: "rgba(255,255,255,0.86)" },
                "& li::marker": { color: "rgba(251,146,60,0.65)" },
              }}
            >
              {b.items.map((it, j) => (
                <Box component="li" key={j}>
                  {renderInline(it)}
                </Box>
              ))}
            </Box>
          );
        }
        if (b.kind === "continuation") {
          if (!enginePositions || !loadedGame) return null;
          return (
            <InsightContinuationInline
              key={i}
              kind={b.tagKind}
              moveNum={b.moveNum}
              color={b.color}
              enginePositions={enginePositions}
              loadedGame={loadedGame}
              onJumpToPly={onJumpToPly}
              renderInline={renderInline}
            />
          );
        }
        return (
          <Box key={i} sx={{ mt: i === 0 ? 0 : 0.6 }}>
            {renderInline(b.body)}
          </Box>
        );
      })}
      {(hasContinuation || hasMaia) && (
        <Box
          sx={{
            mt: 1.25,
            pt: 1,
            borderTop: "1px dashed rgba(255,255,255,0.08)",
            display: "flex",
            gap: 0.5,
            alignItems: "center",
            flexWrap: "wrap",
            fontSize: "0.72rem",
            color: "rgba(255,255,255,0.55)",
          }}
        >
          {hasContinuation && <ContinuationPill kind="CONTINUATION" />}
          {hasMaia && <ContinuationPill kind="MAIA_CONTINUATION" />}
          <Box sx={{ ml: 0.35 }}>· open the Lines tab for the full PV</Box>
        </Box>
      )}
    </Box>
  );
}

// ─── DarkInsightCard ─────────────────────────────────────────────────────
// Dark-themed counterpart to production's InsightCard
// (src/components/AICoachInsights.tsx). Same parsed InsightData shape via
// shared parseInsights — we just render it on a glass surface instead of
// the light Material card the legacy chat uses.
//
// Layout:
//   ┌─────────────────────────────────────────────────────────┐
//   │ 16. Bf5   [Blunder ??]   −0.57 → M−1                    │
//   │ Bringing the second rook into play seemed logical…      │
//   │ [Show why ▾] [Threats] [Roles] [Concept]                │
//   │ ╭─ Why ───────────────────────────────────────────────╮  │
//   │ │ Idea / Problem / Solution / Outcome                 │  │
//   │ ╰─────────────────────────────────────────────────────╯  │
//   └─────────────────────────────────────────────────────────┘
function DarkInsightCard({
  insight,
  renderInline,
  onMoveClick,
  onPracticeConcept,
  enginePositions,
  loadedGame,
  onJumpToPly,
}: {
  insight: InsightData;
  renderInline: (text: string, forceRecommended?: boolean) => React.ReactNode[];
  onMoveClick?: (moveNumber: number, isBlack: boolean) => void;
  /** Fires when the user clicks "Practice this concept" — invokes the
   * parent's triggerPuzzleFetch to attach a real Neo4j-backed pack. */
  onPracticeConcept?: (theme: string, displayName: string) => void;
  /** Optional engine data — passed through to InsightBodyText so it can
   * materialise `[CONTINUATION:N:c]` / `[MAIA_CONTINUATION:N:c]` tokens
   * as live PV widgets. Falls back to the small pill marker if absent. */
  enginePositions?: PositionEval[] | null;
  loadedGame?: Chess;
  onJumpToPly?: (ply: number) => void;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const [showThreats, setShowThreats] = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [showConcept, setShowConcept] = useState(false);

  const cls = (insight.classification ?? "").toLowerCase() as MoveLabel;
  const color = CLASSIFICATION_COLORS[cls] ?? "rgba(255,255,255,0.4)";
  const label = CLASSIFICATION_LABELS[cls] ?? insight.classification ?? "";
  const glyph = CLASSIFICATION_GLYPHS[cls] ?? "";
  const isNegative =
    cls === MoveClassification.Blunder ||
    cls === MoveClassification.Mistake ||
    cls === MoveClassification.Inaccuracy ||
    cls === MoveClassification.Miss;

  const evalLine =
    insight.evalBefore || insight.evalAfter
      ? `${insight.evalBefore ?? "?"} → ${insight.evalAfter ?? "?"}`
      : null;

  const moveText = insight.playedMove
    ? `${insight.moveLabel} ${insight.playedMove}`
    : insight.moveLabel;

  const Pill = ({
    label,
    active,
    onClick,
  }: {
    label: string;
    active: boolean;
    onClick: () => void;
  }) => (
    <Box
      onClick={onClick}
      sx={{
        cursor: "pointer",
        px: 1.25,
        py: 0.45,
        borderRadius: "999px",
        fontSize: "0.72rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        color: active ? "#0A0A0A" : "rgba(255,255,255,0.78)",
        background: active
          ? "linear-gradient(135deg,#F97316 0%,#EA580C 100%)"
          : "rgba(255,255,255,0.05)",
        border: active
          ? "1px solid rgba(249,115,22,0.6)"
          : "1px solid rgba(255,255,255,0.08)",
        transition: "all 180ms ease",
        "&:hover": active
          ? {}
          : {
              background: "rgba(249,115,22,0.1)",
              borderColor: "rgba(249,115,22,0.35)",
              color: "#FB923C",
            },
      }}
    >
      {label}
    </Box>
  );

  const Reveal = ({
    title,
    body,
    onClose,
  }: {
    title: string;
    body: string;
    onClose: () => void;
  }) => (
    <Box
      sx={{
        mt: 1,
        p: 1.25,
        borderRadius: "0.55rem",
        background: "rgba(0,0,0,0.3)",
        border: "1px solid rgba(255,255,255,0.06)",
        position: "relative",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 0.5,
        }}
      >
        <Typography
          sx={{
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.55)",
          }}
        >
          {title}
        </Typography>
        <Box
          onClick={onClose}
          sx={{
            cursor: "pointer",
            color: "rgba(255,255,255,0.4)",
            fontSize: "0.7rem",
            "&:hover": { color: "#FB923C" },
          }}
        >
          ×
        </Box>
      </Box>
      <InsightBodyText
        text={body}
        renderInline={renderInline}
        enginePositions={enginePositions}
        loadedGame={loadedGame}
        onJumpToPly={onJumpToPly}
      />
    </Box>
  );

  return (
    <Box
      sx={{
        mt: 1.25,
        p: 1.5,
        borderRadius: "0.75rem",
        background: "rgba(20,22,28,0.55)",
        backdropFilter: "blur(14px) saturate(150%)",
        WebkitBackdropFilter: "blur(14px) saturate(150%)",
        border: `1px solid ${color}33`,
        boxShadow: `0 4px 16px ${color}1f`,
      }}
    >
      {/* Header: move ref + classification chip + eval delta */}
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ flexWrap: "wrap", gap: 0.75 }}
      >
        <Box
          onClick={() =>
            onMoveClick?.(insight.moveNumber, insight.color === "b")
          }
          sx={{
            cursor: "pointer",
            fontWeight: 700,
            fontSize: "0.95rem",
            color: "#FB923C",
            textDecoration: "underline",
            textDecorationColor: "rgba(251,146,60,0.4)",
            textUnderlineOffset: "3px",
            "&:hover": {
              color: "#FDBA74",
              textDecorationColor: "#FDBA74",
            },
          }}
        >
          {moveText}
        </Box>
        <Box
          sx={{
            px: 0.85,
            py: 0.25,
            borderRadius: "999px",
            background: `${color}22`,
            border: `1px solid ${color}55`,
            color,
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.02em",
            display: "flex",
            gap: 0.4,
            alignItems: "center",
          }}
        >
          {glyph && <Box component="span">{glyph}</Box>}
          {label}
        </Box>
        {evalLine && (
          <Typography
            sx={{
              fontSize: "0.74rem",
              color: "rgba(255,255,255,0.5)",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
            }}
          >
            {evalLine}
          </Typography>
        )}
      </Stack>

      {/* Non-spoiler lede */}
      {insight.headline && (
        <Typography
          sx={{
            mt: 1,
            fontSize: "0.88rem",
            color: "rgba(255,255,255,0.92)",
            lineHeight: 1.45,
          }}
        >
          {renderInline(insight.headline)}
        </Typography>
      )}

      {/* Reveal pills */}
      <Stack
        direction="row"
        spacing={0.75}
        sx={{ mt: 1.25, flexWrap: "wrap", gap: 0.6 }}
      >
        {insight.why && (
          <Pill
            label={
              showWhy
                ? "Hide"
                : isNegative
                ? "Show what was missed"
                : "Show why this works"
            }
            active={showWhy}
            onClick={() => setShowWhy((v) => !v)}
          />
        )}
        {insight.threats && (
          <Pill
            label="Threats"
            active={showThreats}
            onClick={() => setShowThreats((v) => !v)}
          />
        )}
        {insight.roles && (
          <Pill
            label="Piece roles"
            active={showRoles}
            onClick={() => setShowRoles((v) => !v)}
          />
        )}
        {(insight.conceptBody || insight.conceptName) && (
          <Pill
            label={insight.conceptName ?? "Concept"}
            active={showConcept}
            onClick={() => setShowConcept((v) => !v)}
          />
        )}
      </Stack>

      {/* G11 fix: "Practice this concept" used to live INSIDE the
          Concept reveal panel — users who clicked Threats or Roles
          first never saw it. Lifted to a top-level primary CTA below
          the reveal-pill row so any insight with a conceptKey surfaces
          it inline. Distinct gradient + spark icon flags it as the
          one action that leaves the card. */}
      {insight.conceptKey && insight.conceptName && onPracticeConcept && (
        <Box
          onClick={() =>
            onPracticeConcept(insight.conceptKey!, insight.conceptName!)
          }
          sx={{
            mt: 1,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 0.65,
            px: 1.6,
            py: 0.7,
            borderRadius: "999px",
            background: "linear-gradient(135deg,#F97316 0%,#EA580C 100%)",
            color: "#0A0A0A",
            fontWeight: 700,
            fontSize: "0.78rem",
            letterSpacing: "0.02em",
            boxShadow: "0 4px 14px rgba(249,115,22,0.32)",
            transition: "transform 180ms ease, box-shadow 180ms ease",
            "&:hover": {
              transform: "translateY(-1px)",
              boxShadow: "0 6px 18px rgba(249,115,22,0.42)",
            },
          }}
        >
          <Sparkles size={13} />
          Practice {insight.conceptName.toLowerCase()}
        </Box>
      )}

      {showWhy && insight.why && (
        <Reveal
          title={
            insight.bestMove
              ? `Best move: ${insight.bestMove}`
              : "Explanation"
          }
          body={insight.why}
          onClose={() => setShowWhy(false)}
        />
      )}
      {showThreats && insight.threats && (
        <Reveal
          title="Threats"
          body={insight.threats}
          onClose={() => setShowThreats(false)}
        />
      )}
      {showRoles && insight.roles && (
        <Reveal
          title="Piece roles"
          body={insight.roles}
          onClose={() => setShowRoles(false)}
        />
      )}
      {showConcept && (insight.conceptBody || insight.conceptName) && (
        <Reveal
          title={insight.conceptName ?? "Concept"}
          body={insight.conceptBody ?? ""}
          onClose={() => setShowConcept(false)}
        />
      )}
    </Box>
  );
}

// ─── DarkInsightCarousel ────────────────────────────────────────────────
// Paginated wrapper around DarkInsightCard. Renders one insight at a time
// with prev/next arrows + counter + progress bar — mirrors production's
// InsightsCarousel UX (src/components/AICoachInsights.tsx:487) but on
// our dark glass surface.
//
// Animations:
//   - Card content slides horizontally on direction change (framer-motion)
//   - Indexed dots double as click targets so the user can jump to any
//     insight directly
//   - Keyboard: ← / → arrow keys advance when the carousel has focus
function DarkInsightCarousel({
  insights,
  renderInline,
  onMoveClick,
  onPracticeConcept,
  enginePositions,
  loadedGame,
  onJumpToPly,
}: {
  insights: InsightData[];
  renderInline: (text: string, forceRecommended?: boolean) => React.ReactNode[];
  onMoveClick?: (moveNumber: number, isBlack: boolean) => void;
  onPracticeConcept?: (theme: string, displayName: string) => void;
  enginePositions?: PositionEval[] | null;
  loadedGame?: Chess;
  onJumpToPly?: (ply: number) => void;
}) {
  const [[idx, dir], setState] = useState<[number, 1 | -1]>([0, 1]);
  const total = insights.length;
  const clamp = useCallback(
    (n: number) => ((n % total) + total) % total,
    [total]
  );
  const current = insights[clamp(idx)];
  const go = useCallback(
    (delta: 1 | -1) => setState(([prev]) => [clamp(prev + delta), delta]),
    [clamp]
  );
  const jump = useCallback(
    (target: number) =>
      setState(([prev]) => [target, (target > prev ? 1 : -1) as 1 | -1]),
    []
  );
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    }
  };

  if (total === 0) return null;

  return (
    <Box
      tabIndex={0}
      onKeyDown={handleKey}
      sx={{
        mt: 1.5,
        borderRadius: "1rem",
        background:
          "linear-gradient(180deg, rgba(20,22,28,0.6) 0%, rgba(20,22,28,0.4) 100%)",
        backdropFilter: "blur(18px) saturate(160%)",
        WebkitBackdropFilter: "blur(18px) saturate(160%)",
        border: "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
        outline: "none",
        "&:focus-visible": {
          borderColor: "rgba(249,115,22,0.5)",
          boxShadow: "0 0 0 2px rgba(249,115,22,0.18)",
        },
      }}
    >
      {/* Eyebrow + nav */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 1.5,
          py: 1,
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.85,
          }}
        >
          <Flame size={12} color="#FB923C" />
          <Box
            sx={{
              fontSize: "0.66rem",
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.62)",
            }}
          >
            Key moments
          </Box>
        </Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
          }}
        >
          <Box
            onClick={() => go(-1)}
            aria-label="Previous insight"
            sx={{
              cursor: total > 1 ? "pointer" : "default",
              opacity: total > 1 ? 1 : 0.3,
              width: 24,
              height: 24,
              borderRadius: "999px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.7)",
              transition: "all 180ms ease",
              "&:hover":
                total > 1
                  ? {
                      background: "rgba(249,115,22,0.12)",
                      color: "#FB923C",
                    }
                  : {},
            }}
          >
            <ChevronLeft size={14} />
          </Box>
          <Box
            sx={{
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "rgba(255,255,255,0.85)",
              fontVariantNumeric: "tabular-nums",
              minWidth: 32,
              textAlign: "center",
              letterSpacing: "0.02em",
            }}
          >
            {clamp(idx) + 1} / {total}
          </Box>
          <Box
            onClick={() => go(1)}
            aria-label="Next insight"
            sx={{
              cursor: total > 1 ? "pointer" : "default",
              opacity: total > 1 ? 1 : 0.3,
              width: 24,
              height: 24,
              borderRadius: "999px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.7)",
              transition: "all 180ms ease",
              "&:hover":
                total > 1
                  ? {
                      background: "rgba(249,115,22,0.12)",
                      color: "#FB923C",
                    }
                  : {},
            }}
          >
            <ChevronRight size={14} />
          </Box>
        </Box>
      </Box>

      {/* Progress bar */}
      <Box sx={{ position: "relative", height: 2 }}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: "rgba(255,255,255,0.04)",
          }}
        />
        <motion.div
          layout
          animate={{
            width: `${((clamp(idx) + 1) / total) * 100}%`,
          }}
          transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            background:
              "linear-gradient(90deg, #F97316 0%, #FB923C 100%)",
            boxShadow: "0 0 12px rgba(249,115,22,0.45)",
          }}
        />
      </Box>

      {/* Slide-animated card body */}
      <Box sx={{ position: "relative", p: 1.5 }}>
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={clamp(idx)}
            custom={dir}
            initial={{ opacity: 0, x: dir * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -24 }}
            transition={{
              duration: 0.22,
              ease: [0.22, 0.61, 0.36, 1],
            }}
          >
            <DarkInsightCard
              insight={current}
              renderInline={renderInline}
              onMoveClick={onMoveClick}
              onPracticeConcept={onPracticeConcept}
              enginePositions={enginePositions}
              loadedGame={loadedGame}
              onJumpToPly={onJumpToPly}
            />
          </motion.div>
        </AnimatePresence>
      </Box>

      {/* Indexed dots (jump-to) */}
      {total > 1 && (
        <Box
          sx={{
            display: "flex",
            gap: 0.5,
            justifyContent: "center",
            pb: 1.25,
            pt: 0.25,
          }}
        >
          {insights.map((_, i) => {
            const active = i === clamp(idx);
            return (
              <Box
                key={i}
                onClick={() => jump(i)}
                aria-label={`Go to insight ${i + 1}`}
                sx={{
                  cursor: "pointer",
                  width: active ? 18 : 6,
                  height: 6,
                  borderRadius: "999px",
                  background: active
                    ? "linear-gradient(135deg,#F97316,#EA580C)"
                    : "rgba(255,255,255,0.18)",
                  boxShadow: active
                    ? "0 0 10px rgba(249,115,22,0.45)"
                    : "none",
                  transition: "all 220ms ease",
                  "&:hover": active
                    ? {}
                    : { background: "rgba(255,255,255,0.32)" },
                }}
              />
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function CoachBubble({
  msg,
  onPromoteToBoard,
  allMoves,
  onMoveRefClick,
  onShare,
  allMessages,
  messageIndex,
  contextId,
  onPuzzleSolved,
  onPracticeConcept,
  enginePositions,
  loadedGame,
}: {
  msg: CoachMessage;
  onPromoteToBoard?: (puzzles: DrillPuzzle[], startIndex: number) => void;
  /** Full move history — used to resolve "24.Rxd4" → ply 47. */
  allMoves?: Move[];
  /** Fired when the user clicks a move reference in coach text. */
  onMoveRefClick?: (ply: number) => void;
  /** Fired when the user clicks the share icon on a coach reply. */
  onShare?: (msg: CoachMessage) => void;
  /** Full chat history — required for G12 FlagButton context. */
  allMessages?: CoachMessage[];
  /** Index of this message in allMessages — for FlagButton. */
  messageIndex?: number;
  /** Current analysis contextId — for FlagButton. Null if no deep analysis run yet. */
  contextId?: string | null;
  /** G11: fires when an inline puzzle is solved so we can persist + exclude. */
  onPuzzleSolved?: (puzzle: DrillPuzzle, timeSpentSeconds: number) => void;
  /** Fired when a concept practice CTA is clicked inside an insight card. */
  onPracticeConcept?: (
    theme: string,
    displayName: string,
    messageIndex: number
  ) => void;
  /** Engine data passed through to insight cards so `[CONTINUATION:N:c]`
   *  / `[MAIA_CONTINUATION:N:c]` tokens can materialise inline PVs. */
  enginePositions?: PositionEval[] | null;
  loadedGame?: Chess;
}) {
  const isUser = msg.role === "user";

  // Renderer: handles bold (**…**) AND inline move references (24.Rxd4 →
  // clickable, board jumps on click). `forceRecommended` lets a caller
  // (e.g. InsightBodyText rendering a SOLUTION/OUTCOME-labeled body row)
  // pre-mark every move ref as recommended, bypassing the contextBefore
  // regex check. Necessary because the round-2 smoke test surfaced that
  // structured-card content like `SOLUTION: 7. dxe5 wins the pawn` never
  // had "best was" / "should have" in its lookback window, so the green
  // 🔍 tag never fired even when the move clearly was the recommended one.
  const renderInline = (
    text: string,
    forceRecommended = false
  ): React.ReactNode[] => {
    const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
    const out: React.ReactNode[] = [];
    boldParts.forEach((part, boldIdx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        out.push(
          <Box
            key={`b${boldIdx}`}
            component="span"
            sx={{
              fontWeight: 700,
              color: isUser ? "#0A0A0A" : "#FB923C",
            }}
          >
            {part.slice(2, -2)}
          </Box>
        );
        return;
      }
      // G7: production-parity 4-tier move-reference parser. Each match is
      // styled either as "recommended" (green, click → explore the
      // alternative) or "navigate" (orange, click → jump to that ply).
      if (!allMoves || !onMoveRefClick) {
        out.push(<span key={`t${boldIdx}`}>{part}</span>);
        return;
      }
      const refs = findAllMoveRefs(part, forceRecommended);
      if (refs.length === 0) {
        out.push(<span key={`t${boldIdx}`}>{part}</span>);
        return;
      }
      let lastIdx = 0;
      for (const ref of refs) {
        if (ref.start > lastIdx) {
          out.push(
            <span key={`${boldIdx}t${lastIdx}`}>
              {part.slice(lastIdx, ref.start)}
            </span>
          );
        }
        const matchedPly = findPlyForMoveRef(
          allMoves,
          ref.moveNumber,
          ref.isBlack,
          ref.san
        );
        // RECOMMENDED moves are by definition NOT what the player actually
        // played, so findPlyForMoveRef will return null for them — the SAN
        // at that ply won't match the recommended SAN. We still want them
        // clickable (jumps to the position FROM which the recommended move
        // would be played, so the user lands in exploration mode). Same
        // ply derivation as findPlyForMoveRef's expectedPly, then -1 to
        // sit BEFORE the move. Round-2 + Round-3 smoke caught this:
        // "11. g4" in a SOLUTION row rendered as a plain <span> with no
        // click handler because findPlyForMoveRef returned null.
        const recommendedTargetPly =
          ref.recommended && matchedPly === null
            ? Math.max(
                0,
                (ref.moveNumber - 1) * 2 + (ref.isBlack ? 1 : 0)
              )
            : null;
        const ply = matchedPly ?? recommendedTargetPly;
        if (ply !== null) {
          const recColor = "#86efac"; // light green for recommended
          const navColor = isUser ? "#0A0A0A" : "#FB923C";
          out.push(
            <Box
              key={`${boldIdx}m${ref.start}`}
              component="span"
              onClick={() => onMoveRefClick(ply)}
              title={
                ref.recommended
                  ? `Recommended alternative: ${ref.san}`
                  : `Jump to ${ref.moveNumber}${
                      ref.isBlack ? "..." : "."
                    } ${ref.san}`
              }
              sx={{
                color: ref.recommended ? recColor : navColor,
                cursor: "pointer",
                fontWeight: 700,
                textDecoration: "underline",
                textDecorationStyle: "dotted",
                textDecorationColor: ref.recommended
                  ? "rgba(134,239,172,0.5)"
                  : isUser
                  ? "rgba(0,0,0,0.5)"
                  : "rgba(251,146,60,0.5)",
                px: 0.35,
                borderRadius: "3px",
                transition: "all 140ms ease",
                "&:hover": {
                  textDecorationStyle: "solid",
                  background: ref.recommended
                    ? "rgba(34,197,94,0.16)"
                    : isUser
                    ? "rgba(0,0,0,0.08)"
                    : "rgba(249,115,22,0.14)",
                },
              }}
            >
              {ref.recommended ? "🔍 " : ""}
              {ref.full}
            </Box>
          );
        } else {
          out.push(<span key={`${boldIdx}m${ref.start}`}>{ref.full}</span>);
        }
        lastIdx = ref.end;
      }
      if (lastIdx < part.length) {
        out.push(
          <span key={`${boldIdx}t${lastIdx}end`}>
            {part.slice(lastIdx)}
          </span>
        );
      }
    });
    return out;
  };

  // ─── Markdown prose renderer ────────────────────────────────────────────
  // The coach prompt does not currently forbid markdown, the few-shot
  // examples (goldStandardExamples.ts) use **bold** + bullet lists + the
  // occasional [label](url), and the model emits markdown by training
  // default. Before this PR the renderer collapsed all of that to plain
  // text — bare `**bold**` and literal `[label](url)` survived as raw
  // characters in the bubble.
  //
  // We run prose between INSIGHT cards through react-markdown + GFM, but
  // every text node still goes through renderInline so the move-reference
  // tokenizer + the recommended-move green-tag logic keep working.
  // `renderInline` already handles `**bold**`, so we leave bold to it
  // rather than relying on react-markdown's `<strong>` to avoid double-
  // bolding when both layers fire on the same span.
  const processChildren = (node: ReactNode): ReactNode => {
    if (typeof node === "string") {
      return <>{renderInline(node)}</>;
    }
    if (Array.isArray(node)) {
      return node.map((child, idx) => (
        <Fragment key={idx}>{processChildren(child)}</Fragment>
      ));
    }
    if (
      isValidElement<{ children?: ReactNode }>(node) &&
      node.props != null &&
      "children" in node.props
    ) {
      return cloneElement(node, {
        children: processChildren(node.props.children),
      });
    }
    return node;
  };

  // Markdown links: only http/https survive. javascript: / data: / file:
  // URLs from a hallucinated coach reply get silently rendered as plain
  // text.
  const isSafeHref = (href: string | undefined): href is string => {
    if (!href) return false;
    try {
      const u = new URL(href, "https://chessmasti.com");
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  };

  const markdownComponents = {
    a: ({ href, children, ...rest }: any) => {
      if (!isSafeHref(href)) return <>{processChildren(children)}</>;
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: isUser ? "#0A0A0A" : "#FB923C",
            textDecoration: "underline",
            fontWeight: 600,
          }}
          {...rest}
        >
          {processChildren(children)}
        </a>
      );
    },
    p: ({ children }: any) => (
      <Box component="p" sx={{ m: 0, mb: 0.75, "&:last-child": { mb: 0 } }}>
        {processChildren(children)}
      </Box>
    ),
    ul: ({ children }: any) => (
      <Box component="ul" sx={{ m: 0, mb: 0.75, pl: 2.5 }}>
        {processChildren(children)}
      </Box>
    ),
    ol: ({ children }: any) => (
      <Box component="ol" sx={{ m: 0, mb: 0.75, pl: 2.5 }}>
        {processChildren(children)}
      </Box>
    ),
    li: ({ children }: any) => (
      <Box component="li" sx={{ mb: 0.25 }}>
        {processChildren(children)}
      </Box>
    ),
    blockquote: ({ children }: any) => (
      <Box
        component="blockquote"
        sx={{
          m: 0,
          mb: 0.75,
          pl: 1.25,
          borderLeft: isUser
            ? "3px solid rgba(0,0,0,0.25)"
            : "3px solid rgba(251,146,60,0.5)",
          color: "inherit",
          opacity: 0.85,
        }}
      >
        {processChildren(children)}
      </Box>
    ),
    h1: ({ children }: any) => (
      <Box component="div" sx={{ fontWeight: 700, fontSize: "1.05em", mb: 0.5 }}>
        {processChildren(children)}
      </Box>
    ),
    h2: ({ children }: any) => (
      <Box component="div" sx={{ fontWeight: 700, fontSize: "1.02em", mb: 0.5 }}>
        {processChildren(children)}
      </Box>
    ),
    h3: ({ children }: any) => (
      <Box component="div" sx={{ fontWeight: 700, fontSize: "1em", mb: 0.5 }}>
        {processChildren(children)}
      </Box>
    ),
    h4: ({ children }: any) => (
      <Box component="div" sx={{ fontWeight: 700, fontSize: "0.96em", mb: 0.5 }}>
        {processChildren(children)}
      </Box>
    ),
    em: ({ children }: any) => (
      <em>{processChildren(children)}</em>
    ),
    // We intentionally do NOT remap <strong>: renderInline already turns
    // `**bold**` into a styled span, and remark-gfm's `<strong>` rendering
    // would double-bold the same content. Leaving `strong` off this map
    // means react-markdown emits the default <strong>, but the bold text
    // never reaches react-markdown because renderInline consumed the
    // `**…**` syntax first.
    code: ({ inline, children, ...rest }: any) => {
      // react-markdown 10 still passes `inline` for compatibility; default
      // to "inline" when in doubt — coach output rarely contains real
      // code blocks, and falling back to inline keeps the layout sane.
      const isInline = inline ?? true;
      if (isInline) {
        return (
          <Box
            component="code"
            sx={{
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: "0.9em",
              px: 0.45,
              py: 0.05,
              borderRadius: "4px",
              background: isUser
                ? "rgba(0,0,0,0.12)"
                : "rgba(255,255,255,0.08)",
            }}
            {...rest}
          >
            {children}
          </Box>
        );
      }
      return (
        <Box
          component="pre"
          sx={{
            m: 0,
            mb: 0.75,
            p: 1,
            borderRadius: "8px",
            background: "rgba(0,0,0,0.3)",
            overflowX: "auto",
            fontSize: "0.85em",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          }}
          {...rest}
        >
          <code>{children}</code>
        </Box>
      );
    },
    hr: () => (
      <Box
        component="hr"
        sx={{
          border: 0,
          borderTop: "1px solid rgba(255,255,255,0.1)",
          my: 1,
        }}
      />
    ),
  };

  // Wraps a chunk of prose in react-markdown but lets renderInline keep
  // owning the bold + move-ref tokenization. Returns a JSX element rather
  // than ReactNode[] so callers can drop it into JSX with `{}`.
  const renderMarkdownProse = (text: string): React.ReactNode => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents}
    >
      {text}
    </ReactMarkdown>
  );

  const shareable =
    !isUser && msg.content.trim().length > 0 && Boolean(onShare);

  return (
    <Box sx={{ position: "relative" }}>
      <Box
        sx={{
          px: 2.25,
          py: 1.5,
          borderRadius: "1rem",
          background: isUser
            ? "linear-gradient(135deg, #F97316 0%, #FB923C 100%)"
            : "rgba(255,255,255,0.04)",
          border: isUser
            ? "1px solid rgba(255,255,255,0.18)"
            : "1px solid rgba(255,255,255,0.08)",
          color: isUser ? "#0A0A0A" : "rgba(255,255,255,0.92)",
          fontSize: "0.92rem",
          lineHeight: 1.55,
          fontWeight: isUser ? 600 : 400,
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          boxShadow: isUser
            ? "0 4px 16px rgba(249,115,22,0.25)"
            : "0 2px 8px rgba(0,0,0,0.2)",
          "&:hover .coach-share-btn": { opacity: 1 },
        }}
      >
        {(() => {
          // Strip PRACTICE tags first (they're for puzzle attach), then
          // parse INSIGHT/WHY/THREATS/ROLES/CONCEPT blocks via production's
          // shared parseInsights. When present we render prefix prose +
          // DarkInsightCard per insight + suffix prose. When absent we
          // fall back to the original raw-text inline rendering.
          if (isUser) return renderInline(msg.content);
          const practiceStripped = extractPracticeTags(msg.content).stripped;
          const { prefix, insights, suffix } = parseInsights(practiceStripped);
          if (insights.length === 0) {
            return renderMarkdownProse(practiceStripped);
          }
          return (
            <>
              {prefix.trim() && renderMarkdownProse(prefix)}
              <DarkInsightCarousel
                insights={insights}
                renderInline={renderInline}
                onMoveClick={(moveNum, isBlack) => {
                  if (!allMoves) return;
                  const ply = isBlack ? moveNum * 2 : moveNum * 2 - 1;
                  if (ply >= 0 && ply <= allMoves.length) {
                    onMoveRefClick?.(ply);
                  }
                }}
                onPracticeConcept={
                  onPracticeConcept && messageIndex !== undefined
                    ? (theme, name) =>
                        onPracticeConcept(theme, name, messageIndex)
                    : undefined
                }
                enginePositions={enginePositions}
                loadedGame={loadedGame}
                onJumpToPly={onMoveRefClick}
              />
              {suffix.trim() && renderMarkdownProse(suffix)}
            </>
          );
        })()}
        {shareable && (
          <Tooltip title="Share this insight (link + PNG)">
            <IconButton
              className="coach-share-btn"
              onClick={() => onShare?.(msg)}
              sx={{
                position: "absolute",
                top: 6,
                right: 6,
                width: 24,
                height: 24,
                p: 0,
                borderRadius: "8px",
                opacity: 0,
                color: "rgba(255,255,255,0.55)",
                background: "rgba(20,22,28,0.7)",
                border: "1px solid rgba(255,255,255,0.08)",
                transition: "all 160ms ease",
                "&:hover": {
                  color: "#FB923C",
                  background: "rgba(249,115,22,0.18)",
                  borderColor: "rgba(249,115,22,0.4)",
                },
              }}
            >
              <Share2 size={12} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {msg.insight && !isUser && (
        <Box
          sx={{
            mt: 1,
            p: 1.5,
            borderRadius: "0.75rem",
            background:
              "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))",
            border: "1px solid rgba(34,197,94,0.25)",
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <Flame size={16} color="#22c55e" />
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: "0.82rem", fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>
              {msg.insight.tag}
            </Typography>
            <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
              {msg.insight.eval && (
                <Typography sx={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.55)", fontFamily: "Monaco, Menlo, monospace" }}>
                  Eval: {msg.insight.eval}
                </Typography>
              )}
              {msg.insight.classification && (
                <Typography sx={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.55)" }}>
                  {msg.insight.classification}
                </Typography>
              )}
            </Stack>
          </Box>
        </Box>
      )}
      {msg.puzzlePack && !isUser && onPromoteToBoard && (
        <CoachPuzzleCard
          pack={msg.puzzlePack}
          onPromote={onPromoteToBoard}
          onSolved={onPuzzleSolved}
        />
      )}
      {/* G12: FlagButton self-gates on useViewer().isIntern — renders
          nothing for non-intern viewers. We just need to mount it on
          every assistant message with the required context. */}
      {!isUser &&
        msg.content.trim().length > 0 &&
        allMessages &&
        messageIndex !== undefined && (
          <Box sx={{ mt: 0.75 }}>
            <FlagButton
              message={{ role: "assistant", content: msg.content }}
              messageIndex={messageIndex}
              chatHistory={allMessages.map((m) => ({
                role:
                  m.role === "coach"
                    ? ("assistant" as const)
                    : ("user" as const),
                content: m.content,
              }))}
              contextId={contextId ?? null}
            />
          </Box>
        )}
    </Box>
  );
}

function ThinkingBubble() {
  return (
    <Box
      sx={{
        px: 2.25,
        py: 1.5,
        borderRadius: "1rem",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
      }}
    >
      <Lightbulb size={14} color="#FB923C" />
      <Typography
        sx={{
          fontSize: "0.85rem",
          color: "rgba(255,255,255,0.62)",
          fontStyle: "italic",
        }}
      >
        Coach is thinking
      </Typography>
      <Stack direction="row" spacing={0.4}>
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "#F97316",
              animation: "bounce 1.2s ease-in-out infinite",
              animationDelay: `${i * 0.15}s`,
              "@keyframes bounce": {
                "0%, 80%, 100%": { transform: "translateY(0)", opacity: 0.4 },
                "40%": { transform: "translateY(-3px)", opacity: 1 },
              },
            }}
          />
        ))}
      </Stack>
    </Box>
  );
}

function MoveNavigator({
  currentPly,
  totalPlies,
  onJumpTo,
  onFlip,
  onReset,
}: {
  currentPly: number;
  totalPlies: number;
  onJumpTo: (ply: number) => void;
  onFlip: () => void;
  onReset: () => void;
}) {
  const NavButton = ({
    onClick,
    disabled,
    tooltip,
    children,
  }: {
    onClick: () => void;
    disabled?: boolean;
    tooltip: string;
    children: React.ReactNode;
  }) => (
    <Tooltip title={tooltip}>
      <span>
        <IconButton
          onClick={onClick}
          disabled={disabled}
          sx={{
            width: 42,
            height: 42,
            borderRadius: "10px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.85)",
            transition: "all 180ms ease",
            "&:hover": {
              background: "rgba(249,115,22,0.12)",
              borderColor: "rgba(249,115,22,0.35)",
              color: "#FB923C",
            },
            "&.Mui-disabled": {
              color: "rgba(255,255,255,0.2)",
              borderColor: "rgba(255,255,255,0.04)",
            },
          }}
        >
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );

  return (
    <Box
      sx={{
        mt: 3,
        px: { xs: 2, md: 3 },
        py: 1.75,
        borderRadius: "999px",
        background: "rgba(20,22,28,0.65)",
        backdropFilter: "blur(14px) saturate(150%)",
        WebkitBackdropFilter: "blur(14px) saturate(150%)",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        gap: 1,
        flexWrap: "wrap",
      }}
    >
      <NavButton
        onClick={() => onJumpTo(0)}
        disabled={currentPly === 0}
        tooltip="Start (Home)"
      >
        <ChevronsLeft size={18} />
      </NavButton>
      <NavButton
        onClick={() => onJumpTo(Math.max(0, currentPly - 1))}
        disabled={currentPly === 0}
        tooltip="Previous move (←)"
      >
        <ChevronLeft size={18} />
      </NavButton>

      <Box
        sx={{
          mx: 1.5,
          px: 2,
          py: 1,
          borderRadius: "10px",
          background: "rgba(249,115,22,0.08)",
          border: "1px solid rgba(249,115,22,0.2)",
          minWidth: 100,
          textAlign: "center",
        }}
      >
        {(() => {
          const disp = plyToMoveDisplay(currentPly);
          return disp.color === null ? (
            <Typography
              sx={{
                fontSize: "0.82rem",
                fontWeight: 700,
                color: "#FB923C",
                fontFamily: "Monaco, Menlo, monospace",
                lineHeight: 1,
              }}
            >
              Start
            </Typography>
          ) : (
            <Stack
              direction="row"
              spacing={0.75}
              alignItems="center"
              justifyContent="center"
              sx={{ lineHeight: 1 }}
            >
              <Typography
                sx={{
                  fontSize: "0.92rem",
                  fontWeight: 700,
                  color: "#FB923C",
                  fontFamily: "Monaco, Menlo, monospace",
                  lineHeight: 1,
                }}
              >
                {disp.moveNum}
              </Typography>
              <Box
                sx={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background:
                    disp.color === "white" ? "#F0D9B5" : "#1A1814",
                  border: "1px solid rgba(255,255,255,0.3)",
                  boxShadow:
                    disp.color === "white"
                      ? "0 0 6px rgba(240,217,181,0.4)"
                      : "inset 0 1px 0 rgba(255,255,255,0.1)",
                  flexShrink: 0,
                }}
              />
            </Stack>
          );
        })()}
        <Typography
          sx={{
            fontSize: "0.65rem",
            color: "rgba(255,255,255,0.4)",
            mt: 0.5,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Move
        </Typography>
      </Box>

      <NavButton
        onClick={() => onJumpTo(Math.min(totalPlies, currentPly + 1))}
        disabled={currentPly === totalPlies}
        tooltip="Next move (→)"
      >
        <ChevronRight size={18} />
      </NavButton>
      <NavButton
        onClick={() => onJumpTo(totalPlies)}
        disabled={currentPly === totalPlies}
        tooltip="End"
      >
        <ChevronsRight size={18} />
      </NavButton>

      <Box sx={{ flex: 1, minWidth: 8 }} />

      <NavButton onClick={onFlip} tooltip="Flip board (F)">
        <RotateCw size={16} />
      </NavButton>
      <NavButton onClick={onReset} tooltip="Reset to start">
        <RefreshCw size={16} />
      </NavButton>
      <Tooltip title="Share">
        <span>
          <IconButton
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                navigator.clipboard.writeText(window.location.href);
              }
            }}
            sx={{
              width: 42,
              height: 42,
              borderRadius: "10px",
              background:
                "linear-gradient(135deg, rgba(249,115,22,0.18), rgba(234,88,12,0.18))",
              border: "1px solid rgba(249,115,22,0.35)",
              color: "#FB923C",
              "&:hover": {
                background:
                  "linear-gradient(135deg, rgba(249,115,22,0.28), rgba(234,88,12,0.28))",
                color: "#FED7AA",
              },
            }}
          >
            <Share2 size={16} />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Main page
// ───────────────────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  // Read puzzle-mode params from URL. When ?puzzleFen= is present, we drop
  // the Kasparov demo and load the puzzle as a single-position study.
  const router = useRouter();
  const puzzleFen =
    typeof router.query.puzzleFen === "string" ? router.query.puzzleFen : null;
  const solutionParam =
    typeof router.query.solution === "string" ? router.query.solution : null;
  const promptParam =
    typeof router.query.prompt === "string" ? router.query.prompt : null;
  const autoAnalyzeParam =
    typeof router.query.autoAnalyze === "string"
      ? router.query.autoAnalyze
      : null;

  // Signed-in user — hoisted to the top so downstream loaders (loadNewGame
  // G13, triggerPuzzleFetch G14, recordSolved G11) can read user.uid /
  // user.displayName without violating the "declared before use" rule.
  //
  // `profile` carries the Firestore-stored coaching prefs (selfReportedRating,
  // coachTone, etc.). We thread the rating into the CoachPanel mount below so
  // the LLM skill-tier calibration (beginner/intermediate/advanced derivation
  // at coachChatPrompt.ts:98-102) is keyed to the user's actual strength
  // instead of a constant 1500.
  const { user, profile } = useViewer();

  // G6: auto-analyze state machine. Mirrors production's autoAnalyzeStateAtom
  // (src/sections/analysis/states.ts:87-93). Triggered by ?autoAnalyze=1
  // (the Chess Masti browser extension sets this). The chat input is
  // locked while in "pending" or "sent-awaiting-insights" so the user
  // can't queue requests on top of a long deep-analysis pass.
  const [autoAnalyzeState, setAutoAnalyzeState] = useState<
    "idle" | "pending" | "sent-awaiting-insights" | "done"
  >(autoAnalyzeParam === "1" ? "pending" : "idle");
  const autoAnalyzeFiredRef = useRef(false);

  // Loaded game — either the Kasparov demo (cold start), a puzzle stub
  // (?puzzleFen=...), or whatever the user just imported via URL param /
  // LoadGameDialog. Mutable because we hot-swap the game when the user
  // pastes a new PGN.
  const [loadedGame, setLoadedGame] = useState<Chess>(() => {
    const g = new Chess();
    if (puzzleFen) {
      g.loadPgn(`[FEN "${decodeURIComponent(puzzleFen)}"]\n[SetUp "1"]\n*`);
    } else {
      g.loadPgn(DEMO_PGN);
    }
    return g;
  });
  // True when we're showing the hand-curated demo (puzzle pack is fair game).
  // Flips false the moment a real game is loaded so we don't pretend the demo
  // narrative applies to a user's PGN.
  const [isDemoGame, setIsDemoGame] = useState(true);

  const allMoves = useMemo(
    () => loadedGame.history({ verbose: true }) as Move[],
    [loadedGame]
  );
  const headers = useMemo(() => loadedGame.header(), [loadedGame]);

  // ───── Real Stockfish evaluation ─────
  // Stockfish17Lite is single-threaded — works on networks that block
  // SharedArrayBuffer (school WiFi) and has the fastest cold start.
  // Depth 12 is plenty for surfacing the eval-curve shape; depth 16
  // matches production /analysis default and gives sharper tactics.
  const [engineSettings, setEngineSettings] = useState<{
    depth: number;
    engineName: EngineName;
  }>({ depth: 12, engineName: EngineName.Stockfish17Lite });
  const engine = useEngine(engineSettings.engineName);
  const [enginePositions, setEnginePositions] = useState<PositionEval[] | null>(
    null
  );
  // Full GameEval (positions + accuracy + estimatedElo + settings) so the
  // Save flow (G4) can persist a complete eval to Firestore/IndexedDB
  // instead of synthesising one. Populated alongside enginePositions.
  const [gameEvalFull, setGameEvalFull] = useState<GameEval | null>(null);

  // G8: real Maia predictions via /api/maia-predict, keyed by
  // `${fen}|${elo}`. Hand-table is the synchronous cold-start fallback.
  // Fetches are auth-gated; on 401/503 we silently keep the table value
  // so the arrow still surfaces something rather than nothing.
  const [maiaCache, setMaiaCache] = useState<Record<string, string>>({});
  const maiaInFlightRef = useRef<Set<string>>(new Set());
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Production-parity classified positions — Brilliant / Great / Best /
  // Excellent / Good / Okay / Forced / Opening / Inaccuracy / Mistake /
  // Miss / Blunder via getMovesClassification. The classifier needs both
  // UCI strings (for legal-move replay) and the canonical FEN sequence.
  const classifiedPositions = useMemo<PositionEval[] | null>(() => {
    if (!enginePositions) return null;
    let params: { fens: string[]; uciMoves: string[] };
    try {
      params = getEvaluateGameParams(loadedGame);
    } catch {
      // Empty history (start position) → getEvaluateGameParams throws on
      // history[-1]. Nothing to classify.
      return enginePositions;
    }
    // The classifier replays uciMoves[0..index-1] for each non-zero index.
    // Bail out when enginePositions is longer than the current game's move
    // list — that happens transiently when loadedGame just changed but the
    // enginePositions-reset effect hasn't fired yet, or when a stale cache
    // entry got restored. Falling through would throw chess.js's
    // "Invalid move: undefined" inside the classifier's inner try/catch,
    // which Next.js 15 dev surfaces as a runtime overlay even though the
    // page renders fine.
    if (enginePositions.length !== params.uciMoves.length + 1) {
      return enginePositions;
    }
    try {
      return getMovesClassification(
        enginePositions,
        params.uciMoves,
        params.fens
      );
    } catch (err) {
      console.warn("[preview/analysis] classification failed:", err);
      return enginePositions;
    }
  }, [enginePositions, loadedGame]);

  // G9: derive real key moments from classification. Production's
  // SurpriseAnalyzer is a separate Stockfish pass that adds a lot of
  // build-time cost; instead we use the classification we already have
  // and lift Brilliant + Great into "brilliant" markers, Blunder + Miss
  // into "mistake" markers. Falls back to the hand-curated Kasparov
  // KEY_MOMENTS constant when classification isn't ready or the demo is
  // still the seed game (isDemoGame), so the demo experience is
  // unchanged.
  const liveKeyMoments = useMemo<KeyMoment[]>(() => {
    if (!classifiedPositions || isDemoGame) return KEY_MOMENTS;
    const moments: KeyMoment[] = [];
    for (let ply = 1; ply < classifiedPositions.length; ply++) {
      const cls = classifiedPositions[ply]?.moveClassification;
      if (!cls) continue;
      const move = loadedGame.history({ verbose: true })[ply - 1];
      if (!move) continue;
      const num = Math.ceil(ply / 2);
      const dots = ply % 2 === 1 ? "." : "...";
      const label = `${num}${dots}${move.san}`;
      if (
        cls === MoveClassification.Brilliant ||
        cls === MoveClassification.Great
      ) {
        moments.push({ ply, label, kind: "brilliant" });
      } else if (
        cls === MoveClassification.Mistake ||
        cls === MoveClassification.Blunder ||
        cls === MoveClassification.Miss
      ) {
        moments.push({ ply, label, kind: "mistake" });
      }
    }
    return moments;
  }, [classifiedPositions, isDemoGame, loadedGame]);

  // Whenever the loaded game OR engine settings change, clear the analysis
  // cache so Stockfish re-runs. allMoves derives from loadedGame so
  // depending on .length alone misses the case where a different game of
  // the same length is loaded.
  useEffect(() => {
    setEnginePositions(null);
    setGameEvalFull(null);
    setAnalysisProgress(0);
    setAnalysisError(null);
  }, [loadedGame, engineSettings.depth, engineSettings.engineName]);

  // Per-FEN analysis cache (sessionStorage, scoped to this browser session).
  // Keyed by a cheap hash of the PGN + engine settings. Restoring a cached
  // analysis is a tabbed-loop power user's superpower: open the same game
  // twice, the second visit is instant. djb2 hash keeps the key short and
  // collision-tolerant for our use case (cached value re-validates against
  // the same PGN on next read anyway).
  const cacheKey = useMemo(() => {
    try {
      const pgn = loadedGame.pgn() || loadedGame.fen();
      let h = 5381;
      for (let i = 0; i < pgn.length; i++) {
        h = ((h << 5) + h + pgn.charCodeAt(i)) >>> 0;
      }
      return `cm-preview-eval-${h.toString(16)}-d${engineSettings.depth}-${engineSettings.engineName}`;
    } catch {
      return null;
    }
  }, [loadedGame, engineSettings.depth, engineSettings.engineName]);

  // Restore on game/settings change
  useEffect(() => {
    if (!cacheKey || enginePositions || analysisError) return;
    if (typeof window === "undefined") return;
    try {
      const stored = window.sessionStorage.getItem(cacheKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as PositionEval[];
      if (Array.isArray(parsed) && parsed.length === allMoves.length + 1) {
        setEnginePositions(parsed);
        setAnalysisProgress(100);
      }
    } catch {
      /* corrupted entry — let Stockfish re-run */
    }
  }, [cacheKey, enginePositions, analysisError, allMoves.length]);

  // Save when analysis completes
  useEffect(() => {
    if (!cacheKey || !enginePositions) return;
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(cacheKey, JSON.stringify(enginePositions));
    } catch {
      /* quota exhausted — skip silently */
    }
  }, [cacheKey, enginePositions]);

  // G15: also push every position eval into the production savedEvalsAtom
  // so the rest of the site (production /analysis, /play eval-bar, etc.)
  // can hydrate from the same analysis without re-running Stockfish.
  // Keyed by FEN per production convention (panelHeader/analyzeButton.tsx).
  const setSavedEvals = useSetAtom(savedEvalsAtom);
  useEffect(() => {
    if (!enginePositions) return;
    let fens: string[] = [];
    try {
      fens = getEvaluateGameParams(loadedGame).fens;
    } catch {
      return;
    }
    if (fens.length !== enginePositions.length) return;
    const gameSavedEvals = fens.reduce<SavedEvals>((acc, fen, idx) => {
      acc[fen] = {
        ...enginePositions[idx],
        engine: engineSettings.engineName,
      };
      return acc;
    }, {} as SavedEvals);
    setSavedEvals((prev) => ({ ...prev, ...gameSavedEvals }));
  }, [enginePositions, loadedGame, engineSettings.engineName, setSavedEvals]);

  const mockEvalSeries = useMemo(
    () => buildMockEval(allMoves.length + 1),
    [allMoves.length]
  );
  const evalSeries = useMemo<number[]>(() => {
    if (!enginePositions) return mockEvalSeries;
    return enginePositions.map((p) => {
      const line = p.lines?.[0];
      if (!line) return 0;
      if (typeof line.mate === "number") return line.mate > 0 ? 10 : -10;
      if (typeof line.cp === "number")
        return Math.max(-12, Math.min(12, line.cp / 100));
      return 0;
    });
  }, [enginePositions, mockEvalSeries]);
  const analysisActive = engine !== null && enginePositions === null && analysisError === null;

  useEffect(() => {
    if (!engine || enginePositions || analysisError) return;
    if (!allMoves.length) return;
    let cancelled = false;
    const params = getEvaluateGameParams(loadedGame);
    setAnalysisProgress(1);
    engine
      .evaluateGame({
        ...params,
        depth: engineSettings.depth,
        // UciEngine guards multiPv into [2, 10] (`Invalid MultiPV value`).
        // We render only the top line in the eval curve, but the coach
        // prompt's "TOP MISTAKES" section in /api/enhanced-analysis emits
        // up to three candidate lines per mistake (see route.ts where it
        // walks evalBefore.lines[0..2]). multiPv: 2 silently truncated
        // that to two candidates and made computeCandidateGap blind to
        // the user's actual move whenever it was line #3 or worse. 3 is
        // the sweet spot for analysis quality without a meaningful
        // latency hit on Stockfish17Lite.
        multiPv: 3,
        workersNb: 1,
        setEvaluationProgress: (v) => {
          if (!cancelled) setAnalysisProgress(v);
        },
      })
      .then((result) => {
        if (cancelled) return;
        setEnginePositions(result.positions);
        setGameEvalFull(result);
        setAnalysisProgress(100);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[preview/analysis] Stockfish failed:", msg);
        setAnalysisError(msg);
      });
    return () => {
      cancelled = true;
    };
  }, [
    engine,
    loadedGame,
    allMoves.length,
    enginePositions,
    analysisError,
    engineSettings.depth,
  ]);

  const [currentPly, setCurrentPly] = useState(0);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">(
    "white"
  );

  // ─── Production-parity personalization extras for the deep coach path ───
  // Production's AICoachChat (line 2459-2487) threads playerColor +
  // playerColorName + boardOrientation + username + chess-platform handles
  // into every /api/enhanced-analysis request. The server uses these to
  // compose the system prompt (perspective, addressing, accuracy/Elo
  // overview). Without them the LLM drops to a generic reply tone — visibly
  // less specific than the prod surface. Recompute once per relevant input
  // change so the three streamCoachReply call sites can spread it.
  // Coach personality — final enhanced-analysis parity field. Persisted
  // across sessions via localStorage so the user's chosen voice sticks.
  // The picker UI sits in CoachPanel's header chip; this is the source
  // of truth that flows into coachExtras → request body.
  const [selectedPersonalityId, setSelectedPersonalityId] =
    useLocalStorage<string>(
      "cm-preview-personality",
      defaultPersonalityId
    );
  const personality = useMemo(
    () => getPersonalityById(selectedPersonalityId ?? defaultPersonalityId),
    [selectedPersonalityId]
  );

  const coachExtras = useMemo(() => {
    const playerColor: "w" | "b" =
      boardOrientation === "white" ? "w" : "b";
    let chesscomUsername: string | undefined;
    let lichessUsername: string | undefined;
    if (typeof window !== "undefined") {
      try {
        chesscomUsername =
          window.localStorage
            .getItem("chesscom-username")
            ?.replace(/^"|"$/g, "") || undefined;
        lichessUsername =
          window.localStorage
            .getItem("lichess-username")
            ?.replace(/^"|"$/g, "") || undefined;
      } catch {
        /* localStorage unavailable */
      }
    }
    return {
      playerColor,
      playerColorName: boardOrientation,
      boardOrientation,
      username:
        user?.displayName ?? user?.email?.split("@")[0] ?? undefined,
      chesscomUsername,
      lichessUsername,
      personalityId: personality.id,
    };
  }, [
    boardOrientation,
    user?.displayName,
    user?.email,
    personality.id,
  ]);

  // In puzzle mode, prepopulate the coach with a contextual seed message
  const isPuzzleMode = Boolean(puzzleFen);

  // Production's killer "you blundered, here are puzzles for that exact
  // pattern" UX — surfaces when the current ply is a Mistake / Blunder /
  // Miss. Drives the inline ContextualPuzzleRecommendations mount inside
  // the Coach tab. Heavy lifting (mistake → puzzles via /api/mistake-puzzles)
  // is delegated to the production component; we just compute the input.
  const mistakeContext = useMemo<{
    fen: string;
    movePlayed: string;
    correctMove: string;
    evalBefore: number;
    evalAfter: number;
    tacticalMotifs: string[];
  } | null>(() => {
    if (!classifiedPositions || currentPly < 1) return null;
    const played = classifiedPositions[currentPly];
    const cls = played?.moveClassification;
    if (
      cls !== MoveClassification.Mistake &&
      cls !== MoveClassification.Blunder &&
      cls !== MoveClassification.Miss
    )
      return null;

    const prev = classifiedPositions[currentPly - 1];
    if (!prev?.lines?.[0]) return null;

    const move = allMoves[currentPly - 1];
    if (!move) return null;

    const bestUci = prev.lines[0].pv?.[0] ?? "";
    const correctMove =
      bestUci.length >= 4 ? bestUci.slice(0, 2) + bestUci.slice(2, 4) : "";

    // FEN at the position BEFORE the mistake.
    const g = new Chess();
    for (let i = 0; i < currentPly - 1 && i < allMoves.length; i++) {
      g.move(allMoves[i]);
    }
    const fenAtMistake = g.fen();

    const evalBefore = prev.lines[0].cp ?? 0;
    const evalAfter = played?.lines?.[0]?.cp ?? 0;

    return {
      fen: fenAtMistake,
      movePlayed: move.san,
      correctMove,
      evalBefore,
      evalAfter,
      // tacticalMotifs left empty for now — /api/mistake-puzzles handles
      // the empty case via rating-band fallback. G14 wires real motif
      // extraction.
      tacticalMotifs: [],
    };
  }, [classifiedPositions, currentPly, allMoves]);

  // Derived: current FEN + last move + check by replaying moves up to currentPly
  const { currentFen, lastMove, isInCheck } = useMemo(() => {
    const g = new Chess();
    let last: Move | null = null;
    for (let i = 0; i < currentPly; i++) {
      const result = g.move(allMoves[i]);
      if (result) last = result;
    }
    return {
      currentFen: g.fen(),
      lastMove: last,
      isInCheck: g.inCheck(),
    };
  }, [allMoves, currentPly]);

  // Command palette state
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [loadGameOpen, setLoadGameOpen] = useState(false);
  const [shareDialog, setShareDialog] = useState<{
    msg: CoachMessage;
    fen: string;
  } | null>(null);

  // Coach chat state (persists across takeover toggle — chat history intact)
  const [messages, setMessages] = useState<CoachMessage[]>(
    isPuzzleMode
      ? [
          {
            role: "coach",
            content: solutionParam
              ? `Loaded a puzzle position. Solution: **${solutionParam.replace("-", " → ")}**. Ask me anything about the tactical idea, or try alternatives on the board.`
              : `Loaded a puzzle position. Ask me to walk through the tactical idea.`,
            ply: 0,
          },
        ]
      : SEED_MESSAGES
  );
  const [input, setInput] = useState(
    promptParam ? decodeURIComponent(promptParam) : ""
  );
  const [isThinking, setIsThinking] = useState(false);

  // Coach context cache — minted by the first /api/enhanced-analysis call,
  // reused on every follow-up /api/chat call. Reset on game change so the
  // server doesn't return analysis grounded in the previous game. Also
  // reset on personality change — the fast path (/api/chat) only sends
  // contextId+userMessage+conversationHistory, so it'd silently keep the
  // OLD personality's cached prompt until the user switched games. By
  // dropping the contextId we force the next message back through the
  // deep path, which re-mints context under the new persona.
  const coachContextIdRef = useRef<string | null>(null);
  useEffect(() => {
    coachContextIdRef.current = null;
  }, [loadedGame, selectedPersonalityId]);

  // Replace the loaded game from a fresh Chess instance (e.g. user pasted
  // a PGN, or a URL param brought one in). Resets cursor + seed chat +
  // analysis cache via the useEffect on [loadedGame]. Pass keepChat=true
  // to preserve existing message history (e.g. on insight permalinks).
  const loadNewGame = useCallback(
    (game: Chess, opts?: { keepChat?: boolean; greeting?: string }) => {
      setLoadedGame(game);
      setIsDemoGame(false);
      setCurrentPly(0);
      // G13: smart color detection on imports. If the PGN headers point at
      // chess.com or lichess.org AND we have a known username (stashed in
      // localStorage by the LichessInput / ChessComInput loaders, or from
      // the signed-in profile), flip the board so the user is at the
      // bottom. Falls through silently otherwise.
      try {
        if (typeof window !== "undefined") {
          const headerSite = (game.header().Site ?? "").toLowerCase();
          let source: "chesscom" | "lichess" | undefined;
          if (headerSite.includes("chess.com")) source = "chesscom";
          else if (headerSite.includes("lichess.org")) source = "lichess";
          if (source) {
            const stored =
              source === "lichess"
                ? window.localStorage.getItem("lichess-username")
                : window.localStorage.getItem("chesscom-username");
            const cleanStored = stored ? stored.replace(/^"|"$/g, "") : null;
            const username =
              cleanStored ||
              user?.displayName ||
              user?.email?.split("@")[0] ||
              undefined;
            const info = extractImportedGameInfo(game, source, username);
            const detection = detectUserColor(game, info);
            if (detection.method === "username_match") {
              setBoardOrientation(detection.userColor);
            }
          }
        }
      } catch {
        /* defensive — color detection should never block a game load */
      }
      // Sentry breadcrumb so debugging "the page broke on my Lichess game"
      // has the actual PGN at hand without us having to ask.
      try {
        const hdr = game.header();
        setSentryContext("loadedGame", {
          pgn: game.pgn().slice(0, 4096),
          white: hdr.White,
          black: hdr.Black,
          event: hdr.Event,
          date: hdr.Date,
          moves: game.history().length,
        });
      } catch {
        /* sentry failures are never user-facing */
      }
      if (!opts?.keepChat) {
        const newHeaders = game.header();
        const greeting =
          opts?.greeting ??
          (newHeaders.White && newHeaders.Black
            ? `Loaded **${newHeaders.White} vs ${newHeaders.Black}**${
                newHeaders.Date ? ` (${newHeaders.Date.split(".")[0]})` : ""
              }. Stockfish is running in the background; once it's done the Moves tab will light up with classifications. Ask me about any move.`
            : `Loaded a new game. Stockfish is running in the background. Ask me anything about the position or a specific move.`);
        setMessages([{ role: "coach", content: greeting, ply: 0 }]);
      }
    },
    []
  );

  // ───── URL-param + localStorage ingestion (mirrors production /analysis) ─────
  // Each handler dedupes via a ref so navigation back/forward (or React's
  // double-render in strict mode) doesn't re-load the same game.
  const pgnLoadedRef = useRef(false);
  const fenLoadedRef = useRef(false);
  const lichessReviewLoadedRef = useRef(false);
  const insightLoadedRef = useRef(false);

  // ?pgn=<url-encoded PGN>
  useEffect(() => {
    if (!router.isReady || pgnLoadedRef.current) return;
    const raw = router.query.pgn;
    if (typeof raw !== "string" || !raw) return;
    try {
      const decoded = decodeURIComponent(raw);
      const g = new Chess();
      g.loadPgn(decoded);
      pgnLoadedRef.current = true;
      loadNewGame(g);
    } catch (err) {
      console.warn("[preview/analysis] malformed ?pgn= param:", err);
    }
  }, [router.isReady, router.query.pgn, loadNewGame]);

  // ?fen=<url-encoded FEN> — load a single position, no PGN history
  useEffect(() => {
    if (!router.isReady || fenLoadedRef.current) return;
    if (router.query.pgn) return; // pgn wins
    const raw = router.query.fen;
    if (typeof raw !== "string" || !raw) return;
    try {
      const decoded = decodeURIComponent(raw);
      const g = new Chess(decoded); // throws on invalid
      fenLoadedRef.current = true;
      loadNewGame(g, {
        greeting: `Loaded a custom position (\`${decoded.split(" ")[1] === "w" ? "White" : "Black"}\` to move). Stockfish is running. Ask me anything about the position.`,
      });
      setBoardOrientation(decoded.split(" ")[1] === "w" ? "white" : "black");
    } catch (err) {
      console.warn("[preview/analysis] malformed ?fen= param:", err);
    }
  }, [router.isReady, router.query.fen, router.query.pgn, loadNewGame]);

  // ?lichessReview=1 + localStorage('lichess-review-pgn')
  useEffect(() => {
    if (!router.isReady || lichessReviewLoadedRef.current) return;
    if (router.query.lichessReview !== "1") return;
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("lichess-review-pgn");
    if (!stored) return;
    try {
      window.localStorage.removeItem("lichess-review-pgn");
      const g = new Chess();
      g.loadPgn(stored);
      lichessReviewLoadedRef.current = true;
      loadNewGame(g);
      // Clean up the URL after ingest so refreshes don't try to re-load
      router.replace("/preview/analysis", undefined, { shallow: true });
    } catch (err) {
      console.warn("[preview/analysis] malformed lichess-review payload:", err);
    }
  }, [router.isReady, router.query.lichessReview, loadNewGame, router]);

  // ?insightId=<id> — permalink to a saved coach insight. Fetches
  // /api/insights/{id} and hydrates the chat with the saved transcript.
  useEffect(() => {
    if (!router.isReady || insightLoadedRef.current) return;
    const id = router.query.insightId;
    if (typeof id !== "string" || !id) return;
    insightLoadedRef.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/insights/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(`insight fetch HTTP ${res.status}`);
        const data = await res.json();
        // Hydrate game state. The insight may carry pgn or just fen.
        if (typeof data.pgn === "string" && data.pgn.length > 0) {
          const g = new Chess();
          g.loadPgn(data.pgn);
          loadNewGame(g, { keepChat: true });
        } else if (typeof data.fen === "string" && data.fen.length >= 10) {
          const g = new Chess(data.fen);
          loadNewGame(g, { keepChat: true });
          setBoardOrientation(data.fen.split(" ")[1] === "w" ? "white" : "black");
        }
        // Hydrate chat transcript or single message
        if (data.kind === "transcript" && Array.isArray(data.transcript)) {
          const transcriptMessages: CoachMessage[] = data.transcript.map(
            (m: { role: string; content: string }) => ({
              role: m.role === "user" ? "user" : "coach",
              content: m.content,
              ply: 0,
            })
          );
          setMessages(transcriptMessages);
        } else if (data.kind === "single" && typeof data.coachContent === "string") {
          setMessages([
            {
              role: "coach",
              content: data.coachContent,
              ply: 0,
            },
          ]);
        }
      } catch (err) {
        console.warn("[preview/analysis] insight fetch failed:", err);
      }
    })();
  }, [router.isReady, router.query.insightId, loadNewGame]);

  // Right-column tab selection. Masters tab makes the main board interactive
  // for exploration (same behavior the old modal "takeover" provided). The
  // tab swap replaces the previous Coach↔Masters modal animation.
  const [rightTab, setRightTab] = useState<RightTab>("coach");
  const takeoverMode = rightTab === "masters"; // legacy alias kept for board props
  // Optional previewed move while exploring with Masters tab open — replays
  // from currentFen so the live candidate list updates on the new position.
  const [takeoverPreview, setTakeoverPreview] = useState<{
    fen: string;
    from: string;
    to: string;
    san: string;
  } | null>(null);

  // Arrow toggle state (Engine best / Most common / Game played / Maia)
  const [arrowToggles, setArrowToggles] = useState<ArrowToggleState>(
    DEFAULT_ARROW_TOGGLES
  );

  // Live candidate list from the takeover panel (master DB) — used to
  // overlay top-3 candidate arrows on the board while takeover is active.
  const [takeoverCandidates, setTakeoverCandidates] = useState<
    MasterCandidate[]
  >([]);

  // Drill mode — puzzle promoted onto the main board. Coach chat persists
  // alongside the drill so the user can chat with the coach about the
  // puzzle while solving. "Return to game" restores `currentPly` from the
  // saved snapshot; the message log is never mutated, so chat history
  // survives the round-trip automatically.
  const [drillState, setDrillState] = useState<DrillState | null>(null);
  const drillActive = drillState !== null && drillState.status !== "complete";
  // Bumped to force the board to re-sync to React-state FEN. Chessground
  // commits a drag visually before the move event fires, so a rejected
  // move (wrong puzzle solution) leaves the piece on the wrong square
  // until we explicitly re-set the position. Same for puzzle transitions.
  const [boardSyncTick, setBoardSyncTick] = useState(0);
  const bumpBoardSync = useCallback(() => setBoardSyncTick((t) => t + 1), []);

  // Board FEN + last move switch when previewing in takeover mode or
  // when a puzzle has been promoted to the main board (drill mode).
  // Drill wins over takeover wins over the canonical game position.
  const displayFen = drillState
    ? drillState.currentFen
    : takeoverPreview?.fen ?? currentFen;
  const displayLastMove = useMemo<Move | null>(() => {
    if (drillState) {
      return drillState.lastMove
        ? ({
            from: drillState.lastMove.from,
            to: drillState.lastMove.to,
            san: "",
          } as Move)
        : null;
    }
    if (takeoverPreview) {
      return {
        from: takeoverPreview.from,
        to: takeoverPreview.to,
        san: takeoverPreview.san,
      } as Move;
    }
    return lastMove;
  }, [drillState, takeoverPreview, lastMove]);

  // In-check indicator must reflect the displayed position, not the canonical
  // game position (otherwise a puzzle FEN with check won't show the red glow).
  const displayInCheck = useMemo(() => {
    if (drillState) return new Chess(drillState.currentFen).inCheck();
    if (takeoverPreview) return new Chess(takeoverPreview.fen).inCheck();
    return isInCheck;
  }, [drillState, takeoverPreview, isInCheck]);

  // Color to move on the displayed position (for interactive board in takeover)
  const turnToMove = useMemo<"white" | "black">(() => {
    const c = new Chess(displayFen);
    return c.turn() === "w" ? "white" : "black";
  }, [displayFen]);

  // Legal destinations from the current displayed position
  const displayDests = useMemo<Map<string, string[]>>(() => {
    const c = new Chess(displayFen);
    const m = new Map<string, string[]>();
    c.moves({ verbose: true }).forEach((mv) => {
      const arr = m.get(mv.from) ?? [];
      arr.push(mv.to);
      m.set(mv.from, arr);
    });
    return m;
  }, [displayFen]);

  // Computed arrow shapes from toggles + takeover state
  const displayShapes = useMemo<DrawShape[]>(() => {
    const shapes: DrawShape[] = [];

    // In takeover (no specific candidate selected yet): show the top 3 master
    // moves as fan-out arrows. Brightest for the most-played, dimmer for the
    // alternatives. Gives an instant visual of "what masters do here."
    if (takeoverMode && !takeoverPreview && takeoverCandidates.length > 0) {
      const topThree = takeoverCandidates.slice(0, 3);
      topThree.forEach((c, i) => {
        if (!c.uci || c.uci.length < 4) return;
        shapes.push({
          orig: c.uci.slice(0, 2),
          dest: c.uci.slice(2, 4),
          brush: i === 0 ? "green" : "paleGreen",
        });
      });
    }

    // Takeover preview always wins visibility — gold arrow (overlays the
    // top-3 fan-out so the user sees their selection clearly)
    if (takeoverPreview) {
      shapes.push({
        orig: takeoverPreview.from,
        dest: takeoverPreview.to,
        brush: "gold",
      });
    }

    // Engine best (green)
    if (arrowToggles.best) {
      const best = ENGINE_BEST[currentPly];
      if (best) shapes.push(uciToShape(best, ARROW_PALETTE.best.brush));
    }

    // Most common from master DB (blue)
    if (arrowToggles.common) {
      const cands = getMasterCandidates(currentPly);
      const top = cands[0];
      if (top) shapes.push(uciToShape(top.uci, ARROW_PALETTE.common.brush));
    }

    // Game played — the move that was actually played at currentPly+1
    if (arrowToggles.game) {
      const nextMove = allMoves[currentPly];
      if (nextMove) {
        shapes.push({
          orig: nextMove.from,
          dest: nextMove.to,
          brush: ARROW_PALETTE.game.brush,
        });
      }
    }

    // Maia at the selected ELO (purple). Prefer the live /api/maia-predict
    // result for the current FEN+ELO; fall back to the hand-table for the
    // Kasparov demo so the arrow shows during the in-flight fetch and stays
    // useful when MAIA_API_URL is unconfigured.
    if (arrowToggles.maia) {
      const cacheKey = `${currentFen}|${arrowToggles.maiaElo}`;
      const live = maiaCache[cacheKey];
      const maia = live ?? findMaiaMoveFromTable(currentPly, arrowToggles.maiaElo);
      if (maia) shapes.push(uciToShape(maia, ARROW_PALETTE.maia.brush));
    }

    return shapes;
  }, [
    takeoverMode,
    takeoverPreview,
    takeoverCandidates,
    arrowToggles,
    currentPly,
    allMoves,
    currentFen,
    maiaCache,
  ]);

  // G8 fetch effect: when the Maia toggle is on and the (fen, elo) pair
  // isn't cached, hit /api/maia-predict. Silent on 401/503/network errors
  // — the displayShapes memo falls back to the cold-start table.
  useEffect(() => {
    if (!arrowToggles.maia) return;
    const cacheKey = `${currentFen}|${arrowToggles.maiaElo}`;
    if (maiaCache[cacheKey]) return;
    if (maiaInFlightRef.current.has(cacheKey)) return;
    maiaInFlightRef.current.add(cacheKey);
    fetch("/api/maia-predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        fen: currentFen,
        rating: arrowToggles.maiaElo,
        opponent_rating: arrowToggles.maiaElo,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { humanLikeMove?: string } | null) => {
        if (data?.humanLikeMove) {
          setMaiaCache((m) => ({ ...m, [cacheKey]: data.humanLikeMove! }));
        }
      })
      .catch(() => {
        /* silent — fallback table covers it */
      })
      .finally(() => {
        maiaInFlightRef.current.delete(cacheKey);
      });
  }, [currentFen, arrowToggles.maia, arrowToggles.maiaElo, maiaCache]);

  const handleTabChange = useCallback(
    (next: RightTab) => {
      setRightTab(next);
      if (next !== "masters") {
        // Leaving the Masters tab → clear exploration preview + candidates
        setTakeoverPreview(null);
        setTakeoverCandidates([]);
      }
    },
    []
  );
  const handleTakeoverPreviewMove = useCallback(
    (uci: string, san: string) => {
      // Play on top of the currently displayed position so chained clicks
      // walk the opening tree (engine state must follow the preview cursor,
      // not stay pinned to the canonical game's FEN).
      const g = new Chess(displayFen);
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const result = g.move({ from, to, promotion: "q" });
      if (result) {
        setTakeoverPreview({ fen: g.fen(), from, to, san });
      }
    },
    [displayFen]
  );

  // User makes a move on the board directly (interactive in takeover mode)
  const handleBoardMove = useCallback(
    (orig: string, dest: string) => {
      // Replay from the currently displayed position (preview or canonical)
      const g = new Chess(displayFen);
      const result = g.move({ from: orig, to: dest, promotion: "q" });
      if (result) {
        setTakeoverPreview({
          fen: g.fen(),
          from: orig,
          to: dest,
          san: result.san,
        });
      }
    },
    [displayFen]
  );
  const handleTakeoverSendToCoach = useCallback(
    async (message: string, candidate?: MasterCandidate) => {
      const prevForApi = messages;
      setMessages((prev) => [
        ...prev,
        { role: "user", content: message, ply: currentPly },
      ]);
      setIsThinking(true);

      // Build a rich insight card we'll attach to the coach's response —
      // structured data the LLM doesn't have direct access to.
      const insight = candidate
        ? {
            tag: `${candidate.san} — Master line`,
            eval:
              typeof candidate.eval === "number"
                ? `${candidate.eval >= 0 ? "+" : ""}${(candidate.eval / 100).toFixed(2)}`
                : candidate.count > 0
                ? `${(candidate.count / 1_000_000).toFixed(1)}M games`
                : undefined,
            classification:
              candidate.rank === 2
                ? "Best move (engine)"
                : candidate.rank === 1
                ? "Sound continuation"
                : candidate.rank === 0
                ? "Neutral"
                : candidate.topPlayer
                ? `Played by ${candidate.topPlayer.name}`
                : undefined,
          }
        : undefined;

      // Add placeholder coach message (with insight already attached) that
      // streamCoachReply will fill in delta-by-delta.
      setMessages((prev) => [
        ...prev,
        { role: "coach", content: "", ply: currentPly, insight },
      ]);

      let accumulated = "";
      try {
        await streamCoachReply({
          prevMessages: prevForApi,
          userText: message,
          fen: displayFen,
          currentPly,
          allMoves,
          loadedGame,
          enginePositions,
          gameEvalFull,
          contextIdRef: coachContextIdRef,
          ...coachExtras,
          onDelta: (chunk) => {
            accumulated += chunk;
            setMessages((prev) => {
              if (prev.length === 0) return prev;
              const last = prev[prev.length - 1];
              if (last.role !== "coach") return prev;
              return [
                ...prev.slice(0, -1),
                { ...last, content: accumulated },
              ];
            });
          },
        });
      } catch (err) {
        const errorText =
          err instanceof CoachAuthError
            ? "**Sign-in required** — the coach endpoint is auth-gated."
            : err instanceof CoachApiError
            ? `**Coach is offline** (HTTP ${err.status}).`
            : "**Network error** reaching the coach.";
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (last.role !== "coach") return prev;
          return [
            ...prev.slice(0, -1),
            { ...last, content: errorText },
          ];
        });
      } finally {
        setIsThinking(false);
      }
    },
    [messages, currentPly, displayFen, allMoves]
  );

  // Played SAN — what was played at the CURRENT canonical position (for the
  // "PLAYED" badge in the takeover list). Only highlights when the user is
  // still on the canonical position (no exploration / preview).
  const playedSanAtPly = useMemo<string | undefined>(() => {
    if (takeoverPreview) return undefined;
    return allMoves[currentPly]?.san;
  }, [allMoves, currentPly, takeoverPreview]);

  // ───── Drill handlers ─────
  // Promote a puzzle from a coach pack onto the main board. Saves the game
  // ply + orientation so "Return to game" restores them. Snaps the board
  // orientation to the side-to-move so the user always plays from the bottom.
  // ─── Drill timing constants (mirrored from src/components/InlinePuzzleSet.tsx) ───
  const OPP_REPLY_DELAY_MS = 400;
  const WRONG_FLASH_MS = 1200;
  const SOLVED_ADVANCE_MS = 700;

  const handlePromoteToBoard = useCallback(
    (puzzles: DrillPuzzle[], startIndex: number) => {
      const puzzle = puzzles[startIndex];
      if (!puzzle) return;
      if (takeoverMode) {
        setRightTab("coach");
        setTakeoverPreview(null);
        setTakeoverCandidates([]);
      }
      const orient: "white" | "black" =
        new Chess(puzzle.fen).turn() === "w" ? "white" : "black";
      setBoardOrientation(orient);
      setDrillState({
        puzzles,
        currentIndex: startIndex,
        currentMoveIndex: 0,
        currentFen: puzzle.fen,
        status: "solving",
        wrongAttempts: 0,
        lastMove: null,
        savedPly: currentPly,
        savedOrientation: boardOrientation,
      });
      bumpBoardSync();
    },
    [boardOrientation, currentPly, takeoverMode, bumpBoardSync]
  );

  const exitDrill = useCallback(() => {
    setDrillState((prev) => {
      if (!prev) return prev;
      setCurrentPly(prev.savedPly);
      setBoardOrientation(prev.savedOrientation);
      return null;
    });
    bumpBoardSync();
  }, [bumpBoardSync]);

  const restartDrill = useCallback(() => {
    setDrillState((prev) => {
      if (!prev) return prev;
      const first = prev.puzzles[0];
      const orient: "white" | "black" =
        new Chess(first.fen).turn() === "w" ? "white" : "black";
      setBoardOrientation(orient);
      return {
        ...prev,
        currentIndex: 0,
        currentMoveIndex: 0,
        currentFen: first.fen,
        status: "solving",
        wrongAttempts: 0,
        lastMove: null,
      };
    });
    bumpBoardSync();
  }, [bumpBoardSync]);

  const advanceDrill = useCallback(() => {
    setDrillState((prev) => {
      if (!prev) return prev;
      const nextIndex = prev.currentIndex + 1;
      if (nextIndex >= prev.puzzles.length) {
        return { ...prev, status: "complete" };
      }
      const next = prev.puzzles[nextIndex];
      const orient: "white" | "black" =
        new Chess(next.fen).turn() === "w" ? "white" : "black";
      setBoardOrientation(orient);
      return {
        ...prev,
        currentIndex: nextIndex,
        currentMoveIndex: 0,
        currentFen: next.fen,
        status: "solving",
        wrongAttempts: 0,
        lastMove: null,
      };
    });
    bumpBoardSync();
  }, [bumpBoardSync]);

  // User moves a piece while a drill is in flight. Validate against the
  // puzzle solution: correct → auto-play opponent's reply (if any) then
  // advance state; wrong → flash red, REVERT the visual board (chessground
  // commits the drag before this fires, so we must explicitly re-sync).
  const handleDrillMove = useCallback(
    (orig: string, dest: string) => {
      if (!drillState || drillState.status !== "solving") return;
      const puzzle = drillState.puzzles[drillState.currentIndex];
      if (!puzzle) return;
      const expected = puzzle.solution[drillState.currentMoveIndex];
      if (!expected) return;
      const expFrom = expected.slice(0, 2);
      const expTo = expected.slice(2, 4);
      const expPromo = expected.length >= 5 ? expected[4] : undefined;

      if (orig !== expFrom || dest !== expTo) {
        // Wrong move — revert the board visually, flash red, then resume
        bumpBoardSync(); // chessground locally moved the piece; force re-sync
        setDrillState((prev) =>
          prev
            ? {
                ...prev,
                status: "wrong",
                wrongAttempts: prev.wrongAttempts + 1,
              }
            : prev
        );
        setTimeout(() => {
          setDrillState((prev) =>
            prev && prev.status === "wrong"
              ? { ...prev, status: "solving" }
              : prev
          );
        }, WRONG_FLASH_MS);
        return;
      }

      // Correct move — apply it
      const game = new Chess(drillState.currentFen);
      const userMove = game.move({
        from: orig,
        to: dest,
        promotion: expPromo ?? "q",
      });
      if (!userMove) {
        console.warn("[drill] expected move was illegal:", expected);
        bumpBoardSync();
        return;
      }
      const afterUserFen = game.fen();
      const newIdx = drillState.currentMoveIndex + 1;

      if (newIdx >= puzzle.solution.length) {
        // Puzzle solved with user's move (no opp reply needed)
        setDrillState((prev) =>
          prev
            ? {
                ...prev,
                currentFen: afterUserFen,
                currentMoveIndex: newIdx,
                status: "solved",
                lastMove: { from: orig, to: dest },
              }
            : prev
        );
        setTimeout(() => advanceDrill(), SOLVED_ADVANCE_MS);
        return;
      }

      // User move applied — show it on the board, then schedule opponent reply
      setDrillState((prev) =>
        prev
          ? {
              ...prev,
              currentFen: afterUserFen,
              currentMoveIndex: newIdx,
              status: "solving",
              lastMove: { from: orig, to: dest },
            }
          : prev
      );

      // Opponent reply on a delay so the user actually sees their own move
      setTimeout(() => {
        setDrillState((prev) => {
          if (!prev || prev.status !== "solving") return prev;
          if (prev.currentIndex !== drillState.currentIndex) return prev;
          const p = prev.puzzles[prev.currentIndex];
          if (!p) return prev;
          const oppUci = p.solution[prev.currentMoveIndex];
          if (!oppUci) return prev;
          const oppFrom = oppUci.slice(0, 2);
          const oppTo = oppUci.slice(2, 4);
          const oppPromo = oppUci.length >= 5 ? oppUci[4] : undefined;
          const g = new Chess(prev.currentFen);
          const oppMove = g.move({
            from: oppFrom,
            to: oppTo,
            promotion: oppPromo ?? "q",
          });
          if (!oppMove) {
            console.warn("[drill] opponent reply illegal:", oppUci);
            return prev;
          }
          const newMoveIdx = prev.currentMoveIndex + 1;
          const oppSolved = newMoveIdx >= p.solution.length;
          if (oppSolved) {
            setTimeout(() => advanceDrill(), SOLVED_ADVANCE_MS);
          }
          return {
            ...prev,
            currentFen: g.fen(),
            currentMoveIndex: newMoveIdx,
            status: oppSolved ? "solved" : "solving",
            lastMove: { from: oppFrom, to: oppTo },
          };
        });
      }, OPP_REPLY_DELAY_MS);
    },
    [drillState, advanceDrill, bumpBoardSync]
  );

  // ─── G4: Firestore game persistence (user is hoisted to the top of
  // AnalysisPage so loadNewGame G13 + triggerPuzzleFetch G14 can read it
  // too). ───
  const { addGame, setGameEval } = useGameDatabase();
  const [savedGameId, setSavedGameId] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  // ─── G11: Spaced repetition. We persist every solve via
  // recordPuzzleAttempt (production helper, localStorage-backed) and pass
  // the de-duped solved-id set as excludeIds to every puzzle fetch so the
  // user never re-solves the same one. Ref is the source of truth for
  // fast read; counter forces fresh memo reads after a solve. ───
  const solvedPuzzleIdsRef = useRef<Set<string>>(new Set());
  const [solvedBump, setSolvedBump] = useState(0);
  void solvedBump;

  useEffect(() => {
    try {
      const attempts = getAllAttempts();
      const next = new Set<string>();
      for (const a of attempts) {
        if (a.success) next.add(a.puzzleId);
      }
      solvedPuzzleIdsRef.current = next;
    } catch {
      // localStorage unavailable; treat as empty.
    }
  }, []);

  const recordSolved = useCallback(
    (puzzleId: string, timeSpentSeconds: number, movesPlayed: string[]) => {
      const next = new Set(solvedPuzzleIdsRef.current);
      next.add(puzzleId);
      solvedPuzzleIdsRef.current = next;
      setSolvedBump((b) => b + 1);
      try {
        recordPuzzleAttempt({
          puzzleId,
          userId: user?.uid ?? "anon",
          success: true,
          movesPlayed,
          timeSpentSeconds,
        });
      } catch {
        // Persist is best-effort; the in-memory ref still rules this session.
      }
    },
    [user?.uid]
  );

  // Shared puzzle-pack fetch + attach. msgIdx is the index of the coach
  // message to mutate when the response lands. Returns nothing — purely a
  // side-effect coordinator. Reuses fetchPuzzlesForTheme.
  const triggerPuzzleFetch = useCallback(
    (msgIdx: number, theme: string, displayTheme: string, fen: string) => {
      setMessages((prev) => {
        const next = [...prev];
        const m = next[msgIdx];
        if (!m || m.role !== "coach") return prev;
        next[msgIdx] = {
          ...m,
          puzzlePack: {
            theme,
            displayTheme,
            puzzles: [],
            status: "loading",
          },
        };
        return next;
      });
      (async () => {
        const excludeIds = Array.from(solvedPuzzleIdsRef.current);
        // G14: signed-in users go through /api/adaptive-puzzles first.
        // The endpoint picks themes the user has personally struggled
        // with; if it returns nothing or fails we fall through to the
        // generic similar-puzzles path.
        if (user?.uid) {
          const adaptive = await fetchAdaptivePuzzles(
            user.uid,
            theme,
            3,
            excludeIds
          );
          if (adaptive && adaptive.length > 0) return adaptive;
        }
        return fetchPuzzlesForTheme(fen, theme, 1500, 3, excludeIds);
      })()
        .then((puzzles) => {
          setMessages((prev) => {
            const next = [...prev];
            const m = next[msgIdx];
            if (!m || m.role !== "coach" || !m.puzzlePack) return prev;
            next[msgIdx] = {
              ...m,
              puzzlePack:
                puzzles && puzzles.length > 0
                  ? { ...m.puzzlePack, puzzles, status: "ready" as const }
                  : {
                      ...m.puzzlePack,
                      puzzles: [],
                      status: "error" as const,
                      error: "no matches in current rating band",
                    },
            };
            return next;
          });
        })
        .catch((err: unknown) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          setMessages((prev) => {
            const next = [...prev];
            const m = next[msgIdx];
            if (!m || m.role !== "coach" || !m.puzzlePack) return prev;
            next[msgIdx] = {
              ...m,
              puzzlePack: {
                ...m.puzzlePack,
                status: "error" as const,
                error: errMsg,
              },
            };
            return next;
          });
        });
    },
    []
  );

  // Used by the Moves tab — each move has an "Ask coach" affordance.
  // Switches focus to the Coach tab, jumps the board to the move, then
  // streams a coach explanation about that specific move.

  // Reset save state on game change.
  useEffect(() => {
    setSavedGameId(null);
    setSaveState("idle");
  }, [loadedGame]);

  // When Stockfish completes after a save, push the eval up to cloud.
  useEffect(() => {
    if (!savedGameId || !gameEvalFull) return;
    setGameEval(savedGameId, gameEvalFull).catch((err) => {
      console.warn("[preview/analysis] cloud eval sync failed:", err);
    });
  }, [savedGameId, gameEvalFull, setGameEval]);

  const handleSaveGame = useCallback(async () => {
    if (saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");
    try {
      const gid = await addGame(loadedGame);
      setSavedGameId(gid);
      if (gameEvalFull) {
        await setGameEval(gid, gameEvalFull);
      }
      setSaveState("saved");
    } catch (err) {
      console.warn("[preview/analysis] save game failed:", err);
      setSaveState("error");
    }
  }, [addGame, gameEvalFull, loadedGame, saveState, setGameEval]);

  const handleAskCoachAboutMove = useCallback(
    async (ply: number, san: string) => {
      setRightTab("coach");
      setCurrentPly(ply);
      if (isThinking) return;

      const moveNumber = Math.ceil(ply / 2);
      const sideLabel = ply % 2 === 1 ? "White" : "Black";
      const text = `Walk me through ${moveNumber}.${
        ply % 2 === 1 ? "" : ".."
      }${san}. What's the idea behind ${sideLabel}'s move, what were the alternatives, and what does it change about the position?`;

      const prevForApi = messages;
      setMessages((prev) => [
        ...prev,
        { role: "user", content: text, ply },
        { role: "coach", content: "", ply },
      ]);
      setIsThinking(true);

      // Compute the FEN AT this ply (not at the current display position)
      const g = new Chess();
      for (let i = 0; i < ply && i < allMoves.length; i++) g.move(allMoves[i]);
      const fenAtPly = g.fen();

      let accumulated = "";
      try {
        await streamCoachReply({
          prevMessages: prevForApi,
          userText: text,
          fen: fenAtPly,
          currentPly: ply,
          allMoves,
          loadedGame,
          enginePositions,
          gameEvalFull,
          contextIdRef: coachContextIdRef,
          ...coachExtras,
          onDelta: (chunk) => {
            accumulated += chunk;
            setMessages((prev) => {
              if (prev.length === 0) return prev;
              const last = prev[prev.length - 1];
              if (last.role !== "coach") return prev;
              return [
                ...prev.slice(0, -1),
                { ...last, content: accumulated },
              ];
            });
          },
        });
        const tags = extractPracticeTags(accumulated).tags;
        if (tags.length > 0) {
          const coachMsgIdx = prevForApi.length + 1;
          const first = tags[0];
          setTimeout(
            () =>
              triggerPuzzleFetch(
                coachMsgIdx,
                first.theme,
                first.displayTheme,
                fenAtPly
              ),
            0
          );
        }
      } catch (err) {
        const errorText =
          err instanceof CoachAuthError
            ? "**Sign-in required** — the coach endpoint is auth-gated."
            : err instanceof CoachApiError
            ? `**Coach is offline** (HTTP ${err.status}).`
            : "**Network error** reaching the coach.";
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (last.role !== "coach") return prev;
          return [...prev.slice(0, -1), { ...last, content: errorText }];
        });
      } finally {
        setIsThinking(false);
      }
    },
    [allMoves, isThinking, messages, triggerPuzzleFetch]
  );

  // G6 auto-fire infrastructure: a ref to the latest handleSend so we can
  // dispatch the "Analyze my game" message without a stale closure.
  // useEffect/setState handlers see this ref's `.current` lazily.
  const handleSendRef = useRef<((overrideText?: string) => void) | null>(null);

  // G6 auto-fire: when ?autoAnalyze=1 brought us in AND Stockfish has
  // finished AND we haven't fired yet, dispatch "Analyze my game" and
  // transition to sent-awaiting-insights. Unlocks on first INSIGHT tag.
  useEffect(() => {
    if (autoAnalyzeFiredRef.current) return;
    if (autoAnalyzeState !== "pending") return;
    if (!enginePositions || isThinking) return;
    if (allMoves.length === 0) return;
    autoAnalyzeFiredRef.current = true;
    setAutoAnalyzeState("sent-awaiting-insights");
    handleSendRef.current?.("Analyze my game.");
  }, [autoAnalyzeState, enginePositions, isThinking, allMoves.length]);

  const handleSend = useCallback(async (overrideText?: string) => {
    // Defensive: onSend is wired straight onto the Send IconButton's
    // onClick prop, which would otherwise hand a React MouseEvent down
    // as `overrideText`. Only honour string overrides; anything else
    // (events, undefined) falls back to the input box.
    const override =
      typeof overrideText === "string" ? overrideText : undefined;
    const text = (override ?? input).trim();
    if (!text || isThinking) return;
    // Mirror production AICoachChat:2180 — don't fire deep-coach requests
    // while Stockfish is still computing. gameEval would be undefined,
    // landing the user in the route's no-eval branch where the LLM
    // produces a conversational reply with no grounded mistake insights.
    if (analysisActive) return;
    const prevForApi = messages;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, ply: currentPly },
      // Empty coach message we'll fill in as deltas arrive
      { role: "coach", content: "", ply: currentPly },
    ]);
    setInput("");
    setIsThinking(true);

    let accumulated = "";
    try {
      await streamCoachReply({
        prevMessages: prevForApi,
        userText: text,
        fen: displayFen,
        currentPly,
        allMoves,
        loadedGame,
        enginePositions,
        gameEvalFull,
        contextIdRef: coachContextIdRef,
        ...coachExtras,
        onDelta: (chunk) => {
          accumulated += chunk;
          // Update the last coach message in-place
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            if (last.role !== "coach") return prev;
            return [
              ...prev.slice(0, -1),
              { ...last, content: accumulated },
            ];
          });
        },
      });
      // After stream completes, scan for [PRACTICE:...] tags and trigger
      // a real /api/similar-puzzles fetch per tag. The coach's tag persists
      // in the message content but CoachBubble strips it from display.
      const tags = extractPracticeTags(accumulated).tags;
      if (tags.length > 0) {
        const coachMsgIdx = prevForApi.length + 1; // user, then coach
        const first = tags[0]; // multi-tag pack support is a follow-up
        setTimeout(
          () =>
            triggerPuzzleFetch(
              coachMsgIdx,
              first.theme,
              first.displayTheme,
              displayFen
            ),
          0
        );
      }
      // G6: autoAnalyze completion gate. When the reply contains any
      // [INSIGHT:...] tag, transition the state machine to "done" so
      // the input unlocks. Mirrors AICoachChat.tsx:2038-2047.
      if (
        (autoAnalyzeState === "pending" ||
          autoAnalyzeState === "sent-awaiting-insights") &&
        extractInsightTags(accumulated).insights.length > 0
      ) {
        setAutoAnalyzeState("done");
      }
    } catch (err) {
      const errorText =
        err instanceof CoachAuthError
          ? "**Sign-in required** — the coach endpoint is auth-gated. Sign in on chessmasti.com and refresh."
          : err instanceof CoachApiError
          ? `**Coach is offline** (HTTP ${err.status}). The LLM provider returned an error — try again in a moment.`
          : "**Network error** reaching the coach. Try again?";
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (last.role !== "coach") return prev;
        return [...prev.slice(0, -1), { ...last, content: errorText }];
      });
    } finally {
      setIsThinking(false);
    }
  }, [
    input,
    isThinking,
    messages,
    currentPly,
    displayFen,
    allMoves,
    triggerPuzzleFetch,
    autoAnalyzeState,
    loadedGame,
    enginePositions,
    analysisActive,
  ]);

  // Keep the auto-fire ref pointed at the latest handleSend so the
  // useEffect above can dispatch the synthetic prompt without a stale
  // closure on input/messages.
  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  const handleSuggestion = useCallback(
    (s: string) => {
      // Intercept the puzzle-finding pill — fetch real Neo4j puzzles from
      // /api/similar-puzzles for the current position and surface them as
      // a coach-attached pack. Other pills fall through to the normal
      // "populate input → user presses Enter" flow.
      if (/find me puzzles/i.test(s)) {
        // Map the pill phrasing to a theme. Coach-emitted [PRACTICE:...]
        // tags will go through the same fetch path in production.
        const theme = /rook/i.test(s)
          ? "sacrifice"
          : /knight/i.test(s)
          ? "knight-fork"
          : /mate/i.test(s)
          ? "mateIn2"
          : "fork";
        const displayTheme = /rook/i.test(s)
          ? "Rook sacrifices"
          : "Tactical patterns";
        const msgIdx = messages.length + 1; // index of the coach msg we push
        setMessages((prev) => [
          ...prev,
          { role: "user", content: s, ply: currentPly },
          {
            role: "coach",
            content: `Pulled three positions in the same family from the master puzzle index — solve them inline, or move any one onto the big board.`,
            ply: currentPly,
          },
        ]);
        // Defer one tick so the message lands in state before the fetch trigger
        setTimeout(
          () => triggerPuzzleFetch(msgIdx, theme, displayTheme, displayFen),
          0
        );
        return;
      }
      setInput(s);
    },
    [messages, currentPly, displayFen, triggerPuzzleFetch]
  );

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (inInput) return;
      if (e.key === "ArrowLeft") setCurrentPly((p) => Math.max(0, p - 1));
      else if (e.key === "ArrowRight")
        setCurrentPly((p) => Math.min(allMoves.length, p + 1));
      else if (e.key === "Home") setCurrentPly(0);
      else if (e.key === "End") setCurrentPly(allMoves.length);
      else if (e.key === "f" || e.key === "F")
        setBoardOrientation((o) => (o === "white" ? "black" : "white"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allMoves.length]);

  // Command palette groups — recomputed when ply/moments change
  const commandGroups: CommandGroup[] = useMemo(
    () => [
      {
        heading: "Navigation",
        items: [
          {
            id: "start",
            label: "Go to start",
            hint: "Move 0",
            icon: CommandIcons.Start,
            shortcut: ["Home"],
            onSelect: () => setCurrentPly(0),
          },
          {
            id: "prev",
            label: "Previous move",
            icon: CommandIcons.Prev,
            shortcut: ["←"],
            onSelect: () =>
              setCurrentPly((p) => Math.max(0, p - 1)),
          },
          {
            id: "next",
            label: "Next move",
            icon: CommandIcons.Next,
            shortcut: ["→"],
            onSelect: () =>
              setCurrentPly((p) => Math.min(allMoves.length, p + 1)),
          },
          {
            id: "end",
            label: "Go to end",
            hint: `Move ${allMoves.length}`,
            icon: CommandIcons.End,
            shortcut: ["End"],
            onSelect: () => setCurrentPly(allMoves.length),
          },
        ],
      },
      {
        heading: "Key moments",
        items: liveKeyMoments.map((m) => ({
          id: `moment-${m.ply}`,
          label: `Jump to ${m.label}`,
          hint: `Move ${Math.ceil(m.ply / 2)}`,
          icon: m.kind === "brilliant" ? CommandIcons.Brilliant : CommandIcons.Moment,
          onSelect: () => setCurrentPly(m.ply),
        })),
      },
      {
        heading: "View",
        items: [
          {
            id: "flip",
            label: "Flip board",
            icon: CommandIcons.Flip,
            shortcut: ["F"],
            onSelect: () =>
              setBoardOrientation((o) => (o === "white" ? "black" : "white")),
          },
          {
            id: "reset",
            label: "Reset to start",
            icon: CommandIcons.Reset,
            onSelect: () => setCurrentPly(0),
          },
        ],
      },
      {
        heading: "Coach",
        items: SUGGESTION_PILLS.map((s, i) => ({
          id: `ask-${i}`,
          label: s,
          hint: "Ask the coach",
          icon: CommandIcons.Coach,
          onSelect: () => {
            setInput(s);
            // tiny delay so input visibly populates before send fires
            setTimeout(() => {
              const ev = new Event("submit");
              ev.preventDefault?.();
              // We can't call handleSend directly (stale closure) — set the
              // input and let the user press Enter, OR autosubmit via state.
              // Auto-submit pattern: store the suggestion to a separate state
              // is overkill; just leave input populated.
            }, 0);
          },
        })),
      },
    ],
    [allMoves.length, liveKeyMoments]
  );

  return (
    <ThemeProvider theme={analysisTheme}>
      <Head>
        <title>Chess Masti — Analyze your game</title>
        <meta
          name="description"
          content="Stockfish 17 evaluates, an AI coach explains, a validator checks every claim. Engine-grounded chess coaching, free for everyone."
        />
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#08090C" />
        <style>{`
          html, body { background-color: #08090C; color-scheme: dark; margin: 0; }
          ::-webkit-scrollbar { width: 10px; height: 10px; }
          ::-webkit-scrollbar-track { background: #08090C; }
          ::-webkit-scrollbar-thumb { background: rgba(249,115,22,0.18); border-radius: 5px; }
          ::-webkit-scrollbar-thumb:hover { background: rgba(249,115,22,0.32); }
        `}</style>
      </Head>

      <GradientBackdrop />
      <ChessgroundDarkSquareOverride />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        groups={commandGroups}
      />

      <LoadGameDialog
        open={loadGameOpen}
        onClose={() => setLoadGameOpen(false)}
        onLoad={(g) => loadNewGame(g)}
      />

      {shareDialog && (
        <CoachShareDialog
          open={Boolean(shareDialog)}
          onClose={() => setShareDialog(null)}
          data={{
            fen: shareDialog.fen,
            explanation: shareDialog.msg.content,
            transcript: messages
              .filter(
                (m) => m.role === "user" || m.role === "coach"
              )
              .map((m) => ({
                role: m.role === "coach" ? ("assistant" as const) : ("user" as const),
                content: m.content,
                fen: undefined,
              })),
          }}
        />
      )}

      <OnboardingHelp
        storageKey="cm-tour-analysis-v1"
        title="Welcome to the Analyze surface"
        subtitle="A few things power users discover late"
        tips={[
          {
            icon: Command,
            iconColor: "#F97316",
            title: "Command palette",
            shortcut: "⌘K",
            body: "Jump to any move, flip the board, or fire a question to the coach without taking your hands off the keyboard.",
          },
          {
            icon: BookOpen,
            iconColor: "#22c55e",
            title: "Takeover the master database",
            body: "Click the green Takeover button under the eval arc. The right panel swaps to a live browser of millions of master-game positions — filter by player, click any move to preview on the board.",
          },
          {
            icon: MousePointerClick,
            iconColor: "#A855F7",
            title: "Drag pieces freely in Takeover",
            body: "Once in Takeover, the board becomes interactive. Drag any piece to explore variations — the master-DB panel re-queries the new position automatically.",
          },
          {
            icon: Activity,
            iconColor: "#FB923C",
            title: "Toggle 4 arrow overlays",
            body: "Above the eval sparkline: Engine best · Most common · Game played · Maia (with ELO slider). Mix and match to see what humans, masters, and engines disagree about.",
          },
          {
            icon: Eye,
            iconColor: "#FBBF24",
            title: "Scrub the evaluation arc",
            body: "Click anywhere on the sparkline below the board to jump to that ply. The dots are key moments — click for instant navigation.",
          },
        ]}
      />

      <Box
        sx={{
          minHeight: "100vh",
          width: "100%",
          color: "rgba(255,255,255,0.94)",
          pt: 2,
          pb: 4,
          px: { xs: 2, md: 3 },
        }}
      >
        <SharedNavPill active="analysis" badge={{ label: "Analysis" }} />

        {/* Lc0DownloadBanner — was previously injected by the legacy
            chrome (sections/layout/index.tsx) which the cutover dropped
            on /preview/* routes. Re-mounted here so the Maia/Lc0
            availability nudge still surfaces when the microservice is
            down. Self-gates on maia-status; renders nothing in the
            common case where Maia is up. */}
        <Box sx={{ maxWidth: 1680, mx: "auto", px: { xs: 1, sm: 2 }, mb: 2 }}>
          <Lc0DownloadBanner />
        </Box>

        <Box sx={{ maxWidth: 1680, mx: "auto" }}>
          <GameHeader
            whiteName={headers.White || "White"}
            blackName={headers.Black || "Black"}
            event={headers.Event || "—"}
            year={headers.Date?.split(".")[0] || ""}
            opening={headers.Opening || "—"}
            currentEval={evalSeries[currentPly] ?? 0}
            currentPly={currentPly}
            totalPlies={allMoves.length}
            onLoadGameClick={() => setLoadGameOpen(true)}
            engineDepth={engineSettings.depth}
            onEngineDepthChange={(d) =>
              setEngineSettings((s) => ({ ...s, depth: d }))
            }
            engineName={engineSettings.engineName}
            onEngineNameChange={(n) =>
              setEngineSettings((s) => ({ ...s, engineName: n }))
            }
            onSaveGameClick={user ? handleSaveGame : undefined}
            saveState={saveState}
          />

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                lg: "minmax(420px, 680px) minmax(380px, 1fr)",
              },
              gap: { xs: 3, lg: 3 },
              alignItems: "start",
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
                maxWidth: { xs: "100%", lg: 680 },
              }}
            >
              {drillState && (
                <DrillBanner
                  state={drillState}
                  onExit={exitDrill}
                  onRestart={restartDrill}
                  onSkip={advanceDrill}
                />
              )}
              <ErrorBoundary name="preview-analysis-board">
                <BoardArea
                  fen={displayFen}
                  lastMove={displayLastMove}
                  boardOrientation={boardOrientation}
                  isInCheck={displayInCheck}
                  shapes={displayShapes}
                  interactive={takeoverMode || drillActive}
                  movableColor={
                    drillActive
                      ? turnToMove
                      : takeoverMode
                      ? turnToMove
                      : undefined
                  }
                  dests={
                    drillActive
                      ? displayDests
                      : takeoverMode
                      ? displayDests
                      : undefined
                  }
                  onMove={
                    drillActive
                      ? handleDrillMove
                      : takeoverMode
                      ? handleBoardMove
                      : undefined
                  }
                  syncTick={boardSyncTick}
                />
              </ErrorBoundary>
              <BoardArrowToggles
                state={arrowToggles}
                onChange={setArrowToggles}
              />
              <EvalSparkline
                series={evalSeries}
                currentPly={currentPly}
                onJumpTo={setCurrentPly}
                keyMoments={liveKeyMoments}
                analyzing={analysisActive}
                progress={analysisProgress}
                errored={analysisError !== null}
              />
              <KeyMomentsRow
                moments={liveKeyMoments}
                currentPly={currentPly}
                onJumpTo={setCurrentPly}
              />
            </Box>

            {/* Right column: tabbed surface — Coach / Masters / Moves.
                The Masters tab makes the main board interactive for
                exploration (same role the old "Takeover" modal had). */}
            <ErrorBoundary name="preview-analysis-tabs">
            <Box sx={{ position: "relative" }}>
              <TabStrip
                active={rightTab}
                onChange={handleTabChange}
                movesBadge={`${currentPly}/${allMoves.length}`}
                mastersBadge={
                  rightTab === "masters" && takeoverCandidates.length > 0
                    ? String(takeoverCandidates.length)
                    : undefined
                }
              />
              <Box
                sx={{
                  position: "relative",
                  height: {
                    xs: 600,
                    lg: "clamp(720px, 86vh, 920px)",
                  },
                }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {rightTab === "coach" && (
                    <motion.div
                      key="coach"
                      initial={{ opacity: 0, x: -32, scale: 0.98 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -32, scale: 0.98 }}
                      transition={{
                        duration: 0.32,
                        ease: [0.22, 0.61, 0.36, 1],
                      }}
                      style={{ position: "absolute", inset: 0 }}
                    >
                      <CoachPanel
                        messages={messages}
                        input={input}
                        onChangeInput={setInput}
                        onSend={handleSend}
                        onSuggestion={handleSuggestion}
                        isThinking={isThinking}
                        analysisActive={analysisActive}
                        onPromoteToBoard={handlePromoteToBoard}
                        allMoves={allMoves}
                        onMoveRefClick={setCurrentPly}
                        onShareMessage={(m) =>
                          setShareDialog({ msg: m, fen: displayFen })
                        }
                        mistakeContext={mistakeContext}
                        userRating={profile?.selfReportedRating ?? 1500}
                        coachContextIdProp={coachContextIdRef.current}
                        enginePositions={enginePositions}
                        loadedGame={loadedGame}
                        personalityId={personality.id}
                        onChangePersonality={(id) =>
                          setSelectedPersonalityId(id)
                        }
                        onPuzzleSolved={(puzzle, secs) =>
                          recordSolved(
                            puzzle.id,
                            secs,
                            puzzle.solution
                          )
                        }
                        onPracticeConcept={(theme, name, msgIdx) =>
                          triggerPuzzleFetch(
                            msgIdx,
                            theme,
                            name,
                            displayFen
                          )
                        }
                      />
                    </motion.div>
                  )}
                  {rightTab === "masters" && (
                    <motion.div
                      key="masters"
                      initial={{ opacity: 0, x: 32, scale: 0.98 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: 32, scale: 0.98 }}
                      transition={{
                        duration: 0.32,
                        ease: [0.22, 0.61, 0.36, 1],
                      }}
                      style={{ position: "absolute", inset: 0 }}
                    >
                      <MasterGamesTakeover
                        fen={displayFen}
                        ply={currentPly}
                        playedSan={playedSanAtPly}
                        onPreviewMove={handleTakeoverPreviewMove}
                        onSendToCoach={handleTakeoverSendToCoach}
                        onRevert={() => handleTabChange("coach")}
                        onCandidatesUpdate={setTakeoverCandidates}
                      />
                    </motion.div>
                  )}
                  {rightTab === "moves" && (
                    <motion.div
                      key="moves"
                      initial={{ opacity: 0, x: 32, scale: 0.98 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: 32, scale: 0.98 }}
                      transition={{
                        duration: 0.32,
                        ease: [0.22, 0.61, 0.36, 1],
                      }}
                      style={{ position: "absolute", inset: 0 }}
                    >
                      <MovesListPanel
                        moves={allMoves}
                        currentPly={currentPly}
                        positions={classifiedPositions}
                        onJumpTo={setCurrentPly}
                        onAskCoach={handleAskCoachAboutMove}
                      />
                    </motion.div>
                  )}
                  {rightTab === "lines" && (
                    <motion.div
                      key="lines"
                      initial={{ opacity: 0, x: 32, scale: 0.98 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: 32, scale: 0.98 }}
                      transition={{
                        duration: 0.32,
                        ease: [0.22, 0.61, 0.36, 1],
                      }}
                      style={{ position: "absolute", inset: 0 }}
                    >
                      <EngineLinesPanel
                        position={
                          enginePositions?.[currentPly] ?? null
                        }
                        fen={displayFen}
                        engineName={engineSettings.engineName}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Box>
            </Box>
            </ErrorBoundary>
          </Box>

          <MoveNavigator
            currentPly={currentPly}
            totalPlies={allMoves.length}
            onJumpTo={setCurrentPly}
            onFlip={() =>
              setBoardOrientation((o) => (o === "white" ? "black" : "white"))
            }
            onReset={() => setCurrentPly(0)}
          />

          <Box
            sx={{
              mt: 4,
              pt: 3,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              gap: 1.5,
              alignItems: "center",
              justifyContent: "space-between",
              color: "rgba(255,255,255,0.4)",
              fontSize: "0.78rem",
            }}
          >
            <Stack direction="row" spacing={2.5} alignItems="center">
              <Box
                component={Link}
                href="/preview/launch"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  color: "rgba(255,255,255,0.6)",
                  textDecoration: "none",
                  "&:hover": { color: "rgba(255,255,255,0.9)" },
                }}
              >
                <ArrowLeft size={14} />
                Back to launch
              </Box>
              <Box>·</Box>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: "wrap" }}>
                <Box>← → navigate · F flip · scrub the sparkline ·</Box>
                <Box
                  onClick={() => setPaletteOpen(true)}
                  sx={{
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.5,
                    px: 0.85,
                    py: 0.25,
                    borderRadius: "5px",
                    background: "rgba(249,115,22,0.1)",
                    border: "1px solid rgba(249,115,22,0.25)",
                    color: "#FB923C",
                    fontFamily: "Monaco, Menlo, monospace",
                    fontWeight: 600,
                    fontSize: "0.72rem",
                    transition: "all 180ms ease",
                    "&:hover": {
                      background: "rgba(249,115,22,0.18)",
                      borderColor: "rgba(249,115,22,0.4)",
                    },
                  }}
                >
                  ⌘K
                </Box>
                <Box>for commands</Box>
              </Stack>
            </Stack>
            <Stack direction="row" spacing={2.5} alignItems="center">
              <Box>Engine-grounded by</Box>
              <Box sx={{ color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>
                Stockfish 17
              </Box>
            </Stack>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
