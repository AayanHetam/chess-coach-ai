import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Grid,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import { Icon } from "@iconify/react";
import { DossierPanel } from "./dossier";
import { CollisionLine, Collisions } from "@/types/scout";
import { formatMoveSequence } from "@/lib/scoutService";
import {
  ACCENT,
  LINE,
  MOTION,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
} from "@/theme/tokens";

export interface CollisionPanelProps {
  collisions: Collisions;
  targetUsername: string;
  onExplore: (moves: string[], asColor: "white" | "black") => void;
}

export default function CollisionPanel({
  collisions,
  targetUsername,
  onExplore,
}: CollisionPanelProps) {
  const [color, setColor] = useState<"white" | "black">("white");
  const lines =
    color === "white"
      ? collisions.whenYouPlayWhite
      : collisions.whenYouPlayBlack;
  const empty =
    collisions.whenYouPlayWhite.length === 0 &&
    collisions.whenYouPlayBlack.length === 0;

  return (
    <DossierPanel label={`Collisions · you vs ${targetUsername}`}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "flex-start", sm: "center" }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="caption" color="text.secondary">
            Lines where <strong>your</strong> repertoire meets{" "}
            <strong>their</strong> weakness. Ranked by overall edge.
          </Typography>
        </Box>

        <Tabs
          value={color}
          onChange={(_, v) => setColor(v)}
          sx={{
            minHeight: 36,
            "& .MuiTab-root": { minHeight: 36, fontSize: "0.82rem", px: 2 },
          }}
        >
          <Tab
            value="white"
            label={
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    bgcolor: "#fff",
                    border: "1px solid #999",
                  }}
                />
                <span>you as White</span>
              </Stack>
            }
          />
          <Tab
            value="black"
            label={
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    bgcolor: "#3a3a3a",
                    border: `1px solid ${LINE.strong}`,
                  }}
                />
                <span>you as Black</span>
              </Stack>
            }
          />
        </Tabs>
      </Stack>

      {empty ? (
        <EmptyState yourGames={collisions.yourGames} />
      ) : (
        <>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{ mb: 1.5 }}
          >
            <Typography variant="caption" color="text.secondary">
              Your overall win rate:{" "}
              <strong style={{ color: STATUS.success }}>
                {(collisions.yourWinRate * 100).toFixed(0)}%
              </strong>{" "}
              across {collisions.yourGames} games
            </Typography>
          </Stack>

          {lines.length === 0 ? (
            <EmptyState
              yourGames={collisions.yourGames}
              message="No significant edges on this side: their weaknesses don't overlap with your repertoire."
            />
          ) : (
            <Grid container spacing={1.5}>
              {lines.map((line, i) => (
                <Grid size={{ xs: 12, md: 6 }} key={`${line.eco}-${i}`}>
                  <CollisionCard
                    line={line}
                    onExplore={() => onExplore(line.moves, color)}
                  />
                </Grid>
              ))}
            </Grid>
          )}
        </>
      )}
    </DossierPanel>
  );
}

function EmptyState({
  yourGames,
  message,
}: {
  yourGames: number;
  message?: string;
}) {
  return (
    <Box
      sx={{
        p: 3,
        textAlign: "center",
        color: "text.secondary",
        borderRadius: `${RADIUS.control}px`,
        border: `1px dashed ${LINE.strong}`,
      }}
    >
      <Icon icon="mdi:crosshairs-off" width={36} style={{ opacity: 0.4 }} />
      <Typography variant="body2" sx={{ mt: 1 }}>
        {message ??
          (yourGames === 0
            ? "No games found for your username yet."
            : "Your repertoire and theirs don't overlap on enough shared lines yet.")}
      </Typography>
    </Box>
  );
}

function CollisionCard({
  line,
  onExplore,
}: {
  line: CollisionLine;
  onExplore: () => void;
}) {
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
          label={line.eco}
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
            {line.name}
            {line.variation && (
              <Box
                component="span"
                sx={{ color: "text.secondary", fontWeight: 500, ml: 0.5 }}
              >
                {line.variation}
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
            {formatMoveSequence(line.moves.slice(0, 8))}
            {line.moves.length > 8 ? "…" : ""}
          </Typography>
        </Box>
      </Stack>

      {/* You vs them bars */}
      <Stack spacing={0.75}>
        <EdgeBar
          label="You"
          games={line.yourGames}
          score={line.yourScorePct}
          color={STATUS.success}
          strong
        />
        <EdgeBar
          label="Them"
          games={line.theirGames}
          score={line.theirScorePct}
          color={STATUS.error}
        />
      </Stack>

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mt: 1.25 }}
      >
        <Tooltip title="Higher edge = better your-vs-them differential scaled by sample confidence.">
          <Chip
            icon={<Icon icon="mdi:trending-up" width={12} />}
            label={`+${Math.round(line.edge)}`}
            size="small"
            sx={{
              fontSize: "0.75rem",
              fontWeight: 600,
              height: 22,
              bgcolor: STATUS.successTint,
              color: STATUS.success,
              "& .MuiChip-icon": { color: STATUS.success },
            }}
          />
        </Tooltip>
        <Button
          size="small"
          startIcon={<Icon icon="mdi:play-circle-outline" width={14} />}
          sx={{ fontWeight: 600, fontSize: "0.75rem", color: ACCENT.main }}
        >
          Explore line
        </Button>
      </Stack>
    </Box>
  );
}

function EdgeBar({
  label,
  games,
  score,
  color,
  strong = false,
}: {
  label: string;
  games: number;
  score: number;
  color: string;
  strong?: boolean;
}) {
  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 0.25 }}
      >
        <Typography
          variant="caption"
          sx={{ fontWeight: strong ? 700 : 600, fontSize: "0.75rem", color }}
        >
          {label}
        </Typography>
        <Stack direction="row" spacing={0.75} alignItems="baseline">
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: "0.75rem" }}
          >
            {games} games
          </Typography>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: "0.82rem",
              color,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {score.toFixed(0)}%
          </Typography>
        </Stack>
      </Stack>
      <Box
        sx={{
          height: 5,
          borderRadius: 2,
          bgcolor: "rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            width: `${Math.max(3, Math.min(100, score))}%`,
            height: "100%",
            borderRadius: 2,
            bgcolor: color,
            transition: "width 0.4s ease",
          }}
        />
      </Box>
    </Box>
  );
}
