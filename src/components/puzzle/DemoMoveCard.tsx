"use client";

import { Box, Button, Stack, Typography } from "@mui/material";
import { ArrowUpRight, Play } from "lucide-react";
import {
  ACCENT,
  FONT_MONO,
  LINE,
  RADIUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

/**
 * In-chat card the coach can drop to offer a board demo.
 *
 * Triggered by `[SHOW_MOVE: san1 san2 ...]` tags in coach prose. Clicking
 * "Show" hands the moves up to the parent which opens DemoMoveDialog for
 * confirmation + speed pick. The line stays visible in the chat after a
 * demo so the user can re-trigger or just read it.
 *
 * Visual: each ply is a glyph chip (piece + destination), grouped into
 * numbered move rows. The solving side's moves ("you") read in the accent
 * tint; the opponent's replies read muted — so the line is scannable at a
 * glance instead of a monospace blob. The card is a solid tertiary surface
 * inside the coach bubble; it does not animate in, the bubble already did.
 */

interface DemoMoveCardProps {
  moves: string[];
  /** When true, render with an "(answered)" affordance so the user knows
   *  this is the solution reveal — purely cosmetic. Defaults false. */
  isAnswer?: boolean;
  onShow: (moves: string[]) => void;
}

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
    <Box sx={{ mt: 1, mb: 1 }}>
      <Box
        sx={{
          display: "inline-flex",
          flexDirection: "column",
          gap: 1,
          maxWidth: "100%",
          minWidth: 200,
          px: 1.5,
          py: 1.25,
          borderRadius: `${RADIUS.control}px`,
          background: SURFACE.raisedTertiary,
          border: `1px solid ${LINE.hairline}`,
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
            <ArrowUpRight
              size={16}
              strokeWidth={1.75}
              color={TEXT.secondary}
              aria-hidden
            />
            <Typography sx={{ ...TYPE.label, color: TEXT.primary }}>
              {isAnswer ? "Masti's answer" : "Show on the board"}
            </Typography>
          </Stack>
          <Typography
            sx={{
              ...TYPE.caption,
              color: TEXT.secondary,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {moves.length} {moves.length === 1 ? "move" : "moves"}
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
                  fontFamily: FONT_MONO,
                  fontSize: TYPE.caption.fontSize,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  color: TEXT.secondary,
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
                    sx={{ color: TEXT.tertiary, fontSize: "0.8rem" }}
                  >
                    →
                  </Box>
                  <PlyChip san={r.opp} side="opp" />
                </>
              )}
            </Stack>
          ))}
        </Stack>

        {/* Outlined: a transcript can hold several of these, and the
            page's one solid action is elsewhere. */}
        <Button
          onClick={() => onShow(moves)}
          startIcon={<Play size={13} />}
          size="small"
          variant="outlined"
          sx={{ alignSelf: "flex-start", mt: 0.25 }}
        >
          Play on board
        </Button>
      </Box>
    </Box>
  );
}

/** A single move as a glyph + coordinate chip. `you` wears the accent tint;
 *  the opponent's reply is a muted neutral so the line reads as a dialogue. */
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
        borderRadius: `${RADIUS.small}px`,
        background: isYou ? ACCENT.tint : "rgba(255,255,255,0.06)",
        border: `1px solid ${isYou ? ACCENT.border : LINE.hairline}`,
      }}
    >
      <Box
        component="span"
        aria-hidden
        sx={{
          fontSize: "0.95rem",
          lineHeight: 1,
          color: isYou ? ACCENT.hover : TEXT.secondary,
        }}
      >
        {glyph}
      </Box>
      <Box
        component="span"
        aria-hidden
        sx={{
          fontFamily: FONT_MONO,
          fontSize: "0.82rem",
          fontWeight: 600,
          color: isYou ? TEXT.primary : TEXT.secondary,
        }}
      >
        {label}
      </Box>
    </Box>
  );
}
