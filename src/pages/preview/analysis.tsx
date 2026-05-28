"use client";

import { Chess, type Move } from "chess.js";
import {
  Box,
  Button,
  IconButton,
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
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Command,
  Crown,
  Eye,
  Flame,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BorderBeam } from "@/components/ui/BorderBeam";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill as SharedNavPill } from "@/components/ui/NavPill";
import { OpeningExplorer } from "@/components/ui/OpeningExplorer";
import {
  CommandPalette,
  CommandIcons,
  type CommandGroup,
} from "@/components/ui/CommandPalette";

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

function findMaiaMove(ply: number, elo: number): string | undefined {
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

async function streamCoachReply(params: {
  prevMessages: CoachMessage[];
  userText: string;
  fen: string;
  currentPly: number;
  allMoves: Move[];
  onDelta: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { prevMessages, userText, fen, currentPly, allMoves, onDelta, signal } =
    params;
  const blurb = buildContextBlurb(fen, currentPly, allMoves);
  const userWithContext = `${blurb}\n\n${userText}`;

  const history = prevMessages
    .filter((m) => m.role === "user" || m.role === "coach")
    .map((m) => ({
      role: m.role === "coach" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

  const apiMessages = [
    ...history,
    { role: "user" as const, content: userWithContext },
  ];

  const res = await fetch("/api/chat?stream=1", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    credentials: "include",
    body: JSON.stringify({ messages: apiMessages, temperature: 0.7 }),
    signal,
  });

  if (res.status === 401) throw new CoachAuthError();
  if (!res.ok) throw new CoachApiError(res.status);
  if (!res.body) throw new CoachApiError(res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Process complete SSE events (delimited by \n\n)
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const ev of events) {
      const line = ev.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const parsed = JSON.parse(payload);
        if (parsed.type === "text" && typeof parsed.delta === "string") {
          onDelta(parsed.delta);
        } else if (parsed.type === "error") {
          throw new CoachApiError(502);
        }
      } catch (e) {
        if (e instanceof CoachApiError) throw e;
        // ignore malformed lines
      }
    }
  }
}

// Pre-loaded coach exchange — what an excellent first interaction looks like
interface CoachMessage {
  role: "user" | "coach";
  content: string;
  ply?: number; // links message to a board position
  insight?: { tag: string; eval?: string; classification?: string };
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
      "Stockfish 17 sees it as the only winning move — eval jumps from +2.4 to +4.7 after **24.Rxd4 cxd4 25.Re7+!** The rook is *lost* but the second rook delivers check, and after **25...Kb6 26.Qxd4+** the black king walks into a mating net on a4 with no defenders. Kasparov calculated 15+ ply to see this would work. Want to see the forced line?",
    ply: 47,
    insight: {
      tag: "24.Rxd4 — brilliancy",
      eval: "+4.7",
      classification: "Best move (only win)",
    },
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
}: {
  whiteName: string;
  blackName: string;
  event: string;
  year: string;
  opening: string;
  currentEval: number;
  currentPly: number;
  totalPlies: number;
}) {
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

      <Stack direction="row" spacing={2.5} alignItems="center">
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
      </Stack>
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
}: {
  series: number[];
  currentPly: number;
  onJumpTo: (ply: number) => void;
  keyMoments: KeyMoment[];
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
          <path d={areaPath} fill="url(#evalGrad)" />
          {/* Line stroke */}
          <path
            d={linePath}
            fill="none"
            stroke="#FB923C"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
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

function CoachPanel({
  messages,
  input,
  onChangeInput,
  onSend,
  onSuggestion,
  isThinking,
}: {
  messages: CoachMessage[];
  input: string;
  onChangeInput: (v: string) => void;
  onSend: () => void;
  onSuggestion: (s: string) => void;
  isThinking: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

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
                <CoachBubble msg={msg} />
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
                onSend();
              }
            }}
            placeholder="Ask anything about this position..."
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
            disabled={!input.trim() || isThinking}
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

function CoachBubble({ msg }: { msg: CoachMessage }) {
  const isUser = msg.role === "user";

  // Simple markdown — bold via **...**
  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**")) {
        return (
          <Box
            key={i}
            component="span"
            sx={{
              fontWeight: 700,
              color: isUser ? "#0A0A0A" : "#FB923C",
            }}
          >
            {p.slice(2, -2)}
          </Box>
        );
      }
      return <span key={i}>{p}</span>;
    });
  };

  return (
    <Box>
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
        }}
      >
        {renderInline(msg.content)}
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

  // Load demo game once (or build a stub for puzzle mode)
  const [demoGame] = useState(() => {
    const g = new Chess();
    if (puzzleFen) {
      g.loadPgn(`[FEN "${decodeURIComponent(puzzleFen)}"]\n[SetUp "1"]\n*`);
    } else {
      g.loadPgn(DEMO_PGN);
    }
    return g;
  });

  const allMoves = useMemo(
    () => demoGame.history({ verbose: true }) as Move[],
    [demoGame]
  );
  const headers = useMemo(() => demoGame.header(), [demoGame]);
  const evalSeries = useMemo(
    () => buildMockEval(allMoves.length + 1),
    [allMoves.length]
  );

  const [currentPly, setCurrentPly] = useState(0);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">(
    "white"
  );

  // In puzzle mode, prepopulate the coach with a contextual seed message
  const isPuzzleMode = Boolean(puzzleFen);

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

  // Takeover mode (Master games panel replaces Coach panel)
  const [takeoverMode, setTakeoverMode] = useState(false);
  // Optional previewed move while in takeover — replays from currentFen
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

  // Board FEN + last move switch when previewing in takeover mode
  const displayFen = takeoverPreview?.fen ?? currentFen;
  const displayLastMove = useMemo<Move | null>(() => {
    if (takeoverPreview) {
      return {
        from: takeoverPreview.from,
        to: takeoverPreview.to,
        san: takeoverPreview.san,
      } as Move;
    }
    return lastMove;
  }, [takeoverPreview, lastMove]);

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

    // Maia at the selected ELO (purple)
    if (arrowToggles.maia) {
      const maia = findMaiaMove(currentPly, arrowToggles.maiaElo);
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
  ]);

  const handleTakeoverEnter = useCallback(() => {
    setTakeoverMode(true);
    setTakeoverPreview(null);
  }, []);
  const handleTakeoverRevert = useCallback(() => {
    setTakeoverMode(false);
    setTakeoverPreview(null);
    setTakeoverCandidates([]);
  }, []);
  const handleTakeoverPreviewMove = useCallback(
    (uci: string, san: string) => {
      // Play the move on a fresh chess from currentFen
      const g = new Chess(currentFen);
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const result = g.move({ from, to, promotion: "q" });
      if (result) {
        setTakeoverPreview({ fen: g.fen(), from, to, san });
      }
    },
    [currentFen]
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

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isThinking) return;
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
  }, [input, isThinking, messages, currentPly, displayFen, allMoves]);

  const handleSuggestion = useCallback((s: string) => {
    setInput(s);
  }, []);

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
        items: KEY_MOMENTS.map((m) => ({
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
    [allMoves.length]
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
              <BoardArea
                fen={displayFen}
                lastMove={displayLastMove}
                boardOrientation={boardOrientation}
                isInCheck={isInCheck}
                shapes={displayShapes}
                interactive={takeoverMode}
                movableColor={takeoverMode ? turnToMove : undefined}
                dests={takeoverMode ? displayDests : undefined}
                onMove={takeoverMode ? handleBoardMove : undefined}
              />
              <BoardArrowToggles
                state={arrowToggles}
                onChange={setArrowToggles}
              />
              <EvalSparkline
                series={evalSeries}
                currentPly={currentPly}
                onJumpTo={setCurrentPly}
                keyMoments={KEY_MOMENTS}
              />
              <KeyMomentsRow
                moments={KEY_MOMENTS}
                currentPly={currentPly}
                onJumpTo={setCurrentPly}
              />
            </Box>

            {/* Right column: Coach (sized like the board) + Master Games
                (lined up with the eval graph below), or full-height
                Takeover panel when active. */}
            <Box sx={{ position: "relative" }}>
              <AnimatePresence mode="wait" initial={false}>
                {takeoverMode ? (
                  <Box
                    sx={{
                      height: {
                        xs: "auto",
                        lg: "clamp(560px, calc(100vh - 240px), 880px)",
                      },
                      minHeight: { xs: 600, lg: 0 },
                    }}
                  >
                    <MasterGamesTakeover
                      key="takeover"
                      fen={displayFen}
                      ply={currentPly}
                      playedSan={playedSanAtPly}
                      onPreviewMove={handleTakeoverPreviewMove}
                      onSendToCoach={handleTakeoverSendToCoach}
                      onRevert={handleTakeoverRevert}
                      onCandidatesUpdate={setTakeoverCandidates}
                    />
                  </Box>
                ) : (
                  <motion.div
                    key="coach"
                    initial={{ opacity: 0, x: -60, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -60, scale: 0.96 }}
                    transition={{
                      duration: 0.42,
                      ease: [0.22, 0.61, 0.36, 1],
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 1.5,
                      }}
                    >
                      {/* Coach extends down to nearly touch Master Games —
                          the right column reads as one tight stack. */}
                      <Box
                        sx={{
                          height: {
                            xs: 600,
                            lg: "clamp(520px, 70vh, 800px)",
                          },
                        }}
                      >
                        <CoachPanel
                          messages={messages}
                          input={input}
                          onChangeInput={setInput}
                          onSend={handleSend}
                          onSuggestion={handleSuggestion}
                          isThinking={isThinking}
                        />
                      </Box>
                      <Box sx={{ flexShrink: 0 }}>
                        <OpeningExplorer
                          fen={currentFen}
                          fallbackOpeningName={headers.Opening ?? undefined}
                          fallbackEco={headers.ECO ?? undefined}
                          onTakeover={handleTakeoverEnter}
                        />
                      </Box>
                    </Box>
                  </motion.div>
                )}
              </AnimatePresence>
            </Box>
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
