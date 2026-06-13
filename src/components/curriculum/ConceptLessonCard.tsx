"use client";

import { useState } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import { puzzleStatsAtom } from "@/lib/puzzleRating";
import { computeCurriculumProgress } from "@/lib/curriculum/mastery";
import { unitById, SYLLABUS } from "@/lib/curriculum/syllabus";

const ORANGE = "linear-gradient(135deg, #F97316 0%, #EA580C 100%)";
const ORANGE_HOVER = "linear-gradient(135deg, #FB923C 0%, #F97316 100%)";

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
        setError("Couldn't load the lesson — try again in a moment.");
      }
    } catch {
      setError("Couldn't load the lesson — try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography
        sx={{
          color: "#FB923C",
          fontWeight: 700,
          fontSize: "0.72rem",
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          mb: 0.5,
        }}
      >
        Coach&apos;s corner
      </Typography>
      <Typography
        sx={{ color: "#fff", fontWeight: 700, fontSize: "1.1rem", mb: 0.25 }}
      >
        {unit.title}
      </Typography>
      <Typography
        sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.85rem", mb: 2 }}
      >
        {unit.blurb}
      </Typography>

      {lesson ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <LessonPart label="What it is" body={lesson.what} />
          <LessonPart label="How to spot it" body={lesson.spot} />
          <LessonPart label="Remember" body={lesson.cue} accent />
          <Button
            onClick={() => {
              setLesson(null);
              setError(null);
            }}
            sx={{
              alignSelf: "flex-start",
              textTransform: "none",
              color: "rgba(255,255,255,0.5)",
              fontSize: "0.8rem",
              p: 0,
              "&:hover": {
                color: "rgba(255,255,255,0.8)",
                background: "transparent",
              },
            }}
          >
            Close
          </Button>
        </Box>
      ) : (
        <Button
          onClick={fetchLesson}
          disabled={loading}
          sx={{
            py: 1,
            px: 3,
            borderRadius: "10px",
            textTransform: "none",
            fontWeight: 700,
            color: "#fff",
            background: ORANGE,
            "&:hover": { background: ORANGE_HOVER },
            "&.Mui-disabled": {
              color: "rgba(255,255,255,0.6)",
              background: "rgba(249,115,22,0.4)",
            },
          }}
        >
          {loading ? (
            <CircularProgress size={20} sx={{ color: "#fff" }} />
          ) : (
            "Teach me this"
          )}
        </Button>
      )}
      {error && (
        <Typography sx={{ color: "#f87171", fontSize: "0.82rem", mt: 1 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

function LessonPart({
  label,
  body,
  accent,
}: {
  label: string;
  body: string;
  accent?: boolean;
}) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: "12px",
        background: accent ? "rgba(249,115,22,0.1)" : "rgba(255,255,255,0.03)",
        border: accent
          ? "1px solid rgba(249,115,22,0.3)"
          : "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <Typography
        sx={{
          color: accent ? "#FB923C" : "rgba(255,255,255,0.5)",
          fontSize: "0.7rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          mb: 0.5,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          color: "rgba(255,255,255,0.88)",
          fontSize: "0.88rem",
          lineHeight: 1.5,
        }}
      >
        {body}
      </Typography>
    </Box>
  );
}
