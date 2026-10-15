import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Card,
  CardActionArea,
  CardContent,
  Dialog,
  DialogContent,
  IconButton,
  Chip,
} from "@mui/material";
import { Icon } from "@iconify/react";
import { MastiAvatar } from "@/components/masti";
import {
  ACCENT,
  LINE,
  MOTION,
  RADIUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";
import { useAtom } from "jotai";
import { selectedCoachIdAtom } from "@/atoms/coachAtoms";
import {
  coachPersonalities,
  getPersonalityById,
  defaultPersonalityId,
} from "@/config/coachPersonalities";

interface CoachPersonalitySelectorProps {
  onPersonalityChange?: (personalityId: string) => void;
}

export default function CoachPersonalitySelector({
  onPersonalityChange,
}: CoachPersonalitySelectorProps) {
  const [selectedId, setSelectedId] = useAtom(selectedCoachIdAtom);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("chess-coach-personality");
    if (saved) {
      setSelectedId(saved);
    }
  }, [setSelectedId]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    localStorage.setItem("chess-coach-personality", id);
    onPersonalityChange?.(id);
    setDialogOpen(false);
  };

  const currentPersonality = getPersonalityById(selectedId);

  return (
    <>
      {/* Compact trigger button. Its two 13px text lines (about 32px) set
          its height, with room for descenders; the 28px avatar sits inside
          that. About 46px with the padding, a full phone tap target. */}
      <Box
        component="button"
        type="button"
        aria-haspopup="dialog"
        onClick={() => setDialogOpen(true)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          width: "100%",
          px: 1.5,
          py: 0.75,
          borderRadius: `${RADIUS.control}px`,
          cursor: "pointer",
          font: "inherit",
          textAlign: "left",
          color: TEXT.primary,
          backgroundColor: SURFACE.raisedSecondary,
          border: `1px solid ${LINE.hairline}`,
          transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}, transform ${MOTION.press}`,
          "&:hover": {
            backgroundColor: SURFACE.raisedTertiary,
            borderColor: LINE.strong,
          },
          "&:active": { transform: MOTION.pressScale },
          "&:focus-visible": {
            outline: `2px solid ${TEXT.primary}`,
            outlineOffset: 2,
          },
        }}
      >
        <MastiAvatar mood={currentPersonality.mood} size={28} decorative />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: TYPE.caption.fontSize,
              fontWeight: 600,
              lineHeight: 1.2,
              color: TEXT.primary,
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {currentPersonality.name}
          </Typography>
          <Typography
            sx={{
              fontSize: TYPE.caption.fontSize,
              lineHeight: 1.25,
              color: TEXT.secondary,
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {currentPersonality.title}
          </Typography>
        </Box>
        <Icon icon="mdi:chevron-down" width={16} color={TEXT.secondary} />
      </Box>

      {/* Personality selection dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { overflow: "hidden" } }}
      >
        {/* Header */}
        <Box
          sx={{
            py: 2.5,
            px: 3,
            position: "relative",
            borderBottom: `1px solid ${LINE.hairline}`,
          }}
        >
          <IconButton
            onClick={() => setDialogOpen(false)}
            aria-label="Close"
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              color: TEXT.secondary,
              "&:hover": { color: TEXT.primary },
            }}
          >
            <Icon icon="mdi:close" />
          </IconButton>

          <Typography variant="h6" sx={{ mb: 0.5, pr: 4 }}>
            Pick Masti&apos;s attitude
          </Typography>
          <Typography variant="body2" sx={{ color: TEXT.secondary }}>
            Each attitude teaches a little differently. Pick the one that suits
            how you learn.
          </Typography>
        </Box>

        <DialogContent sx={{ py: 2, px: 2 }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: 1.5,
            }}
          >
            {coachPersonalities.map((personality) => {
              const isSelected = personality.id === selectedId;

              return (
                <Card
                  key={personality.id}
                  variant="outlined"
                  // The attitude's colour lives in Masti's mood, not on the
                  // card: a selected card is the one accent-tinted state.
                  sx={{
                    borderRadius: `${RADIUS.card}px`,
                    border: isSelected
                      ? `1px solid ${ACCENT.border}`
                      : `1px solid ${LINE.hairline}`,
                    backgroundColor: isSelected ? ACCENT.tint : "transparent",
                    boxShadow: "none",
                    transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}`,
                    "&:hover": {
                      borderColor: isSelected ? ACCENT.border : LINE.strong,
                      boxShadow: "none",
                    },
                  }}
                >
                  <CardActionArea
                    onClick={() => handleSelect(personality.id)}
                    sx={{ p: 0 }}
                  >
                    <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1.5,
                          mb: 1,
                        }}
                      >
                        <MastiAvatar
                          mood={personality.mood}
                          size={40}
                          ring={isSelected}
                          decorative
                        />
                        <Box sx={{ flex: 1 }}>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600, color: TEXT.primary }}
                            >
                              {personality.name}
                            </Typography>
                            {isSelected && (
                              <Chip
                                label="Active"
                                size="small"
                                sx={{
                                  minHeight: 24,
                                  fontSize: TYPE.caption.fontSize,
                                  fontWeight: 600,
                                  bgcolor: ACCENT.tint,
                                  color: ACCENT.hover,
                                }}
                              />
                            )}
                          </Box>
                          <Typography
                            sx={{
                              ...TYPE.caption,
                              fontWeight: 600,
                              color: TEXT.secondary,
                            }}
                          >
                            {personality.title}
                          </Typography>
                        </Box>
                      </Box>

                      <Typography
                        sx={{
                          ...TYPE.caption,
                          color: TEXT.secondary,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {personality.description}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              );
            })}
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}
