"use client";

import React, { useMemo, useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Button,
  Chip,
  Stack,
  Collapse,
  Divider,
  LinearProgress,
} from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import GpsFixedIcon from "@mui/icons-material/GpsFixed";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import CloseIcon from "@mui/icons-material/Close";
import { MoveClassification } from "@/types/enums";
// The INSIGHT-tag parser lives in a sibling .ts file so it can be unit-
// tested without dragging React/JSX through vitest's transformer. Re-export
// here so the established import path `@/components/AICoachInsights` keeps
// working for `parseInsights` and the `InsightData` type.
import { parseInsights, type InsightData } from "./AICoachInsights.parser";
export { parseInsights };
export type { InsightData };

// Shared dark-on-light override — every InsightsCarousel / InsightCard sits on
// a light background but lives inside the orange MessageBubble which forces
// color: #fff. We need aggressive overrides on the container.
const DARK_TEXT_SX = {
  color: "#1f1f1f",
  "& .MuiTypography-root": { color: "#1f1f1f" },
  "& .MuiIconButton-root": { color: "rgba(0,0,0,0.54)" },
  "& .MuiButton-outlined": {
    color: "#1565c0",
    borderColor: "rgba(21,101,192,0.5)",
  },
  "& .MuiChip-root": { color: "#fff" }, // chips keep their own bg color
  "& .MuiLinearProgress-root": { bgcolor: "rgba(0,0,0,0.08)" },
  "& p, & li, & span, & div, & h1, & h2, & h3, & h4, & strong, & em": {
    color: "inherit",
  },
} as const;

// ─── Classification styling ─────────────────────────────────────────────
const CLASSIFICATION_STYLE: Record<
  string,
  { label: string; color: string; bg: string; emoji: string }
> = {
  [MoveClassification.Blunder]: { label: "Blunder", color: "#b71c1c", bg: "#ffebee", emoji: "??" },
  [MoveClassification.Mistake]: { label: "Mistake", color: "#e65100", bg: "#fff3e0", emoji: "?" },
  [MoveClassification.Miss]: { label: "Missed Win", color: "#6a1b9a", bg: "#f3e5f5", emoji: "?!" },
  [MoveClassification.Inaccuracy]: { label: "Inaccuracy", color: "#f9a825", bg: "#fffde7", emoji: "?!" },
  [MoveClassification.Brilliant]: { label: "Brilliant", color: "#00695c", bg: "#e0f2f1", emoji: "!!" },
  [MoveClassification.Great]: { label: "Great Move", color: "#1565c0", bg: "#e3f2fd", emoji: "!" },
  [MoveClassification.Best]: { label: "Best", color: "#2e7d32", bg: "#e8f5e9", emoji: "" },
  [MoveClassification.Excellent]: { label: "Excellent", color: "#388e3c", bg: "#f1f8e9", emoji: "" },
  [MoveClassification.Good]: { label: "Good", color: "#558b2f", bg: "#f9fbe7", emoji: "" },
  [MoveClassification.Forced]: { label: "Forced", color: "#616161", bg: "#f5f5f5", emoji: "" },
};

const styleFor = (classification: string) => {
  const key = classification.toLowerCase();
  return (
    CLASSIFICATION_STYLE[key] ?? {
      label: classification,
      color: "#424242",
      bg: "#f5f5f5",
      emoji: "",
    }
  );
};

const isNegative = (classification: string) => {
  const key = classification.toLowerCase();
  return (
    key === MoveClassification.Blunder ||
    key === MoveClassification.Mistake ||
    key === MoveClassification.Inaccuracy ||
    key === MoveClassification.Miss
  );
};

// ─── InsightCard ────────────────────────────────────────────────────────
// Renders one insight with DecodeChess-style progressive reveal.
// The caller passes `renderRich` to interpolate clickable moves / continuation
// tokens / practice markers inside the revealed text, reusing the existing
// AICoachChat renderer.
interface InsightCardProps {
  insight: InsightData;
  renderRich: (text: string) => React.ReactNode;
  /** Callback when the user clicks the move label to navigate the board. */
  onMoveClick?: (moveNumber: number, isBlack: boolean) => void;
}

