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
  Avatar,
} from "@mui/material";
import { Icon } from "@iconify/react";
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
      {/* Compact trigger button */}
      <Box
        onClick={() => setDialogOpen(true)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.75,
          borderRadius: 2,
          cursor: "pointer",
          backgroundColor: "rgba(255,107,53,0.08)",
          border: "1px solid rgba(255,107,53,0.2)",
          transition: "all 0.2s ease",
          "&:hover": {
            backgroundColor: "rgba(255,107,53,0.15)",
            borderColor: "rgba(255,107,53,0.4)",
          },
        }}
      >
        <Avatar
          sx={{
            width: 28,
            height: 28,
            fontSize: "0.9rem",
            bgcolor: currentPersonality.color,
          }}
        >
          {currentPersonality.avatar}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              fontSize: "0.75rem",
              lineHeight: 1.2,
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {currentPersonality.name}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontSize: "0.65rem",
              color: "text.secondary",
              lineHeight: 1,
            }}
          >
            {currentPersonality.title}
          </Typography>
        </Box>
        <Icon
          icon="mdi:chevron-down"
          width={16}
          color="rgba(255,107,53,0.6)"
        />
      </Box>

      {/* Personality selection dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 4,
            overflow: "hidden",
          },
        }}
      >
        {/* Header */}
        <Box
          sx={{
            background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
            py: 2.5,
            px: 3,
            position: "relative",
          }}
        >
          <IconButton
            onClick={() => setDialogOpen(false)}
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              color: "rgba(255,255,255,0.7)",
              "&:hover": { color: "#fff" },
            }}
          >
            <Icon icon="mdi:close" />
          </IconButton>

          <Typography
            variant="h6"
            sx={{ fontWeight: 800, color: "#fff", mb: 0.5 }}
          >
            Choose Your Coach
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "rgba(255,255,255,0.85)" }}
          >
            Each coach has a unique teaching style. Pick the one that matches
            how you like to learn.
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
                  sx={{
                    borderRadius: 3,
                    borderColor: isSelected
                      ? personality.color
                      : "rgba(0,0,0,0.12)",
                    borderWidth: isSelected ? 2 : 1,
                    backgroundColor: isSelected
                      ? `${personality.color}08`
                      : "transparent",
                    transition: "all 0.2s ease",
                    "&:hover": {
                      borderColor: personality.color,
                      boxShadow: `0 4px 16px ${personality.color}20`,
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
                        <Avatar
                          sx={{
                            width: 40,
                            height: 40,
                            fontSize: "1.3rem",
                            bgcolor: personality.color,
                          }}
                        >
                          {personality.avatar}
                        </Avatar>
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
                              sx={{ fontWeight: 700 }}
                            >
                              {personality.name}
                            </Typography>
                            {isSelected && (
                              <Chip
                                label="Active"
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: "0.6rem",
                                  fontWeight: 700,
                                  bgcolor: personality.color,
                                  color: "#fff",
                                }}
                              />
                            )}
                          </Box>
                          <Typography
                            variant="caption"
                            sx={{
                              color: personality.color,
                              fontWeight: 600,
                              fontSize: "0.7rem",
                            }}
                          >
                            {personality.title}
                          </Typography>
                        </Box>
                      </Box>

                      <Typography
                        variant="caption"
                        sx={{
                          color: "text.secondary",
                          fontSize: "0.75rem",
                          lineHeight: 1.4,
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
