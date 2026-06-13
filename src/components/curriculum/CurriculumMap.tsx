"use client";

import { Box, Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import { puzzleStatsAtom } from "@/lib/puzzleRating";
import { SYLLABUS } from "@/lib/curriculum/syllabus";
import { computeCurriculumProgress } from "@/lib/curriculum/mastery";

/** The learning path: ordered units with mastered / current / locked state. */
export default function CurriculumMap() {
  const stats = useAtomValue(puzzleStatsAtom);
  const progress = computeCurriculumProgress(stats, stats.rating);

  return (
    <Box>
      <Typography
        sx={{ color: "#fff", fontWeight: 700, fontSize: "1.1rem", mb: 1.5 }}
      >
        Your learning path
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {SYLLABUS.map((unit) => {
          const mastered = progress.masteredUnitIds.includes(unit.id);
          const unlocked = progress.unlockedUnitIds.includes(unit.id);
          const current = progress.currentUnitId === unit.id;
          return (
            <Box
              key={unit.id}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                p: "12px 14px",
                borderRadius: "12px",
                opacity: unlocked ? 1 : 0.45,
                background: current
                  ? "rgba(249,115,22,0.12)"
                  : "rgba(255,255,255,0.03)",
                border: current
                  ? "1px solid rgba(249,115,22,0.5)"
                  : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <Box
                aria-hidden
                sx={{
                  width: 26,
                  height: 26,
                  flexShrink: 0,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: mastered ? "#fff" : "rgba(255,255,255,0.7)",
                  background: mastered
                    ? "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)"
                    : "rgba(255,255,255,0.08)",
                  border: mastered
                    ? "none"
                    : "1px solid rgba(255,255,255,0.15)",
                }}
              >
                {mastered ? "✓" : unlocked ? "" : "🔒"}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    color: "rgba(255,255,255,0.94)",
                    fontWeight: 600,
                    fontSize: "0.92rem",
                  }}
                >
                  {unit.title}
                  {current && (
                    <Box
                      component="span"
                      sx={{
                        ml: 1,
                        color: "#FB923C",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Now
                    </Box>
                  )}
                </Typography>
                <Typography
                  sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.78rem" }}
                >
                  {unit.blurb}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
