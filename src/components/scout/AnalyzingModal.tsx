import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { Masti } from "@/components/masti";
import { PLATFORM_LABEL } from "./dossier";
import { Icon } from "@iconify/react";
import {
  ACCENT,
  LINE,
  MOTION,
  RADIUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

const TITLE_ID = "scout-analyzing-title";

export type AnalyzingStage = "connect" | "download" | "analyze";

const STAGE_ORDER: AnalyzingStage[] = ["connect", "download", "analyze"];

export interface AnalyzingModalProps {
  open: boolean;
  username: string;
  platform: "chess.com" | "lichess";
  stage: AnalyzingStage;
  progress: number; // 0-1
  onCancel?: () => void;
}

const STAGE_LABEL: Record<AnalyzingStage, string> = {
  connect: "Connect",
  download: "Download",
  analyze: "Analyze",
};

const STAGE_BODY: Record<AnalyzingStage, { title: string; detail: string }> = {
  connect: {
    title: "Connecting to the archives…",
    detail: "Finding the player",
  },
  download: {
    title: "Pulling recent games…",
    detail: "Last year of play",
  },
  analyze: {
    title: "Analyzing patterns…",
    detail: "Openings, traps and psychology",
  },
};

export default function AnalyzingModal({
  open,
  username,
  platform,
  stage,
  progress,
  onCancel,
}: AnalyzingModalProps) {
  const stageIdx = STAGE_ORDER.indexOf(stage);
  const { title, detail } = STAGE_BODY[stage];
  const pct = Math.round(progress * 100);

  // The theme styles the Dialog (SURFACE.overlay, RADIUS.sheet, a hairline,
  // SHADOW.modal, the scrim); Dialog traps focus and Escape cancels. A click
  // on the scrim does nothing, as before: a stray click should not throw
  // away a scout that is halfway through.
  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        if (reason === "escapeKeyDown") onCancel?.();
      }}
      disableEscapeKeyDown={!onCancel}
      fullWidth
      maxWidth="xs"
      aria-labelledby={TITLE_ID}
    >
      <Box sx={{ p: 3 }}>
        {/* Avatar + username */}
        <Stack
          direction="column"
          alignItems="center"
          spacing={1.5}
          sx={{ mb: 2 }}
        >
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              bgcolor: SURFACE.raisedSecondary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <Typography
              sx={{ fontSize: 32, fontWeight: 700, color: TEXT.primary }}
            >
              {username.charAt(0).toUpperCase() || "?"}
            </Typography>
            <Box
              sx={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: 16,
                height: 16,
                borderRadius: "4px",
                bgcolor: platform === "chess.com" ? "#7fa650" : "#262421",
                border: `2px solid ${SURFACE.overlay}`,
              }}
            />
          </Box>

          <Box sx={{ textAlign: "center" }}>
            <DialogTitle id={TITLE_ID} sx={{ p: 0 }}>
              Analyzing {username}
            </DialogTitle>
            <Typography variant="caption" sx={{ color: TEXT.secondary }}>
              {PLATFORM_LABEL[platform]}
            </Typography>
          </Box>
        </Stack>

        {/* Step indicators */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="center"
          sx={{ mb: 3, gap: 0 }}
        >
          {STAGE_ORDER.map((s, i) => {
            const done = i < stageIdx;
            const active = i === stageIdx;
            return (
              <Box
                key={s}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0,
                  flex: i < STAGE_ORDER.length - 1 ? 1 : "unset",
                }}
              >
                <Stack alignItems="center" spacing={0.5}>
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 600,
                      fontSize: 14,
                      fontVariantNumeric: "tabular-nums",
                      color: active
                        ? TEXT.onAccent
                        : done
                          ? ACCENT.hover
                          : TEXT.secondary,
                      bgcolor: active
                        ? ACCENT.main
                        : done
                          ? ACCENT.tint
                          : SURFACE.raisedSecondary,
                      transition: `background-color ${MOTION.hover}, color ${MOTION.hover}`,
                    }}
                  >
                    {done ? <Icon icon="mdi:check-bold" width={18} /> : i + 1}
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      ...TYPE.label,
                      color: active ? TEXT.primary : TEXT.secondary,
                    }}
                  >
                    {STAGE_LABEL[s]}
                  </Typography>
                </Stack>
                {i < STAGE_ORDER.length - 1 && (
                  <Box
                    sx={{
                      flex: 1,
                      height: 2,
                      bgcolor: done ? LINE.strong : LINE.hairline,
                      mx: 1,
                      mt: -2,
                    }}
                  />
                )}
              </Box>
            );
          })}
        </Stack>

        {/* Detail card */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 2.5,
            borderRadius: `${RADIUS.control}px`,
            bgcolor: SURFACE.raisedSecondary,
            border: `1px solid ${LINE.hairline}`,
          }}
        >
          {/* The stage line is the live region; the bar below carries the
              percentage as a progressbar so it is not read out every tick. */}
          <Box role="status" aria-live="polite">
            <Typography
              sx={{
                fontWeight: 600,
                color: TEXT.primary,
                fontSize: 15,
                mb: 0.5,
              }}
            >
              {title}
            </Typography>
            <Typography sx={{ color: TEXT.secondary, fontSize: 13, mb: 1.5 }}>
              {detail}
            </Typography>
          </Box>

          {/* Masti thinks while the archive downloads: the still until the
              modal opens, the loop while it is open (when the pack has one),
              the still again once it closes. The figure stands alone; the
              modal copy above him already says what is happening. */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              my: 1.5,
            }}
          >
            <Masti
              mood="thinking"
              size={96}
              animated={open}
              loops={0}
              decorative
            />
          </Box>

          <LinearProgress
            variant="determinate"
            value={pct}
            aria-label="Scout progress"
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: LINE.hairline,
              "& .MuiLinearProgress-bar": { bgcolor: ACCENT.main },
            }}
          />
          <Typography
            variant="caption"
            sx={{
              color: TEXT.secondary,
              mt: 0.5,
              display: "block",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {pct}%
          </Typography>
        </Paper>

        {onCancel && (
          <Button fullWidth variant="outlined" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </Box>
    </Dialog>
  );
}
