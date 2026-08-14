"use client";

import { Chess, type Move } from "chess.js";
import { triggerPaywall } from "@/contexts/PaywallDialogContext";
import {
  ANALYSIS_HANDOFF_PARAM,
  consumeStagedGame,
} from "@/lib/analysis/handoff";
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
  useMediaQuery,
} from "@mui/material";
import { ThemeProvider, createTheme, useTheme } from "@mui/material/styles";
import { motion, AnimatePresence } from "framer-motion";
import {
  MasterGamesTakeover,
  getMasterCandidates,
  replayPreviewMove,
  type MasterCandidate,
} from "@/components/ui/MasterGamesTakeover";
import {
  findAllMoveRefs,
  findPlyForMoveRef,
  plyBeforeMove,
  buildRecommendedPreview,
  playSanOnFen,
} from "@/components/preview-analysis/coachMoveRefs";
import {
  gameSideKey,
  inferPlayerSideFromHeaders,
  loadStoredSide,
  storeSide,
  type PlayerSide,
  type PlayerSideColor,
} from "@/components/preview-analysis/playerSide";
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
  AlertTriangle,
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
import { isWasmSupported } from "@/lib/engine/shared";
import {
  pickDisplayEval,
  satisfiesRequest,
} from "@/lib/engine/pickDisplayEval";
import { EngineName, MoveClassification } from "@/types/enums";
import type { PositionEval, LineEval } from "@/types/eval";
import { getMovesClassification } from "@/lib/engine/helpers/moveClassification";
import { ContextualPuzzleRecommendations } from "@/components/ContextualPuzzleRecommendations";
import { useGameDatabase } from "@/hooks/useGameDatabase";
import { useViewer } from "@/hooks/useViewer";
import { resolveUserRating } from "@/lib/coach/userRating";
import { buildAnalysisRequestBody } from "@/lib/coach/analysisRequestBody";
import { buildChatRequestBody } from "@/lib/coach/chatRequestBody";
import { buildConversationHistory } from "@/lib/coach/conversationHistory";
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
import { useAtomValue, useSetAtom } from "jotai";
import { savedEvalsAtom } from "@/sections/analysis/states";
import type { SavedEvals } from "@/types/eval";
import {
  getEvaluateGameParams,
  getEvaluationBarValue,
  getRootFen,
  replayFromRoot,
} from "@/lib/chess";
import { detectOpening } from "@/lib/unifiedOpeningDetector";
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
// Cold start
// ───────────────────────────────────────────────────────────────────────────────
//
// /analysis opens on an EMPTY board. It used to open on a hand-curated
// Kasparov–Topalov 1999 demo, which brought with it a whole shadow set of
// hardcoded, ply-indexed data — a mock eval curve, seven authored "key
// moments", an ENGINE_BEST table and a Maia move table. All of it was keyed by
// ply number, not position, so every one of them rendered confidently WRONG
// data the moment a user loaded their own game. Removing the demo removes the
// entire class. Everything on the page now derives from the loaded game, and
// with no game loaded the page says so.

// Key moments are derived from move classification (see `liveKeyMoments`).
interface KeyMoment {
  ply: number;
  label: string;
  kind: "opening" | "mistake" | "brilliant" | "winning" | "neutral";
}

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
  /**
   * The user's real rating, or `undefined` when they have none.
   *
   * Deliberately a REQUIRED key with an optional value (`number | undefined`,
   * not `userRating?: number`). A1 happened because this was `?`-optional:
   * `coachExtras` simply never included it, that type-checked, and the body's
   * `?? 1500` filled the hole with a plausible lie. With the key required,
   * dropping it from `coachExtras` is a compile error at all three call sites.
   * Do not soften this back to `?`.
   */
  userRating: number | undefined;
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
  /**
   * D1: fired when the server shipped a CORRECTED analysis. The caller must
   * replace the streamed text with it, otherwise the raw (uncorrected) copy is
   * what gets replayed to the model on the next turn as its own last word.
   */
  onCorrected?: (correctedText: string) => void;
  /**
   * D4: fired when the stream ended without a `done` event. The caller must
   * mark the message `incomplete` so it renders as truncated and is kept out
   * of conversationHistory.
   */
  onTruncated?: () => void;
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
    onCorrected,
    onTruncated,
    signal,
  } = params;

  // Group D: synthetic (UI-authored) and incomplete (truncated) turns are
  // filtered out here, in the ONE place history is assembled.
  const conversationHistory = buildConversationHistory(prevMessages);

  const hasContext =
    contextIdRef.current !== null &&
    conversationHistory.some((m) => m.role === "assistant");

  // ─── FAST PATH: follow-up via /api/chat (cached deep context) ───
  if (hasContext) {
    const chatRes = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(
        // B1 (SILENT_SUBSTITUTION_HANDOFF §3 Group B): assembled by the shared
        // builder so the "forward the board the user is actually looking at"
        // contract is unit-tested against the code that ships.
        buildChatRequestBody({
          contextId: contextIdRef.current!,
          userMessage: userText,
          conversationHistory,
          fen,
          currentPly,
        })
      ),
      signal,
    });
    if (chatRes.status === 404) {
      // contextId expired — fall through to deep path
      contextIdRef.current = null;
    } else if (chatRes.status === 401) {
      throw new CoachAuthError();
    } else if (chatRes.status === 402) {
      triggerPaywall({ feature: "AI coach", reason: "quota_exhausted" });
      throw new CoachApiError(402);
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
  // Extract PGN headers from the loaded game so the server can thread
  // player + event metadata into the LLM overview. chess.js's header() is
  // a plain object keyed by the canonical PGN tag names; we filter to the
  // structured field set the server's zod schema accepts, lower-casing the
  // keys to match. Empty headers (a freshly loaded FEN with no history)
  // come back as `{}` and we just send undefined.
  const rawHeaders = loadedGame.header();
  const pickHeader = (key: string): string | undefined => {
    const v = rawHeaders[key];
    if (typeof v !== "string") return undefined;
    const trimmed = v.trim();
    if (!trimmed || trimmed === "?" || trimmed === "-") return undefined;
    return trimmed;
  };
  // PGN-supplied opening + ECO are preferred when present (chess.com /
  // lichess labels are usually more specific than the local trie can
  // produce). Otherwise fall back to detectOpening() — same source the
  // board banner uses since PR #73 — so the LLM never has to infer the
  // opening from raw move tokens just because the PGN was a paste with no
  // Opening tag.
  const pgnOpening = pickHeader("Opening");
  const pgnEco = pickHeader("ECO");
  const fallbackOpening =
    !pgnOpening && !pgnEco ? detectOpening(loadedGame) : null;
  const gameHeaders = {
    white: pickHeader("White"),
    black: pickHeader("Black"),
    whiteElo: pickHeader("WhiteElo"),
    blackElo: pickHeader("BlackElo"),
    event: pickHeader("Event"),
    date: pickHeader("Date") ?? pickHeader("UTCDate"),
    result: pickHeader("Result"),
    eco: pgnEco ?? fallbackOpening?.eco,
    opening:
      pgnOpening ??
      (fallbackOpening && fallbackOpening.name !== "Opening"
        ? fallbackOpening.name
        : undefined),
    timeControl: pickHeader("TimeControl"),
  };
  // Assembled by the shared builder so the personalization contract (notably
  // "an absent rating is omitted, never defaulted" — A1) is unit-tested
  // against the code that actually ships. See lib/coach/analysisRequestBody.ts.
  const requestBody = buildAnalysisRequestBody({
    userMessage: userText,
    moveHistory,
    fen,
    gameEval: gameEvalPayload,
    conversationHistory,
    userRating,
    viewedPly: currentPly,
    playerColor,
    playerColorName,
    boardOrientation,
    username,
    chesscomUsername,
    lichessUsername,
    personalityId,
    gameHeaders,
  });

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
  if (res.status === 402) {
    triggerPaywall({ feature: "AI coach", reason: "quota_exhausted" });
    throw new CoachApiError(402);
  }
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
  // D4 (SILENT_SUBSTITUTION_HANDOFF §3 Group D): the loop used to exit on the
  // reader's `done` with no check that a `type:"done"` EVENT ever arrived. A
  // Vercel 60s kill, a dropped connection, or a proxy cutting the SSE body all
  // yield a partial answer that renders as finished and enters history as a
  // completed turn.
  let sawDoneEvent = false;
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
        } else if (
          parsed.type === "context" &&
          typeof parsed.contextId === "string"
        ) {
          // T1: the server now ships the contextId as its own EARLY event so a
          // function killed mid-stream doesn't cost the client its cached
          // context (which would make the next turn a full flagship
          // re-analysis). Emitting it server-side is inert without this branch
          // — the reader only understood text/done/metadata/error.
          contextIdRef.current = parsed.contextId;
        } else if (parsed.type === "done" || parsed.type === "metadata") {
          // Final event carries contextId + validation + puzzle recs
          sawDoneEvent = true;
          if (parsed.contextId) contextIdRef.current = parsed.contextId;
          if (parsed.metadata?.contextId)
            contextIdRef.current = parsed.metadata.contextId;
          // T5 (SILENT_SUBSTITUTION_HANDOFF §4): the server already reports
          // when the deep-validation pass timed out or fell back — the client
          // just never read it, so the placeholder ("Still analyzing — the
          // deep-validation pass took longer than expected") rendered
          // IDENTICALLY to a real answer and entered history as one. Reuse
          // D4's `incomplete` flag: it both marks the bubble and keeps the
          // non-answer out of what the model is told it said.
          if (
            parsed.metadata?.pipeline?.timedOut === true ||
            parsed.metadata?.pipeline?.finalOutcome === "fallback_used"
          ) {
            onTruncated?.();
          }
          // D1: the server stores the CORRECTED analysis as canonical and
          // re-injects it as the first assistant message on every follow-up —
          // but the client kept the raw streamed text and re-sent THAT in
          // conversationHistory, where it landed as the model's most recent
          // statement. The model then defends the uncorrected line and the
          // corrected copy reads as superseded. Swap it in.
          if (
            parsed.metadata?.corrected &&
            typeof parsed.metadata?.analysis === "string" &&
            parsed.metadata.analysis.trim().length > 0
          ) {
            onCorrected?.(parsed.metadata.analysis);
          }
        } else if (parsed.type === "error") {
          throw new CoachApiError(502);
        }
      } catch (e) {
        if (e instanceof CoachApiError) throw e;
        // ignore malformed lines
      }
    }
  }
  // D4: reaching here without a `done` event means the answer is a fragment.
  if (!sawDoneEvent) onTruncated?.();
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

interface CoachMessage {
  role: "user" | "coach";
  content: string;
  /**
   * D2/D3 (SILENT_SUBSTITUTION_HANDOFF §3 Group D): this turn was authored by
   * the UI, not by the model or the user. Seeded demo content, load greetings,
   * error banners, and the suggestion pill's fabricated exchange all set it.
   * Synthetic turns still RENDER — they are just never replayed to the model
   * as things it said.
   */
  synthetic?: boolean;
  /**
   * D4: the stream ended without a `done` event, so this text is a fragment.
   * Excluded from conversationHistory — a half-finished sentence replayed as a
   * completed thought is worse than no history at all.
   */
  incomplete?: boolean;
  ply?: number; // links message to a board position
  insight?: { tag: string; eval?: string; classification?: string };
  // When set, a puzzle pack card renders below the bubble with a
  // "Move to big board" CTA per puzzle.
  puzzlePack?: PuzzlePack;
}

// The cold-start chat. `synthetic: true` keeps it out of conversationHistory
// (D2/D3, SILENT_SUBSTITUTION_HANDOFF §3 Group D) — it is UI copy, not
// something the model said. It replaced a three-turn seeded exchange about
// the Kasparov demo whose hand-written eval numbers used to be replayed to
// the model as its own prior analysis.
const EMPTY_STATE_MESSAGES: CoachMessage[] = [
  {
    role: "coach",
    synthetic: true,
    content:
      "Board's empty — load a game and I'll take a look. **Load game** up top takes a PGN, a FEN, or your last games straight from Lichess or Chess.com.",
    ply: 0,
  },
];

// Replaced with the per-game generator in `./generateSuggestions`.
// The CoachPanel receives a fresh `suggestions` array (pinned "Analyze
// my game" in ember + up to 3 rule-derived) computed in AnalysisPage
// based on the current game's blunders / brilliancies / opening /
// endgame state / active mistake context.
import {
  generateSuggestions,
  type Suggestion,
} from "./generateSuggestions";

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
        href="/"
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

/**
 * The loaded game's identity, rendered INSIDE the nav pill.
 *
 * Replaces the standalone GameHeader card that used to sit under the pill —
 * two stacked bars saying "you are on /analysis" and "you are analyzing X".
 * Everything load-bearing survived the merge (players, opening, ply cursor,
 * live eval); what didn't was the "NOW ANALYZING" caption, the crown icon,
 * and the Event/date line, none of which the user acts on.
 *
 * Truncates rather than wraps: the pill is a fixed-height row.
 */
