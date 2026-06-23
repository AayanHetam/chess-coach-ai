"use client";

import { Box, Button, Stack, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { ArrowUpRight, Play } from "lucide-react";

/**
 * In-chat card the coach can drop to offer a board demo.
 *
 * Triggered by `[SHOW_MOVE: san1 san2 ...]` tags in coach prose. Clicking
 * "Show" hands the moves up to the parent which opens DemoMoveDialog for
 * confirmation + speed pick. The line stays visible in the chat after a
 * demo so the user can re-trigger or just read it.
 *
 * Visual: each ply is a glyph chip (piece + destination), grouped into
 * numbered move rows. The solving side's moves ("you") read in warm ember;
 * the opponent's replies read muted — so the line is scannable at a glance
 * instead of a monospace blob.
 */

interface DemoMoveCardProps {
  moves: string[];
  /** When true, render with an "(answered)" affordance so the user knows
   *  this is the solution reveal — purely cosmetic. Defaults false. */
  isAnswer?: boolean;
  onShow: (moves: string[]) => void;
}

const EASE_OUT_STRONG: [number, number, number, number] = [0.23, 1, 0.32, 1];

/** Solid unicode glyph per SAN piece letter; pawn is the default. */
const PIECE_GLYPH: Record<string, string> = {
  K: "♚",
  Q: "♛",
  R: "♜",
  B: "♝",
  N: "♞",
  P: "♟",
};

/** Split a SAN into its piece glyph + the rest (destination / capture). */
function parsePly(san: string): { glyph: string; label: string } {
  if (san.startsWith("O-O")) {
    return { glyph: PIECE_GLYPH.K, label: san.replace(/[+#]/g, "") };
  }
  const first = san[0];
  if (first && PIECE_GLYPH[first] && first === first.toUpperCase()) {
    const rest = san.slice(1);
    return { glyph: PIECE_GLYPH[first], label: rest || san };
  }
  // Pawn move (e4, exd5, e8=Q…)
  return { glyph: PIECE_GLYPH.P, label: san };
}

export function DemoMoveCard({
  moves,
  isAnswer = false,
  onShow,
}: DemoMoveCardProps) {
  if (moves.length === 0) return null;

  // Group plies into move rows: [white, black?] pairs. The first ply is the
  // solving side's move ("you"); plies alternate from there.
  const rows: Array<{ num: number; you?: string; opp?: string }> = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({ num: i / 2 + 1, you: moves[i], opp: moves[i + 1] });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: EASE_OUT_STRONG }}
      style={{ marginTop: 8, marginBottom: 8 }}
    >
      <Box
        sx={{
          display: "inline-flex",
          flexDirection: "column",
          gap: 1,
          maxWidth: "100%",
          minWidth: 200,
          px: 1.5,
          py: 1.25,
          borderRadius: "1rem",
          background:
            "linear-gradient(135deg, rgba(255,122,26,0.14), rgba(22,18,14,0.7))",
          backdropFilter: "blur(12px) saturate(140%)",
          WebkitBackdropFilter: "blur(12px) saturate(140%)",
          border: "1px solid rgba(255,122,26,0.3)",
          boxShadow:
            "0 12px 32px -14px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        {/* Header */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
        >
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <ArrowUpRight size={13} color="#FFD1A8" />
            <Typography
              sx={{
                fontSize: "0.66rem",
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#FFD1A8",
              }}
            >
              {isAnswer ? "Coach answer" : "Show on the board"}
            </Typography>
          </Stack>
          <Typography
            sx={{
              fontSize: "0.6rem",
              fontWeight: 700,
              color: "rgba(255,240,224,0.55)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {moves.length} {moves.length === 1 ? "ply" : "plies"}
          </Typography>
        </Stack>

        {/* Move rows */}
        <Stack spacing={0.6} sx={{ py: 0.25 }}>
          {rows.map((r) => (
            <Stack
              key={r.num}
              direction="row"
              alignItems="center"
              spacing={0.75}
              useFlexGap
              sx={{ flexWrap: "wrap", rowGap: 0.5 }}
            >
              <Box
                component="span"
                sx={{
                  width: 18,
                  flexShrink: 0,
                  textAlign: "right",
                  fontFamily: "Monaco, Menlo, monospace",
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  color: "rgba(255,240,224,0.5)",
                }}
              >
                {r.num}.
              </Box>
              {r.you && <PlyChip san={r.you} side="you" />}
              {r.opp && (
                <>
                  <Box
                    component="span"
                    aria-hidden
                    sx={{ color: "rgba(255,240,224,0.45)", fontSize: "0.8rem" }}
                  >
                    →
                  </Box>
                  <PlyChip san={r.opp} side="opp" />
                </>
              )}
            </Stack>
          ))}
        </Stack>

        <Button
          onClick={() => onShow(moves)}
          startIcon={<Play size={13} />}
          size="small"
          sx={{
            alignSelf: "flex-start",
            mt: 0.25,
            px: 1.75,
            py: 0.5,
            borderRadius: "999px",
            background: "linear-gradient(135deg, #FF7A1A, #FB923C)",
            color: "#0A0907",
            fontSize: "0.76rem",
            fontWeight: 800,
            boxShadow: "0 8px 20px -10px rgba(255,122,26,0.7)",
            "&:hover": {
              background: "linear-gradient(135deg, #FB923C, #FBBF24)",
            },
          }}
        >
          Play on board
        </Button>
      </Box>
    </motion.div>
  );
}

/** A single move as a glyph + coordinate chip. `you` is warm ember; the
 *  opponent's reply is a muted neutral so the line reads as a dialogue. */
function PlyChip({ san, side }: { san: string; side: "you" | "opp" }) {
  const { glyph, label } = parsePly(san);
  const isYou = side === "you";
  return (
    <Box
      aria-label={`${isYou ? "your move" : "opponent's move"} ${san}`}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.4,
        px: 0.85,
        py: 0.3,
        borderRadius: "0.55rem",
        background: isYou
          ? "linear-gradient(135deg, rgba(255,122,26,0.28), rgba(255,140,66,0.14))"
          : "rgba(255,255,255,0.05)",
        border: isYou
          ? "1px solid rgba(255,122,26,0.45)"
          : "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <Box
        component="span"
        aria-hidden
        sx={{
          fontSize: "0.95rem",
          lineHeight: 1,
          color: isYou ? "#FFD8B0" : "rgba(255,240,224,0.78)",
        }}
      >
        {glyph}
      </Box>
      <Box
        component="span"
        aria-hidden
        sx={{
          fontFamily: "Monaco, Menlo, monospace",
          fontSize: "0.82rem",
          fontWeight: 700,
          color: isYou ? "rgba(255,240,224,0.96)" : "rgba(255,240,224,0.78)",
        }}
      >
        {label}
      </Box>
    </Box>
  );
}
