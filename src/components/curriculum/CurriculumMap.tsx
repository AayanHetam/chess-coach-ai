"use client";

import { Box, Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import { Check, Lock } from "lucide-react";
import { puzzleStatsAtom } from "@/lib/puzzleRating";
import { SYLLABUS } from "@/lib/curriculum/syllabus";
import { computeCurriculumProgress } from "@/lib/curriculum/mastery";
import {
  ACCENT,
  LINE,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

/** The learning path: ordered units with mastered / current / locked state. */
export default function CurriculumMap() {
  const stats = useAtomValue(puzzleStatsAtom);
  const progress = computeCurriculumProgress(stats, stats.rating);

  return (
    <Box>
      <Typography sx={{ ...TYPE.h4, color: TEXT.primary, mb: 1.5 }}>
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
                borderRadius: `${RADIUS.control}px`,
                opacity: unlocked ? 1 : 0.45,
                background: current ? ACCENT.tint : SURFACE.raisedSecondary,
                border: `1px solid ${current ? ACCENT.border : LINE.hairline}`,
              }}
            >
              {/* The state as a bare icon: a check once mastered, a lock while
                  closed, nothing while open. The row's opacity says it too. */}
              <Box
                aria-hidden
                sx={{
                  width: 26,
                  height: 26,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: mastered ? STATUS.success : TEXT.secondary,
                }}
              >
                {mastered ? (
                  <Check size={18} strokeWidth={1.75} />
                ) : unlocked ? null : (
                  <Lock size={18} strokeWidth={1.75} />
                )}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    ...TYPE.bodySmall,
                    color: TEXT.primary,
                    fontWeight: 600,
                  }}
                >
                  {unit.title}
                  {current && (
                    <Box
                      component="span"
                      sx={{
                        ml: 1,
                        px: 0.75,
                        py: 0.125,
                        borderRadius: `${RADIUS.small}px`,
                        background: ACCENT.tint,
                        color: ACCENT.hover,
                        fontSize: TYPE.caption.fontSize,
                        fontWeight: 600,
                        verticalAlign: "middle",
                      }}
                    >
                      Now
                    </Box>
                  )}
                </Typography>
                <Typography sx={{ ...TYPE.caption, color: TEXT.secondary }}>
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
