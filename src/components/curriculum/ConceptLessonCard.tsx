"use client";

import { useState } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import { puzzleStatsAtom } from "@/lib/puzzleRating";
import { computeCurriculumProgress } from "@/lib/curriculum/mastery";
import { unitById, SYLLABUS } from "@/lib/curriculum/syllabus";
import { LINE, RADIUS, STATUS, SURFACE, TEXT, TYPE } from "@/theme/tokens";

interface Lesson {
  what: string;
  spot: string;
  cue: string;
}

/**
 * The AI coach as teacher: a one-tap micro-lesson on the user's CURRENT
 * curriculum concept, generated on demand (Haiku) and adapted to their level.
 * Lazy — the dashboard renders instantly; the LLM call only fires on click.
 */
export default function ConceptLessonCard() {
  const stats = useAtomValue(puzzleStatsAtom);
  const progress = computeCurriculumProgress(stats, stats.rating);
  const unit =
    (progress.currentUnitId && unitById(progress.currentUnitId)) || SYLLABUS[0];
  const themeId = unit.themes[0];

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLesson = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/concept-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId, userRating: stats.rating }),
      });
      const data = await res.json();
      if (res.ok && data.lesson) {
        setLesson(data.lesson as Lesson);
      } else {
        setError("Couldn't load the lesson. Try again in a moment.");
      }
    } catch {
      setError("Couldn't load the lesson. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography sx={{ ...TYPE.label, color: TEXT.secondary, mb: 0.5 }}>
        Coach&apos;s corner
      </Typography>
      <Typography sx={{ ...TYPE.h4, color: TEXT.primary, mb: 0.25 }}>
        {unit.title}
      </Typography>
      <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary, mb: 2 }}>
        {unit.blurb}
      </Typography>

      {lesson ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <LessonPart label="What it is" body={lesson.what} />
          <LessonPart label="How to spot it" body={lesson.spot} />
          <LessonPart label="Remember" body={lesson.cue} emphasis />
          <Button
            variant="text"
            size="small"
            onClick={() => {
              setLesson(null);
              setError(null);
            }}
            sx={{ alignSelf: "flex-start", color: TEXT.secondary }}
          >
            Close
          </Button>
        </Box>
      ) : (
        <Button variant="contained" onClick={fetchLesson} disabled={loading}>
          {loading ? (
            <CircularProgress size={16} color="inherit" />
          ) : (
            "Teach me this"
          )}
        </Button>
      )}
      {error && (
        <Typography sx={{ ...TYPE.caption, color: STATUS.error, mt: 1 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

function LessonPart({
  label,
  body,
  emphasis,
}: {
  label: string;
  body: string;
  /** The takeaway: set apart by its label's weight and colour, not a fill. */
  emphasis?: boolean;
}) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: `${RADIUS.control}px`,
        background: SURFACE.raisedSecondary,
        border: `1px solid ${LINE.hairline}`,
      }}
    >
      <Typography
        sx={{
          ...TYPE.label,
          color: emphasis ? TEXT.primary : TEXT.secondary,
          mb: 0.5,
        }}
      >
        {label}
      </Typography>
      <Typography sx={{ ...TYPE.bodySmall, color: TEXT.primary }}>
        {body}
      </Typography>
    </Box>
  );
}
