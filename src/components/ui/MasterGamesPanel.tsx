"use client";

import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { Chess, type Move } from "chess.js";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Cpu,
  MessageSquare,
  RefreshCw,
  Rewind,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchExplorer,
  peekExplorer,
  prefetchExplorer,
  type ApiData,
  type ApiMove,
  type MasterCorpusMeta,
  type MasterSource,
} from "@/lib/master/explorerClient";
import {
  ACCENT,
  FONT_MONO,
  LINE,
  MOTION,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

export type { ApiData, ApiMove, MasterCorpusMeta, MasterSource };

// ───────────────────────────────────────────────────────────────────────────
// Data model — what /api/opening-explorer answers, and what a row is.
// ───────────────────────────────────────────────────────────────────────────

export interface MasterCandidate {
  san: string;
  uci: string;
  /** Games in which this move was played. 0 for engine-only sources. */
  count: number;
  whiteWins?: number;
  draws?: number;
  blackWins?: number;
  /** Engine eval in centipawns from WHITE's side (the route flips chessdb). */
  eval?: number;
  /** chessdb rank: 2 = top choice ("!"), 1 = playable ("*"), 0 = inferior ("?"). */
  rank?: number;
  /** White's expected score, 0..100, from the engine analysis. */
  winrate?: number;
  source?: MasterSource;
}

// ───────────────────────────────────────────────────────────────────────────
// Pure helpers — everything the panel computes, testable without a DOM.
// ───────────────────────────────────────────────────────────────────────────

/** "1.6M", "53K", "391". Under 10M keeps one decimal so 1.4M and 1.6M differ. */
export function formatCount(n: number): string {
  if (n >= 10_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** "+0.35", "-1.20", "0.00"; mate scores as "#" with the distance. */
export function formatEval(cp: number): string {
  if (Math.abs(cp) >= 10_000) {
    // chessdb encodes mate as 30000 - plies; the sign says who mates.
    const plies = 30_000 - Math.abs(cp);
    const n = Math.max(1, Math.ceil(plies / 2));
    return cp > 0 ? `#${n}` : `#-${n}`;
  }
  const pawns = cp / 100;
  if (pawns === 0) return "0.00";
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

/** Whose move it is and which move number, straight from the FEN. */
export function describePosition(fen: string): {
  moveNumber: number;
  sideToMove: "White" | "Black";
} {
  const fields = fen.split(" ");
  const moveNumber = Math.max(1, parseInt(fields[5] ?? "1", 10) || 1);
  return { moveNumber, sideToMove: fields[1] === "b" ? "Black" : "White" };
}

const START_POSITION = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

/** The standard start position, whatever its move counters say. */
export function isStartPosition(fen: string): boolean {
  return fen.split(" ").slice(0, 4).join(" ") === START_POSITION;
}

/**
 * Replay a UCI move on top of a base FEN and return the resulting position.
 *
 * Exploration moves must replay from the *currently displayed* position (the
 * running preview cursor), not the canonical game FEN — otherwise chained
 * clicks throw "Invalid move" once the board has walked past ply 0. Returns
 * null on an illegal move so callers can no-op instead of crashing.
 */
export function replayPreviewMove(
  baseFen: string,
  uci: string
): { fen: string; from: string; to: string; san: string } | null {
  if (!uci || uci.length < 4) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  try {
    const g = new Chess(baseFen);
    const result = g.move({ from, to, promotion: "q" });
    if (!result) return null;
    return { fen: g.fen(), from, to, san: result.san };
  } catch {
    return null;
  }
}

/** Wrap-around index for ↑/↓ through the list. 0 for an empty list. */
export function nextCandidateIndex(
  current: number,
  len: number,
  dir: 1 | -1
): number {
  if (len <= 0) return 0;
  return (current + dir + len) % len;
}

export function buildCandidatesFromApi(
  data: ApiData,
  fen: string
): MasterCandidate[] {
  // Whether these numbers are game counts is stated by the API, not guessed
  // from their size: a real position played 391 times is data, not noise.
  const hasCounts = data.hasGameCounts !== false;
  return (data.moves ?? []).map((m): MasterCandidate => {
    // chessdb doesn't return SAN — compute from FEN + UCI on the fly.
    let san = m.san ?? "";
    if (!san) {
      try {
        const c = new Chess(fen);
        const promo = m.uci.length > 4 ? m.uci[4] : undefined;
        const result = c.move({
          from: m.uci.slice(0, 2),
          to: m.uci.slice(2, 4),
          promotion: promo,
        });
        san = result?.san ?? m.uci;
      } catch {
        san = m.uci;
      }
    }
    const count = hasCounts
      ? (m.count ?? (m.white ?? 0) + (m.draws ?? 0) + (m.black ?? 0))
      : 0;
    return {
      san,
      uci: m.uci,
      count,
      whiteWins: hasCounts ? m.white : undefined,
      draws: hasCounts ? m.draws : undefined,
      blackWins: hasCounts ? m.black : undefined,
      eval: m.eval,
      rank: m.rank,
      winrate: m.winrate,
      source: data.source,
    };
  });
}

/**
 * What the explorer last answered, and for which position.
 *
 * One value keyed by FEN rather than separate data / error / loading states,
 * because the position under the panel changes faster than the network
 * answers. With separate states the previous position's rows stayed on
 * screen — and on the board as arrows — until the new response landed.
 */
export interface ExplorerResult {
  fen: string;
  data: ApiData | null;
  /** The request failed (network, timeout, 5xx). Not "no rows". */
  error: boolean;
}

// Offline fallback, for the start position ONLY: it is the same in every
// game, so these first moves are true whatever is loaded. Counts are Lichess
// Masters' all-time figures and are labelled as a fallback in the footer.
const START_POSITION_FALLBACK: MasterCandidate[] = [
  { san: "e4", uci: "e2e4", count: 8_400_000 },
  { san: "d4", uci: "d2d4", count: 6_100_000 },
  { san: "Nf3", uci: "g1f3", count: 2_300_000 },
  { san: "c4", uci: "c2c4", count: 1_700_000 },
  { san: "g3", uci: "g2g3", count: 240_000 },
];

/**
 * The rows for the position on the board, and only that position: nothing
 * until a result for THIS fen exists (loading); the API's rows when it
 * answered (an empty list is a real answer: out of book); the offline
 * fallback only when the request failed AND the board shows the start
 * position.
 */
export function candidatesForPosition(
  result: ExplorerResult | null,
  fen: string
): MasterCandidate[] {
  if (!result || result.fen !== fen) return [];
  if (result.data) return buildCandidatesFromApi(result.data, fen);
  if (result.error && isStartPosition(fen)) return START_POSITION_FALLBACK;
  return [];
}

export interface ResultSplit {
  white: number;
  draws: number;
  black: number;
}

/** Fractions (summing to 1) of the games after this move, or null. */
export function resultSplit(c: MasterCandidate): ResultSplit | null {
  if (
    c.count <= 0 ||
    typeof c.whiteWins !== "number" ||
    typeof c.draws !== "number" ||
    typeof c.blackWins !== "number"
  ) {
    return null;
  }
  const n = c.whiteWins + c.draws + c.blackWins;
  if (n <= 0) return null;
  return { white: c.whiteWins / n, draws: c.draws / n, black: c.blackWins / n };
}

/**
 * The position as a whole: games that reached it and how they ended.
 * `total` is the API's arrival count; the rows only add up to it when the
 * move list was not capped.
 */
export function positionSummary(
  candidates: MasterCandidate[],
  total?: number
): { games: number; split: ResultSplit | null } | null {
  const counted = candidates.filter((c) => c.count > 0);
  const rowSum = counted.reduce((s, c) => s + c.count, 0);
  const games = Math.max(total ?? 0, rowSum);
  if (games <= 0) return null;
  let w = 0;
  let d = 0;
  let b = 0;
  let n = 0;
  for (const c of counted) {
    if (
      typeof c.whiteWins === "number" &&
      typeof c.draws === "number" &&
      typeof c.blackWins === "number"
    ) {
      w += c.whiteWins;
      d += c.draws;
      b += c.blackWins;
      n += c.whiteWins + c.draws + c.blackWins;
    }
  }
  return {
    games,
    split: n > 0 ? { white: w / n, draws: d / n, black: b / n } : null,
  };
}

/** Share of the games at the position that continued with this move. */
export function shareOf(count: number, games: number): number {
  if (games <= 0 || count <= 0) return 0;
  return Math.min(1, count / games);
}

export type Verdict = "top" | "playable" | "inferior";

/** chessdb's verdict on an engine row, in words. */
export function engineVerdict(c: MasterCandidate): Verdict | null {
  if (c.rank === 2) return "top";
  if (c.rank === 1) return "playable";
  if (c.rank === 0) return "inferior";
  return null;
}

/**
 * Centipawns this move gives up against the best engine row, from the
 * mover's side: 0 for the best move, positive for everything worse.
 */
export function lossVersusBest(
  c: MasterCandidate,
  candidates: MasterCandidate[],
  sideToMove: "White" | "Black"
): number | null {
  if (typeof c.eval !== "number") return null;
  const evals = candidates
    .map((x) => x.eval)
    .filter((e): e is number => typeof e === "number");
  if (evals.length === 0) return null;
  const best = sideToMove === "White" ? Math.max(...evals) : Math.min(...evals);
  return sideToMove === "White" ? best - c.eval : c.eval - best;
}

/**
 * The insight card attached to the coach's reply when a line is sent from
 * this panel — structured evidence the model does not see for itself.
 */
export function masterLineInsight(candidate: MasterCandidate): {
  tag: string;
  eval?: string;
  classification?: string;
} {
  const split = resultSplit(candidate);
  const evidence =
    typeof candidate.eval === "number"
      ? formatEval(candidate.eval)
      : candidate.count > 0
        ? `${formatCount(candidate.count)} games`
        : undefined;
  const verdict = engineVerdict(candidate);
  const classification = verdict
    ? VERDICT_META[verdict].insight
    : split
      ? `White ${pct(split.white)} · draw ${pct(split.draws)} · Black ${pct(split.black)}`
      : undefined;
  return {
    tag: `${candidate.san}: Master line`,
    eval: evidence,
    classification,
  };
}

/** What the coach is asked when a row's chat button is pressed. */
export function coachQuestionFor(
  candidate: MasterCandidate,
  sideToMove: "White" | "Black"
): string {
  const split = resultSplit(candidate);
  const verdict = engineVerdict(candidate);
  if (candidate.count > 0) {
    const results = split
      ? ` (White won ${pct(split.white)}, drew ${pct(split.draws)}, Black won ${pct(split.black)})`
      : "";
    return `Tell me about ${candidate.san} from this position: ${formatCount(candidate.count)} master games went this way${results}. What is the idea, and what does ${sideToMove} need to know before playing it?`;
  }
  if (typeof candidate.eval === "number") {
    const verdictBit = verdict
      ? `, ${VERDICT_META[verdict].label.toLowerCase()}`
      : "";
    return `Tell me about ${candidate.san} from this position: the engine gives ${formatEval(candidate.eval)}${verdictBit}, and no master games reach here. What is the idea?`;
  }
  return `Tell me about ${candidate.san} from this position.`;
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

const VERDICT_META: Record<
  Verdict,
  { label: string; insight: string; color: string; tint: string }
> = {
  top: {
    label: "Top choice",
    insight: "Engine's top choice",
    color: STATUS.success,
    tint: STATUS.successTint,
  },
  playable: {
    label: "Playable",
    insight: "Playable (engine)",
    color: TEXT.primary,
    tint: SURFACE.raisedSecondary,
  },
  inferior: {
    label: "Inferior",
    insight: "Inferior (engine)",
    color: STATUS.error,
    tint: STATUS.errorTint,
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Visual tokens: the site's flat dark system (src/theme/tokens.ts).
// ───────────────────────────────────────────────────────────────────────────

const HAIRLINE = `1px solid ${LINE.hairline}`;
const HOVER = "rgba(255,255,255,0.06)";
const SELECTED = "rgba(255,255,255,0.10)";
// Result-bar colours carry the data (White / draw / Black), not chrome.
const WDL = {
  white: { bg: "#E2E8F0", fg: "#0F172A" },
  draws: { bg: "#64748B", fg: "#F8FAFC" },
  black: { bg: "#1E293B", fg: "#E2E8F0" },
} as const;

const navBtnSx = {
  width: 26,
  height: 26,
  color: TEXT.secondary,
  background: SURFACE.raisedSecondary,
  borderRadius: `${RADIUS.small}px`,
  flexShrink: 0,
  transition: `background-color ${MOTION.hover}, color ${MOTION.hover}`,
  "&:hover": {
    background: SURFACE.raisedTertiary,
    color: TEXT.primary,
  },
  "&.Mui-disabled": {
    color: TEXT.tertiary,
    background: "transparent",
  },
} as const;

const stripCellSx = (isCurrent: boolean) =>
  ({
    flexShrink: 0,
    px: 0.85,
    py: 0.45,
    borderRadius: `${RADIUS.small}px`,
    cursor: "pointer",
    fontSize: TYPE.caption.fontSize,
    fontFamily: FONT_MONO,
    fontWeight: 600,
    lineHeight: 1,
    whiteSpace: "nowrap" as const,
    color: isCurrent ? TEXT.primary : TEXT.secondary,
    background: isCurrent ? SELECTED : "transparent",
    border: "1px solid transparent",
    transition: `background-color ${MOTION.hover}, color ${MOTION.hover}`,
    "&:hover": {
      background: isCurrent ? SELECTED : HOVER,
      color: TEXT.primary,
    },
  }) as const;

// ───────────────────────────────────────────────────────────────────────────
// Result bar — White / draw / Black as one segmented bar.
// ───────────────────────────────────────────────────────────────────────────

function ResultBar({
  split,
  height = 16,
  labels = true,
}: {
  split: ResultSplit;
  height?: number;
  labels?: boolean;
}) {
  const segments: { key: keyof ResultSplit; name: string }[] = [
    { key: "white", name: "White wins" },
    { key: "draws", name: "Draws" },
    { key: "black", name: "Black wins" },
  ];
  const title = segments
    .map((s) => `${s.name} ${pct(split[s.key])}`)
    .join(" · ");
  return (
    <Tooltip title={title} arrow placement="top" describeChild>
      <Box
        role="img"
        aria-label={title}
        sx={{
          display: "flex",
          width: "100%",
          height,
          borderRadius: `${RADIUS.small}px`,
          overflow: "hidden",
          border: `1px solid ${LINE.hairline}`,
          background: SURFACE.raisedSecondary,
        }}
      >
        {segments.map((s) => {
          const value = split[s.key];
          if (value <= 0) return null;
          return (
            <Box
              key={s.key}
              sx={{
                width: `${value * 100}%`,
                background: WDL[s.key].bg,
                color: WDL[s.key].fg,
                fontSize: TYPE.caption.fontSize,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                lineHeight: `${height - 2}px`,
                textAlign: "center",
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              {labels && value >= 0.12 ? pct(value) : ""}
            </Box>
          );
        })}
      </Box>
    </Tooltip>
  );
}

function VerdictChip({ verdict }: { verdict: Verdict }) {
  const meta = VERDICT_META[verdict];
  return (
    <Box
      component="span"
      sx={{
        px: 1,
        py: 0.25,
        borderRadius: `${RADIUS.small}px`,
        fontSize: TYPE.caption.fontSize,
        fontWeight: 600,
        color: meta.color,
        background: meta.tint,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {meta.label}
    </Box>
  );
}

function ColumnHeader({
  columns,
}: {
  columns: { label: string; sx?: object }[];
}) {
  return (
    <Box
      aria-hidden
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        px: 2.25,
        pt: 1.25,
        pb: 0.5,
        fontSize: TYPE.caption.fontSize,
        fontWeight: 600,
        color: TEXT.secondary,
        flexShrink: 0,
      }}
    >
      {columns.map((c) => (
        <Box key={c.label} sx={c.sx}>
          {c.label}
        </Box>
      ))}
    </Box>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// The panel
// ───────────────────────────────────────────────────────────────────────────

interface MasterGamesPanelProps {
  /** The position on the board — what is looked up. */
  fen: string;
  /** Mainline ply, for the history strip. */
  ply: number;
  /** Move played in the loaded game at this ply, for the PLAYED badge. */
  playedSan?: string;
  /** A row was chosen (click, → or Enter): parent plays it on the board. */
  onPreviewMove: (uci: string, san: string) => void;
  /** ←: parent takes the board half a move back. */
  onStepBack?: () => void;
  /**
   * The row to select when the rows for `fen` are up, instead of the first:
   * after ← it is the move just taken back, so ↓ reaches its siblings.
   */
  selectSan?: string;
  /** A row's chat button: parent sends the question with the row attached. */
  onSendToCoach: (message: string, candidate?: MasterCandidate) => void;
  /** Fires whenever the visible rows change, for the board's arrows. */
  onCandidatesUpdate?: (candidates: MasterCandidate[]) => void;
  /** Loaded game's move list — drives the history strip. */
  moves?: Move[];
  /** Jump board + panel to a half-move. */
  onJumpToPly?: (ply: number) => void;
}

/**
 * Holding an arrow key through the strip changes the position faster than
 * this; one request per position the user actually settles on.
 */
const FETCH_DEBOUNCE_MS = 60;

/** How long a selection has to rest before its position is fetched ahead. */
const PREFETCH_DELAY_MS = 150;

export function MasterGamesPanel({
  fen,
  ply,
  playedSan,
  onPreviewMove,
  onStepBack,
  selectSan,
  onSendToCoach,
  onCandidatesUpdate,
  moves,
  onJumpToPly,
}: MasterGamesPanelProps) {
  // The explorer's last answer that had to be waited for, tagged with the
  // position it answers for — see ExplorerResult for why it is one value and
  // not three states. Positions already answered come straight from the
  // shared cache below, with no loading state at all.
  const [fetched, setFetched] = useState<ExplorerResult | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!fen || peekExplorer(fen)) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      fetchExplorer(fen)
        .then((data) => {
          if (!cancelled) setFetched({ fen, data, error: false });
        })
        .catch(() => {
          if (!cancelled) setFetched({ fen, data: null, error: true });
        });
    }, FETCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [fen, retryTick]);

  // Everything below reads the answer for the position on the board and
  // nothing else. Until one exists the panel is loading, whatever the
  // previous position had.
  const result = useMemo<ExplorerResult | null>(() => {
    const cached = peekExplorer(fen);
    if (cached) return { fen, data: cached, error: false };
    return fetched?.fen === fen ? fetched : null;
  }, [fen, fetched]);
  const apiData = result?.data ?? null;
  const apiError = result?.error ?? false;
  const loading = result === null;

  const candidates = useMemo<MasterCandidate[]>(
    () => candidatesForPosition(result, fen),
    [result, fen]
  );

  useEffect(() => {
    onCandidatesUpdate?.(candidates);
  }, [candidates, onCandidatesUpdate]);

  const position = useMemo(() => describePosition(fen), [fen]);
  const summary = useMemo(
    () => positionSummary(candidates, apiData?.total),
    [candidates, apiData?.total]
  );
  const isEngine = apiData?.source === "chessdb";
  const isFallback = apiError && candidates.length > 0;
  const opening = apiData?.opening;

  // Which row → plays: the first (most played, or the engine's top choice)
  // unless the parent names one — after ← it is the move just taken back, so
  // ↓ reaches its siblings.
  const [selectedIdx, setSelectedIdx] = useState(0);
  useEffect(() => {
    const wanted = selectSan
      ? candidates.findIndex((c) => c.san === selectSan)
      : -1;
    setSelectedIdx(wanted >= 0 ? wanted : 0);
  }, [fen, candidates, selectSan]);

  // ↑/↓ select, → (or Enter) plays the selection, ← takes half a move back.
  // The page binds ←/→ to the game's plies everywhere else; while this panel
  // is up they belong to it, and AnalysisImpl stands down.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onStepBack?.();
        return;
      }
      if (candidates.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => nextCandidateIndex(i, candidates.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => nextCandidateIndex(i, candidates.length, -1));
      } else if (
        e.key === "ArrowRight" ||
        (e.key === "Enter" && t?.tagName !== "BUTTON")
      ) {
        const c = candidates[selectedIdx];
        if (!c) return;
        e.preventDefault();
        onPreviewMove(c.uci, c.san);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [candidates, selectedIdx, onPreviewMove, onStepBack]);

  // Have the selected row's position answered before → asks for it. Only
  // from a master position: past the tree every child is a chessdb round
  // trip, and one of those per keypress is enough.
  useEffect(() => {
    if (!apiData || apiData.source !== "tree") return;
    const c = candidates[selectedIdx];
    if (!c) return;
    const next = replayPreviewMove(fen, c.uci);
    if (!next) return;
    const handle = setTimeout(
      () => prefetchExplorer(next.fen),
      PREFETCH_DELAY_MS
    );
    return () => clearTimeout(handle);
  }, [apiData, candidates, selectedIdx, fen]);

  // Auto-scroll the history strip to keep the current ply in view.
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!stripRef.current) return;
    const el = stripRef.current.querySelector(
      `[data-strip-ply="${ply}"]`
    ) as HTMLElement | null;
    el?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [ply, moves]);

  const totalPlies = moves?.length ?? 0;
  const canPrev = !!onJumpToPly && ply > 0;
  const canNext = !!onJumpToPly && ply < totalPlies;

  const title = isEngine ? "Engine analysis" : "Master games";
  const TitleIcon = isEngine ? Cpu : BookOpen;

  const subtitle = opening ? (
    <>
      {opening.name}
      {opening.eco && (
        <Box component="span" sx={{ color: TEXT.secondary, ml: 0.75 }}>
          {opening.eco}
        </Box>
      )}
    </>
  ) : (
    <>
      Move {position.moveNumber} · {position.sideToMove} to move
    </>
  );

  const footerSource = apiError
    ? isFallback
      ? "Offline · Lichess Masters all-time figures for the start position"
      : "Master database unreachable"
    : apiData
      ? isEngine
        ? "chessdb.cn engine analysis · evaluations from White's side"
        : apiData.source === "lichess"
          ? "Lichess Masters (live)"
          : apiData.corpus?.games
            ? `${formatCount(apiData.corpus.games)} games · ${apiData.corpus.source}`
            : `Master-games database (${apiData.indexedPositions ?? "?"} positions)`
      : "Loading";

  return (
    <Box
      data-testid="master-games-panel"
      sx={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        borderRadius: `${RADIUS.card}px`,
        background: SURFACE.raised,
        border: `1px solid ${LINE.hairline}`,
        overflow: "hidden",
      }}
    >
      {/* Header: what this is, and which position it describes. */}
      <Box
        sx={{
          px: 2.25,
          pt: 1.75,
          pb: 1.25,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          flexShrink: 0,
        }}
      >
        <TitleIcon
          size={20}
          strokeWidth={1.75}
          color={TEXT.secondary}
          aria-hidden
          style={{ flexShrink: 0 }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography
              sx={{ ...TYPE.h5, color: TEXT.primary, lineHeight: 1.1 }}
            >
              {title}
            </Typography>
            {loading && (
              <CircularProgress
                aria-label="Loading"
                size={14}
                sx={{ color: TEXT.secondary }}
              />
            )}
          </Box>
          <Typography
            data-testid="master-games-subtitle"
            sx={{
              fontSize: TYPE.caption.fontSize,
              color: TEXT.secondary,
              mt: 0.4,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {subtitle}
          </Typography>
        </Box>
      </Box>

      {/* Move-history strip — back/forward + click-to-jump scrubber. */}
      {onJumpToPly && moves && moves.length > 0 && (
        <Box
          sx={{
            px: 1.5,
            py: 1,
            borderTop: HAIRLINE,
            borderBottom: HAIRLINE,
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            flexShrink: 0,
          }}
        >
          <Tooltip title="Jump to start" arrow>
            <span>
              <IconButton
                onClick={() => onJumpToPly(0)}
                disabled={!canPrev}
                size="small"
                sx={navBtnSx}
                aria-label="Jump to start"
              >
                <Rewind size={13} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Previous move in the game" arrow>
            <span>
              <IconButton
                onClick={() => onJumpToPly(Math.max(0, ply - 1))}
                disabled={!canPrev}
                size="small"
                sx={navBtnSx}
                aria-label="Previous move"
              >
                <ChevronLeft size={14} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Next move in the game" arrow>
            <span>
              <IconButton
                onClick={() => onJumpToPly(Math.min(totalPlies, ply + 1))}
                disabled={!canNext}
                size="small"
                sx={navBtnSx}
                aria-label="Next move"
              >
                <ChevronRight size={14} />
              </IconButton>
            </span>
          </Tooltip>
          <Box
            ref={stripRef}
            sx={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              gap: 0.35,
              overflowX: "auto",
              px: 0.5,
              py: 0.25,
            }}
          >
            <Box
              data-strip-ply={0}
              onClick={() => onJumpToPly(0)}
              sx={stripCellSx(ply === 0)}
            >
              start
            </Box>
            {moves.map((m, i) => {
              const movePly = i + 1;
              const isWhite = i % 2 === 0;
              const moveNumber = Math.floor(i / 2) + 1;
              return (
                <Box
                  key={`${movePly}-${m.san}`}
                  data-strip-ply={movePly}
                  onClick={() => onJumpToPly(movePly)}
                  sx={stripCellSx(movePly === ply)}
                >
                  {isWhite && (
                    <Box
                      component="span"
                      sx={{
                        color: TEXT.secondary,
                        mr: 0.4,
                        fontWeight: 600,
                      }}
                    >
                      {moveNumber}.
                    </Box>
                  )}
                  {m.san}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Position summary: how many games got here and how they ended. */}
      {summary && !isFallback && (
        <Box
          data-testid="master-games-summary"
          sx={{
            px: 2.25,
            py: 1.25,
            borderBottom: HAIRLINE,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            flexShrink: 0,
          }}
        >
          <Box sx={{ flexShrink: 0 }}>
            <Typography
              sx={{
                fontSize: TYPE.h5.fontSize,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                color: TEXT.primary,
                lineHeight: 1,
              }}
            >
              {summary.games.toLocaleString("en-US")}
            </Typography>
            <Typography
              sx={{
                fontSize: TYPE.caption.fontSize,
                color: TEXT.secondary,
                mt: 0.4,
              }}
            >
              games reached this position
            </Typography>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {summary.split && <ResultBar split={summary.split} height={18} />}
          </Box>
        </Box>
      )}

      {isFallback && (
        <Box
          sx={{
            mx: 2.25,
            mt: 1.25,
            px: 1.25,
            py: 0.85,
            borderRadius: `${RADIUS.control}px`,
            background: STATUS.warningTint,
            border: `1px solid ${LINE.hairline}`,
            fontSize: TYPE.caption.fontSize,
            color: TEXT.primary,
            lineHeight: 1.5,
            flexShrink: 0,
          }}
        >
          The master database couldn't be reached. These are the first moves of
          every game, from Lichess Masters' all-time figures, so the panel is
          not empty while it is down.
        </Box>
      )}

      {isEngine && candidates.length > 0 && (
        <Box
          data-testid="master-games-engine-notice"
          sx={{
            mx: 2.25,
            mt: 1.25,
            px: 1.25,
            py: 0.85,
            borderRadius: `${RADIUS.control}px`,
            background: STATUS.infoTint,
            border: `1px solid ${LINE.hairline}`,
            flexShrink: 0,
          }}
        >
          <Typography
            sx={{ ...TYPE.label, color: TEXT.primary, lineHeight: 1.5 }}
          >
            Beyond the games database
          </Typography>
          <Typography
            sx={{
              fontSize: TYPE.caption.fontSize,
              color: TEXT.secondary,
              lineHeight: 1.5,
            }}
          >
            No master games reach this position. These are engine picks from
            chessdb.cn, evaluated from White's side: how the engine rates each
            move, not how often anyone played it.
          </Typography>
        </Box>
      )}

      {candidates.length > 0 && (
        <ColumnHeader
          columns={
            isEngine
              ? [
                  { label: "Move", sx: { width: 64 } },
                  { label: "Eval", sx: { width: 60, textAlign: "right" } },
                  { label: "vs best", sx: { width: 58, textAlign: "right" } },
                  { label: "Verdict", sx: { flex: 1 } },
                ]
              : [
                  { label: "Move", sx: { width: 64 } },
                  { label: "Games", sx: { width: 56, textAlign: "right" } },
                  {
                    label: "Share",
                    sx: {
                      width: 46,
                      textAlign: "right",
                      display: { xs: "none", sm: "block" },
                    },
                  },
                  { label: "White · draw · Black", sx: { flex: 1, pl: 0.5 } },
                ]
          }
        />
      )}

      {/* The rows. */}
      <Box
        data-testid="master-games-rows"
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          px: 1.5,
          pb: 1.5,
          pt: candidates.length > 0 ? 0.25 : 1.5,
        }}
      >
        {candidates.length === 0 ? (
          loading ? (
            <Stack
              spacing={0.75}
              aria-label="Loading master games"
              role="status"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <Box
                  key={i}
                  sx={{
                    height: 44,
                    borderRadius: `${RADIUS.control}px`,
                    background: "rgba(255,255,255,0.06)",
                  }}
                />
              ))}
              <Typography
                sx={{
                  fontSize: TYPE.caption.fontSize,
                  color: TEXT.secondary,
                  textAlign: "center",
                  pt: 1,
                }}
              >
                Loading master games
              </Typography>
            </Stack>
          ) : apiError ? (
            <Box sx={{ px: 1.5, py: 4, textAlign: "center" }} role="alert">
              <Typography
                sx={{
                  fontSize: TYPE.bodySmall.fontSize,
                  color: TEXT.primary,
                  fontWeight: 600,
                }}
              >
                Couldn't reach the master database
              </Typography>
              <Typography
                sx={{
                  fontSize: TYPE.caption.fontSize,
                  color: TEXT.secondary,
                  mt: 0.5,
                }}
              >
                Nothing is wrong with the position. Try again in a moment.
              </Typography>
              <Button
                onClick={() => setRetryTick((t) => t + 1)}
                startIcon={<RefreshCw size={14} strokeWidth={1.75} />}
                variant="outlined"
                size="small"
                sx={{ mt: 1.5 }}
              >
                Try again
              </Button>
            </Box>
          ) : (
            <Box sx={{ px: 1.5, py: 4, textAlign: "center" }}>
              <Search
                size={18}
                strokeWidth={1.75}
                color={TEXT.secondary}
                aria-hidden
                style={{ marginBottom: 8 }}
              />
              <Typography
                sx={{
                  fontSize: TYPE.bodySmall.fontSize,
                  color: TEXT.primary,
                  fontWeight: 600,
                }}
              >
                Out of master-game book
              </Typography>
              <Typography
                sx={{
                  fontSize: TYPE.caption.fontSize,
                  color: TEXT.secondary,
                  mt: 0.5,
                  lineHeight: 1.5,
                }}
              >
                No master games in the database reach this position, and the
                engine database has no analysis for it either. You're in
                original territory: the Lines tab has Stockfish for that.
              </Typography>
            </Box>
          )
        ) : (
          <Stack spacing={0.5}>
            {candidates.map((c, idx) => {
              const isPlayed = c.san === playedSan;
              const isSelected = idx === selectedIdx;
              const share = summary ? shareOf(c.count, summary.games) : 0;
              const split = resultSplit(c);
              const verdict = engineVerdict(c);
              const loss = isEngine
                ? lossVersusBest(c, candidates, position.sideToMove)
                : null;
              return (
                <Box
                  key={c.san}
                  data-testid="master-candidate"
                  data-kb-selected={isSelected || undefined}
                  role="button"
                  tabIndex={-1}
                  aria-label={`Preview ${c.san}`}
                  ref={(el: HTMLDivElement | null) => {
                    if (el && isSelected) {
                      el.scrollIntoView({
                        block: "nearest",
                        behavior: "smooth",
                      });
                    }
                  }}
                  onClick={() => onPreviewMove(c.uci, c.san)}
                  sx={{
                    position: "relative",
                    px: 0.75,
                    py: 0.85,
                    borderRadius: `${RADIUS.control}px`,
                    cursor: "pointer",
                    // The keyboard selection (the row → plays) is the only
                    // filled row, so it outranks every marker. The played
                    // move is marked by its "Played" word alone, and keeps
                    // that word when it is also the selection.
                    background: isSelected ? SELECTED : "transparent",
                    border: isSelected
                      ? `1px solid ${LINE.strong}`
                      : "1px solid transparent",
                    transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}`,
                    "&:hover": {
                      background: isSelected ? SELECTED : HOVER,
                    },
                    "&:active": {
                      background: SURFACE.raisedTertiary,
                    },
                  }}
                >
                  {share > 0 && (
                    <Box
                      aria-hidden
                      sx={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${share * 100}%`,
                        background: "rgba(255,255,255,0.04)",
                        borderRadius: `${RADIUS.control}px`,
                        pointerEvents: "none",
                      }}
                    />
                  )}
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1.25}
                    sx={{ position: "relative" }}
                  >
                    <Box sx={{ width: 64, flexShrink: 0 }}>
                      <Typography
                        sx={{
                          fontSize: TYPE.bodySmall.fontSize,
                          fontWeight: 600,
                          color: TEXT.primary,
                          fontFamily: FONT_MONO,
                          lineHeight: 1.1,
                        }}
                      >
                        {c.san}
                      </Typography>
                      {isPlayed && (
                        <Typography
                          sx={{
                            fontSize: TYPE.caption.fontSize,
                            color: ACCENT.hover,
                            fontWeight: 600,
                            mt: 0.2,
                          }}
                        >
                          Played
                        </Typography>
                      )}
                    </Box>

                    {isEngine ? (
                      <>
                        <Typography
                          sx={{
                            width: 60,
                            flexShrink: 0,
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                            fontSize: TYPE.bodySmall.fontSize,
                            fontWeight: 600,
                            // Neutral on purpose: the eval is White's, the
                            // verdict is the mover's, and a green "+0.27" next
                            // to "Inferior" with Black to move said two things.
                            color: TEXT.primary,
                          }}
                        >
                          {typeof c.eval === "number"
                            ? formatEval(c.eval)
                            : "–"}
                        </Typography>
                        <Typography
                          sx={{
                            width: 58,
                            flexShrink: 0,
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                            fontSize: TYPE.caption.fontSize,
                            color: TEXT.secondary,
                          }}
                        >
                          {loss === null
                            ? ""
                            : loss <= 0
                              ? "best"
                              : `−${(loss / 100).toFixed(2)}`}
                        </Typography>
                        <Box
                          sx={{
                            flex: 1,
                            minWidth: 0,
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          {verdict && <VerdictChip verdict={verdict} />}
                        </Box>
                      </>
                    ) : (
                      <>
                        <Tooltip
                          title={`${c.count.toLocaleString("en-US")} games`}
                          arrow
                          placement="top"
                        >
                          <Typography
                            sx={{
                              width: 56,
                              flexShrink: 0,
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                              fontSize: TYPE.bodySmall.fontSize,
                              fontWeight: 600,
                              color: TEXT.primary,
                            }}
                          >
                            {c.count > 0 ? formatCount(c.count) : "–"}
                          </Typography>
                        </Tooltip>
                        <Typography
                          sx={{
                            width: 46,
                            flexShrink: 0,
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                            fontSize: TYPE.caption.fontSize,
                            color: TEXT.secondary,
                            display: { xs: "none", sm: "block" },
                          }}
                        >
                          {share > 0 ? pct(share) : ""}
                        </Typography>
                        <Box sx={{ flex: 1, minWidth: 0, pl: 0.5 }}>
                          {/* A row's bar is too narrow for its labels; the
                              tooltip and the accessible name carry all three
                              numbers. The wider summary bar keeps them. */}
                          {split && <ResultBar split={split} labels={false} />}
                        </Box>
                      </>
                    )}

                    <Tooltip title="Ask Masti about this line" arrow>
                      <IconButton
                        aria-label={`Ask Masti about ${c.san}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSendToCoach(
                            coachQuestionFor(c, position.sideToMove),
                            c
                          );
                        }}
                        size="small"
                        sx={{
                          width: 28,
                          height: 28,
                          flexShrink: 0,
                          color: TEXT.secondary,
                          borderRadius: `${RADIUS.small}px`,
                          "&:hover": {
                            background: HOVER,
                            color: TEXT.primary,
                          },
                        }}
                      >
                        <MessageSquare size={14} strokeWidth={1.75} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>

      {/* Footer: where the numbers come from, and how to drive the panel. */}
      <Box
        data-testid="master-games-footer"
        sx={{
          px: 2.25,
          py: 1.25,
          borderTop: HAIRLINE,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          fontSize: TYPE.caption.fontSize,
          color: TEXT.secondary,
          flexShrink: 0,
        }}
      >
        <Box
          sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}
        >
          <Box
            aria-hidden
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              flexShrink: 0,
              background: apiError ? STATUS.error : STATUS.success,
            }}
          />
          <Box
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {footerSource}
          </Box>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Box
          sx={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flexShrink: 1,
            minWidth: 0,
            display: { xs: "none", sm: "block" },
          }}
        >
          ↑↓ select · → play · ← back · drag to explore
        </Box>
      </Box>
    </Box>
  );
}
