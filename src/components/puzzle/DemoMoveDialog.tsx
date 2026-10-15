"use client";

import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { Play, X } from "lucide-react";
import { FONT_MONO, LINE, RADIUS, SURFACE, TEXT, TYPE } from "@/theme/tokens";

/**
 * Confirmation modal that opens when the user taps "Show on board" inside
 * a DemoMoveCard. Lets them pick a playback speed and confirm.
 *
 * On confirm, the parent owns the demo lifecycle — DemoMoveDialog is
 * stateless beyond its speed pick. After this dialog closes, the parent
 * begins playing the moves on the user's main board.
 *
 * The dialog paper, title, toggle buttons and buttons are styled by the
 * theme; nothing here restyles them.
 */

export type DemoSpeedKey = "fast" | "normal" | "slow";

export const DEMO_SPEED_MS: Record<DemoSpeedKey, number> = {
  fast: 600,
  normal: 1200,
  slow: 2000,
};

interface DemoMoveDialogProps {
  open: boolean;
  moves: string[];
  /** True when the user is mid-puzzle (will be returned to their attempt
   *  after the demo). Drives the "you'll come back" microcopy. */
  resumeAfter: boolean;
  onConfirm: (speed: DemoSpeedKey) => void;
  onCancel: () => void;
}

export function DemoMoveDialog({
  open,
  moves,
  resumeAfter,
  onConfirm,
  onCancel,
}: DemoMoveDialogProps) {
  const [speed, setSpeed] = useState<DemoSpeedKey>("normal");

  const formatted = formatMoveList(moves);

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Show on the board</DialogTitle>

      <DialogContent sx={{ px: 3, pb: 2 }}>
        <Stack spacing={2}>
          <Box
            sx={{
              p: 1.5,
              borderRadius: `${RADIUS.control}px`,
              background: SURFACE.raisedSecondary,
              border: `1px solid ${LINE.hairline}`,
            }}
          >
            <Typography sx={{ ...TYPE.label, color: TEXT.secondary, mb: 0.5 }}>
              Line
            </Typography>
            <Typography
              sx={{
                fontFamily: FONT_MONO,
                fontSize: "0.92rem",
                color: TEXT.primary,
                lineHeight: 1.5,
              }}
            >
              {formatted || "No moves to show"}
            </Typography>
          </Box>

          <Box>
            <Typography sx={{ ...TYPE.label, color: TEXT.secondary, mb: 0.75 }}>
              Speed
            </Typography>
            <ToggleButtonGroup
              value={speed}
              exclusive
              onChange={(_, v) => v && setSpeed(v as DemoSpeedKey)}
              size="small"
              sx={{
                width: "100%",
                "& .MuiToggleButton-root": { flex: 1 },
              }}
            >
              <ToggleButton value="fast">Fast</ToggleButton>
              <ToggleButton value="normal">Normal</ToggleButton>
              <ToggleButton value="slow">Slow</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {resumeAfter ? (
            <Typography
              sx={{
                fontSize: TYPE.caption.fontSize,
                color: TEXT.secondary,
                lineHeight: 1.45,
              }}
            >
              Your puzzle attempt is paused. You'll be returned to your current
              position when the demo finishes.
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onCancel} variant="text" startIcon={<X size={14} />}>
          Cancel
        </Button>
        <Button
          onClick={() => onConfirm(speed)}
          variant="contained"
          startIcon={<Play size={14} />}
        >
          Play on board
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function formatMoveList(sans: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < sans.length; i += 2) {
    const num = i / 2 + 1;
    const white = sans[i];
    const black = sans[i + 1];
    parts.push(black ? `${num}. ${white} ${black}` : `${num}. ${white}`);
  }
  return parts.join("   ");
}
