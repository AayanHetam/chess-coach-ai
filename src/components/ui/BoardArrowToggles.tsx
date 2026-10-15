"use client";

import { Box, Slider, Stack, Typography } from "@mui/material";
import { Activity, BookOpen, Brain, Cpu } from "lucide-react";
import { LINE, MOTION, RADIUS, SURFACE, TEXT, TYPE } from "@/theme/tokens";

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
  common: {
    brush: "blue",
    color: "#3B82F6",
    label: "Most common",
    icon: BookOpen,
  },
  game: {
    brush: "yellow",
    color: "#F97316",
    label: "Game played",
    icon: Activity,
  },
  // The legend for ChessgroundBoard's "purple" brush, which is chess
  // rendering (section 7 of DESIGN_RULES.md) and keeps its colour. The two
  // literals change together.
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
   * Single-row variant: no outer card, no "Arrows" caption, short
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
              borderRadius: `${RADIUS.card}px`,
              background: SURFACE.raised,
              border: `1px solid ${LINE.hairline}`,
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
              ...TYPE.label,
              color: TEXT.secondary,
              mr: 1,
              whiteSpace: "nowrap",
            }}
          >
            Arrows
          </Typography>
        )}

        {(["best", "common", "game", "maia"] as const).map((key) => {
          const opt = ARROW_PALETTE[key];
          const active = state[key];
          const Icon = opt.icon;
          return (
            <Box
              key={key}
              component="button"
              type="button"
              aria-pressed={active}
              onClick={() => toggle(key)}
              title={compact ? opt.label : undefined}
              sx={{
                cursor: "pointer",
                font: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: compact ? 0.5 : 0.75,
                // Compact padding is trimmed so the 13px labels keep the
                // strip's width and height on the /analysis viewport budget.
                px: compact ? 0.75 : 1.25,
                py: compact ? 0.25 : 0.6,
                borderRadius: `${RADIUS.pill}px`,
                // The arrow colour is the legend: a quiet tint on the chip
                // that is on, nothing on the chips that are off.
                background: active ? `${opt.color}24` : "transparent",
                border: active
                  ? `1px solid ${opt.color}66`
                  : `1px solid ${LINE.hairline}`,
                color: active ? opt.color : TEXT.secondary,
                fontWeight: active ? 600 : 500,
                fontSize: TYPE.caption.fontSize,
                transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}, color ${MOTION.hover}, transform ${MOTION.press}`,
                userSelect: "none",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                "&:hover": {
                  background: active
                    ? `${opt.color}30`
                    : "rgba(255,255,255,0.06)",
                  borderColor: active ? `${opt.color}88` : LINE.strong,
                },
                "&:active": { transform: MOTION.pressScale },
                "&:focus-visible": {
                  outline: "2px solid #FFFFFF",
                  outlineOffset: 2,
                },
              }}
            >
              {!compact && (
                <Box
                  component="span"
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: active ? opt.color : "transparent",
                    border: active ? "none" : `1.5px solid ${opt.color}aa`,
                    flexShrink: 0,
                  }}
                />
              )}
              <Icon size={11} />
              <Box component="span" sx={{ whiteSpace: "nowrap" }}>
                {compact ? COMPACT_LABELS[key] : opt.label}
              </Box>
              {key === "maia" && active && !compact && (
                <Box
                  component="span"
                  sx={{
                    ml: 0.5,
                    fontVariantNumeric: "tabular-nums",
                    fontSize: TYPE.caption.fontSize,
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
              borderRadius: `${RADIUS.small}px`,
              border: `1px solid ${LINE.hairline}`,
            }}
          >
            <Slider
              aria-label="Maia ELO"
              value={state.maiaElo}
              onChange={(_, v) =>
                onChange({
                  ...state,
                  maiaElo: typeof v === "number" ? v : v[0],
                })
              }
              min={1100}
              max={2200}
              step={100}
              sx={{
                width: 84,
                py: 0.75,
                "& .MuiSlider-rail": { height: 3 },
                "& .MuiSlider-track": { height: 3, border: "none" },
                "& .MuiSlider-thumb": { width: 11, height: 11 },
              }}
            />
            <Typography
              sx={{
                fontSize: TYPE.caption.fontSize,
                fontWeight: 600,
                color: TEXT.primary,
                fontVariantNumeric: "tabular-nums",
                minWidth: 34,
                textAlign: "right",
              }}
            >
              {state.maiaElo}
            </Typography>
          </Stack>
        )}
      </Stack>

      {/* Appears in place, without animating its height: only transform and
          opacity animate (DESIGN_RULES.md section 5). */}
      {!compact && state.maia && (
        <Box
          sx={{
            mt: 1.5,
            px: 1.5,
            py: 1,
            borderRadius: `${RADIUS.control}px`,
            background: SURFACE.raisedSecondary,
            border: `1px solid ${LINE.hairline}`,
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            gap: 2,
            alignItems: "center",
          }}
        >
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Brain
              size={16}
              strokeWidth={1.75}
              color={ARROW_PALETTE.maia.color}
            />
            <Typography sx={{ ...TYPE.label, color: TEXT.secondary }}>
              Maia ELO
            </Typography>
          </Stack>
          <Slider
            value={state.maiaElo}
            onChange={(_, v) =>
              onChange({
                ...state,
                maiaElo: typeof v === "number" ? v : v[0],
              })
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
              py: 1,
              "& .MuiSlider-rail": { height: 4 },
              "& .MuiSlider-track": { height: 4, border: "none" },
              "& .MuiSlider-thumb": { width: 14, height: 14 },
              "& .MuiSlider-mark": {
                background: "rgba(255,255,255,0.18)",
                width: 2,
                height: 6,
              },
            }}
          />
          <Typography
            sx={{
              fontSize: TYPE.caption.fontSize,
              fontWeight: 600,
              color: TEXT.primary,
              fontVariantNumeric: "tabular-nums",
              minWidth: 48,
              textAlign: "right",
            }}
          >
            {state.maiaElo}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
