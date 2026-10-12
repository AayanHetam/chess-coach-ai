import { useState } from "react";
import {
  Backdrop,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { Icon } from "@iconify/react";
import { Platform, ProfileSnapshot } from "@/types/scout";
import {
  ACCENT,
  LINE,
  MOTION,
  RADIUS,
  SHADOW,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

export interface TwinBotDialogProps {
  open: boolean;
  onClose: () => void;
  onStart: (color: "white" | "black") => void;
  username: string;
  platform: Platform;
  profile: ProfileSnapshot;
}

export default function TwinBotDialog({
  open,
  onClose,
  onStart,
  username,
  platform,
  profile,
}: TwinBotDialogProps) {
  const [color, setColor] = useState<"white" | "black">("white");
  if (!open) return null;

  return (
    <Backdrop
      open
      sx={{ zIndex: (theme) => theme.zIndex.modal + 10 }}
      onClick={onClose}
    >
      <Paper
        elevation={0}
        onClick={(e) => e.stopPropagation()}
        sx={{
          width: 420,
          maxWidth: "92vw",
          p: 3,
          borderRadius: `${RADIUS.sheet}px`,
          background: SURFACE.overlay,
          color: TEXT.primary,
          border: `1px solid ${LINE.hairline}`,
          boxShadow: SHADOW.modal,
          position: "relative",
        }}
      >
        {/* Header */}
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
          <Box sx={{ display: "flex", color: TEXT.secondary }}>
            <Icon icon="mdi:robot-outline" width={20} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ ...TYPE.h4, lineHeight: 1.1 }}>
              Twin bot
            </Typography>
            <Typography variant="caption" sx={{ color: TEXT.secondary }}>
              Practice against {username}&apos;s style
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={onClose}
            aria-label="Close"
            sx={{ color: TEXT.secondary, "&:hover": { color: TEXT.primary } }}
          >
            <Icon icon="mdi:close" width={18} />
          </IconButton>
        </Stack>

        {/* Player card */}
        <Paper
          elevation={0}
          sx={{
            p: 1.75,
            mb: 3,
            borderRadius: `${RADIUS.control}px`,
            bgcolor: SURFACE.raisedSecondary,
            border: `1px solid ${LINE.hairline}`,
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <Box sx={{ position: "relative" }}>
            <Box
              sx={{
                width: 54,
                height: 54,
                borderRadius: `${RADIUS.control}px`,
                bgcolor: SURFACE.raisedTertiary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: TEXT.primary,
                fontWeight: 700,
                fontSize: 24,
              }}
            >
              {username.charAt(0).toUpperCase() || "?"}
            </Box>
            <Box
              sx={{
                position: "absolute",
                right: -2,
                bottom: -2,
                width: 12,
                height: 12,
                borderRadius: "50%",
                bgcolor: platform === "chess.com" ? "#7fa650" : "#bcbcbc",
                border: `2px solid ${SURFACE.overlay}`,
              }}
            />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, fontSize: "1rem" }}>
              {username}
            </Typography>
            <Stack
              direction="row"
              spacing={1.5}
              alignItems="center"
              sx={{ mt: 0.25 }}
            >
              <Stack
                direction="row"
                spacing={0.5}
                alignItems="center"
                sx={{ color: TEXT.secondary }}
              >
                <Icon icon="mdi:trophy" width={14} />
                <Typography
                  sx={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: TEXT.primary,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {profile.phaseElo.baseline} Elo
                </Typography>
              </Stack>
              <Stack
                direction="row"
                spacing={0.5}
                alignItems="center"
                sx={{ color: TEXT.secondary }}
              >
                <Icon icon="mdi:chess-pawn" width={14} />
                <Typography sx={{ fontSize: "0.78rem" }}>
                  {profile.totalGames.toLocaleString()} games
                </Typography>
              </Stack>
            </Stack>
            <Chip
              label={profile.archetype}
              size="small"
              sx={{
                mt: 0.75,
                bgcolor: SURFACE.raisedTertiary,
                color: TEXT.primary,
                fontWeight: 500,
                fontSize: "0.75rem",
                height: 20,
              }}
            />
          </Box>
        </Paper>

        {/* Phase ELO breakdown */}
        <Box sx={{ mb: 2.5 }}>
          <Typography
            variant="caption"
            sx={{
              ...TYPE.label,
              color: TEXT.secondary,
              display: "block",
              mb: 1,
            }}
          >
            Bot strength by phase
          </Typography>
          <Stack direction="row" spacing={1}>
            <PhasePill
              label="Opening"
              elo={profile.phaseElo.opening}
              icon="mdi:book-open-variant"
            />
            <PhasePill
              label="Middle"
              elo={profile.phaseElo.middle}
              icon="mdi:sword-cross"
            />
            <PhasePill
              label="Endgame"
              elo={profile.phaseElo.endgame}
              icon="mdi:flag-checkered"
            />
          </Stack>
          <Typography
            variant="caption"
            sx={{ color: TEXT.secondary, mt: 0.75, display: "block" }}
          >
            In opening theory the bot plays their <strong>actual moves</strong>.
            After that, a human-like opponent at their strength in each phase.
          </Typography>
        </Box>

        {/* Color picker */}
        <Typography
          variant="caption"
          sx={{ ...TYPE.label, color: TEXT.secondary, display: "block", mb: 1 }}
        >
          Choose your color
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ mb: 3 }}>
          <ColorCard
            label="White"
            selected={color === "white"}
            onClick={() => setColor("white")}
            bgColor="#fff"
            pieceColor="#0f1724"
          />
          <ColorCard
            label="Black"
            selected={color === "black"}
            onClick={() => setColor("black")}
            bgColor="#facc15"
            pieceColor="#0f1724"
          />
        </Stack>

        {/* Start */}
        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={() => onStart(color)}
          startIcon={<Icon icon="mdi:play" />}
        >
          Start game
        </Button>
      </Paper>
    </Backdrop>
  );
}