function GameIdentity({
  whiteName,
  blackName,
  opening,
  currentEval,
  currentPly,
  totalPlies,
  hasGame,
  evalPending,
}: {
  whiteName?: string;
  blackName?: string;
  opening: string | null;
  currentEval: number;
  currentPly: number;
  totalPlies: number;
  hasGame: boolean;
  /** Stockfish still running — show a dash, not a number we don't have. */
  evalPending?: boolean;
}) {
  // On a phone the pill has room for the burger, the mark, Load game and
  // Sign in — and nothing else. Squeezing the name in truncated it to a
  // single character, which is worse than omitting it; the loaded game is
  // named in the coach's greeting directly below.
  const hideOnPhone = { xs: "none", sm: "flex" } as const;

  if (!hasGame) {
    return (
      <Typography
        sx={{
          display: { xs: "none", sm: "block" },
          fontSize: "0.86rem",
          color: "rgba(255,255,255,0.42)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        No game loaded
      </Typography>
    );
  }

  const evalPositive = currentEval >= 0;

  return (
    <Stack
      direction="row"
      spacing={1.5}
      alignItems="center"
      sx={{ minWidth: 0, width: "100%", display: hideOnPhone }}
    >
      <Typography
        sx={{
          fontSize: "0.9rem",
          fontWeight: 700,
          color: "rgba(255,255,255,0.92)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          minWidth: 0,
        }}
      >
        {whiteName || "White"}{" "}
        <Box
          component="span"
          sx={{ color: "rgba(255,255,255,0.35)", fontWeight: 400 }}
        >
          vs
        </Box>{" "}
        {blackName || "Black"}
      </Typography>

      {opening && opening !== "—" && (
        <Typography
          sx={{
            // Widest thing here and the least actionable — first to go when
            // the nav links need the room.
            display: { xs: "none", xl: "block" },
            fontSize: "0.8rem",
            color: "rgba(255,255,255,0.45)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}
        >
          {opening}
        </Typography>
      )}

      {/* Both chips are fixed-width, so on a phone they crowd the truncating
          name out and collide with the actions. The move cursor and the eval
          are both restated under the board. */}
      <Stack
        direction="row"
        spacing={0.4}
        alignItems="baseline"
        sx={{ flexShrink: 0, display: { xs: "none", md: "flex" } }}
      >
        <Typography
          sx={{
            fontSize: "0.92rem",
            fontWeight: 800,
            color: "rgba(255,255,255,0.9)",
            fontFamily: "Monaco, Menlo, monospace",
            lineHeight: 1,
          }}
        >
          {currentPly}
        </Typography>
        <Typography
          sx={{ fontSize: "0.76rem", color: "rgba(255,255,255,0.38)" }}
        >
          / {totalPlies}
        </Typography>
      </Stack>

      <Box
        sx={{
          flexShrink: 0,
          display: { xs: "none", md: "block" },
          px: 1.1,
          py: 0.4,
          borderRadius: "8px",
          background: evalPositive
            ? "rgba(249,115,22,0.12)"
            : "rgba(255,255,255,0.06)",
          border: evalPositive
            ? "1px solid rgba(249,115,22,0.3)"
            : "1px solid rgba(255,255,255,0.1)",
          minWidth: 52,
          textAlign: "center",
        }}
      >
        <Typography
          sx={{
            fontSize: "0.84rem",
            fontWeight: 700,
            color: evalPending
              ? "rgba(255,255,255,0.4)"
              : evalPositive
              ? "#FB923C"
              : "rgba(255,255,255,0.85)",
            fontFamily: "Monaco, Menlo, monospace",
            lineHeight: 1.35,
          }}
        >
          {evalPending ? "—" : formatEval(currentEval)}
        </Typography>
      </Box>
    </Stack>
  );
}

/**
 * The game actions half of the merged bar: engine settings, Load, Save, and
 * the ⌘K chip inherited from the page footer this layout removed.
 */
function GameActions({
  onLoadGameClick,
  engineDepth,
  onEngineDepthChange,
  engineName,
  onEngineNameChange,
  onSaveGameClick,
  saveState,
  onOpenPalette,
}: {
  onLoadGameClick?: () => void;
  engineDepth?: number;
  onEngineDepthChange?: (d: number) => void;
  engineName?: EngineName;
  onEngineNameChange?: (n: EngineName) => void;
  /**
   * G4: surface a Save button when the user is signed in AND there is a game
   * to save. Undefined = button hidden.
   */
  onSaveGameClick?: () => void;
  saveState?: "idle" | "saving" | "saved" | "error";
  onOpenPalette?: () => void;
}) {
  const [enginePopoverAnchor, setEnginePopoverAnchor] =
    useState<HTMLElement | null>(null);

  const actionSx = {
    px: 1.25,
    py: 0.6,
    minWidth: 0,
    borderRadius: "10px",
    fontSize: "0.76rem",
    fontWeight: 700,
    textTransform: "none" as const,
    whiteSpace: "nowrap" as const,
  };

  return (
    <Stack
      direction="row"
      spacing={0.85}
      alignItems="center"
      sx={{ flexShrink: 0 }}
    >
      {onOpenPalette && (
        <Tooltip title="Command palette — jump to a move, flip, ask the coach">
          <Box
            component="button"
            type="button"
            aria-label="Open command palette"
            onClick={onOpenPalette}
            sx={{
              display: { xs: "none", xl: "inline-flex" },
              alignItems: "center",
              cursor: "pointer",
              font: "inherit",
              px: 0.9,
              py: 0.45,
              borderRadius: "8px",
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
        </Tooltip>
      )}

      {engineDepth !== undefined && (
        <Tooltip title="Stockfish engine settings — depth and variant">
          <Button
            onClick={(e) => setEnginePopoverAnchor(e.currentTarget)}
            sx={{
              ...actionSx,
              display: { xs: "none", sm: "inline-flex" },
              fontFamily: "Monaco, Menlo, monospace",
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
              ...actionSx,
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
                ...actionSx,
                display: { xs: "none", lg: "inline-flex" },
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
                    saveState === "saved" ? "#86efac" : "rgba(255,255,255,0.4)",
                },
              }}
            >
              {saveState === "saved"
                ? "✓ Saved"
                : saveState === "saving"
                ? "Saving…"
                : "Save"}
            </Button>
          </span>
        </Tooltip>
      )}

      <EngineSettingsPopover
        anchorEl={enginePopoverAnchor}
        onClose={() => setEnginePopoverAnchor(null)}
        depth={engineDepth ?? 16}
        onDepthChange={onEngineDepthChange}
        engineName={engineName ?? EngineName.Stockfish17Lite}
        onEngineNameChange={onEngineNameChange}
      />
    </Stack>
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
                Stuck? Skip ahead, or ask the coach
                {/* "on the right" only reads right on viewports where the
                    right-column tabs actually sit to the right of the
                    board. On xs the page stacks vertically so the coach
                    is below, not next to, the drill banner. */}
                <Box
                  component="span"
                  sx={{ display: { xs: "inline", lg: "none" } }}
                >
                  {" "}below
                </Box>
                <Box
                  component="span"
                  sx={{ display: { xs: "none", lg: "inline" } }}
                >
                  {" "}on the right
                </Box>
                .
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

/** Data driving the vertical eval bar beside the board. */
type EvalBarData = {
  /** White's share of the bar, 0–100 (lichess win-percentage model). */
  whitePercentage: number;
  /** "1.2" / "M4" / "1-0" / "½-½" — null while pending. */
  label: string | null;
  /** True while no eval exists yet for the displayed position. */
  pending: boolean;
};

// Vertical evaluation bar — tracks the position actually on the board
// (mainline, takeover preview, or drill), not just the mainline ply.
// White's share uses the same lichess win-percentage model as the
// sparkline; mates snap to a full bar; terminal board positions show
// the game result. Pending state pulses a neutral 50/50 bar.
function GlassEvalBar({
  whitePercentage,
  label,
  pending,
  boardOrientation,
  heightPx,
}: EvalBarData & {
  boardOrientation: "white" | "black";
  /**
   * Pin the bar to the board's measured square height. Without it the bar
   * stretches to the row instead, and stands taller than the board whenever
   * the square is height-capped. Null/undefined → stretch (mobile).
   */
  heightPx?: number | null;
}) {
  const whiteShare = pending
    ? 50
    : Math.max(0, Math.min(100, whitePercentage));
  const whiteOnTop = boardOrientation === "black";
  const whiteAdv = whiteShare >= 50;
  // Label sits at the advantaged side's outer edge (lichess convention).
  const labelAtTop = whiteAdv === whiteOnTop;

  return (
    <Box
      role="img"
      aria-label={
        pending ? "Engine evaluation: calculating" : `Engine evaluation: ${label}`
      }
      sx={{
        position: "relative",
        width: { xs: 16, md: 22 },
        flexShrink: 0,
        ...(heightPx
          ? { height: heightPx, alignSelf: "center" }
          : { alignSelf: "stretch" }),
        borderRadius: "10px",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
        // Black's side of the bar — the white segment paints over it.
        background:
          "linear-gradient(180deg, rgba(30,32,40,0.96), rgba(12,13,17,0.96))",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.35)",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          [whiteOnTop ? "top" : "bottom"]: 0,
          height: `${whiteShare}%`,
          background: "linear-gradient(180deg, #FBFAF7, #E9E6DE)",
          transition: "height 220ms cubic-bezier(0.33, 1, 0.68, 1)",
        }}
      />
      {/* 50% midline tick — ember accent */}
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          height: "2px",
          mt: "-1px",
          background: "rgba(249,115,22,0.55)",
          zIndex: 1,
        }}
      />
      {pending && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.10))",
            animation: "cmEvalBarPulse 1.8s ease-in-out infinite",
            "@keyframes cmEvalBarPulse": {
              "0%, 100%": { opacity: 0.35 },
              "50%": { opacity: 1 },
            },
            zIndex: 1,
          }}
        />
      )}
      {label !== null && !pending && (
        <Typography
          sx={{
            position: "absolute",
            [labelAtTop ? "top" : "bottom"]: "4px",
            left: 0,
            width: "100%",
            textAlign: "center",
            fontSize: { xs: "0.5rem", md: "0.6rem" },
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            fontVariantNumeric: "tabular-nums",
            color: whiteAdv ? "rgba(17,19,24,0.92)" : "rgba(255,255,255,0.92)",
            zIndex: 2,
            pointerEvents: "none",
          }}
        >
          {label}
        </Typography>
      )}
    </Box>
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
  evalBar,
  empty = false,
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
  evalBar: EvalBarData;
  /** No game loaded — dim the start position and say so over it. */
  empty?: boolean;
}) {
  const lastMoveTuple = useMemo<[string, string] | undefined>(
    () => (lastMove ? [lastMove.from, lastMove.to] : undefined),
    [lastMove]
  );

  // The board must be the largest square that fits the space left over after
  // the strip below it — i.e. min(available width, available height).
  //
  // CSS can't express that here. `aspect-ratio` transfers a definite height
  // to width only when the box's width is genuinely auto, and a flex item
  // whose child is `width: 100%` (chessground) resolves its flex-basis from
  // content instead, so the square silently became a rectangle. Measuring the
  // slot is the reliable version.
  //
  // Only below lg, though. In the stacked layout the column has no bounded
  // height, so the slot's height is derived from the board — measuring it
  // and then sizing the board from the measurement collapses the board to a
  // few pixels. There, chessground's own width-driven mode is correct.
  const theme = useTheme();
  const heightBound = useMediaQuery(theme.breakpoints.up("lg"));
  const slotRef = useRef<HTMLDivElement>(null);
  const [squarePx, setSquarePx] = useState<number | null>(null);
  useEffect(() => {
    if (!heightBound) {
      setSquarePx(null);
      return;
    }
    const el = slotRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const next =
        width > 0 && height > 0 ? Math.floor(Math.min(width, height)) : null;
      setSquarePx((prev) => (prev === next ? prev : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [heightBound]);

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
        p: { xs: 1.5, md: 1.75 },
        // At lg the board is the column's flexible element: it takes whatever
        // height is left after the strip below it, and the square sizes off
        // THAT rather than off the column width. That inversion is what keeps
        // the page one screen tall.
        flex: { lg: 1 },
        minHeight: { lg: 0 },
        display: "flex",
        // As a flex item of the column, this card would refuse to shrink
        // below the board's min-content width and overflow the viewport on
        // a phone. It was a plain block before it became a flex container.
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "stretch",
          justifyContent: "center",
          gap: { xs: 1, md: 1.5 },
          width: "100%",
          minHeight: 0,
        }}
      >
        <GlassEvalBar
          {...evalBar}
          boardOrientation={boardOrientation}
          heightPx={squarePx}
        />
        {/* Measured slot: fills the row, reports its box to the observer. */}
        <Box
          ref={slotRef}
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
        <Box
          sx={{
            position: "relative",
            width: squarePx ?? "100%",
            height: squarePx ?? "auto",
            maxWidth: "100%",
            flexShrink: 0,
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
          {empty && (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.75,
                textAlign: "center",
                px: 3,
                background: "rgba(8,9,12,0.72)",
                backdropFilter: "blur(2px)",
                pointerEvents: "none",
              }}
            >
              <Typography
                sx={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.9)",
                }}
              >
                No game loaded
              </Typography>
              <Typography
                sx={{
                  fontSize: "0.84rem",
                  color: "rgba(255,255,255,0.55)",
                  maxWidth: 300,
                  lineHeight: 1.5,
                }}
              >
                Hit <Box component="span" sx={{ color: "#FB923C", fontWeight: 700 }}>Load game</Box>{" "}
                to paste a PGN or FEN, or pull your recent games from Lichess
                or Chess.com.
              </Typography>
            </Box>
          )}
        </Box>
        </Box>
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

