"use client";

import { Box, Slider, Stack, Typography } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, BookOpen, Brain, Cpu } from "lucide-react";

export interface ArrowToggleState {
  best: boolean;
  common: boolean;
  game: boolean;
  maia: boolean;
  maiaElo: number;
}

export const DEFAULT_ARROW_TOGGLES: ArrowToggleState = {
  best: false,
  common: false,
  game: false,
  maia: false,
  maiaElo: 1500,
};

export const ARROW_PALETTE = {
  // Match chessground brush names so the page can use these directly
  best: { brush: "green", color: "#22c55e", label: "Engine best", icon: Cpu },
  common: { brush: "blue", color: "#3B82F6", label: "Most common", icon: BookOpen },
  game: { brush: "yellow", color: "#F97316", label: "Game played", icon: Activity },
  maia: { brush: "purple", color: "#A855F7", label: "Maia", icon: Brain },
} as const;

// Shorter labels for `compact`, where the row shares one strip with the move
// navigator and every pixel of width is contended.
const COMPACT_LABELS = {
  best: "Best",
  common: "Common",
  game: "Played",
  maia: "Maia",
} as const;

interface BoardArrowTogglesProps {
  state: ArrowToggleState;
  onChange: (next: ArrowToggleState) => void;
  /**
   * Single-row variant: no outer glass card, no "ARROWS" caption, short
   * labels, and the Maia ELO slider sits inline instead of expanding a
   * second row. Used by /analysis, where the page is pinned to the viewport
   * and an expanding control would push the board off-screen.
   */
  compact?: boolean;
}

