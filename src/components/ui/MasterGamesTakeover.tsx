"use client";

import { Box, Button, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { Chess } from "chess.js";
import { motion } from "framer-motion";
import {
  ArrowLeftRight,
  BookOpen,
  Filter,
  Loader2,
  MessageSquare,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

// ───────────────────────────────────────────────────────────────────────────
// Top players — colored avatars for highest-rated player at a position.
// Names from the Lichess masters API are matched against the regex list.
// ───────────────────────────────────────────────────────────────────────────

export interface TopPlayer {
  name: string;
  initials: string;
  color: string;
  rank: number;
}

const TOP_PLAYERS = {
  carlsen: { name: "Magnus Carlsen", initials: "MC", color: "#FCD34D", rank: 1 },
  caruana: { name: "Fabiano Caruana", initials: "FC", color: "#60A5FA", rank: 2 },
  nakamura: { name: "Hikaru Nakamura", initials: "HN", color: "#A78BFA", rank: 3 },
  nepo: { name: "Ian Nepomniachtchi", initials: "IN", color: "#34D399", rank: 4 },
  giri: { name: "Anish Giri", initials: "AG", color: "#F472B6", rank: 5 },
  ding: { name: "Ding Liren", initials: "DL", color: "#FB923C", rank: 6 },
  firouzja: { name: "Alireza Firouzja", initials: "AF", color: "#22D3EE", rank: 7 },
  so: { name: "Wesley So", initials: "WS", color: "#A3E635", rank: 8 },
  aronian: { name: "Levon Aronian", initials: "LA", color: "#FB7185", rank: 9 },
  rapport: { name: "Richard Rapport", initials: "RR", color: "#E879F9", rank: 10 },
  // Legends — high rank number so they're "lower priority" than active top players
  kasparov: { name: "Garry Kasparov", initials: "GK", color: "#F87171", rank: 50 },
  topalov: { name: "Veselin Topalov", initials: "VT", color: "#C084FC", rank: 51 },
  kramnik: { name: "Vladimir Kramnik", initials: "VK", color: "#FB7185", rank: 52 },
  anand: { name: "Viswanathan Anand", initials: "VA", color: "#FACC15", rank: 53 },
  karpov: { name: "Anatoly Karpov", initials: "AK", color: "#FDA4AF", rank: 54 },
  fischer: { name: "Robert Fischer", initials: "BF", color: "#7DD3FC", rank: 55 },
} as const;

// Match strategies for player names returned by the Lichess masters API.
// The API uses last-name-first formats like "Carlsen, M" — handle both.
const PLAYER_MATCHERS: { regex: RegExp; player: TopPlayer }[] = [
  { regex: /\bcarlsen\b.*\b[mM]\b|magnus carlsen/i, player: TOP_PLAYERS.carlsen },
  { regex: /\bcaruana\b.*\b[fF]\b|fabiano caruana/i, player: TOP_PLAYERS.caruana },
  { regex: /\bnakamura\b.*\b[hH]\b|hikaru nakamura/i, player: TOP_PLAYERS.nakamura },
  { regex: /\bnepomniachtchi\b|nepomniashchy|ian nepom/i, player: TOP_PLAYERS.nepo },
  { regex: /\bgiri\b.*\b[aA]\b|anish giri/i, player: TOP_PLAYERS.giri },
  { regex: /\bding\b.*\b[lL]\b|ding liren/i, player: TOP_PLAYERS.ding },
  { regex: /\bfirouzja\b|alireza/i, player: TOP_PLAYERS.firouzja },
  { regex: /\bso\b.*\b[wW]\b|wesley so/i, player: TOP_PLAYERS.so },
  { regex: /\baronian\b.*\b[lL]\b|levon aronian/i, player: TOP_PLAYERS.aronian },
  { regex: /\brapport\b.*\b[rR]\b|richard rapport/i, player: TOP_PLAYERS.rapport },
  { regex: /\bkasparov\b.*\b[gG]\b|garry kasparov/i, player: TOP_PLAYERS.kasparov },
  { regex: /\btopalov\b.*\b[vV]\b|veselin topalov/i, player: TOP_PLAYERS.topalov },
  { regex: /\bkramnik\b.*\b[vV]\b|vladimir kramnik/i, player: TOP_PLAYERS.kramnik },
  { regex: /\banand\b.*\b[vV]\b|viswanathan anand/i, player: TOP_PLAYERS.anand },
  { regex: /\bkarpov\b.*\b[aA]\b|anatoly karpov/i, player: TOP_PLAYERS.karpov },
  { regex: /\bfischer\b.*\b[rR]\b|robert fischer|bobby fischer/i, player: TOP_PLAYERS.fischer },
];

function findPlayerFromName(name: string | undefined): TopPlayer | undefined {
  if (!name) return undefined;
  for (const m of PLAYER_MATCHERS) {
    if (m.regex.test(name)) return m.player;
  }
  return undefined;
}

// ───────────────────────────────────────────────────────────────────────────
// Candidate model
// ───────────────────────────────────────────────────────────────────────────

/**
 * Which upstream in the master-games source chain produced this response.
 * Mirrors `ApiData["source"]` from /api/opening-explorer:
 * curated (hand-vetted master index) → lichess (Lichess Masters, live) →
 * chessdb (chessdb.cn engine fallback).
 */
export type MasterSource = "curated" | "lichess" | "chessdb";

export interface MasterCandidate {
  san: string;
  uci: string;
  count: number;
  topPlayer?: TopPlayer;
  whiteWins?: number;
  blackWins?: number;
  draws?: number;
  /** Engine eval in centipawns (positive = white better) — from chessdb. */
  eval?: number;
  /** chessdb rank: 0=poor, 1=neutral, 2=good, 3=best */
  rank?: number;
  /** White's expected score (0..100) from chessdb's engine analysis. */
  winrate?: number;
  /**
   * The data source that produced this candidate — threaded from the
   * response-level `ApiData.source`. Undefined for hardcoded-demo rows.
   */
  source?: MasterSource;
}

// Hardcoded fallback for the Pirc/Kasparov demo when the Lichess API is
// unreachable. Keyed by ply so we can still demo offline.
const HARDCODED_FALLBACK_BY_PLY: Record<number, MasterCandidate[]> = {
  0: [
    { san: "e4", uci: "e2e4", count: 8400000, topPlayer: TOP_PLAYERS.carlsen },
    { san: "d4", uci: "d2d4", count: 6100000, topPlayer: TOP_PLAYERS.caruana },
    { san: "Nf3", uci: "g1f3", count: 2300000, topPlayer: TOP_PLAYERS.nakamura },
    { san: "c4", uci: "c2c4", count: 1700000, topPlayer: TOP_PLAYERS.giri },
    { san: "g3", uci: "g2g3", count: 240000 },
  ],
  1: [
    { san: "e5", uci: "e7e5", count: 2800000, topPlayer: TOP_PLAYERS.carlsen },
    { san: "c5", uci: "c7c5", count: 2400000, topPlayer: TOP_PLAYERS.nepo },
    { san: "e6", uci: "e7e6", count: 890000 },
    { san: "c6", uci: "c7c6", count: 540000 },
    { san: "d6", uci: "d7d6", count: 420000, topPlayer: TOP_PLAYERS.topalov },
  ],
};

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

// Public helper still used by analysis.tsx's "Most common arrow" toggle.
// Best-effort: returns the highest-count hardcoded candidate when available.
export function getMasterCandidates(ply: number): MasterCandidate[] {
  return HARDCODED_FALLBACK_BY_PLY[ply] ?? [];
}

/**
 * Replay a UCI move on top of a base FEN and return the resulting position.
 *
 * This is the ae4cf45 fix pattern extracted into a pure unit: exploration
 * moves in the Master Games takeover must replay from the *currently displayed*
 * position (the running preview cursor), not the canonical game FEN — otherwise
 * chained clicks throw "Invalid move" once the board has walked past ply 0.
 * Returns null on an illegal move (e.g. replaying "e7e5" on the start position)
 * so callers can no-op instead of crashing.
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
    // chess.js throws on an illegal move rather than returning null.
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// API response parsing (Lichess masters via our /api/opening-explorer proxy)
// ───────────────────────────────────────────────────────────────────────────

interface ApiMove {
  uci: string;
  san?: string;
  white: number;
  draws: number;
  black: number;
  averageRating?: number;
  eval?: number;
  rank?: number;
  winrate?: number;
  popularity?: number;
  /** Curated data carries the player key directly (e.g. "carlsen"). */
  topPlayer?: string;
}

interface ApiTopGame {
  uci: string;
  white?: { name?: string; rating?: number };
  black?: { name?: string; rating?: number };
  year?: number;
  winner?: "white" | "black" | "draws";
}

interface ApiData {
  white: number;
  draws: number;
  black: number;
  moves: ApiMove[];
  topGames?: ApiTopGame[];
  opening?: { eco: string; name: string };
  source?: MasterSource;
  indexedPositions?: number;
}

export function buildCandidatesFromApi(
  data: ApiData,
  fen: string
): MasterCandidate[] {
  const topByUci = new Map<string, ApiTopGame[]>();
  (data.topGames ?? []).forEach((g) => {
    const arr = topByUci.get(g.uci) ?? [];
    arr.push(g);
    topByUci.set(g.uci, arr);
  });

  return data.moves.map((m): MasterCandidate => {
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

    // Real game count from Lichess (sum of white/draws/black). chessdb's
    // numbers are color-split synthesizers, not game counts — leave count
    // at 0 in that case and the UI shows engine data instead.
    const total = m.white + m.draws + m.black;
    const isFromLichess = total > 1000; // Lichess returns thousands+ at minimum
    const count = isFromLichess ? total : 0;

    // Top player attribution:
    // - Curated data carries the key directly (e.g. "carlsen") — fastest path
    // - Lichess attaches player names inside topGames — regex-match those
    let topPlayer: TopPlayer | undefined;
    if (m.topPlayer && (TOP_PLAYERS as Record<string, TopPlayer>)[m.topPlayer]) {
      topPlayer = (TOP_PLAYERS as Record<string, TopPlayer>)[m.topPlayer];
    } else {
      const games = topByUci.get(m.uci) ?? [];
      for (const g of games) {
        const w = findPlayerFromName(g.white?.name);
        const b = findPlayerFromName(g.black?.name);
        const here =
          w && b ? (w.rank < b.rank ? w : b) : (w ?? b);
        if (here && (!topPlayer || here.rank < topPlayer.rank)) {
          topPlayer = here;
        }
      }
    }

    return {
      san,
      uci: m.uci,
      count,
      topPlayer,
      whiteWins: m.white,
      draws: m.draws,
      blackWins: m.black,
      eval: m.eval,
      rank: m.rank,
      winrate: m.winrate,
      source: data.source,
    };
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Source badge — per-row attribution of which upstream produced the candidate.
// Pure, hookless → SSR-testable. Derived from `candidate.source`, never a
// hardcoded per-move constant. Undefined source (hardcoded demo) → renders null.
// ───────────────────────────────────────────────────────────────────────────

const SOURCE_META: Record<
  MasterSource,
  { initials: string; label: string; color: string }
> = {
  curated: {
    initials: "CUR",
    label: "Curated master index",
    color: "#22C55E",
  },
  lichess: {
    initials: "LIC",
    label: "Lichess Masters (live)",
    color: "#60A5FA",
  },
  chessdb: {
    initials: "CDB",
    label: "chessdb.cn engine",
    color: "#A78BFA",
  },
};

export function SourceBadge({
  source,
}: {
  source?: MasterSource;
}) {
  if (!source) return null;
  const meta = SOURCE_META[source];
  if (!meta) return null;
  return (
    <Tooltip title={`Source: ${meta.label}`} arrow placement="top">
      <Box
        component="span"
        aria-label={`Source: ${meta.label}`}
        sx={{
          px: 0.85,
          py: 0.3,
          borderRadius: "6px",
          background: `${meta.color}1F`,
          border: `1px solid ${meta.color}59`,
          color: meta.color,
          fontFamily: "Monaco, Menlo, monospace",
          fontSize: "0.62rem",
          fontWeight: 800,
          letterSpacing: "0.06em",
          lineHeight: 1,
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        {meta.initials}
      </Box>
    </Tooltip>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Player avatar
// ───────────────────────────────────────────────────────────────────────────

function PlayerAvatar({
  player,
  size = 28,
  onClick,
  active = false,
}: {
  player: TopPlayer;
  size?: number;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <Tooltip title={player.name} arrow placement="top">
      <Box
        onClick={onClick}
        sx={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: player.color,
          color: "#0A0A0A",
          fontSize: size <= 22 ? "0.6rem" : "0.66rem",
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          cursor: onClick ? "pointer" : "default",
          letterSpacing: "0.02em",
          border: active
            ? "2px solid rgba(255,255,255,0.92)"
            : "2px solid transparent",
          boxShadow: `0 0 ${active ? "16px" : "10px"} ${player.color}88, inset 0 -2px 4px rgba(0,0,0,0.18)`,
          transition: "all 180ms cubic-bezier(0.22, 0.61, 0.36, 1)",
          "&:hover": onClick
            ? {
                transform: "scale(1.08)",
                boxShadow: `0 0 18px ${player.color}aa, inset 0 -2px 4px rgba(0,0,0,0.18)`,
              }
            : undefined,
        }}
      >
        {player.initials}
      </Box>
    </Tooltip>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Main panel
// ───────────────────────────────────────────────────────────────────────────

interface MasterGamesTakeoverProps {
  /** Current board position to look up in master DB. */
  fen: string;
  /** Canonical ply (for hardcoded fallback + offline mode). */
  ply: number;
  /** Move played in the canonical game at this ply (for highlighting). */
  playedSan?: string;
  /** When a candidate is clicked, parent updates the board to that line. */
  onPreviewMove: (uci: string, san: string) => void;
  /**
   * When user wants to send a candidate/idea to the coach chat.
   * Receives the candidate so the parent can build a rich insight card.
   */
  onSendToCoach: (message: string, candidate?: MasterCandidate) => void;
  /** Exit takeover, restore coach panel + canonical board position. */
  onRevert: () => void;
  /** Fires whenever the visible candidate list changes — parent uses it
   *  to overlay top-N moves as soft arrows on the board. */
  onCandidatesUpdate?: (candidates: MasterCandidate[]) => void;
}

export function MasterGamesTakeover({
  fen,
  ply,
  playedSan,
  onPreviewMove,
  onSendToCoach,
  onRevert,
  onCandidatesUpdate,
}: MasterGamesTakeoverProps) {
  const [apiData, setApiData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [filterPlayer, setFilterPlayer] = useState<TopPlayer | null>(null);

  // Reset player filter when position changes (different position, different
  // candidates — filter from prior position is no longer relevant).
  useEffect(() => {
    setFilterPlayer(null);
  }, [fen]);

  // Fetch candidates from Lichess masters via /api/opening-explorer proxy
  useEffect(() => {
    if (!fen) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const handle = setTimeout(async () => {
      setLoading(true);
      setApiError(false);
      try {
        const url = `/api/opening-explorer?fen=${encodeURIComponent(fen)}&moves=10`;
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as ApiData;
        if (!ctrl.signal.aborted) setApiData(data);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setApiError(true);
          setApiData(null);
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(handle);
      ctrl.abort();
    };
  }, [fen]);

  // Build the candidate list. Use API data if available, fall back to
  // hardcoded for the Pirc demo positions, otherwise empty (out of book).
  const candidates = useMemo<MasterCandidate[]>(() => {
    if (apiData) return buildCandidatesFromApi(apiData, fen);
    return HARDCODED_FALLBACK_BY_PLY[ply] ?? [];
  }, [apiData, fen, ply]);

  // Surface candidates to the parent so it can overlay arrows on the board
  useEffect(() => {
    onCandidatesUpdate?.(candidates);
  }, [candidates, onCandidatesUpdate]);

  // Highest-ranked player present at this position
  const featuredPlayer = useMemo(() => {
    const all = candidates
      .map((c) => c.topPlayer)
      .filter((p): p is TopPlayer => Boolean(p))
      .sort((a, b) => a.rank - b.rank);
    return all[0] ?? null;
  }, [candidates]);

  const displayed = useMemo(() => {
    if (!filterPlayer) return candidates;
    return candidates.filter(
      (c) => c.topPlayer && c.topPlayer.name === filterPlayer.name
    );
  }, [candidates, filterPlayer]);

  const totalGames = candidates.reduce((acc, c) => acc + c.count, 0);
  const hasRealCounts = totalGames > 0;
  const openingName = apiData?.opening?.name;
  const openingEco = apiData?.opening?.eco;

  return (
    <motion.div
      key="takeover"
      initial={{ opacity: 0, x: 60, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.96 }}
      transition={{ duration: 0.42, ease: [0.22, 0.61, 0.36, 1] }}
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          borderRadius: "1.5rem",
          background:
            "linear-gradient(160deg, rgba(34,197,94,0.05), rgba(20,22,28,0.7))",
          backdropFilter: "blur(16px) saturate(150%)",
          WebkitBackdropFilter: "blur(16px) saturate(150%)",
          border: "1px solid rgba(34,197,94,0.18)",
          boxShadow:
            "0 16px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            px: 3,
            py: 2,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            flexShrink: 0,
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "10px",
              background:
                "linear-gradient(135deg, rgba(34,197,94,0.18), rgba(22,163,74,0.12))",
              border: "1px solid rgba(34,197,94,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {loading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
              >
                <Loader2 size={16} color="#22c55e" />
              </motion.div>
            ) : (
              <BookOpen size={16} color="#22c55e" />
            )}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: "0.94rem",
                fontWeight: 700,
                color: "rgba(255,255,255,0.96)",
                lineHeight: 1.1,
              }}
            >
              Master Games · Lichess DB
            </Typography>
            <Typography
              sx={{
                fontSize: "0.72rem",
                color: "rgba(255,255,255,0.5)",
                fontFamily: "Monaco, Menlo, monospace",
                mt: 0.5,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {openingName ? (
                <>
                  {openingName}{" "}
                  {openingEco && (
                    <Box
                      component="span"
                      sx={{ color: "rgba(255,255,255,0.35)" }}
                    >
                      {openingEco}
                    </Box>
                  )}
                  {hasRealCounts && <> · {formatCount(totalGames)} games</>}
                </>
              ) : hasRealCounts ? (
                <>{formatCount(totalGames)} games at this position</>
              ) : apiData?.source === "chessdb" ? (
                <>Engine analysis · Move {Math.ceil(ply / 2) || 1}</>
              ) : (
                <>Move {Math.ceil(ply / 2) || 1}</>
              )}
            </Typography>
          </Box>

          {featuredPlayer && (
            <PlayerAvatar
              player={featuredPlayer}
              size={32}
              active={filterPlayer?.name === featuredPlayer.name}
              onClick={() =>
                setFilterPlayer((p) =>
                  p?.name === featuredPlayer.name ? null : featuredPlayer
                )
              }
            />
          )}

          <Button
            onClick={onRevert}
            startIcon={<ArrowLeftRight size={14} />}
            sx={{
              bgcolor: "#3B82F6",
              color: "#0A0A0A",
              fontWeight: 700,
              fontSize: "0.82rem",
              px: 2,
              py: 0.85,
              borderRadius: "999px",
              boxShadow:
                "0 0 0 1px rgba(59,130,246,0.5), 0 6px 20px rgba(59,130,246,0.3)",
              "&:hover": {
                bgcolor: "#60A5FA",
                transform: "translateY(-1px)",
              },
              flexShrink: 0,
            }}
          >
            Revert
          </Button>
        </Box>

        {/* Filter indicator */}
        {filterPlayer && (
          <Box
            sx={{
              px: 3,
              py: 1.25,
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              background: "rgba(252,211,77,0.06)",
            }}
          >
            <Filter size={13} color={filterPlayer.color} />
            <Typography
              sx={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.75)", flex: 1 }}
            >
              Filtered to{" "}
              <Box
                component="span"
                sx={{ color: filterPlayer.color, fontWeight: 700 }}
              >
                {filterPlayer.name}
              </Box>{" "}
              · {displayed.length}{" "}
              {displayed.length === 1 ? "move" : "moves"}
            </Typography>
            <IconButton
              onClick={() => setFilterPlayer(null)}
              size="small"
              sx={{ color: "rgba(255,255,255,0.55)" }}
            >
              <X size={14} />
            </IconButton>
          </Box>
        )}

        {/* Candidate list */}
        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            px: 2,
            py: 2,
            "&::-webkit-scrollbar": { width: 6 },
            "&::-webkit-scrollbar-thumb": {
              background: "rgba(34,197,94,0.18)",
              borderRadius: "3px",
            },
          }}
        >
          {displayed.length === 0 ? (
            <Box sx={{ px: 1.5, py: 4, textAlign: "center" }}>
              <Search
                size={18}
                color="rgba(255,255,255,0.3)"
                style={{ marginBottom: 8 }}
              />
              <Typography
                sx={{ fontSize: "0.88rem", color: "rgba(255,255,255,0.5)" }}
              >
                {filterPlayer
                  ? `${filterPlayer.name} hasn't reached this exact position in our database.`
                  : apiError
                  ? "Master DB unavailable on this network — falls back to live data in production."
                  : loading
                  ? "Querying master database…"
                  : "Out of master-game book — you're in original territory."}
              </Typography>
            </Box>
          ) : (
            <Stack spacing={0.75}>
              {displayed.map((c) => {
                const isPlayed = c.san === playedSan;
                const percentage =
                  totalGames > 0 ? (c.count / totalGames) * 100 : 0;
                return (
                  <Box
                    key={c.san}
                    onClick={() => onPreviewMove(c.uci, c.san)}
                    sx={{
                      position: "relative",
                      px: 1.5,
                      py: 1.25,
                      borderRadius: "10px",
                      cursor: "pointer",
                      background: isPlayed
                        ? "linear-gradient(90deg, rgba(249,115,22,0.1), rgba(20,22,28,0.4))"
                        : "rgba(255,255,255,0.025)",
                      border: isPlayed
                        ? "1px solid rgba(249,115,22,0.3)"
                        : "1px solid rgba(255,255,255,0.05)",
                      transition: "all 180ms ease",
                      "&:hover": {
                        background: "rgba(34,197,94,0.06)",
                        borderColor: "rgba(34,197,94,0.32)",
                        transform: "translateX(2px)",
                      },
                    }}
                  >
                    {hasRealCounts && (
                      <Box
                        sx={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: `${percentage}%`,
                          background:
                            "linear-gradient(90deg, rgba(34,197,94,0.05), transparent)",
                          borderRadius: "10px",
                          pointerEvents: "none",
                        }}
                      />
                    )}
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1.5}
                      sx={{ position: "relative" }}
                    >
                      <Box sx={{ minWidth: 60, flexShrink: 0 }}>
                        <Typography
                          sx={{
                            fontSize: "0.98rem",
                            fontWeight: 700,
                            color: isPlayed
                              ? "#FB923C"
                              : "rgba(255,255,255,0.92)",
                            fontFamily: "Monaco, Menlo, monospace",
                          }}
                        >
                          {c.san}
                        </Typography>
                        {isPlayed && (
                          <Typography
                            sx={{
                              fontSize: "0.62rem",
                              color: "#F97316",
                              fontWeight: 700,
                              letterSpacing: "0.1em",
                              mt: 0.2,
                            }}
                          >
                            PLAYED
                          </Typography>
                        )}
                      </Box>

                      <Box sx={{ flex: 1 }} />

                      <SourceBadge source={c.source} />

                      {c.topPlayer && (
                        <Box
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <PlayerAvatar
                            player={c.topPlayer}
                            size={22}
                            active={filterPlayer?.name === c.topPlayer.name}
                            onClick={() =>
                              setFilterPlayer((p) =>
                                p?.name === c.topPlayer!.name
                                  ? null
                                  : c.topPlayer!
                              )
                            }
                          />
                        </Box>
                      )}

                      {c.count > 0 ? (
                        // Real game count from Lichess masters
                        <Tooltip title="Master games at this position" arrow>
                          <Box
                            sx={{
                              px: 1.5,
                              py: 0.4,
                              borderRadius: "8px",
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.08)",
                              minWidth: 56,
                              textAlign: "center",
                            }}
                          >
                            <Typography
                              sx={{
                                fontSize: "0.84rem",
                                fontWeight: 700,
                                color: "rgba(255,255,255,0.9)",
                                fontFamily: "Monaco, Menlo, monospace",
                                lineHeight: 1,
                              }}
                            >
                              {formatCount(c.count)}
                            </Typography>
                          </Box>
                        </Tooltip>
                      ) : (
                        // No game counts — show engine analysis instead
                        <Stack
                          direction="row"
                          spacing={0.75}
                          alignItems="center"
                          sx={{ minWidth: 130, justifyContent: "flex-end" }}
                        >
                          {typeof c.winrate === "number" && (
                            <Tooltip
                              title="White's expected score (engine analysis)"
                              arrow
                            >
                              <Box
                                sx={{
                                  px: 1,
                                  py: 0.4,
                                  borderRadius: "6px",
                                  background: "rgba(255,255,255,0.04)",
                                  border: "1px solid rgba(255,255,255,0.08)",
                                  fontFamily: "Monaco, Menlo, monospace",
                                  fontSize: "0.74rem",
                                  fontWeight: 700,
                                  color: "rgba(255,255,255,0.78)",
                                  lineHeight: 1,
                                }}
                              >
                                {c.winrate.toFixed(0)}%
                              </Box>
                            </Tooltip>
                          )}
                          {typeof c.eval === "number" && (
                            <Tooltip
                              title="Engine eval (centipawns, white POV)"
                              arrow
                            >
                              <Box
                                sx={{
                                  px: 1,
                                  py: 0.4,
                                  borderRadius: "6px",
                                  background:
                                    c.eval >= 25
                                      ? "rgba(34,197,94,0.12)"
                                      : c.eval <= -25
                                      ? "rgba(239,68,68,0.12)"
                                      : "rgba(255,255,255,0.04)",
                                  border:
                                    c.eval >= 25
                                      ? "1px solid rgba(34,197,94,0.32)"
                                      : c.eval <= -25
                                      ? "1px solid rgba(239,68,68,0.32)"
                                      : "1px solid rgba(255,255,255,0.08)",
                                  fontFamily: "Monaco, Menlo, monospace",
                                  fontSize: "0.74rem",
                                  fontWeight: 700,
                                  color:
                                    c.eval >= 25
                                      ? "#86efac"
                                      : c.eval <= -25
                                      ? "#fca5a5"
                                      : "rgba(255,255,255,0.78)",
                                  lineHeight: 1,
                                  minWidth: 38,
                                  textAlign: "center",
                                }}
                              >
                                {c.eval > 0 ? "+" : ""}
                                {(c.eval / 100).toFixed(2)}
                              </Box>
                            </Tooltip>
                          )}
                        </Stack>
                      )}

                      <Tooltip title="Send this line to the coach" arrow>
                        <IconButton
                          onClick={(e) => {
                            e.stopPropagation();
                            const ctxBit =
                              c.count > 0
                                ? ` — ${formatCount(c.count)} master games went this way`
                                : typeof c.eval === "number"
                                ? ` — engine eval ${c.eval >= 0 ? "+" : ""}${(c.eval / 100).toFixed(2)}`
                                : "";
                            onSendToCoach(
                              `Tell me about ${c.san} from this position${ctxBit}${c.topPlayer ? `, including ${c.topPlayer.name}` : ""}.`,
                              c
                            );
                          }}
                          size="small"
                          sx={{
                            width: 28,
                            height: 28,
                            color: "rgba(255,255,255,0.55)",
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: "8px",
                            "&:hover": {
                              background: "rgba(249,115,22,0.12)",
                              borderColor: "rgba(249,115,22,0.3)",
                              color: "#FB923C",
                            },
                          }}
                        >
                          <MessageSquare size={12} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Box>

        {/* Footer */}
        <Box
          sx={{
            px: 3,
            py: 1.5,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            gap: 2,
            fontSize: "0.72rem",
            color: "rgba(255,255,255,0.42)",
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: apiError ? "#EF4444" : "#22c55e",
                boxShadow: apiError
                  ? "0 0 6px rgba(239,68,68,0.5)"
                  : "0 0 6px rgba(34,197,94,0.6)",
              }}
            />
            <Box>
              {apiError
                ? "Offline · fallback only"
                : apiData
                ? apiData.source === "curated"
                  ? `Lichess Masters · curated index (${apiData.indexedPositions ?? "?"} positions)`
                  : apiData.source === "chessdb"
                  ? "chessdb.cn · 7B+ positions"
                  : "Lichess masters · 2.5M+ games (live)"
                : "Loading…"}
            </Box>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Box>Drag pieces to explore</Box>
        </Box>
      </Box>
    </motion.div>
  );
}