const InsightCard: React.FC<InsightCardProps> = ({ insight, renderRich, onMoveClick }) => {
  const s = styleFor(insight.classification);
  const [showWhy, setShowWhy] = useState(false);
  const [showThreats, setShowThreats] = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [showConcept, setShowConcept] = useState(false);

  const negative = isNegative(insight.classification);
  const evalLine = useMemo(() => {
    if (!insight.evalBefore && !insight.evalAfter) return null;
    return `${insight.evalBefore ?? "?"} -> ${insight.evalAfter ?? "?"}`;
  }, [insight.evalBefore, insight.evalAfter]);

  // Build a clickable move label. If `playedMove` is present the existing
  // renderRich pipeline turns "12. g5" into a blue <ClickableMove> link that
  // rewinds the board. As a fallback we provide an explicit onClick handler
  // so the label always navigates even if the SAN isn't parsed by the regex.
  const hasSAN = !!insight.playedMove;
  const clickableMoveText = hasSAN
    ? `${insight.moveLabel} ${insight.playedMove}`
    : insight.moveLabel;

  const handleMoveLabelClick = () => {
    if (onMoveClick) {
      onMoveClick(insight.moveNumber, insight.color === "b");
    }
  };

  return (
    <Box
      sx={{
        border: `1px solid ${s.color}33`,
        borderRadius: 2,
        background: s.bg,
        p: 2,
        mb: 1,
        ...DARK_TEXT_SX,
      }}
    >
      {/* Headline */}
      <Stack direction="row" spacing={1} alignItems="baseline" sx={{ flexWrap: "wrap" }}>
        {hasSAN ? (
          <Typography
            variant="subtitle1"
            component="div"
            sx={{ fontWeight: 700 }}
          >
            {renderRich(clickableMoveText)}
          </Typography>
        ) : (
          <Typography
            variant="subtitle1"
            component="span"
            onClick={handleMoveLabelClick}
            sx={{
              fontWeight: 700,
              color: "#1565c0 !important",
              cursor: "pointer",
              textDecoration: "underline",
              "&:hover": { color: "#0d47a1 !important" },
            }}
          >
            {clickableMoveText}
          </Typography>
        )}
        <Chip
          size="small"
          label={s.emoji ? `${s.emoji} ${s.label}` : s.label}
          sx={{
            background: s.color,
            color: "#fff",
            fontWeight: 600,
            height: 22,
          }}
        />
        {evalLine && (
          <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.55) !important" }}>
            {evalLine}
          </Typography>
        )}
      </Stack>

      {/* Non-spoiler lede */}
      {insight.headline && (
        <Typography variant="body2" component="div" sx={{ mt: 1 }}>
          {renderRich(insight.headline)}
        </Typography>
      )}

      {/* Primary reveal: "Show the full explanation" (the spoiler) */}
      {insight.why && (
        <Box sx={{ mt: 1.5 }}>
          {!showWhy ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<LightbulbOutlinedIcon fontSize="small" />}
              onClick={() => setShowWhy(true)}
              sx={{ textTransform: "none", borderRadius: 1.5 }}
            >
              {negative ? "Show what you missed" : "Show why this works"}
            </Button>
          ) : (
            <RevealSection
              onClose={() => setShowWhy(false)}
              title={
                insight.bestMove
                  ? `Best move: ${insight.bestMove}`
                  : "Explanation"
              }
            >
              {renderRich(insight.why)}
            </RevealSection>
          )}
        </Box>
      )}

      {/* Secondary reveals */}
      <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", gap: 1 }}>
        {insight.threats && (
          <RevealButton
            label="Threats"
            icon={<GpsFixedIcon fontSize="small" />}
            active={showThreats}
            onClick={() => setShowThreats((v) => !v)}
          />
        )}
        {insight.roles && (
          <RevealButton
            label="Piece roles"
            icon={<PeopleOutlineIcon fontSize="small" />}
            active={showRoles}
            onClick={() => setShowRoles((v) => !v)}
          />
        )}
        {(insight.conceptKey || insight.conceptBody) && (
          <RevealButton
            label="Concept"
            icon={<SchoolOutlinedIcon fontSize="small" />}
            active={showConcept}
            onClick={() => setShowConcept((v) => !v)}
          />
        )}
      </Stack>

      <Collapse in={showThreats && !!insight.threats} unmountOnExit>
        <RevealSection title="Threats" onClose={() => setShowThreats(false)}>
          {renderRich(insight.threats ?? "")}
        </RevealSection>
      </Collapse>
      <Collapse in={showRoles && !!insight.roles} unmountOnExit>
        <RevealSection title="Key piece roles" onClose={() => setShowRoles(false)}>
          {renderRich(insight.roles ?? "")}
        </RevealSection>
      </Collapse>
      <Collapse in={showConcept} unmountOnExit>
        <RevealSection
          title={
            insight.conceptName
              ? `Concept: ${insight.conceptName}`
              : "Concept"
          }
          onClose={() => setShowConcept(false)}
        >
          {insight.conceptBody && renderRich(insight.conceptBody)}
          {insight.conceptKey && insight.conceptName && (
            <Box sx={{ mt: 1 }}>
              {renderRich(
                `Reinforce with puzzles: [PRACTICE:${insight.conceptKey}:${insight.conceptName}]`
              )}
            </Box>
          )}
        </RevealSection>
      </Collapse>

      {/* Engine line markers (CONTINUATION / MAIA_CONTINUATION) rendered inline */}
      {insight.engineLine && (
        <Box sx={{ mt: 1.5 }}>
          <Divider sx={{ mb: 1 }} />
          <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.55) !important", display: "block", mb: 0.5 }}>
            Engine continuation
          </Typography>
          <Box>{renderRich(insight.engineLine)}</Box>
        </Box>
      )}
    </Box>
  );
};

