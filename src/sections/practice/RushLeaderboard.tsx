import { useEffect, useState } from "react";
import { Box, Typography, Paper, CircularProgress } from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";

type RushMode = "three" | "five" | "survival";

const MODE_TO_FIELD: Record<RushMode, "threeMin" | "fiveMin" | "survivalBest"> = {
  three: "threeMin",
  five: "fiveMin",
  survival: "survivalBest",
};

interface LeaderboardEntry {
  handle: string;
  score: number;
}

const MEDAL_COLOR = ["#FFD700", "#C0C0C0", "#CD7F32"];

/**
 * Top-10 global Puzzle Rush leaderboard for the currently-selected mode.
 * Reads GET /api/leaderboards/puzzle-rush?mode=... — public, no auth.
 */
export function RushLeaderboard({ mode }: { mode: RushMode }) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setErrored(false);
    fetch(`/api/leaderboards/puzzle-rush?mode=${MODE_TO_FIELD[mode]}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: { entries?: LeaderboardEntry[] }) => {
        if (!cancelled) setEntries(data.entries ?? []);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  return (
    <Paper
      sx={{
        p: 3,
        mt: 3,
        maxWidth: 600,
        mx: "auto",
        borderRadius: "1.5rem",
        background: "rgba(20,22,28,0.55)",
        backdropFilter: "blur(14px) saturate(140%)",
        WebkitBackdropFilter: "blur(14px) saturate(140%)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow:
          "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <EmojiEventsIcon sx={{ color: "warning.light", fontSize: 22 }} />
        <Typography sx={{ fontWeight: 700, color: "rgba(255,255,255,0.94)" }}>
          Leaderboard
        </Typography>
      </Box>

      {entries === null && !errored && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={22} sx={{ color: "rgba(255,255,255,0.35)" }} />
        </Box>
      )}

      {errored && (
        <Typography
          variant="body2"
          sx={{ color: "rgba(255,255,255,0.45)", textAlign: "center", py: 2 }}
        >
          Couldn&rsquo;t load the leaderboard right now.
        </Typography>
      )}

      {entries !== null && entries.length === 0 && !errored && (
        <Typography
          variant="body2"
          sx={{ color: "rgba(255,255,255,0.45)", textAlign: "center", py: 2 }}
        >
          No scores yet — be the first.
        </Typography>
      )}

      {entries !== null && entries.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {entries.slice(0, 10).map((entry, i) => (
            <Box
              key={`${entry.handle}-${i}`}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 1.5,
                py: 0.75,
                borderRadius: "0.75rem",
                background: i < 3 ? "rgba(255,255,255,0.04)" : "transparent",
              }}
            >
              <Typography
                sx={{
                  width: 24,
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  fontFamily: "Monaco, monospace",
                  color: i < 3 ? MEDAL_COLOR[i] : "rgba(255,255,255,0.4)",
                }}
              >
                {i + 1}
              </Typography>
              <Typography
                sx={{
                  flex: 1,
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  color: "rgba(255,255,255,0.88)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {entry.handle}
              </Typography>
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  fontFamily: "Monaco, monospace",
                  color: "success.light",
                }}
              >
                {entry.score}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  );
}
