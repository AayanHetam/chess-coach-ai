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

/**
 * Confirmation modal that opens when the user taps "Show on board" inside
 * a DemoMoveCard. Lets them pick a playback speed and confirm.
 *
 * On confirm, the parent owns the demo lifecycle — DemoMoveDialog is
 * stateless beyond its speed pick. After this dialog closes, the parent
 * begins playing the moves on the user's main board.
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
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: "1.25rem",
            background: "rgba(22,18,14,0.92)",
            backdropFilter: "blur(16px) saturate(150%)",
            WebkitBackdropFilter: "blur(16px) saturate(150%)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,240,224,0.94)",
            boxShadow:
              "0 24px 64px -16px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,122,26,0.16)",
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          pt: 2.5,
          pb: 1,
          px: 3,
          fontSize: "1rem",
          fontWeight: 700,
          letterSpacing: "-0.01em",
        }}
      >
        Show on the board
      </DialogTitle>

      <DialogContent sx={{ px: 3, pb: 2 }}>
        <Stack spacing={2}>
          <Box
            sx={{
              p: 1.5,
              borderRadius: "0.75rem",
              background: "rgba(0,0,0,0.32)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <Typography
              sx={{
                fontSize: "0.66rem",
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,209,168,0.7)",
                mb: 0.5,
              }}
            >
              Line
            </Typography>
            <Typography
              sx={{
                fontFamily: "Monaco, Menlo, monospace",
                fontSize: "0.92rem",
                color: "rgba(255,240,224,0.94)",
                lineHeight: 1.5,
              }}
            >
              {formatted || "—"}
            </Typography>
          </Box>

          <Box>
            <Typography
              sx={{
                fontSize: "0.66rem",
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,209,168,0.7)",
                mb: 0.75,
              }}
            >
              Speed
            </Typography>
            <ToggleButtonGroup
              value={speed}
              exclusive
              onChange={(_, v) => v && setSpeed(v as DemoSpeedKey)}
              size="small"
              sx={{
                width: "100%",
                "& .MuiToggleButton-root": {
                  flex: 1,
                  color: "rgba(255,240,224,0.65)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  textTransform: "none",
                  "&.Mui-selected": {
                    background: "rgba(255,122,26,0.18)",
                    color: "#FFD1A8",
                    borderColor: "rgba(255,122,26,0.4)",
                  },
                  "&.Mui-selected:hover": {
                    background: "rgba(255,122,26,0.22)",
                  },
                },
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
                fontSize: "0.78rem",
                color: "rgba(255,240,224,0.6)",
                lineHeight: 1.45,
              }}
            >
              Your puzzle attempt is paused. You'll be returned to your
              current position when the demo finishes.
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button
          onClick={onCancel}
          startIcon={<X size={14} />}
          sx={{
            color: "rgba(255,240,224,0.65)",
            textTransform: "none",
            fontSize: "0.82rem",
            "&:hover": { background: "rgba(255,255,255,0.04)" },
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={() => onConfirm(speed)}
          startIcon={<Play size={14} />}
          variant="contained"
          sx={{
            px: 2.5,
            py: 0.75,
            borderRadius: "999px",
            background: "linear-gradient(135deg, #FF7A1A, #FB923C)",
            color: "#0A0907",
            fontSize: "0.82rem",
            fontWeight: 700,
            textTransform: "none",
            boxShadow: "none",
            "&:hover": {
              background: "linear-gradient(135deg, #FB923C, #FBBF24)",
              boxShadow: "none",
            },
          }}
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
