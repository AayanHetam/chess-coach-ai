import { useEffect, useState } from "react";
import { Box, Typography, Paper, CircularProgress } from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import {
  ACCENT,
  LINE,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

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
 *
 * It covers ONE mode, and is dropped the moment the player switches, because
 * from then on the live GET is the fresher of the two.
 */
export interface LeaderboardSeed {
  mode: RushField;
  entries: LeaderboardEntry[];
}

/**
 * Where the reader stands, in EVERY mode. Deliberately outlives the seed: the
 * board is per-mode but a player comparing modes should not watch their own
 * rank disappear on the way. Null until a sync has reported one — signed-out
 * readers never have one.
 */
export interface LeaderboardStanding {
  ranks: Record<RushField, number | null> | null;
  scores: Record<RushField, number> | null;
  handle: string | null;
}

const MEDAL_COLOR = ["#FFD700", "#C0C0C0", "#CD7F32"];

/**
 * Whether the reader needs a row of their own beneath the board.
 *
 * Asks whether they are actually ON the visible board, rather than comparing
 * their rank to its length. Those differ once scores tie: ranks are shared —
 * three players on 20 are all 9th — while display positions are not, so the
 * third of them shows up 11th on a board of ten. Comparing 9 against 10 said
 * "they can see themselves" about a player who had just dropped off the
 * bottom, and they vanished from their own leaderboard.
 */
export function shouldShowOwnRank(
  visible: LeaderboardEntry[],
  youHandle: string | null,
  youRank: number | null
): boolean {
  if (youRank === null) return false;
  if (youHandle === null) return true;
  return !visible.some((entry) => entry.handle === youHandle);
}

/**
 * Top-10 global Puzzle Rush leaderboard for the currently-selected mode,
 * plus the reader's own standing when they sit outside those ten.
 * Reads GET /api/leaderboards/puzzle-rush?mode=... — public, no auth.
 */
export function RushLeaderboard({
  mode,
  seed = null,
  standing = null,
}: {
  mode: RushMode;
  seed?: LeaderboardSeed | null;
  standing?: LeaderboardStanding | null;
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
  const youHandle = standing?.handle ?? null;
  const youRank = standing?.ranks?.[field] ?? null;
  const youScore = standing?.scores?.[field] ?? 0;
  const showYourRank = shouldShowOwnRank(visible, youHandle, youRank);

  return (
    <Paper
      sx={{
        p: 3,
        mt: 3,
        maxWidth: 600,
        mx: "auto",
        borderRadius: `${RADIUS.card}px`,
        background: SURFACE.raised,
        border: `1px solid ${LINE.hairline}`,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <EmojiEventsIcon sx={{ color: "warning.light", fontSize: 22 }} />
        <Typography sx={{ ...TYPE.h5, color: TEXT.primary }}>
          Leaderboard
        </Typography>
      </Box>

      {entries === null && !errored && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={20} />
        </Box>
      )}

      {errored && (
        <Typography
          variant="body2"
          sx={{ color: TEXT.secondary, textAlign: "center", py: 2 }}
        >
          Couldn&rsquo;t load the leaderboard right now.
        </Typography>
      )}

      {entries !== null && entries.length === 0 && !errored && (
        <Typography
          variant="body2"
          sx={{ color: TEXT.secondary, textAlign: "center", py: 2 }}
        >
          No scores yet. Be the first.
        </Typography>
      )}

      {entries !== null && entries.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {visible.map((entry, i) => {
            const isYou = youHandle != null && entry.handle === youHandle;
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
                  borderRadius: `${RADIUS.small}px`,
                  background: isYou
                    ? ACCENT.tint
                    : i < 3
                      ? SURFACE.raisedSecondary
                      : "transparent",
                  border: isYou
                    ? `1px solid ${ACCENT.border}`
                    : "1px solid transparent",
                }}
              >
                <Typography
                  sx={{
                    width: 24,
                    textAlign: "center",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    fontVariantNumeric: "tabular-nums",
                    color: i < 3 ? MEDAL_COLOR[i] : TEXT.secondary,
                  }}
                >
                  {i + 1}
                </Typography>
                <Typography
                  sx={{
                    flex: 1,
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    color: TEXT.primary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {entry.handle}
                  {isYou && (
                    <Box
                      component="span"
                      sx={{ color: ACCENT.hover, fontWeight: 700, ml: 0.75 }}
                    >
                      you
                    </Box>
                  )}
                </Typography>
                <Typography
                  sx={{
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    fontVariantNumeric: "tabular-nums",
                    color: STATUS.success,
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
                borderRadius: `${RADIUS.small}px`,
                background: ACCENT.tint,
                border: `1px solid ${ACCENT.border}`,
              }}
            >
              <Typography
                sx={{
                  width: 24,
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  fontVariantNumeric: "tabular-nums",
                  color: ACCENT.hover,
                }}
              >
                {youRank}
              </Typography>
              <Typography
                sx={{
                  flex: 1,
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  color: TEXT.primary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {youHandle ?? "You"}
                <Box
                  component="span"
                  sx={{ color: ACCENT.hover, fontWeight: 700, ml: 0.75 }}
                >
                  you
                </Box>
              </Typography>
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  fontVariantNumeric: "tabular-nums",
                  color: STATUS.success,
                }}
              >
                {youScore}
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Paper>
  );
}
