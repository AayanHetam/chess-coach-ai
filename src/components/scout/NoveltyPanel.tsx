import {
  Box,
  Button,
  Chip,
  Grid,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { Icon } from "@iconify/react";
import { DossierPanel, FieldLabel } from "./dossier";
import { NoveltyFinding } from "@/types/scout";
import { formatMoveSequence } from "@/lib/scoutService";
import {
  ACCENT,
  LINE,
  MOTION,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

export interface NoveltyPanelProps {
  findings: NoveltyFinding[];
  /**
   * Callback when a novelty is clicked. `color` is the target's color in the
   * game where the deviation occurred — i.e., the color filter the tree
   * explorer should switch to.
   */
  onExplore: (moves: string[], targetColor: "white" | "black") => void;
}

export default function NoveltyPanel({
  findings,
  onExplore,
}: NoveltyPanelProps) {
  return (
    <DossierPanel
      label="Novelty finder"
      action={
        <FieldLabel>{`${findings.length} deviation${findings.length === 1 ? "" : "s"}`}</FieldLabel>
      }
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mb: 2 }}
      >
        Positions where the opponent <strong>left their own repertoire</strong>{" "}
        early. They were guessing: point the prep arrow right here.
      </Typography>

      {findings.length === 0 ? (
        <Box
          sx={{
            p: 3,
            textAlign: "center",
            color: "text.secondary",
            borderRadius: `${RADIUS.control}px`,
            border: `1px dashed ${LINE.strong}`,
          }}
        >
          <Typography variant="body2">
            No notable deviations: they stay very consistent in their lines.
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={1.5}>
          {findings.map((f, i) => (
            <Grid
              size={{ xs: 12, md: 6 }}
              key={`${f.eco}-${i}-${f.playedMove}`}
            >
              <NoveltyCard
                finding={f}
                onExplore={() => {
                  // The deviation occurred in a game where target played a specific color.
                  // Determine that color from ply parity: if ply is even, target is white.
                  const targetColor: "white" | "black" =
                    f.ply % 2 === 0 ? "white" : "black";
                  onExplore(f.moves, targetColor);
                }}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </DossierPanel>
  );
}

function NoveltyCard({
  finding,
  onExplore,
}: {
  finding: NoveltyFinding;
  onExplore: () => void;
}) {
  const frequency =
    (finding.bookFrequency / Math.max(1, finding.totalGames)) * 100;
  const moveNumber = Math.floor(finding.ply / 2) + 1;
  const colorLabel = finding.ply % 2 === 0 ? "W" : "B";
  return (
    <Box
      onClick={onExplore}
      sx={{
        p: 1.5,
        borderRadius: `${RADIUS.control}px`,
        border: `1px solid ${LINE.hairline}`,
        bgcolor: SURFACE.raisedSecondary,
        cursor: "pointer",
        transition: `border-color ${MOTION.hover}, transform ${MOTION.press}`,
        "&:hover": { borderColor: LINE.strong },
        "&:active": { transform: MOTION.pressScale },
      }}
    >
      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1 }}>
        <Chip
          label={finding.eco}
          size="small"
          sx={{
            bgcolor: "rgba(255,255,255,0.08)",
            color: TEXT.primary,
            fontFamily: "monospace",
            fontWeight: 700,
            fontSize: "0.72rem",
            height: 22,
          }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: "0.88rem",
              lineHeight: 1.3,
              color: TEXT.primary,
            }}
          >
            {finding.name}
            {finding.variation && (
              <Box
                component="span"
                sx={{ color: "text.secondary", fontWeight: 500, ml: 0.5 }}
              >
                {finding.variation}
              </Box>
            )}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontFamily: "monospace",
              color: "text.secondary",
              fontSize: "0.75rem",
            }}
          >
            {formatMoveSequence(finding.moves.slice(0, 8))}
          </Typography>
        </Box>
      </Stack>

      {/* Usually vs This time */}
      <Box
        sx={{
          p: 1.25,
          borderRadius: `${RADIUS.small}px`,
          bgcolor: "rgba(255,255,255,0.04)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 1,
        }}
      >
        <Box>
          <Typography
            variant="caption"
            sx={{ ...TYPE.label, color: TEXT.secondary, display: "block" }}
          >
            Usually plays
          </Typography>
          <Stack direction="row" spacing={0.75} alignItems="baseline">
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: "1rem",
                fontFamily: "monospace",
                color: STATUS.success,
              }}
            >
              {moveNumber}
              {colorLabel === "W" ? "." : "…"}
              {finding.bookMove}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: "0.75rem" }}
            >
              {frequency.toFixed(0)}% of {finding.totalGames}
            </Typography>
          </Stack>
        </Box>
        <Box>
          <Typography
            variant="caption"
            sx={{ ...TYPE.label, color: TEXT.secondary, display: "block" }}
          >
            This game
          </Typography>
          <Stack direction="row" spacing={0.75} alignItems="baseline">
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: "1rem",
                fontFamily: "monospace",
                color: STATUS.error,
              }}
            >
              {moveNumber}
              {colorLabel === "W" ? "." : "…"}
              {finding.playedMove}
            </Typography>
            {finding.gameLost && (
              <Tooltip title="They lost this game">
                <Chip
                  label="Lost"
                  size="small"
                  sx={{
                    fontSize: "0.75rem",
                    height: 18,
                    fontWeight: 600,
                    bgcolor: STATUS.errorTint,
                    color: STATUS.error,
                    "& .MuiChip-label": { px: 0.75 },
                  }}
                />
              </Tooltip>
            )}
          </Stack>
        </Box>
      </Box>

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mt: 1 }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: "0.75rem" }}
        >
          Ply {finding.ply + 1} · out of book early
        </Typography>
        <Button
          size="small"
          startIcon={<Icon icon="mdi:magnify" width={12} />}
          sx={{ fontWeight: 600, fontSize: "0.75rem", color: ACCENT.main }}
        >
          Investigate
        </Button>
      </Stack>
    </Box>
  );
}