// ─── Reveal sub-components ──────────────────────────────────────────────
const RevealButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}> = ({ label, icon, active, onClick }) => (
  <Button
    size="small"
    variant={active ? "contained" : "outlined"}
    startIcon={icon}
    onClick={onClick}
    sx={{
      textTransform: "none",
      borderRadius: 1.5,
      minHeight: 28,
      fontSize: "0.78rem",
    }}
  >
    {label}
  </Button>
);

const RevealSection: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <Box
    sx={{
      mt: 1,
      p: 1.25,
      borderRadius: 1.5,
      background: "rgba(255,255,255,0.85)",
      border: "1px solid rgba(0,0,0,0.08)",
      color: "#1f1f1f",
      "& .MuiTypography-root": { color: "inherit" },
      "& p, & li, & span, & div": { color: "inherit" },
    }}
  >
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      sx={{ mb: 0.5 }}
    >
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, color: "rgba(0,0,0,0.6) !important" }}
      >
        {title}
      </Typography>
      <IconButton size="small" onClick={onClose} sx={{ p: 0.25, color: "rgba(0,0,0,0.6)" }}>
        <CloseIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </Stack>
    <Box sx={{ fontSize: "0.88rem", lineHeight: 1.5, color: "#1f1f1f" }}>
      {children}
    </Box>
  </Box>
);

// ─── InsightsCarousel ───────────────────────────────────────────────────
// Paginated container: one insight visible at a time with ? 1/N ? controls.
interface InsightsCarouselProps {
  insights: InsightData[];
  renderRich: (text: string) => React.ReactNode;
  onMoveClick?: (moveNumber: number, isBlack: boolean) => void;
}

export const InsightsCarousel: React.FC<InsightsCarouselProps> = ({
  insights,
  renderRich,
  onMoveClick,
}) => {
  const [idx, setIdx] = useState(0);
  if (insights.length === 0) return null;

  const clamp = (n: number) =>
    ((n % insights.length) + insights.length) % insights.length;
  const current = insights[clamp(idx)];
  const progress = ((clamp(idx) + 1) / insights.length) * 100;

  return (
    <Box
      sx={{
        mt: 1,
        mb: 1,
        borderRadius: 2,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "#fafafa",
        overflow: "hidden",
        ...DARK_TEXT_SX,
      }}
    >
      {/* Pager bar */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 1.5, py: 0.75, borderBottom: "1px solid rgba(0,0,0,0.08)" }}
      >
        <Typography variant="caption" sx={{ fontWeight: 700, color: "rgba(0,0,0,0.55) !important" }}>
          Key moments
        </Typography>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <IconButton
            size="small"
            onClick={() => setIdx((i) => clamp(i - 1))}
            disabled={insights.length < 2}
            sx={{ color: "rgba(0,0,0,0.54)" }}
          >
            <ArrowBackIosNewIcon sx={{ fontSize: 14 }} />
          </IconButton>
          <Typography variant="caption" sx={{ minWidth: 42, textAlign: "center", color: "#1f1f1f !important" }}>
            Insight {clamp(idx) + 1} / {insights.length}
          </Typography>
          <IconButton
            size="small"
            onClick={() => setIdx((i) => clamp(i + 1))}
            disabled={insights.length < 2}
            sx={{ color: "rgba(0,0,0,0.54)" }}
          >
            <ArrowForwardIosIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Stack>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{ height: 2 }}
      />
      <Box sx={{ p: 1.5 }}>
        <InsightCard insight={current} renderRich={renderRich} onMoveClick={onMoveClick} />
      </Box>
    </Box>
  );
};

export default InsightsCarousel;