/**
 * The eval curve, sized to live inside the control strip under the board.
 *
 * Slimmed from a standalone card: the glass shell, the "EVALUATION ARC"
 * caption and the "Click to scrub" hint are gone (the strip supplies the
 * shell; the cursor supplies the affordance). The key-moment markers absorbed
 * the KeyMomentsRow that used to sit beneath — they are now hoverable and
 * clickable, so the labels are still reachable at zero vertical cost.
 */
function EvalSparkline({
  series,
  currentPly,
  onJumpTo,
  keyMoments,
  analyzing = false,
  progress = 0,
  errored = false,
  hasGame = true,
}: {
  series: number[];
  currentPly: number;
  onJumpTo: (ply: number) => void;
  keyMoments: KeyMoment[];
  /** True while Stockfish is still computing — shows progress + dotted line. */
  analyzing?: boolean;
  progress?: number;
  /** True if the engine failed to start. */
  errored?: boolean;
  /** False on the empty board — nothing to plot, so say so. */
  hasGame?: boolean;
}) {
  const width = 800;
  const height = 48;
  const padY = 6;
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

  const statusChip = analyzing ? (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.6}
      sx={{
        px: 0.9,
        py: 0.15,
        borderRadius: "999px",
        background: "rgba(12,14,20,0.85)",
        border: "1px solid rgba(249,115,22,0.3)",
      }}
    >
      <Box
        sx={{
          width: 5,
          height: 5,
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
          fontSize: "0.64rem",
          fontWeight: 700,
          color: "#FB923C",
          fontFamily: "Monaco, Menlo, monospace",
        }}
      >
        Stockfish · {Math.round(progress)}%
      </Typography>
    </Stack>
  ) : errored ? (
    <Typography
      sx={{
        px: 0.9,
        py: 0.15,
        borderRadius: "999px",
        background: "rgba(12,14,20,0.85)",
        border: "1px solid rgba(239,68,68,0.25)",
        fontSize: "0.64rem",
        fontWeight: 700,
        color: "#fca5a5",
        fontFamily: "Monaco, Menlo, monospace",
      }}
    >
      Engine offline
    </Typography>
  ) : null;

  if (!hasGame || series.length < 2) {
    return (
      <Box
        sx={{
          height,
          borderRadius: "10px",
          border: "1px dashed rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography
          sx={{
            fontSize: "0.7rem",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontWeight: 700,
            color: "rgba(255,255,255,0.24)",
          }}
        >
          Evaluation arc
        </Typography>
      </Box>
    );
  }

  return (
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
        {/* Key moment markers — the whole of the old KeyMomentsRow. Hover for
            the label, click to jump. */}
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
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onJumpTo(m.ply);
            }}
          >
            <title>{m.label}</title>
          </circle>
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
      {statusChip && (
        <Box
          sx={{
            position: "absolute",
            top: 2,
            right: 4,
            pointerEvents: "none",
          }}
        >
          {statusChip}
        </Box>
      )}
    </Box>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Right-column tabs — Coach / Masters / Moves
// ───────────────────────────────────────────────────────────────────────────────

type RightTab = "coach" | "masters" | "moves" | "lines";

/**
 * A position the user has walked to OFF the mainline — by clicking a master
 * move, a coach recommendation, or by moving a piece on the board.
 *
 * `path` and `anchorPly` exist so the user can get back. Exploration used to
 * carry only the resulting FEN, so once you had clicked a few moves deep
 * there was nothing on screen saying where you had branched from or how to
 * return to it — you had to guess a ply and re-navigate.
 */
interface ExplorationPreview {
  fen: string;
  from: string;
  to: string;
  san: string;
  /** SANs played since leaving the mainline, in order. */
  path: string[];
  /** The mainline ply this branch left from. Returning restores it. */
  anchorPly: number;
}

/**
 * Why the Lines tab has nothing to show, when it has nothing to show.
 * "starting" and "unsupported" are deliberately distinct: `engine === null`
 * covers both, and conflating them told every visitor for the first seconds
 * of every page load that the engine had failed.
 */
type LinesStatus =
  | "ready"
  | "searching"
  | "starting"
  | "unsupported"
  | "terminal";

/**
 * How hard the user wants the engine to think about the position in front of
 * them, and which engine should do it.
 *
 * Separate from the whole-game review settings: this applies to one position,
 * so it can afford depth the review pass cannot.
 */
interface LinesSettings {
  /** Search depth for the current position. */
  depth: number;
  /** How many candidate lines to show (MultiPV — the engine allows 2–10). */
  count: number;
  /**
   * Force the selected local engine even when Lichess's cloud holds a deeper
   * answer. Off by default: the cloud result is usually far deeper (60+) and
   * instant. On, for anyone who wants the engine they picked to be the one
   * actually answering.
   */
  preferLocalEngine: boolean;
}

/** Depth choices for a single position. */
const LINES_DEPTHS = [14, 18, 22, 26] as const;
/** Candidate-line counts. Engine accepts 2–10; more is slower per search. */
const LINES_COUNTS = [2, 3, 5] as const;

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
              gap: { xs: 0.5, sm: 0.85 },
              // Four tabs share one row; at full padding the last one is
              // clipped on a phone.
              px: { xs: 0.5, sm: 1.5 },
              py: 1,
              borderRadius: "0.65rem",
              cursor: "pointer",
              color: isActive ? "#0A0A0A" : "rgba(255,255,255,0.62)",
              fontSize: { xs: "0.76rem", sm: "0.84rem" },
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
                    display: { xs: "none", sm: "inline" },
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
/**
 * "You are off the mainline" — shown above the board whenever an exploration
 * branch is active, on every tab.
 *
 * The board silently showed an explored position with nothing saying so and
 * no way back: after a few clicks down a master line you had to guess which
 * ply you had branched from and re-navigate by hand. This names the branch
 * and restores the anchor in one click (or Escape).
 */
function ExplorationBanner({
  preview,
  onReturn,
}: {
  preview: ExplorationPreview;
  onReturn: () => void;
}) {
  const anchor = plyToMoveDisplay(preview.anchorPly);
  return (
    <Box
      sx={{
        mb: 1.25,
        px: 1.5,
        py: 0.85,
        borderRadius: "0.9rem",
        background:
          "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(20,22,28,0.6))",
        border: "1px solid rgba(251,191,36,0.32)",
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        flexWrap: "wrap",
        rowGap: 0.75,
      }}
    >
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
        <GitBranch size={13} color="#FBBF24" />
        <Typography
          sx={{
            fontSize: "0.66rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#FBBF24",
          }}
        >
          Exploring
        </Typography>
      </Stack>

      <Typography
        sx={{
          flex: 1,
          minWidth: 0,
          fontFamily: "Monaco, Menlo, monospace",
          fontSize: "0.78rem",
          color: "rgba(255,255,255,0.82)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={preview.path.join(" ")}
      >
        {preview.path.join(" ")}
      </Typography>

      <Tooltip title="Leave this line and put the board back where you branched off (Esc)">
        <Button
          onClick={onReturn}
          startIcon={<ArrowLeft size={13} />}
          sx={{
            flexShrink: 0,
            px: 1.25,
            py: 0.4,
            minWidth: 0,
            borderRadius: "8px",
            fontSize: "0.75rem",
            fontWeight: 700,
            textTransform: "none",
            whiteSpace: "nowrap",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.14)",
            color: "rgba(255,255,255,0.88)",
            "&:hover": {
              background: "rgba(251,191,36,0.16)",
              borderColor: "rgba(251,191,36,0.45)",
              color: "#FBBF24",
            },
          }}
        >
          {anchor.color === null
            ? "Back to start"
            : `Back to move ${anchor.moveNum}`}
        </Button>
      </Tooltip>
    </Box>
  );
}

/**
 * Stockfish's top lines FOR THE POSITION ON THE BOARD.
 *
 * `position` must be the evaluation OF `fen`. It used to be handed
 * `enginePositions[currentPly]` — the game-wide pass indexed by ply — while
 * `fen` was the displayed board, so the moment the user explored off the
 * mainline the two disagreed and this panel replayed one position's
 * principal variation on another. chess.js rejected the moves, the SAN list
 * came out empty or truncated, and the tab showed lines that had nothing to
 * do with what was on screen. Both now come from the same FEN-keyed source.
 */
/**
 * Accuracy controls for the position on the board.
 *
 * These existed only behind the small "d16" chip in the nav bar, which set
 * the WHOLE-GAME review depth — so there was no way to ask for a harder look
 * at the one position you were staring at without also making every future
 * game review slower. Depth and line count here apply to the current
 * position only.
 */
function LinesControls({
  settings,
  onChange,
  engineName,
  onEngineNameChange,
  reachedDepth,
  analyzing,
  fromCloud,
}: {
  settings: LinesSettings;
  onChange: (next: LinesSettings) => void;
  engineName: EngineName;
  onEngineNameChange?: (n: EngineName) => void;
  reachedDepth: number;
  analyzing: boolean;
  fromCloud: boolean;
}) {
  const [open, setOpen] = useState(false);

  const chip = (
    label: string,
    active: boolean,
    onClick: () => void,
    title?: string
  ) => (
    // describeChild, because MUI's Tooltip otherwise sets aria-label to the
    // tooltip text and REPLACES the child's own name: d22 and d26 both
    // announced as "Deeper and slower — seconds per position in a browser",
    // indistinguishable to a screen reader and to any name-based query.
    <Tooltip
      title={title ?? ""}
      describeChild
      disableHoverListener={!title}
      key={label}
    >
      <Box
        component="button"
        type="button"
        onClick={onClick}
        sx={{
          cursor: "pointer",
          font: "inherit",
          px: 1,
          py: 0.35,
          borderRadius: "7px",
          fontFamily: "Monaco, Menlo, monospace",
          fontSize: "0.72rem",
          fontWeight: 700,
          lineHeight: 1.4,
          background: active
            ? "linear-gradient(135deg, rgba(249,115,22,0.22), rgba(251,146,60,0.14))"
            : "rgba(255,255,255,0.04)",
          border: active
            ? "1px solid rgba(249,115,22,0.45)"
            : "1px solid rgba(255,255,255,0.1)",
          color: active ? "#FB923C" : "rgba(255,255,255,0.7)",
          transition: "all 150ms ease",
          "&:hover": {
            borderColor: active
              ? "rgba(249,115,22,0.65)"
              : "rgba(255,255,255,0.24)",
            color: active ? "#FB923C" : "rgba(255,255,255,0.95)",
          },
        }}
      >
        {label}
      </Box>
    </Tooltip>
  );

  const label = (text: string) => (
    <Typography
      sx={{
        fontSize: "0.64rem",
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.4)",
        minWidth: 44,
      }}
    >
      {text}
    </Typography>
  );

  return (
    <Box
      sx={{
        mb: 1.5,
        borderRadius: "0.6rem",
        background: "rgba(0,0,0,0.22)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Collapsed summary — the settings that are in force right now. */}
      <Box
        component="button"
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        sx={{
          width: "100%",
          cursor: "pointer",
          font: "inherit",
          background: "none",
          border: "none",
          px: 1.25,
          py: 0.85,
          display: "flex",
          alignItems: "center",
          gap: 1,
          color: "rgba(255,255,255,0.7)",
          "&:hover": { color: "rgba(255,255,255,0.95)" },
        }}
      >
        <Activity size={13} color="#FB923C" />
        <Typography
          sx={{
            fontSize: "0.74rem",
            fontWeight: 600,
            fontFamily: "Monaco, Menlo, monospace",
            color: "inherit",
          }}
        >
          {settings.count} lines · target d{settings.depth}
          {analyzing && reachedDepth > 0 ? ` · at d${reachedDepth}` : ""}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography
          sx={{
            fontSize: "0.68rem",
            color: "rgba(255,255,255,0.45)",
            whiteSpace: "nowrap",
          }}
        >
          {open ? "Hide" : "Accuracy"}
        </Typography>
        <ChevronRight
          size={13}
          style={{
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 160ms ease",
          }}
        />
      </Box>

      {open && (
        <Box
          sx={{
            px: 1.25,
            pb: 1.25,
            pt: 0.25,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <Stack direction="row" spacing={0.6} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.6 }}>
            {label("Depth")}
            {LINES_DEPTHS.map((d) =>
              chip(
                `d${d}`,
                settings.depth === d,
                () => onChange({ ...settings, depth: d }),
                d >= 22
                  ? "Deeper and slower — seconds per position in a browser"
                  : undefined
              )
            )}
          </Stack>

          <Stack direction="row" spacing={0.6} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.6 }}>
            {label("Lines")}
            {LINES_COUNTS.map((n) =>
              chip(String(n), settings.count === n, () =>
                onChange({ ...settings, count: n })
              )
            )}
          </Stack>

          <Stack direction="row" spacing={0.6} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.6 }}>
            {label("Engine")}
            {chip(
              "17 Lite",
              engineName === EngineName.Stockfish17Lite,
              () => onEngineNameChange?.(EngineName.Stockfish17Lite),
              "Single-threaded — fastest to start, works on restricted networks"
            )}
            {chip(
              "17 Full",
              engineName === EngineName.Stockfish17,
              () => onEngineNameChange?.(EngineName.Stockfish17),
              "NNUE — stronger per depth, heavier to load"
            )}
          </Stack>

          {/* The honest part. Without this the engine buttons above are
              decorative on any position Lichess already knows. */}
          <Box
            component="button"
            type="button"
            onClick={() =>
              onChange({
                ...settings,
                preferLocalEngine: !settings.preferLocalEngine,
              })
            }
            sx={{
              mt: 0.25,
              cursor: "pointer",
              font: "inherit",
              textAlign: "left",
              px: 1,
              py: 0.75,
              borderRadius: "7px",
              background: settings.preferLocalEngine
                ? "rgba(249,115,22,0.1)"
                : "rgba(255,255,255,0.03)",
              border: settings.preferLocalEngine
                ? "1px solid rgba(249,115,22,0.35)"
                : "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "flex-start",
              gap: 1,
            }}
          >
            <Box
              sx={{
                mt: "2px",
                width: 13,
                height: 13,
                flexShrink: 0,
                borderRadius: "4px",
                border: settings.preferLocalEngine
                  ? "1px solid #FB923C"
                  : "1px solid rgba(255,255,255,0.3)",
                background: settings.preferLocalEngine ? "#FB923C" : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#0A0A0A",
                fontSize: "0.6rem",
                fontWeight: 900,
                lineHeight: 1,
              }}
            >
              {settings.preferLocalEngine ? "✓" : ""}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  color: settings.preferLocalEngine
                    ? "#FB923C"
                    : "rgba(255,255,255,0.85)",
                  lineHeight: 1.3,
                }}
              >
                Use my engine, not the cloud
              </Typography>
              <Typography
                sx={{
                  fontSize: "0.7rem",
                  color: "rgba(255,255,255,0.5)",
                  lineHeight: 1.45,
                  mt: 0.2,
                }}
              >
                {settings.preferLocalEngine
                  ? `Every line is computed here by ${engineName} at your depth.`
                  : fromCloud
                  ? "These lines came from Lichess's cloud, which is deeper than this browser reaches."
                  : "Lichess's cloud answers when it has a deeper result; otherwise your engine does."}
              </Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

function EngineLinesPanel({
  position,
  fen,
  engineName,
  status = "searching",
  exploring,
  onReturnToAnchor,
  settings,
  onSettingsChange,
  onEngineNameChange,
}: {
  position: PositionEval | null;
  fen: string;
  engineName: EngineName;
  status?: LinesStatus;
  /** Non-null while the board is off the mainline. */
  exploring?: ExplorationPreview | null;
  onReturnToAnchor?: () => void;
  settings: LinesSettings;
  onSettingsChange: (next: LinesSettings) => void;
  onEngineNameChange?: (n: EngineName) => void;
}) {
  const analyzing = status === "searching" || status === "starting";
  const lines = position?.lines ?? [];
  const fromCloud = position?.source === "cloud";
  // Depth actually reached, which is not necessarily the depth requested —
  // a search still running reports a lower one, and a cloud answer usually
  // reports a much higher one.
  const reachedDepth = lines[0]?.depth ?? 0;
  // Guard: only render a line whose moves are actually legal from `fen`. A
  // stale eval arriving for the previous position would otherwise print a
  // plausible-looking but wrong variation.
  const sanLines = useMemo(() => {
    return lines
      .slice(0, settings.count)
      .map((line) => {
        const g = new Chess(fen);
        const sans: string[] = [];
        for (const uci of line.pv.slice(0, 8)) {
          let mv;
          try {
            mv = g.move({
              from: uci.slice(0, 2),
              to: uci.slice(2, 4),
              promotion: uci.length >= 5 ? uci[4] : "q",
            });
          } catch {
            break;
          }
          if (!mv) break;
          sans.push(mv.san);
        }
        return { line, sans };
      })
      .filter((l) => l.sans.length > 0);
  }, [lines, fen, settings.count]);

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

  // Whose move it is, so the variation reads "13.Bg5 Nbd7" rather than a bare
  // move list the reader has to count out.
  const startPly = useMemo(() => {
    try {
      const g = new Chess(fen);
      const full = Number(fen.split(" ")[5] ?? 1);
      return g.turn() === "w" ? full * 2 - 1 : full * 2;
    } catch {
      return 1;
    }
  }, [fen]);

  const renderVariation = (sans: string[]) =>
    sans
      .map((san, i) => {
        const ply = startPly + i;
        const moveNum = Math.ceil(ply / 2);
        if (ply % 2 === 1) return `${moveNum}.${san}`;
        return i === 0 ? `${moveNum}...${san}` : san;
      })
      .join(" ");

  const emptyMessage =
    status === "terminal"
      ? "Game over in this position — nothing to search."
      : status === "unsupported"
      ? "This browser can't run Stockfish (WebAssembly is unavailable here)."
      : status === "starting"
      ? "Starting Stockfish…"
      : status === "searching"
      ? "Stockfish is searching this position…"
      : "No lines for this position yet.";

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
          gap: 1,
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
        <Stack direction="row" spacing={1} alignItems="center">
          {analyzing && (
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
          )}
          {/* Who actually answered.
              This used to be a static `{engineName}` label, which was wrong
              whenever the number came from Lichess's cloud eval — and for
              common positions it usually does, because the cloud holds depth
              60 and the code takes it whenever it beats the requested depth.
              An engine selector is meaningless if the panel can't say which
              engine the numbers in front of you came from. */}
          <Tooltip
            describeChild
            title={
              fromCloud
                ? `Lichess cloud analysis, depth ${reachedDepth} — deeper than this browser would reach. Turn on "Use my engine" below to force ${engineName}.`
                : `Computed in your browser by ${engineName}`
            }
          >
            <Box
              sx={{
                color: fromCloud ? "#93C5FD" : "rgba(255,255,255,0.42)",
                fontSize: "0.72rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                whiteSpace: "nowrap",
                cursor: "help",
              }}
            >
              {fromCloud ? `Lichess cloud · d${reachedDepth}` : engineName}
            </Box>
          </Tooltip>
        </Stack>
      </Box>

      <LinesControls
        settings={settings}
        onChange={onSettingsChange}
        engineName={engineName}
        onEngineNameChange={onEngineNameChange}
        reachedDepth={reachedDepth}
        analyzing={analyzing}
        fromCloud={fromCloud}
      />

      {/* Which position these lines describe. Without it, an explored branch
          and its anchor look identical here — the complaint that started
          this: it was hard to tell where you were, let alone get back. */}
      {exploring && (
        <Box
          sx={{
            mb: 1.5,
            px: 1.25,
            py: 0.85,
            borderRadius: "0.6rem",
            background: "rgba(251,191,36,0.08)",
            border: "1px solid rgba(251,191,36,0.28)",
          }}
        >
          <Typography
            sx={{
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#FBBF24",
              mb: 0.4,
            }}
          >
            Off the mainline
          </Typography>
          <Typography
            sx={{
              fontFamily: "Monaco, Menlo, monospace",
              fontSize: "0.76rem",
              color: "rgba(255,255,255,0.8)",
              wordBreak: "break-word",
            }}
          >
            {exploring.path.join(" ")}
          </Typography>
          {onReturnToAnchor && (
            <Box
              component="button"
              type="button"
              onClick={onReturnToAnchor}
              sx={{
                mt: 0.75,
                cursor: "pointer",
                border: "none",
                background: "none",
                p: 0,
                font: "inherit",
                fontSize: "0.74rem",
                fontWeight: 600,
                color: "rgba(255,255,255,0.6)",
                textDecoration: "underline",
                "&:hover": { color: "#FBBF24" },
              }}
            >
              Back to move {Math.max(1, Math.ceil(exploring.anchorPly / 2))} (Esc)
            </Box>
          )}
        </Box>
      )}

      {sanLines.length === 0 ? (
        <Box
          sx={{
            color: "rgba(255,255,255,0.42)",
            fontSize: "0.84rem",
            py: 3,
            textAlign: "center",
          }}
        >
          {emptyMessage}
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
                {renderVariation(sans)}
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

// ─── "Which side were you playing?" inline ask ───────────────────────────
// Shown once per game inside the coach stream when the player's side
// can't be inferred (no username match, no stored answer). Answering
// threads playerColor into every analysis/chat request and persists the
// choice per-game. Dark-glass styling; the two side buttons are equal
// choices, so ember stays a hover accent rather than a fill.
function PlayerSideAsk({
  onChoose,
}: {
  onChoose: (color: PlayerSideColor) => void;
}) {
  const sideButton = (color: PlayerSideColor) => (
    <Box
      component="button"
      onClick={() => onChoose(color)}
      aria-label={`I was playing ${color}`}
      sx={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.75,
        px: 1.75,
        py: 1,
        cursor: "pointer",
        borderRadius: "12px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.12)",
        color: "rgba(255,255,255,0.92)",
        fontSize: "0.82rem",
        fontWeight: 700,
        fontFamily: "inherit",
        transition: "all 180ms ease",
        "&:hover": {
          background: "rgba(249,115,22,0.14)",
          borderColor: "rgba(249,115,22,0.5)",
          color: "#FB923C",
          transform: "translateY(-1px)",
        },
      }}
    >
      <Box
        component="span"
        sx={{ fontSize: "1.1rem", lineHeight: 1 }}
        aria-hidden
      >
        {color === "white" ? "♔" : "♚"}
      </Box>
      {color === "white" ? "White" : "Black"}
    </Box>
  );
  return (
    <Box
      data-testid="player-side-ask"
      sx={{
        alignSelf: "stretch",
        borderRadius: "1rem",
        background: "rgba(20,22,28,0.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
        px: 2,
        py: 1.75,
      }}
    >
      <Typography
        sx={{
          fontSize: "0.85rem",
          fontWeight: 600,
          color: "rgba(255,255,255,0.9)",
          mb: 1.25,
        }}
      >
        Quick check — which side were you playing?
      </Typography>
      <Stack direction="row" spacing={1.25}>
        {sideButton("white")}
        {sideButton("black")}
      </Stack>
      <Typography
        sx={{
          fontSize: "0.7rem",
          color: "rgba(255,255,255,0.45)",
          mt: 1,
          lineHeight: 1.4,
        }}
      >
        The coach tailors its analysis to your side — mistakes, plans, and
        praise all depend on it.
      </Typography>
    </Box>
  );
}

// Compact chip showing which side the coach is coaching, with a one-click
// switch — surfaced when the side was inferred (username match) or
// remembered, so a wrong guess is one tap away from correct.
function PlayerSideChip({
  side,
  onChoose,
}: {
  side: PlayerSide;
  onChoose?: (color: PlayerSideColor) => void;
}) {
  const other: PlayerSideColor = side.color === "white" ? "black" : "white";
  const sourceLabel =
    side.source === "username_match"
      ? "matched your username"
      : side.source === "stored_choice"
        ? "remembered from last time"
        : "your choice";
  return (
    <Tooltip title={`Side ${sourceLabel} — click to switch to ${other}`}>
      <Box
        data-testid="player-side-chip"
        onClick={() => onChoose?.(other)}
        sx={{
          alignSelf: "center",
          display: "flex",
          alignItems: "center",
          gap: 0.6,
          px: 1.25,
          py: 0.4,
          cursor: onChoose ? "pointer" : "default",
          borderRadius: "999px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          transition: "all 180ms ease",
          "&:hover": onChoose
            ? {
                background: "rgba(249,115,22,0.1)",
                borderColor: "rgba(249,115,22,0.4)",
              }
            : {},
        }}
      >
        <Box component="span" sx={{ fontSize: "0.85rem", lineHeight: 1 }} aria-hidden>
          {side.color === "white" ? "♔" : "♚"}
        </Box>
        <Typography
          sx={{
            fontSize: "0.68rem",
            fontWeight: 600,
            color: "rgba(255,255,255,0.65)",
          }}
        >
          Coaching you as {side.color === "white" ? "White" : "Black"}
        </Typography>
        {onChoose && (
          <Typography
            sx={{
              fontSize: "0.68rem",
              fontWeight: 700,
              color: "#FB923C",
            }}
          >
            · switch
          </Typography>
        )}
      </Box>
    </Tooltip>
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
  suggestions,
  playerSide,
  sideUiEligible,
  onChoosePlayerSide,
}: {
  messages: CoachMessage[];
  input: string;
  onChangeInput: (v: string) => void;
  onSend: () => void;
  onSuggestion: (s: string) => void;
  isThinking: boolean;
  onPromoteToBoard?: (puzzles: DrillPuzzle[], startIndex: number) => void;
  allMoves?: Move[];
  /** ply-only → jump the cursor; with `playSan` → load the recommended
   *  alternative onto the board as an exploration preview. */
  onMoveRefClick?: (ply: number, playSan?: string) => void;
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
  /** Per-game suggestion pills — first entry is the pinned "Analyze my
   *  game" rendered in ember; the rest are rule-derived neutral pills.
   *  Computed by the parent (AnalysisPage) so the command palette can
   *  share the same list. */
  suggestions: Suggestion[];
  /** The side the user played (inferred or chosen), null while ambiguous. */
  playerSide?: PlayerSide | null;
  /** True when a real game (not demo/puzzle/bare FEN) is loaded — gates
   *  both the inline "Which side were you playing?" ask (playerSide null)
   *  and the assumed-side switch chip (playerSide set). */
  sideUiEligible?: boolean;
  onChoosePlayerSide?: (color: PlayerSideColor) => void;
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
          {sideUiEligible && playerSide && (
            <PlayerSideChip side={playerSide} onChoose={onChoosePlayerSide} />
          )}
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
          {sideUiEligible && !playerSide && onChoosePlayerSide && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
              style={{ alignSelf: "stretch" }}
            >
              <PlayerSideAsk onChoose={onChoosePlayerSide} />
            </motion.div>
          )}
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
          {suggestions.map((s) => (
            <Box
              key={s.text}
              onClick={() => onSuggestion(s.text)}
              sx={{
                cursor: "pointer",
                px: 1.5,
                py: 0.6,
                borderRadius: "999px",
                // Pinned suggestions (just "Analyze my game" today) get
                // the ember accent always-on so they read as a primary
                // CTA among the rule-derived neutral pills.
                background: s.pinned
                  ? "rgba(249,115,22,0.14)"
                  : "rgba(255,255,255,0.04)",
                border: s.pinned
                  ? "1px solid rgba(249,115,22,0.45)"
                  : "1px solid rgba(255,255,255,0.08)",
                fontSize: "0.78rem",
                color: s.pinned ? "#FB923C" : "rgba(255,255,255,0.78)",
                fontWeight: s.pinned ? 600 : 400,
                transition: "all 180ms ease",
                "&:hover": {
                  background: s.pinned
                    ? "rgba(249,115,22,0.22)"
                    : "rgba(249,115,22,0.12)",
                  borderColor: "rgba(249,115,22,0.45)",
                  color: "#FB923C",
                  transform: "translateY(-1px)",
                },
              }}
            >
              {s.text}
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

// G7 move-reference parser + green-link exploration helpers — extracted to
// coachMoveRefs.ts (2026-08-10) so the "click a recommended move → the
// board loads that line" behavior is unit-tested. See that module for the
// pattern table + RECOMMENDED_CONTEXT_RE.

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

    // Get FEN before this move by replaying loadedGame's history from its
    // ROOT — a FEN-loaded game does not start from the standard position.
    let fenBefore: string | null = null;
    try {
      const { board } = replayFromRoot(
        loadedGame.history(),
        halfMoveIdx,
        getRootFen(loadedGame)
      );
      fenBefore = board.fen();
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
  // showWhy is open by default so the card's actual analysis is visible
  // immediately. The headline alone is a non-spoiler one-liner and was
  // never enough on its own to demonstrate value — users had to click
  // four reveals per card (Why / Threats / Roles / Concept) to read a
  // single insight, and at five-card carousels that's 20+ clicks. The
  // spoiler-avoidance design assumed users wanted to think about the
  // position first; in practice with no progressive-reveal UI elsewhere
  // on the page the convention isn't legible. The three secondary
  // reveals (Threats / Roles / Concept) stay closed by default — they
  // are supplementary context and the user can opt in if they want it.
  const [showWhy, setShowWhy] = useState(true);
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
  /** Fired when the user clicks a move reference in coach text. `playSan`
   *  is set for recommended-alternative (green) refs: the parent replays
   *  to `ply` and plays `playSan` on the board (exploration preview). */
  onMoveRefClick?: (ply: number, playSan?: string) => void;
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
        // clickable, and clicking must actually LOAD the alternative onto
        // the board: pass the SAN alongside the anchor ply so the parent
        // handler (handleCoachMoveRef) replays the mainline to the anchor
        // and plays the recommended move as an exploration preview.
        // (Founder bug 2026-08-10: the old handler only did
        // setCurrentPly(anchor) — a no-op when the user was already
        // sitting on the mistake ply, so green links "did nothing".)
        const recommendedTargetPly =
          ref.recommended && matchedPly === null
            ? plyBeforeMove(ref.moveNumber, ref.isBlack)
            : null;
        const ply = matchedPly ?? recommendedTargetPly;
        if (ply !== null) {
          const playSan =
            ref.recommended && matchedPly === null ? ref.san : undefined;
          const recColor = "#86efac"; // light green for recommended
          const navColor = isUser ? "#0A0A0A" : "#FB923C";
          out.push(
            <Box
              key={`${boldIdx}m${ref.start}`}
              component="span"
              onClick={() => onMoveRefClick(ply, playSan)}
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
      {msg.incomplete && !isUser && (
        // D4 / T5 (SILENT_SUBSTITUTION_HANDOFF §3 Group D, §4): this answer is
        // a fragment — the stream ended with no `done` event, or the server
        // reported the deep-validation pass timed out. Both used to render
        // EXACTLY like a finished answer, so the user had no way to tell an
        // incomplete analysis from a complete one. Excluding it from the
        // model's history (already done) protects the model; this is what
        // protects the reader.
        <Box
          sx={{
            mt: 1,
            px: 1.25,
            py: 0.75,
            borderRadius: "0.6rem",
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            background: "rgba(249,115,22,0.08)",
            border: "1px solid rgba(249,115,22,0.25)",
            color: "rgba(255,237,213,0.85)",
            fontSize: "0.78rem",
            lineHeight: 1.4,
          }}
        >
          <AlertTriangle size={13} style={{ flexShrink: 0 }} />
          <span>
            This answer was cut off before it finished — treat it as partial,
            and ask again for the full explanation.
          </span>
        </Box>
      )}
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

/**
 * Board controls, sized to share the strip under the board with the eval
 * sparkline.
 *
 * Was a standalone full-width pill below BOTH columns with 42px buttons and a
 * stacked "MOVE" caption. Now: 34px buttons, one-line move readout, and the
 * arrow-overlay toggles ride in the middle via `arrows` rather than occupying
 * a card of their own.
 */
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
            width: 34,
            height: 34,
            borderRadius: "9px",
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
        display: "flex",
        alignItems: "center",
        gap: 0.6,
        flexWrap: "wrap",
        rowGap: 1,
      }}
    >
      <NavButton
        onClick={() => onJumpTo(0)}
        disabled={currentPly === 0}
        tooltip="Start (Home)"
      >
        <ChevronsLeft size={16} />
      </NavButton>
      <NavButton
        onClick={() => onJumpTo(Math.max(0, currentPly - 1))}
        disabled={currentPly === 0}
        tooltip="Previous move (←)"
      >
        <ChevronLeft size={16} />
      </NavButton>

      <Box
        sx={{
          mx: 0.5,
          px: 1.25,
          py: 0.55,
          borderRadius: "9px",
          background: "rgba(249,115,22,0.08)",
          border: "1px solid rgba(249,115,22,0.2)",
          minWidth: 62,
          textAlign: "center",
        }}
      >
        {(() => {
          const disp = plyToMoveDisplay(currentPly);
          return disp.color === null ? (
            <Typography
              sx={{
                fontSize: "0.76rem",
                fontWeight: 700,
                color: "#FB923C",
                fontFamily: "Monaco, Menlo, monospace",
                lineHeight: 1.4,
              }}
            >
              Start
            </Typography>
          ) : (
            <Stack
              direction="row"
              spacing={0.6}
              alignItems="center"
              justifyContent="center"
              sx={{ lineHeight: 1.4 }}
            >
              <Typography
                sx={{
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  color: "#FB923C",
                  fontFamily: "Monaco, Menlo, monospace",
                  lineHeight: 1.4,
                }}
              >
                {disp.moveNum}
              </Typography>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: disp.color === "white" ? "#F0D9B5" : "#1A1814",
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
      </Box>

      <NavButton
        onClick={() => onJumpTo(Math.min(totalPlies, currentPly + 1))}
        disabled={currentPly === totalPlies}
        tooltip="Next move (→)"
      >
        <ChevronRight size={16} />
      </NavButton>
      <NavButton
        onClick={() => onJumpTo(totalPlies)}
        disabled={currentPly === totalPlies}
        tooltip="End"
      >
        <ChevronsRight size={16} />
      </NavButton>

      <Box sx={{ flex: 1, minWidth: 8 }} />

      <NavButton onClick={onFlip} tooltip="Flip board (F)">
        <RotateCw size={15} />
      </NavButton>
      <NavButton onClick={onReset} tooltip="Reset to start">
        <RefreshCw size={15} />
      </NavButton>
      <Tooltip title="Copy a link to this position">
        <span>
          <IconButton
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                navigator.clipboard.writeText(window.location.href);
              }
            }}
            sx={{
              width: 34,
              height: 34,
              borderRadius: "9px",
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
            <Share2 size={15} />
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

  // Loaded game — an empty board on cold start, a puzzle stub
  // (?puzzleFen=...), or whatever the user just imported via URL param /
  // LoadGameDialog. Mutable because we hot-swap the game when the user
  // pastes a new PGN.
  const [loadedGame, setLoadedGame] = useState<Chess>(() => {
    const g = new Chess();
    if (puzzleFen) {
      g.loadPgn(`[FEN "${decodeURIComponent(puzzleFen)}"]\n[SetUp "1"]\n*`);
    }
    return g;
  });

  const allMoves = useMemo(
    () => loadedGame.history({ verbose: true }) as Move[],
    [loadedGame]
  );
  /**
   * The position this game starts from — a FEN when it was loaded from one
   * (?fen=, ?puzzleFen=, a pasted FEN, a position-only coach insight),
   * undefined for an ordinary PGN. Everything that replays the move list has
   * to start here; see getRootFen.
   */
  const rootFen = useMemo(() => getRootFen(loadedGame), [loadedGame]);
  // False until something is actually loaded — the cold-start board is the
  // start position with no history, and a bare-FEN load has no history
  // either, so move count alone can't tell the two apart. Drives the page's
  // empty state (board placeholder, coach copy, suggestion pills).
  const [gameLoaded, setGameLoaded] = useState(Boolean(puzzleFen));
  const hasGame = gameLoaded || allMoves.length > 0;
  const headers = useMemo(() => loadedGame.header(), [loadedGame]);
  // Live opening detection — falls back to the PGN-supplied header. Most
  // imported games have an Opening tag (chess.com fills it, lichess fills
  // it on long games), but PGN pastes, FEN loads, and the demo game ship
  // without one. detectOpening() walks the move list against the openings
  // trie and returns the longest matching name + ECO. Memoised on
  // loadedGame so a click-through navigation doesn't trie-walk per render.
  const detectedOpening = useMemo(
    () => detectOpening(loadedGame),
    [loadedGame],
  );
  const openingLabel = useMemo(() => {
    const pgnOpening = headers.Opening?.trim();
    if (pgnOpening) {
      // Prefer the PGN header — it's chess.com / lichess's verbatim label,
      // including specific variation names ("Sicilian Defense: Najdorf,
      // English Attack") that the local trie won't always reach.
      return headers.ECO ? `${pgnOpening} (${headers.ECO})` : pgnOpening;
    }
    if (!detectedOpening || detectedOpening.name === "Opening") return "—";
    return detectedOpening.eco
      ? `${detectedOpening.name} (${detectedOpening.eco})`
      : detectedOpening.name;
  }, [headers.Opening, headers.ECO, detectedOpening]);

  // ───── Real Stockfish evaluation ─────
  // Stockfish17Lite is single-threaded — works on networks that block
  // SharedArrayBuffer (school WiFi) and has the fastest cold start.
  // Depth 16 everywhere: sharper tactics for the coach's ground truth,
  // at the cost of a longer first eval pass (progress bar covers it).
  const [engineSettings, setEngineSettings] = useState<{
    depth: number;
    engineName: EngineName;
  }>({ depth: 16, engineName: EngineName.Stockfish17Lite });
  const engine = useEngine(engineSettings.engineName);

  /**
   * How hard to think about the ONE position on the board, as opposed to
   * `engineSettings.depth`, which is the whole-game review pass.
   *
   * They have to be separate. The review pass evaluates every ply, so depth
   * there is multiplied by the length of the game — pushing it to 22 turns a
   * 40-move game into minutes of work. The Lines tab is a single position, so
   * it can afford depth the review never could, which is the whole point of
   * letting someone dial in the accuracy they want.
   */
  const [linesSettings, setLinesSettings] = useState<LinesSettings>({
    depth: 18,
    count: 3,
    preferLocalEngine: false,
  });
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
  // into "mistake" markers. Empty until classification lands — there is no
  // hand-authored fallback any more, because a fallback keyed by ply number
  // labels the wrong moves on every game but the one it was written for.
  const liveKeyMoments = useMemo<KeyMoment[]>(() => {
    if (!classifiedPositions) return [];
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
  }, [classifiedPositions, loadedGame]);

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

  // Flat 0.00 until Stockfish reports. This used to be a hand-authored
  // "plausible" curve shaped around the Kasparov demo's rook sacrifice, which
  // on any other game drew swings that never happened. A flat line plus the
  // sparkline's own "Stockfish · N%" chip says what's true: nothing evaluated
  // yet.
  const placeholderEvalSeries = useMemo(
    () => new Array(allMoves.length + 1).fill(0) as number[],
    [allMoves.length]
  );
  const evalSeries = useMemo<number[]>(() => {
    if (!enginePositions) return placeholderEvalSeries;
    return enginePositions.map((p) => {
      const line = p.lines?.[0];
      if (!line) return 0;
      if (typeof line.mate === "number") return line.mate > 0 ? 10 : -10;
      if (typeof line.cp === "number")
        return Math.max(-12, Math.min(12, line.cp / 100));
      return 0;
    });
  }, [enginePositions, placeholderEvalSeries]);
  // Gated on allMoves so the empty board doesn't read as "analysis in
  // progress" forever — the evaluate effect below bails on an empty move
  // list, so enginePositions would stay null and the composer stay locked.
  const analysisActive =
    allMoves.length > 0 &&
    engine !== null &&
    enginePositions === null &&
    analysisError === null;

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

  // Which side did the user play in the loaded game? Null = ambiguous →
  // CoachPanel shows the inline "Which side were you playing?" ask before
  // the first analysis request. Set by loadNewGame (username match against
  // the PGN headers, or a stored per-game answer) or by the user clicking
  // the ask card / the switch chip. Threads into coachExtras.playerColor.
  const [playerSide, setPlayerSide] = useState<PlayerSide | null>(null);

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
    // The user's side. An explicit/inferred answer (playerSide) wins; the
    // board orientation is only the last-resort assumption when the side
    // is still ambiguous (user hasn't answered the inline ask yet).
    // A3 (SILENT_SUBSTITUTION_HANDOFF §3 Group A): `playerSide` is null
    // whenever username→PGN-header matching failed and the user has not
    // answered the "which side were you playing?" card. Board orientation is
    // then a GUESS (and defaults to white).
    //
    // `playerColor` still falls back to the guess because the mechanics need a
    // side to filter mistakes by. `playerColorName` does NOT: it is what the
    // prompt turns into "Always analyze the game from the perspective of
    // <user> playing as White", asserted as fact. Sending it unconfirmed is
    // how a Black-side player gets their opponent's moves reviewed as their
    // own. Confirmed side → assert it; guess → say it is unknown.
    const sideConfirmed = playerSide != null;
    const sideName: "white" | "black" = playerSide?.color ?? boardOrientation;
    const playerColor: "w" | "b" = sideName === "white" ? "w" : "b";
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
      playerColorName: sideConfirmed ? sideName : undefined,
      boardOrientation,
      // A1 (SILENT_SUBSTITUTION_HANDOFF): the real rating, or `undefined` when
      // the user has none. Never a default — the request body used to hardcode
      // 1500, which made the server's profile/PGN-header fallbacks dead code
      // and coached every user in the product as a 1500.
      userRating: resolveUserRating(profile),
      username:
        user?.displayName ?? user?.email?.split("@")[0] ?? undefined,
      chesscomUsername,
      lichessUsername,
      personalityId: personality.id,
    };
  }, [
    playerSide,
    boardOrientation,
    profile,
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

    // FEN at the position BEFORE the mistake, from the game's root.
    const { board: g } = replayFromRoot(allMoves, currentPly - 1, rootFen);
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

  // Per-game suggestion pills shown above the coach input + in the
  // command palette's "Coach" section. Replaces the old static
  // SUGGESTION_PILLS constant. Pinned "Analyze my game" + up to 3 rule-
  // derived suggestions based on the actual game's classifications,
  // opening, and current cursor position. See generateSuggestions.ts.
  // With nothing loaded, every game-derived pill ("Analyze my game", "What's
  // the most important moment in this game?") points at a game that doesn't
  // exist. Offer the one thing that does something instead.
  const coachSuggestions = useMemo(
    () =>
      !hasGame
        ? [
            { text: "How do I load a game?", pinned: true },
            { text: "What can you help me with?" },
          ]
        : generateSuggestions({
            loadedGame,
            enginePositions: classifiedPositions,
            mistakeContext: mistakeContext
              ? {
                  movePlayed: mistakeContext.movePlayed,
                  classification:
                    classifiedPositions?.[currentPly]?.moveClassification,
                }
              : null,
            openingName:
              headers.Opening?.trim() || detectedOpening?.name || null,
          }),
    [
      hasGame,
      loadedGame,
      classifiedPositions,
      mistakeContext,
      currentPly,
      headers.Opening,
      detectedOpening,
    ],
  );

  // Derived: current FEN + last move + check by replaying moves up to currentPly
  const { currentFen, lastMove, isInCheck } = useMemo(() => {
    // Replay from the game's ROOT, not from a fresh board. For a game loaded
    // from a FEN there are no moves to replay, so `new Chess()` handed the
    // whole page the standard start position — board, eval bar, Lines tab and
    // coach context all described a position the user never asked for, under a
    // greeting that said "Loaded a custom position".
    const { board, lastMove: last } = replayFromRoot(
      allMoves,
      currentPly,
      rootFen
    );
    return {
      currentFen: board.fen(),
      lastMove: last,
      isInCheck: board.inCheck(),
    };
  }, [allMoves, currentPly, rootFen]);

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
            // D3: UI-authored greeting, not model output.
            synthetic: true,
            content: solutionParam
              ? `Loaded a puzzle position. Solution: **${solutionParam.replace("-", " → ")}**. Ask me anything about the tactical idea, or try alternatives on the board.`
              : `Loaded a puzzle position. Ask me to walk through the tactical idea.`,
            ply: 0,
          },
        ]
      : EMPTY_STATE_MESSAGES
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
  // Also reset when the player's declared side changes: the deep-analysis
  // context (and the system prompt it caches) is composed for a specific
  // playerColor — /api/chat follow-ups would otherwise keep coaching the
  // wrong side until the next game load.
  useEffect(() => {
    coachContextIdRef.current = null;
  }, [loadedGame, selectedPersonalityId, playerSide?.color]);

  // User answered the "Which side were you playing?" ask (or hit the
  // switch chip). Flip the board to their side and persist per-game so a
  // reload of the same PGN doesn't re-ask.
  const handleChoosePlayerSide = useCallback(
    (color: PlayerSideColor) => {
      setPlayerSide({ color, source: "user_choice" });
      setBoardOrientation(color);
      try {
        storeSide(
          gameSideKey(loadedGame.header(), loadedGame.history().length),
          color
        );
      } catch {
        /* persistence is best-effort */
      }
    },
    [loadedGame]
  );

  // Replace the loaded game from a fresh Chess instance (e.g. user pasted
  // a PGN, or a URL param brought one in). Resets cursor + seed chat +
  // analysis cache via the useEffect on [loadedGame]. Pass keepChat=true
  // to preserve existing message history (e.g. on insight permalinks).
  const loadNewGame = useCallback(
    (game: Chess, opts?: { keepChat?: boolean; greeting?: string }) => {
      setLoadedGame(game);
      setGameLoaded(true);
      setCurrentPly(0);
      // G13 (extended 2026-08-10): resolve which side the user played.
      //  1. Username match against the White/Black headers — any known
      //     handle (lichess/chess.com localStorage stash, display name,
      //     email prefix). Broader than the old check, which required a
      //     chess.com/lichess Site header before even trying.
      //  2. A stored per-game answer from a previous "Which side?" ask.
      //  3. Neither → playerSide null → CoachPanel asks inline before the
      //     first analysis request.
      // On any resolution the board flips so the user's side is at the
      // bottom (same behavior the old username_match path had).
      try {
        let resolved: PlayerSide | null = null;
        if (typeof window !== "undefined") {
          const clean = (v: string | null) =>
            v ? v.replace(/^"|"$/g, "") : null;
          const candidates = [
            clean(window.localStorage.getItem("lichess-username")),
            clean(window.localStorage.getItem("chesscom-username")),
            user?.displayName,
            user?.email?.split("@")[0],
          ];
          const headers = game.header();
          const inferred = inferPlayerSideFromHeaders(headers, candidates);
          if (inferred) {
            resolved = { color: inferred, source: "username_match" };
          } else {
            const stored = loadStoredSide(
              gameSideKey(headers, game.history().length)
            );
            if (stored) resolved = { color: stored, source: "stored_choice" };
          }
        }
        setPlayerSide(resolved);
        if (resolved) setBoardOrientation(resolved.color);
      } catch {
        /* defensive — color detection should never block a game load */
        setPlayerSide(null);
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
        // chess.js fills an absent Date with the PGN placeholder
        // "????.??.??", which used to render as "(????)" in the greeting.
        const year = newHeaders.Date?.split(".")[0];
        const yearSuffix = year && /^\d{4}$/.test(year) ? ` (${year})` : "";
        const greeting =
          opts?.greeting ??
          (newHeaders.White && newHeaders.Black
            ? `Loaded **${newHeaders.White} vs ${newHeaders.Black}**${yearSuffix}. Stockfish is running in the background; once it's done the Moves tab will light up with classifications. Ask me about any move.`
            : `Loaded a new game. Stockfish is running in the background. Ask me anything about the position or a specific move.`);
        setMessages([
          // D3: UI-authored greeting, not model output.
          { role: "coach", content: greeting, ply: 0, synthetic: true },
        ]);
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
  const handoffLoadedRef = useRef(false);

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
      router.replace(router.pathname, undefined, { shallow: true });
    } catch (err) {
      console.warn("[preview/analysis] malformed lichess-review payload:", err);
    }
  }, [router.isReady, router.query.lichessReview, loadNewGame, router]);

  // ?handoff=1 + sessionStorage — "Analyze now" from /profile. The PGN travels
  // in storage rather than the URL because a chess.com PGN with per-move clock
  // comments url-encodes to several KB, and /analysis has getServerSideProps so
  // that would be re-sent to the server on every navigation.
  useEffect(() => {
    if (!router.isReady || handoffLoadedRef.current) return;
    if (router.query[ANALYSIS_HANDOFF_PARAM] !== "1") return;
    const staged = consumeStagedGame();
    if (!staged) return;
    try {
      const g = new Chess();
      g.loadPgn(staged);
      handoffLoadedRef.current = true;
      loadNewGame(g);
      // Drop the flag so a refresh doesn't look for a PGN that's been consumed.
      router.replace(router.pathname, undefined, { shallow: true });
    } catch (err) {
      console.warn("[analysis] malformed handoff payload:", err);
    }
  }, [router.isReady, router.query, loadNewGame, router]);

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
  const [takeoverPreview, setTakeoverPreview] = useState<ExplorationPreview | null>(
    null
  );

  // Desync fix (companion to the ae4cf45 replay fix): navigating game history
  // (arrows / move-history strip) advances `currentPly` → `currentFen`, but the
  // exploration preview was never cleared, so `displayFen` stayed pinned to the
  // stale preview — the board froze on the preview while the engine/ply cursor
  // moved on. Drop the preview whenever the ply cursor changes so `displayFen`
  // follows it. Preview clicks don't touch `currentPly`, so this never fires
  // spuriously while exploring in place.
  //
  // One exception: a green coach-link click (handleCoachMoveRef) syncs the
  // cursor to the anchor ply AND sets a preview in the same act — the ref
  // below tells this effect to keep that just-set preview alive for the
  // one ply change it deliberately caused.
  const keepPreviewOnPlySyncRef = useRef(false);
  useEffect(() => {
    if (keepPreviewOnPlySyncRef.current) {
      keepPreviewOnPlySyncRef.current = false;
      return;
    }
    setTakeoverPreview(null);
  }, [currentPly]);

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

  // ───── Eval bar: evaluation of the position on the board ─────
  // Resolution order for displayFen:
  //   1. terminal board position (checkmate/stalemate/dead draw) — no
  //      engine lines exist, synthesize the game result;
  //   2. savedEvalsAtom — FEN-keyed evals the game pass (G15) already
  //      published, so mainline navigation never re-runs the engine;
  //   3. live single-position eval (takeover previews, drill positions,
  //      custom FENs) streamed via evaluatePositionWithUpdate.
  const displayTerminal = useMemo<{
    whitePercentage: number;
    label: string;
  } | null>(() => {
    const c = new Chess(displayFen);
    if (c.isCheckmate()) {
      return c.turn() === "w"
        ? { whitePercentage: 0, label: "0-1" }
        : { whitePercentage: 100, label: "1-0" };
    }
    if (c.isStalemate() || c.isInsufficientMaterial()) {
      return { whitePercentage: 50, label: "½-½" };
    }
    return null;
  }, [displayFen]);

  const savedEvals = useAtomValue(savedEvalsAtom);
  const [liveEval, setLiveEval] = useState<{
    fen: string;
    position: PositionEval;
  } | null>(null);
  // Completed off-mainline evals, keyed by FEN + depth so a depth change
  // re-evaluates instead of serving the shallower cached answer.
  const liveEvalCacheRef = useRef<Map<string, PositionEval>>(new Map());

  // Never preempt the game-wide pass: evaluatePositionWithUpdate calls
  // stopAllCurrentJobs(), which would kill evaluateGame mid-run. FEN-only
  // loads keep analysisActive true forever (evaluateGame bails on zero
  // moves), so gate on allMoves.length too — those positions are exactly
  // the ones that need a live eval.
  const gameAnalysisRunning = analysisActive && allMoves.length > 0;

  useEffect(() => {
    if (!engine || gameAnalysisRunning || displayTerminal) return;
    const fen = displayFen;
    // Only skip the search if what we already have is as deep and as wide as
    // the user asked for. This used to skip on the mere EXISTENCE of a saved
    // eval, so asking for more depth or more lines than the review pass
    // produced changed nothing — the stale, shallower answer kept being
    // served and the controls looked broken.
    if (
      satisfiesRequest(
        savedEvals[fen],
        linesSettings.depth,
        linesSettings.count
      )
    ) {
      return;
    }
    const liveCacheKey = `${fen}|d${linesSettings.depth}|n${linesSettings.count}|${
      linesSettings.preferLocalEngine ? engineSettings.engineName : "cloud-ok"
    }`;
    const cached = liveEvalCacheRef.current.get(liveCacheKey);
    if (cached) {
      setLiveEval({ fen, position: cached });
      return;
    }
    let cancelled = false;
    // Small debounce so rapid drill/preview sequences don't churn searches.
    const timer = window.setTimeout(() => {
      engine
        .evaluatePositionWithUpdate({
          fen,
          depth: linesSettings.depth,
          multiPv: linesSettings.count,
          allowCloud: !linesSettings.preferLocalEngine,
          setPartialEval: (ev) => {
            if (!cancelled && ev.lines.length) setLiveEval({ fen, position: ev });
          },
        })
        .then((ev) => {
          if (cancelled || !ev.lines.length) return;
          liveEvalCacheRef.current.set(liveCacheKey, ev);
          setLiveEval({ fen, position: ev });
        })
        .catch(() => {
          /* engine busy or shut down — bar stays pending */
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    engine,
    gameAnalysisRunning,
    displayTerminal,
    displayFen,
    savedEvals,
    linesSettings.depth,
    linesSettings.count,
    linesSettings.preferLocalEngine,
    engineSettings.engineName,
  ]);

  /**
   * The engine's evaluation OF THE POSITION ON THE BOARD — the single source
   * both the eval bar and the Lines tab read.
   *
   * Keyed by FEN, never by ply. The Lines tab used to be handed
   * `enginePositions[currentPly]` while being told the board was
   * `displayFen`; the moment you explored off the mainline those were two
   * different positions, so it replayed the mainline's principal variation
   * on the explored board — the SAN conversion silently broke and the tab
   * showed moves that did not belong to what you were looking at. It also
   * ignored `liveEval` entirely, so an explored position reported "Stockfish
   * hasn't reached this position yet" while the eval bar beside it displayed
   * a number for that exact position.
   */
  const displayPositionEval = useMemo<PositionEval | null>(
    () =>
      pickDisplayEval(
        savedEvals[displayFen],
        liveEval?.fen === displayFen ? liveEval.position : null
      ),
    [savedEvals, displayFen, liveEval]
  );

  const evalBarData = useMemo<EvalBarData>(() => {
    if (displayTerminal) return { ...displayTerminal, pending: false };
    const position = displayPositionEval;
    if (!position) return { whitePercentage: 50, label: null, pending: true };
    try {
      const bar = getEvaluationBarValue(position);
      const mate = position.lines[0].mate;
      return {
        // Mates snap to a full bar (the win-% model ceils cp at ±1000).
        whitePercentage: mate ? (mate > 0 ? 100 : 0) : bar.whiteBarPercentage,
        label: bar.label,
        pending: false,
      };
    } catch {
      // Line with neither cp nor mate — treat as not-yet-evaluated.
      return { whitePercentage: 50, label: null, pending: true };
    }
  }, [displayTerminal, displayPositionEval]);

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

    // Engine best (green) — straight off the Stockfish pass for THIS ply.
    // Previously a hardcoded 15-entry ply→UCI table written against the
    // Kasparov demo, which drew an arbitrary arrow on the first 15 plies of
    // whatever game the user actually loaded. Nothing to draw until the
    // engine has reported, which is the honest state.
    if (arrowToggles.best) {
      const pos = enginePositions?.[currentPly];
      const best = pos?.bestMove ?? pos?.lines?.[0]?.pv?.[0];
      if (best && best.length >= 4) {
        shapes.push(uciToShape(best, ARROW_PALETTE.best.brush));
      }
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

    // Maia at the selected ELO (purple) — live /api/maia-predict for the
    // current FEN+ELO. The old ply-indexed hand-table fallback went with the
    // demo; nothing renders while the fetch is in flight or when
    // MAIA_API_URL is unconfigured.
    if (arrowToggles.maia) {
      const maia = maiaCache[`${currentFen}|${arrowToggles.maiaElo}`];
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
    enginePositions,
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
        // Candidates are Masters-specific — drop them.
        //
        // The exploration preview is NOT: it describes the board, which every
        // tab shares. Clearing it here meant walking a line in Masters and
        // then opening Lines to see what the engine thought of it silently
        // threw the line away and snapped the board back, so the two tabs
        // could never be used together. Staleness is already handled by the
        // [currentPly] effect, and the banner offers an explicit way out.
        setTakeoverCandidates([]);
      }
    },
    []
  );
  const handleTakeoverPreviewMove = useCallback(
    (uci: string, san: string) => {
      // Play on top of the currently displayed position so chained clicks
      // walk the opening tree (engine state must follow the preview cursor,
      // not stay pinned to the canonical game's FEN). See replayPreviewMove
      // (the ae4cf45 fix pattern) — it replays on displayFen and no-ops on an
      // illegal move instead of throwing.
      const played = replayPreviewMove(displayFen, uci);
      if (played) {
        // Trust the caller's SAN (it comes from the candidate list) but fall
        // back to the derived SAN if it was omitted.
        const sanPlayed = san || played.san;
        setTakeoverPreview((prev) => ({
          ...played,
          san: sanPlayed,
          path: [...(prev?.path ?? []), sanPlayed],
          anchorPly: prev?.anchorPly ?? currentPly,
        }));
      }
    },
    [displayFen, currentPly]
  );

  // Coach move-reference clicks. Two shapes:
  //  - navigate (orange link / insight header): jump the mainline cursor.
  //  - recommended alternative (green 🔍 link): actually LOAD the line —
  //    replay the mainline to the anchor ply, play the recommended SAN on
  //    top, and surface it through the exploration-preview channel (board,
  //    eval bar, last-move highlight all follow displayFen).
  // Founder bug 2026-08-10: this used to be bare setCurrentPly, which for
  // green links resolved to the ply the user was ALREADY on (the insight
  // is about the current mistake), so clicks visibly did nothing and the
  // recommended move never reached the board.
  const handleCoachMoveRef = useCallback(
    (ply: number, playSan?: string) => {
      if (playSan) {
        const preview = buildRecommendedPreview(
          allMoves,
          ply,
          playSan,
          rootFen
        );
        if (preview) {
          if (preview.anchorPly !== currentPly) {
            keepPreviewOnPlySyncRef.current = true;
          }
          setCurrentPly(preview.anchorPly);
          setTakeoverPreview({
            fen: preview.fen,
            from: preview.from,
            to: preview.to,
            san: preview.san,
            path: [preview.san],
            anchorPly: preview.anchorPly,
          });
          return;
        }
        // Chained PV clicks: the SAN isn't legal from the mainline anchor
        // but is legal on the position currently displayed (the user is
        // already previewing the line) — continue the preview in place.
        const continued = playSanOnFen(displayFen, playSan);
        if (continued) {
          setTakeoverPreview((prev) => ({
            ...continued,
            path: [...(prev?.path ?? []), continued.san],
            anchorPly: prev?.anchorPly ?? currentPly,
          }));
          return;
        }
      }
      // Plain navigation — clear any exploration preview deterministically
      // (the [currentPly] effect won't fire when ply === currentPly).
      setTakeoverPreview(null);
      setCurrentPly(ply);
    },
    [allMoves, currentPly, displayFen, rootFen]
  );

  // User makes a move on the board directly (interactive in takeover mode)
  const handleBoardMove = useCallback(
    (orig: string, dest: string) => {
      // Replay from the currently displayed position (preview or canonical)
      const played = replayPreviewMove(displayFen, `${orig}${dest}`);
      if (played) {
        setTakeoverPreview((prev) => ({
          ...played,
          path: [...(prev?.path ?? []), played.san],
          anchorPly: prev?.anchorPly ?? currentPly,
        }));
      }
    },
    [displayFen, currentPly]
  );

  /**
   * Leave the exploration branch and put the board back on the mainline
   * position it started from.
   *
   * The state to do this always existed — clearing the preview restores
   * `currentFen` — but nothing on screen offered it, so walking a few moves
   * into a line left you guessing which ply you had branched from. Also
   * restores the cursor when a coach recommendation moved it.
   */
  /**
   * What the Lines tab should say when it has nothing to show.
   *
   * `engine === null` means EITHER "the worker is still booting" (the usual
   * case, for the first seconds of every visit) OR "this browser cannot run
   * it at all". Telling a user mid-boot that Stockfish isn't running and they
   * should reload is worse than saying nothing, so the two are separated by
   * the only signal that actually distinguishes them.
   */
  const linesStatus = useMemo<LinesStatus>(() => {
    if (displayTerminal) return "terminal";
    if (displayPositionEval) {
      // Lines exist, but a shallower or narrower answer than was asked for
      // is still work in progress — that distinction is what makes the depth
      // control feel connected to anything.
      return satisfiesRequest(
        displayPositionEval,
        linesSettings.depth,
        linesSettings.count
      )
        ? "ready"
        : "searching";
    }
    if (typeof window !== "undefined" && !isWasmSupported()) {
      return "unsupported";
    }
    if (!engine) return "starting";
    return "searching";
  }, [
    displayTerminal,
    displayPositionEval,
    engine,
    linesSettings.depth,
    linesSettings.count,
  ]);

  const returnToAnchor = useCallback(() => {
    if (!takeoverPreview) return;
    const { anchorPly } = takeoverPreview;
    setTakeoverPreview(null);
    if (anchorPly !== currentPly) setCurrentPly(anchorPly);
  }, [takeoverPreview, currentPly]);

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
          // D1: the server's corrected text replaces the raw stream, so the
          // corrected copy is what gets replayed on the next turn.
          onCorrected: (correctedText) => {
            accumulated = correctedText;
            setMessages((prev) => {
              if (prev.length === 0) return prev;
              const last = prev[prev.length - 1];
              if (last.role !== "coach") return prev;
              return [
                ...prev.slice(0, -1),
                { ...last, content: correctedText },
              ];
            });
          },
          // D4: no `done` event arrived — the answer is a fragment.
          onTruncated: () => {
            setMessages((prev) => {
              if (prev.length === 0) return prev;
              const last = prev[prev.length - 1];
              if (last.role !== "coach") return prev;
              return [...prev.slice(0, -1), { ...last, incomplete: true }];
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
            // D3: the banner overwrites the streamed text in place. Without
            // this flag the model reads "**Coach is offline** (HTTP 502)" as
            // something IT said on its previous turn.
            { ...last, content: errorText, synthetic: true, incomplete: undefined },
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
  const { addGame, setGameEval, setGameTranscript, gameFromUrl } =
    useGameDatabase();
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

  // Persist the coach transcript whenever it changes AND the user has
  // explicitly saved the game (so opt-in only — anonymous / unsaved games
  // never write to IndexedDB or Firestore). Debounced so streaming token
  // updates don't trigger one write per chunk; in practice setGameTranscript
  // fires ~1s after the last message edit. The cold-start greeting is
  // filtered out so it never overwrites a real conversation that the user is
  // mid-replay-loading.
  useEffect(() => {
    if (savedGameId === null) return;
    if (messages.length === 0) return;
    const slim = messages
      .filter(
        (m) =>
          !(
            m.role === "coach" &&
            m.content === EMPTY_STATE_MESSAGES[0]?.content
          ),
      )
      .map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.ply !== undefined ? { ply: m.ply } : {}),
        ts: Date.now(),
      }));
    if (slim.length === 0) return;
    const handle = setTimeout(() => {
      setGameTranscript(savedGameId, slim).catch((err) => {
        console.warn("[preview/analysis] transcript sync failed:", err);
      });
    }, 1000);
    return () => clearTimeout(handle);
  }, [messages, savedGameId, setGameTranscript]);

  // Hydrate transcript from a saved game opened via ?gameId=N. We load the
  // PGN into a fresh Chess via loadNewGame with keepChat:true, then seed
  // the messages array from coachTranscript so the user lands on /analysis
  // mid-conversation instead of staring at the demo greeting. Tracks a ref
  // to avoid re-hydrating on every render once the load happened.
  const hydratedGameIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!gameFromUrl) return;
    if (hydratedGameIdRef.current === gameFromUrl.id) return;
    hydratedGameIdRef.current = gameFromUrl.id;
    try {
      const restored = new Chess();
      restored.loadPgn(gameFromUrl.pgn);
      setSavedGameId(gameFromUrl.id);
      setSaveState("saved");
      // keepChat:true so loadNewGame doesn't reset messages to the greeting
      // before our setMessages below replaces them with the saved transcript.
      loadNewGame(restored, { keepChat: true });
      if (
        gameFromUrl.coachTranscript &&
        gameFromUrl.coachTranscript.length > 0
      ) {
        setMessages(
          gameFromUrl.coachTranscript.map((m) => ({
            role: m.role,
            content: m.content,
            ...(m.ply !== undefined ? { ply: m.ply } : {}),
          })),
        );
      }
    } catch (err) {
      console.warn(
        "[preview/analysis] failed to hydrate saved game:",
        err,
      );
    }
  }, [gameFromUrl, loadNewGame]);

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

      // Compute the FEN AT this ply (not at the current display position),
      // replaying from the game's root so FEN-loaded games are correct.
      const { board: g } = replayFromRoot(allMoves, ply, rootFen);
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
          // D1: the server's corrected text replaces the raw stream, so the
          // corrected copy is what gets replayed on the next turn.
          onCorrected: (correctedText) => {
            accumulated = correctedText;
            setMessages((prev) => {
              if (prev.length === 0) return prev;
              const last = prev[prev.length - 1];
              if (last.role !== "coach") return prev;
              return [
                ...prev.slice(0, -1),
                { ...last, content: correctedText },
              ];
            });
          },
          // D4: no `done` event arrived — the answer is a fragment.
          onTruncated: () => {
            setMessages((prev) => {
              if (prev.length === 0) return prev;
              const last = prev[prev.length - 1];
              if (last.role !== "coach") return prev;
              return [...prev.slice(0, -1), { ...last, incomplete: true }];
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
          // D3: see above — a UI banner is not model output.
          return [...prev.slice(0, -1), { ...last, content: errorText, synthetic: true, incomplete: undefined }];
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
        // D1: the server's corrected text replaces the raw stream, so the
        // corrected copy is what gets replayed on the next turn.
        onCorrected: (correctedText) => {
          accumulated = correctedText;
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            if (last.role !== "coach") return prev;
            return [
              ...prev.slice(0, -1),
              { ...last, content: correctedText },
            ];
          });
        },
        // D4: no `done` event arrived — the answer is a fragment.
        onTruncated: () => {
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            if (last.role !== "coach") return prev;
            return [...prev.slice(0, -1), { ...last, incomplete: true }];
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
        // D3: see above — a UI banner is not model output.
        return [
          ...prev.slice(0, -1),
          { ...last, content: errorText, synthetic: true, incomplete: undefined },
        ];
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
          // D3: this pill fabricates a WHOLE exchange with no API call behind
          // it. Both halves are synthetic — dropping only the coach turn would
          // leave a question the model never answered, which reads as an
          // ignored user.
          { role: "user", content: s, ply: currentPly, synthetic: true },
          {
            role: "coach",
            content: `Pulled three positions in the same family from the master puzzle index — solve them inline, or move any one onto the big board.`,
            ply: currentPly,
            synthetic: true,
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
      // Escape leaves an exploration branch before it means anything else —
      // it is the keyboard half of the "back to move N" control.
      if (e.key === "Escape" && takeoverPreview) {
        e.preventDefault();
        returnToAnchor();
        return;
      }
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
  }, [allMoves.length, takeoverPreview, returnToAnchor]);

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
        // Same dynamic list rendered as pills above the chat input.
        // Pinned "Analyze my game" comes through verbatim so the
        // command palette and the pill row stay in sync.
        items: coachSuggestions.map((s, i) => ({
          id: `ask-${i}`,
          label: s.text,
          hint: s.pinned ? "Pinned · ask the coach" : "Ask the coach",
          icon: CommandIcons.Coach,
          onSelect: () => {
            setInput(s.text);
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
    [allMoves.length, liveKeyMoments, coachSuggestions]
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

      {/*
        Viewport-locked at lg and up: the page is exactly one screen tall and
        never scrolls — the coach transcript is the only scrolling surface.
        Below lg the two columns stack, which cannot fit a board AND a chat in
        one screen, so the layout falls back to ordinary document flow.
      */}
      <Box
        sx={{
          height: { lg: "100dvh" },
          minHeight: { xs: "100vh", lg: 0 },
          width: "100%",
          color: "rgba(255,255,255,0.94)",
          display: "flex",
          flexDirection: "column",
          overflow: { lg: "hidden" },
          pt: { xs: 2, lg: 1.5 },
          pb: { xs: 4, lg: 1.5 },
          px: { xs: 2, md: 3 },
        }}
      >
        {/*
          One bar, not two. The game identity (players / opening) and the
          game actions (engine depth, Load, Save) used to live in a separate
          GameHeader card stacked under the nav pill, costing ~110px of
          vertical space to say what fits inline here.
        */}
        <SharedNavPill
          active="analysis"
          sx={{
            position: "static",
            top: "auto",
            mb: { xs: 2, lg: 1.25 },
            flexShrink: 0,
          }}
          contextSlot={
            <GameIdentity
              whiteName={headers.White ?? undefined}
              blackName={headers.Black ?? undefined}
              opening={hasGame ? openingLabel : null}
              currentEval={evalSeries[currentPly] ?? 0}
              currentPly={currentPly}
              totalPlies={allMoves.length}
              hasGame={hasGame}
              evalPending={analysisActive}
            />
          }
          actionsSlot={
            <GameActions
              onLoadGameClick={() => setLoadGameOpen(true)}
              engineDepth={engineSettings.depth}
              onEngineDepthChange={(d) =>
                setEngineSettings((s) => ({ ...s, depth: d }))
              }
              engineName={engineSettings.engineName}
              onEngineNameChange={(n) =>
                setEngineSettings((s) => ({ ...s, engineName: n }))
              }
              onSaveGameClick={user && hasGame ? handleSaveGame : undefined}
              saveState={saveState}
              onOpenPalette={() => setPaletteOpen(true)}
            />
          }
        />

        {/* Lc0DownloadBanner — was previously injected by the legacy
            chrome (sections/layout/index.tsx) which the cutover dropped
            on /preview/* routes. Re-mounted here so the Maia/Lc0
            availability nudge still surfaces when the microservice is
            down. Self-gates on maia-status; renders nothing in the
            common case where Maia is up — hence no wrapper margin, which
            would otherwise eat vertical space on every page view. */}
        <Box sx={{ maxWidth: 1680, mx: "auto", width: "100%", flexShrink: 0 }}>
          <Lc0DownloadBanner />
        </Box>

        <Box
          sx={{
            maxWidth: 1680,
            mx: "auto",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            flex: { lg: 1 },
            minHeight: { lg: 0 },
          }}
        >
          <Box
            sx={{
              display: "grid",
              // The board column tracks the viewport HEIGHT, because the
              // board is height-capped here (it's the largest square that
              // fits under the nav bar and above the control strip). A fixed
              // 680px track left a short window with a 450px board floating
              // in dead space while the chat was squeezed next to it.
              //
              // 227px is the page chrome around the square (padding, nav bar,
              // strip, card padding), measured rather than derived. It only
              // tunes how much slack the column carries: BoardArea measures
              // its real box, so an imprecise estimate here can never make
              // the board non-square or push the page past one screen.
              gridTemplateColumns: {
                // minmax(0, 1fr), not 1fr: a bare `1fr` track has an `auto`
                // minimum, so the stacked column grew to the board's
                // min-content width and hung off the right of a phone.
                xs: "minmax(0, 1fr)",
                lg: "minmax(420px, min(900px, calc(100dvh - 227px))) minmax(380px, 1fr)",
              },
              gap: { xs: 3, lg: 2 },
              alignItems: { xs: "start", lg: "stretch" },
              flex: { lg: 1 },
              minHeight: { lg: 0 },
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
                minHeight: { lg: 0 },
                maxWidth: "100%",
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
              {!drillState && takeoverPreview && (
                <ExplorationBanner
                  preview={takeoverPreview}
                  onReturn={returnToAnchor}
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
                  evalBar={evalBarData}
                  empty={!hasGame}
                />
              </ErrorBoundary>

              {/*
                One strip under the board instead of four stacked cards
                (arrows / sparkline / key-moments / navigator). The key-moment
                chips are gone: they duplicated the sparkline's own markers,
                which are now hoverable and clickable.
              */}
              <Box
                sx={{
                  mt: { xs: 2, lg: 1.25 },
                  flexShrink: 0,
                  p: { xs: 1.5, lg: 1.25 },
                  borderRadius: "1.25rem",
                  background: "rgba(20,22,28,0.55)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                }}
              >
                <EvalSparkline
                  series={evalSeries}
                  currentPly={currentPly}
                  onJumpTo={setCurrentPly}
                  keyMoments={liveKeyMoments}
                  analyzing={analysisActive}
                  progress={analysisProgress}
                  errored={analysisError !== null}
                  hasGame={hasGame}
                />
                <MoveNavigator
                  currentPly={currentPly}
                  totalPlies={allMoves.length}
                  onJumpTo={setCurrentPly}
                  onFlip={() =>
                    setBoardOrientation((o) =>
                      o === "white" ? "black" : "white"
                    )
                  }
                  onReset={() => setCurrentPly(0)}
                />
                {/* Own row rather than inline with the navigator: sharing one
                    row made the pills wrap on a narrow column, and a strip
                    whose height changes with viewport width is exactly what
                    the board-column sizing above can't predict. */}
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    pt: 1,
                  }}
                >
                  <BoardArrowToggles
                    compact
                    state={arrowToggles}
                    onChange={setArrowToggles}
                  />
                </Box>
              </Box>
            </Box>

            {/* Right column: tabbed surface — Coach / Masters / Moves.
                The Masters tab makes the main board interactive for
                exploration (same role the old "Takeover" modal had). */}
            <ErrorBoundary name="preview-analysis-tabs">
            <Box
              sx={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                minHeight: { lg: 0 },
                height: { lg: "100%" },
              }}
            >
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
              {/* The one scrolling surface on the page: the panel is pinned
                  to the column's height and each tab scrolls internally. */}
              <Box
                sx={{
                  position: "relative",
                  height: { xs: 600, lg: "auto" },
                  flex: { lg: 1 },
                  minHeight: { lg: 0 },
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
                        onMoveRefClick={handleCoachMoveRef}
                        playerSide={playerSide}
                        sideUiEligible={!isPuzzleMode && allMoves.length > 0}
                        onChoosePlayerSide={handleChoosePlayerSide}
                        onShareMessage={(m) =>
                          setShareDialog({ msg: m, fen: displayFen })
                        }
                        mistakeContext={mistakeContext}
                        userRating={resolveUserRating(profile) ?? 1500}
                        coachContextIdProp={coachContextIdRef.current}
                        enginePositions={enginePositions}
                        loadedGame={loadedGame}
                        suggestions={coachSuggestions}
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
                        moves={allMoves}
                        onJumpToPly={setCurrentPly}
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
                        position={displayPositionEval}
                        fen={displayFen}
                        engineName={engineSettings.engineName}
                        status={linesStatus}
                        exploring={takeoverPreview}
                        onReturnToAnchor={returnToAnchor}
                        settings={linesSettings}
                        onSettingsChange={setLinesSettings}
                        onEngineNameChange={(n) =>
                          setEngineSettings((s) => ({ ...s, engineName: n }))
                        }
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Box>
            </Box>
            </ErrorBoundary>
          </Box>

          {/* Footer — hidden at lg and up, where the page is pinned to the
              viewport and there is no room for a row that only carries a
              hint. Its two live affordances survive: the ⌘K chip moved into
              the nav bar, and "Back" is the wordmark. */}
          <Box
            sx={{
              display: { xs: "flex", lg: "none" },
              mt: 4,
              pt: 3,
              borderTop: "1px solid rgba(255,255,255,0.06)",
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
                href="/"
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