export function BoardArrowToggles({
  state,
  onChange,
  compact = false,
}: BoardArrowTogglesProps) {
  const toggle = (key: "best" | "common" | "game" | "maia") => {
    onChange({ ...state, [key]: !state[key] });
  };

  return (
    <Box
      sx={
        compact
          ? { display: "flex", alignItems: "center", minWidth: 0 }
          : {
              mt: 2,
              p: 1.5,
              borderRadius: "1rem",
              background: "rgba(20,22,28,0.5)",
              border: "1px solid rgba(255,255,255,0.06)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }
      }
    >
      <Stack
        direction="row"
        spacing={compact ? 0.5 : 1}
        sx={{ flexWrap: "wrap", gap: compact ? 0.5 : 1 }}
        alignItems="center"
      >
        {!compact && (
          <Typography
            sx={{
              fontSize: "0.66rem",
              fontWeight: 700,
              letterSpacing: "0.16em",
              color: "rgba(255,255,255,0.42)",
              textTransform: "uppercase",
              mr: 1,
              whiteSpace: "nowrap",
            }}
          >
            Arrows
          </Typography>
        )}

        {(
          ["best", "common", "game", "maia"] as const
        ).map((key) => {
          const opt = ARROW_PALETTE[key];
          const active = state[key];
          const Icon = opt.icon;
          return (
            <Box
              key={key}
              onClick={() => toggle(key)}
              title={compact ? opt.label : undefined}
              sx={{
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: compact ? 0.5 : 0.75,
                px: compact ? 0.9 : 1.25,
                py: compact ? 0.4 : 0.6,
                borderRadius: "999px",
                background: active
                  ? `${opt.color}24`
                  : "rgba(255,255,255,0.03)",
                border: active
                  ? `1px solid ${opt.color}66`
                  : "1px solid rgba(255,255,255,0.08)",
                color: active ? opt.color : "rgba(255,255,255,0.7)",
                fontWeight: active ? 700 : 500,
                fontSize: compact ? "0.72rem" : "0.78rem",
                transition: "all 180ms ease",
                userSelect: "none",
                "&:hover": {
                  background: active
                    ? `${opt.color}30`
                    : "rgba(255,255,255,0.06)",
                  borderColor: active ? `${opt.color}88` : "rgba(255,255,255,0.18)",
                },
              }}
            >
              {!compact && (
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: active ? opt.color : "transparent",
                    border: active
                      ? "none"
                      : `1.5px solid ${opt.color}aa`,
                    boxShadow: active
                      ? `0 0 8px ${opt.color}99`
                      : "none",
                    flexShrink: 0,
                  }}
                />
              )}
              <Icon size={11} />
              <Box sx={{ whiteSpace: "nowrap" }}>
                {compact ? COMPACT_LABELS[key] : opt.label}
              </Box>
              {key === "maia" && active && !compact && (
                <Box
                  component="span"
                  sx={{
                    ml: 0.5,
                    fontFamily: "Monaco, Menlo, monospace",
                    fontSize: "0.72rem",
                    color: opt.color,
                  }}
                >
                  {state.maiaElo}
                </Box>
              )}
            </Box>
          );
        })}

        {/* Compact: the ELO control rides in the same row rather than
            expanding a second one, so the strip's height never changes. */}
        {compact && state.maia && (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{
              px: 1,
              py: 0.15,
              borderRadius: "999px",
              background: "rgba(168,85,247,0.08)",
              border: "1px solid rgba(168,85,247,0.22)",
            }}
          >
            <Slider
              aria-label="Maia ELO"
              value={state.maiaElo}
              onChange={(_, v) =>
                onChange({ ...state, maiaElo: typeof v === "number" ? v : v[0] })
              }
              min={1100}
              max={2200}
              step={100}
              sx={{
                width: 84,
                color: "#A855F7",
                py: 0.75,
                "& .MuiSlider-rail": {
                  background: "rgba(168,85,247,0.18)",
                  height: 3,
                },
                "& .MuiSlider-track": {
                  background: "linear-gradient(90deg, #A855F7, #C084FC)",
                  height: 3,
                  border: "none",
                },
                "& .MuiSlider-thumb": {
                  width: 11,
                  height: 11,
                  background: "#A855F7",
                  boxShadow: "0 0 10px rgba(168,85,247,0.6)",
                  border: "2px solid #0A0A0A",
                },
              }}
            />
            <Typography
              sx={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "#C084FC",
                fontFamily: "Monaco, Menlo, monospace",
                minWidth: 34,
                textAlign: "right",
              }}
            >
              {state.maiaElo}
            </Typography>
          </Stack>
        )}
      </Stack>

      <AnimatePresence initial={false}>
        {!compact && state.maia && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
            style={{ overflow: "hidden" }}
          >
            <Box
              sx={{
                px: 1.5,
                py: 1,
                borderRadius: "10px",
                background: "rgba(168,85,247,0.06)",
                border: "1px solid rgba(168,85,247,0.18)",
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 2,
                alignItems: "center",
              }}
            >
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Brain size={13} color="#A855F7" />
                <Typography
                  sx={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: "#C084FC",
                    textTransform: "uppercase",
                  }}
                >
                  Maia ELO
                </Typography>
              </Stack>
              <Slider
                value={state.maiaElo}
                onChange={(_, v) =>
                  onChange({ ...state, maiaElo: typeof v === "number" ? v : v[0] })
                }
                min={1100}
                max={2200}
                step={100}
                marks={[
                  { value: 1100, label: "" },
                  { value: 1500, label: "" },
                  { value: 1800, label: "" },
                  { value: 2200, label: "" },
                ]}
                sx={{
                  color: "#A855F7",
                  py: 1,
                  "& .MuiSlider-rail": {
                    background: "rgba(168,85,247,0.18)",
                    height: 4,
                  },
                  "& .MuiSlider-track": {
                    background:
                      "linear-gradient(90deg, #A855F7, #C084FC)",
                    height: 4,
                    border: "none",
                  },
                  "& .MuiSlider-thumb": {
                    width: 14,
                    height: 14,
                    background: "#A855F7",
                    boxShadow: "0 0 12px rgba(168,85,247,0.6)",
                    border: "2px solid #0A0A0A",
                    "&:hover, &.Mui-focusVisible": {
                      boxShadow: "0 0 16px rgba(168,85,247,0.8)",
                    },
                  },
                  "& .MuiSlider-mark": {
                    background: "rgba(255,255,255,0.18)",
                    width: 2,
                    height: 6,
                  },
                }}
              />
              <Typography
                sx={{
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  color: "#C084FC",
                  fontFamily: "Monaco, Menlo, monospace",
                  minWidth: 48,
                  textAlign: "right",
                }}
              >
                {state.maiaElo}
              </Typography>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
}
