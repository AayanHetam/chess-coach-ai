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
 */

interface DemoMoveCardProps {
  moves: string[];
  /** When true, render with an "(answered)" affordance so the user knows
   *  this is the solution reveal — purely cosmetic. Defaults false. */
  isAnswer?: boolean;
  onShow: (moves: string[]) => void;
}

const EASE_OUT_STRONG: [number, number, number, number] = [0.23, 1, 0.32, 1];

export function DemoMoveCard({
  moves,
  isAnswer = false,
  onShow,
}: DemoMoveCardProps) {
  if (moves.length === 0) return null;

  // Format the SAN sequence as numbered pairs: "1. Nxe4 Kf7  2. Bg5".
  const formatted = formatMoveList(moves);

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
          px: 1.5,
          py: 1.25,
          borderRadius: "0.85rem",
          background:
            "linear-gradient(135deg, rgba(255,122,26,0.12), rgba(22,18,14,0.65))",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border: "1px solid rgba(255,122,26,0.28)",
          boxShadow:
            "0 8px 24px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <ArrowUpRight size={13} color="#FFD1A8" />
          <Typography
            sx={{
              fontSize: "0.68rem",
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
            fontFamily: "Monaco, Menlo, monospace",
            fontSize: "0.88rem",
            color: "rgba(255,240,224,0.94)",
            lineHeight: 1.5,
          }}
        >
          {formatted}
        </Typography>

        <Button
          onClick={() => onShow(moves)}
          startIcon={<Play size={13} />}
          size="small"
          sx={{
            alignSelf: "flex-start",
            mt: 0.25,
            px: 1.5,
            py: 0.4,
            borderRadius: "999px",
            background: "linear-gradient(135deg, #FF7A1A, #FB923C)",
            color: "#0A0907",
            fontSize: "0.74rem",
            fontWeight: 700,
            "&:hover": {
              background: "linear-gradient(135deg, #FB923C, #FBBF24)",
            },
          }}
        >
          Show on board
        </Button>
      </Box>
    </motion.div>
  );
}

/** Format SAN list as numbered ply pairs starting at move 1. */
function formatMoveList(sans: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < sans.length; i += 2) {
    const num = i / 2 + 1;
    const white = sans[i];
    const black = sans[i + 1];
    parts.push(
      black ? `${num}. ${white} ${black}` : `${num}. ${white}`,
    );
  }
  return parts.join("   ");
}