function PhasePill({
  label,
  elo,
  icon,
}: {
  label: string;
  elo: number;
  icon: string;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        p: 1,
        borderRadius: `${RADIUS.control}px`,
        bgcolor: SURFACE.raisedSecondary,
        border: `1px solid ${LINE.hairline}`,
        textAlign: "center",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          color: TEXT.secondary,
          mb: 0.25,
        }}
      >
        <Icon icon={icon} width={16} />
      </Box>
      <Typography
        sx={{
          fontWeight: 700,
          fontSize: "1.02rem",
          color: TEXT.primary,
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {elo}
      </Typography>
      <Typography variant="caption" sx={{ color: TEXT.secondary }}>
        {label}
      </Typography>
    </Box>
  );
}

function ColorCard({
  label,
  selected,
  onClick,
  bgColor,
  pieceColor,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  bgColor: string;
  pieceColor: string;
}) {
  return (
    <Box
      onClick={onClick}
      role="button"
      aria-pressed={selected}
      sx={{
        flex: 1,
        py: 2,
        borderRadius: `${RADIUS.control}px`,
        border: "1px solid",
        borderColor: selected ? ACCENT.border : LINE.hairline,
        bgcolor: selected ? ACCENT.tint : SURFACE.raisedSecondary,
        cursor: "pointer",
        textAlign: "center",
        transition: `border-color ${MOTION.hover}, background-color ${MOTION.hover}, transform ${MOTION.press}`,
        position: "relative",
        "&:hover": { borderColor: selected ? ACCENT.border : LINE.strong },
        "&:active": { transform: MOTION.pressScale },
      }}
    >
      {selected && (
        <Box
          sx={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 16,
            height: 16,
            borderRadius: "50%",
            bgcolor: ACCENT.main,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon
            icon="mdi:check-bold"
            width={10}
            style={{ color: TEXT.onAccent }}
          />
        </Box>
      )}
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          bgcolor: bgColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mx: "auto",
          mb: 0.75,
        }}
      >
        <Icon icon="mdi:crown" width={26} style={{ color: pieceColor }} />
      </Box>
      <Typography
        sx={{ fontWeight: 600, fontSize: "0.88rem", color: TEXT.primary }}
      >
        {label}
      </Typography>
    </Box>
  );
}
