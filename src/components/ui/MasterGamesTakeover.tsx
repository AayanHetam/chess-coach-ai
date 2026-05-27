"use client";

import { Box, Button, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { motion } from "framer-motion";
import {
  ArrowLeftRight,
  BookOpen,
  Filter,
  MessageSquare,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

// ───────────────────────────────────────────────────────────────────────────
// Top players (mock — highest-ranked present at the position takes the icon)
// ───────────────────────────────────────────────────────────────────────────

export interface TopPlayer {
  name: string;
  initials: string;
  color: string;
  rank: number; // 1 = world #1
}

const TOP_PLAYERS: Record<string, TopPlayer> = {
  carlsen: { name: "Magnus Carlsen", initials: "MC", color: "#FCD34D", rank: 1 },
  caruana: { name: "Fabiano Caruana", initials: "FC", color: "#60A5FA", rank: 2 },
  nakamura: { name: "Hikaru Nakamura", initials: "HN", color: "#A78BFA", rank: 3 },
  nepo: { name: "Ian Nepomniachtchi", initials: "IN", color: "#34D399", rank: 4 },
  giri: { name: "Anish Giri", initials: "AG", color: "#F472B6", rank: 5 },
  ding: { name: "Ding Liren", initials: "DL", color: "#FB923C", rank: 6 },
  kasparov: { name: "Garry Kasparov", initials: "GK", color: "#F87171", rank: 99 },
  topalov: { name: "Veselin Topalov", initials: "VT", color: "#C084FC", rank: 99 },
  kramnik: { name: "Vladimir Kramnik", initials: "VK", color: "#FB7185", rank: 99 },
  anand: { name: "Viswanathan Anand", initials: "VA", color: "#FACC15", rank: 99 },
};

// ───────────────────────────────────────────────────────────────────────────
// Mock candidate moves at each ply of the Kasparov–Topalov game
// ───────────────────────────────────────────────────────────────────────────

export interface MasterCandidate {
  san: string;
  uci: string;
  count: number;
  /** Highest-ranked top-100 player who has been at this position */
  topPlayer?: TopPlayer;
}

const PIRC_CANDIDATES: Record<number, MasterCandidate[]> = {
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
  2: [
    { san: "d4", uci: "d2d4", count: 380000, topPlayer: TOP_PLAYERS.kasparov },
    { san: "Nf3", uci: "g1f3", count: 24000 },
    { san: "f4", uci: "f2f4", count: 12000 },
  ],
  3: [
    { san: "Nf6", uci: "g8f6", count: 260000, topPlayer: TOP_PLAYERS.topalov },
    { san: "g6", uci: "g7g6", count: 92000 },
    { san: "Nd7", uci: "b8d7", count: 11000 },
  ],
  4: [
    { san: "Nc3", uci: "b1c3", count: 220000, topPlayer: TOP_PLAYERS.kasparov },
    { san: "Nf3", uci: "g1f3", count: 31000 },
    { san: "f3", uci: "f2f3", count: 5800 },
  ],
  5: [
    { san: "g6", uci: "g7g6", count: 170000, topPlayer: TOP_PLAYERS.topalov },
    { san: "c6", uci: "c7c6", count: 38000 },
    { san: "e5", uci: "e7e5", count: 7200 },
  ],
  6: [
    { san: "Be3", uci: "c1e3", count: 38000, topPlayer: TOP_PLAYERS.kasparov },
    { san: "f4", uci: "f2f4", count: 81000, topPlayer: TOP_PLAYERS.anand },
    { san: "f3", uci: "f2f3", count: 28000 },
    { san: "Nf3", uci: "g1f3", count: 11000 },
    { san: "h3", uci: "h2h3", count: 2400 },
  ],
  7: [
    { san: "Bg7", uci: "f8g7", count: 35000, topPlayer: TOP_PLAYERS.topalov },
    { san: "c6", uci: "c7c6", count: 1800 },
  ],
  8: [
    { san: "Qd2", uci: "d1d2", count: 22000, topPlayer: TOP_PLAYERS.kasparov },
    { san: "f3", uci: "f2f3", count: 7400 },
    { san: "Nf3", uci: "g1f3", count: 3100 },
  ],
  9: [
    { san: "c6", uci: "c7c6", count: 12000, topPlayer: TOP_PLAYERS.topalov },
    { san: "O-O", uci: "e8g8", count: 4800 },
    { san: "Nc6", uci: "b8c6", count: 1200 },
  ],
  10: [
    { san: "f3", uci: "f2f3", count: 8900, topPlayer: TOP_PLAYERS.kasparov },
    { san: "Bh6", uci: "e3h6", count: 2300 },
    { san: "Nf3", uci: "g1f3", count: 1100 },
  ],
};

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function getCandidates(ply: number): MasterCandidate[] {
  return PIRC_CANDIDATES[ply] ?? [];
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
  currentPly: number;
  /** Move played in the canonical game at this ply (for highlighting). */
  playedSan?: string;
  /** When a candidate is clicked, parent updates the board to that line. */
  onPreviewMove: (uci: string, san: string) => void;
  /** When user wants to send a candidate/idea to the coach chat. */
  onSendToCoach: (message: string) => void;
  /** Exit takeover, restore coach panel + canonical board position. */
  onRevert: () => void;
}

export function MasterGamesTakeover({
  currentPly,
  playedSan,
  onPreviewMove,
  onSendToCoach,
  onRevert,
}: MasterGamesTakeoverProps) {
  const candidates = useMemo(() => getCandidates(currentPly), [currentPly]);
  const [filterPlayer, setFilterPlayer] = useState<TopPlayer | null>(null);

  // Highest-ranked player present at this position (lowest rank number)
  const featuredPlayer = useMemo(() => {
    const all = candidates
      .map((c) => c.topPlayer)
      .filter((p): p is TopPlayer => Boolean(p))
      .sort((a, b) => a.rank - b.rank);
    return all[0] ?? null;
  }, [candidates]);

  // Filtered candidate list — if a player is selected, only show their moves
  const displayed = useMemo(() => {
    if (!filterPlayer) return candidates;
    return candidates.filter(
      (c) => c.topPlayer && c.topPlayer.name === filterPlayer.name
    );
  }, [candidates, filterPlayer]);

  const totalGames = candidates.reduce((acc, c) => acc + c.count, 0);

  return (
    <motion.div
      key="takeover"
      initial={{ opacity: 0, x: 60, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.96 }}
      transition={{
        duration: 0.42,
        ease: [0.22, 0.61, 0.36, 1],
      }}
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
            <BookOpen size={16} color="#22c55e" />
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
              Takeover · Master Games
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mt: 0.5 }}
            >
              <Typography
                sx={{
                  fontSize: "0.72rem",
                  color: "rgba(255,255,255,0.5)",
                  fontFamily: "Monaco, Menlo, monospace",
                }}
              >
                Move {Math.ceil(currentPly / 2) || 1} ·{" "}
                {formatCount(totalGames)} games at this position
              </Typography>
            </Stack>
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

        {/* Filter indicator (when a player filter is active) */}
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
                  : "Out of master-game book — you're in original territory."}
              </Typography>
            </Box>
          ) : (
            <Stack spacing={0.75}>
              {displayed.map((c) => {
                const isPlayed = c.san === playedSan;
                const percentage = totalGames > 0 ? (c.count / totalGames) * 100 : 0;
                return (
                  <Box
                    key={c.san}
                    sx={{
                      position: "relative",
                      px: 1.5,
                      py: 1.25,
                      borderRadius: "10px",
                      background: isPlayed
                        ? "linear-gradient(90deg, rgba(249,115,22,0.1), rgba(20,22,28,0.4))"
                        : "rgba(255,255,255,0.025)",
                      border: isPlayed
                        ? "1px solid rgba(249,115,22,0.3)"
                        : "1px solid rgba(255,255,255,0.05)",
                      transition: "all 180ms ease",
                      "&:hover": {
                        background: "rgba(255,255,255,0.05)",
                        borderColor: "rgba(34,197,94,0.3)",
                      },
                    }}
                  >
                    {/* Background bar showing share of games */}
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
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1.5}
                      sx={{ position: "relative" }}
                    >
                      <Box
                        onClick={() => onPreviewMove(c.uci, c.san)}
                        sx={{
                          cursor: "pointer",
                          minWidth: 60,
                          flexShrink: 0,
                        }}
                      >
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

                      {c.topPlayer && (
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
                      )}

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

                      <Tooltip title="Send this line to the coach" arrow>
                        <IconButton
                          onClick={() =>
                            onSendToCoach(
                              `Tell me about ${c.san} at move ${Math.ceil(currentPly / 2) || 1} — ${formatCount(c.count)} master games went this way${c.topPlayer ? `, including ${c.topPlayer.name}` : ""}.`
                            )
                          }
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
                background: "#22c55e",
                boxShadow: "0 0 6px rgba(34,197,94,0.6)",
              }}
            />
            <Box>Sorted most → least played</Box>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Box>Click a move to preview on board</Box>
        </Box>
      </Box>
    </motion.div>
  );
}
