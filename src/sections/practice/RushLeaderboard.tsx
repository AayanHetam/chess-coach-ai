import { useEffect, useState } from "react";
import { Box, Typography, Paper, CircularProgress } from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";

type RushMode = "three" | "five" | "survival";
type RushField = "threeMin" | "fiveMin" | "survivalBest";

const MODE_TO_FIELD: Record<RushMode, RushField> = {
  three: "threeMin",
  five: "fiveMin",
  survival: "survivalBest",
};

/** How many rows the board renders. Beyond this, a player sees their own
 *  standing in the footer instead. */
const VISIBLE_ROWS = 10;

export interface LeaderboardEntry {
  handle: string;
  score: number;
}

/**
 * The post-write board handed back by POST /api/leaderboards/puzzle-rush/sync.
 * Preferred over this component's own GET whenever it covers the current mode:
 * the GET is served from a 20s per-instance memory cache, so re-fetching after
 * setting a personal best can be answered by an instance that never saw the
 * write and show the player their OLD score. The seed cannot be stale that way
 * — it was read from Firestore in the same request that did the write.
 */
export interface LeaderboardSeed {
  mode: RushField;
  entries: LeaderboardEntry[];
  rank: number | null;
  score: number;
  handle: string | null;
}

const MEDAL_COLOR = ["#FFD700", "#C0C0C0", "#CD7F32"];

/**
 * Top-10 global Puzzle Rush leaderboard for the currently-selected mode,
 * plus the reader's own standing when they sit outside those ten.
 * Reads GET /api/leaderboards/puzzle-rush?mode=... — public, no auth.
 */
export function RushLeaderboard({
  mode,
  seed = null,
}: {
  mode: RushMode;
  seed?: LeaderboardSeed | null;
}) {
  const field = MODE_TO_FIELD[mode];
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [errored, setErrored] = useState(false);

  // Stable identity: either the seed object itself or null, never a fresh
  // object per render, so both effects below key off it correctly.
  const seedForMode = seed && seed.mode === field ? seed : null;

  useEffect(() => {
    if (!seedForMode) return;
    setEntries(seedForMode.entries);
    setErrored(false);
  }, [seedForMode]);

  useEffect(() => {
    // Fetching alongside a seed for this mode could only lose the race: the
    // cached GET may be older than the write the seed just made. Switching
    // modes clears seedForMode and re-runs this, which is what we want.
    if (seedForMode) return;
    let cancelled = false;
    setEntries(null);
    setErrored(false);
    fetch(`/api/leaderboards/puzzle-rush?mode=${field}`)
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
  }, [field, seedForMode]);

  const visible = entries?.slice(0, VISIBLE_ROWS) ?? [];
  const youRank = seedForMode?.rank ?? null;
  // Only worth a row of its own once the player has dropped off the visible
  // board — inside it, their highlighted row already says where they are.
  const showYourRank = youRank !== null && youRank > visible.length;

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
          <CircularProgress
            size={22}
            sx={{ color: "rgba(255,255,255,0.35)" }}
          />
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
          {visible.map((entry, i) => {
            const isYou =
              seedForMode?.handle != null &&
              entry.handle === seedForMode.handle;
            return (
              <Box
                key={`${entry.handle}-${i}`}
                data-testid={isYou ? "rush-leaderboard-you" : undefined}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.5,
                  py: 0.75,
                  borderRadius: "0.75rem",
                  background: isYou
                    ? "rgba(249,115,22,0.14)"
                    : i < 3
                      ? "rgba(255,255,255,0.04)"
                      : "transparent",
                  border: isYou
                    ? "1px solid rgba(249,115,22,0.35)"
                    : "1px solid transparent",
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
                  {isYou && (
                    <Box
                      component="span"
                      sx={{ color: "#F97316", fontWeight: 700, ml: 0.75 }}
                    >
                      you
                    </Box>
                  )}
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
            );
          })}

          {showYourRank && (
            <Box
              data-testid="rush-leaderboard-you"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 1.5,
                py: 0.75,
                mt: 0.5,
                borderRadius: "0.75rem",
                background: "rgba(249,115,22,0.14)",
                border: "1px solid rgba(249,115,22,0.35)",
              }}
            >
              <Typography
                sx={{
                  width: 24,
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  fontFamily: "Monaco, monospace",
                  color: "#F97316",
                }}
              >
                {youRank}
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
                {seedForMode?.handle ?? "You"}
                <Box
                  component="span"
                  sx={{ color: "#F97316", fontWeight: 700, ml: 0.75 }}
                >
                  you
                </Box>
              </Typography>
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  fontFamily: "Monaco, monospace",
                  color: "success.light",
                }}
              >
                {seedForMode?.score ?? 0}
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Paper>
  );
}
