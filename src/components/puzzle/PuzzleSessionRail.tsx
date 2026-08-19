"use client";

import { addressAs } from "@/lib/auth/displayIdentity";
import { useRouter } from "next/router";
import { Avatar, Box, IconButton, Stack, Typography } from "@mui/material";
import { ArrowLeft, Check, Settings, X } from "lucide-react";
import type { PuzzleContext } from "@/lib/validation/puzzleChatSchemas";
import type { SessionResult } from "@/lib/puzzleSession";
import { buildRailRows, type RowState } from "@/lib/puzzle/railRows";
import { SERIF_DISPLAY } from "@/theme/fonts";
import { useAuth } from "@/contexts/AuthContext";

/**
 * PuzzleSessionRail — the left navigator on /puzzles.
 *
 * Holds the *set*; the board card holds the *one*. Modelled on the Acely SAT
 * trainer's question rail (see docs/PUZZLE_TRAINING_LAYOUT_SPEC.md): the
 * solver never leaves the current puzzle to see how much is left, because
 * progress accumulates here as green checks.
 *
 * Rows are ordered graded-first, then current, then queued — the same reading
 * order as the session actually happened in. Graded rows are re-openable only
 * when they're still in the feed queue; a consumed puzzle can't be jumped back
 * to, so those rows are inert rather than misleadingly clickable.
 */

/** Chrome tokens, kept together so the rail reads as one surface. */
const RAIL_BG = "rgba(12,10,8,0.72)";
const RAIL_EDGE = "1px solid rgba(255,255,255,0.08)";
const TEXT = "rgba(255,240,224,0.92)";
const TEXT_DIM = "rgba(255,240,224,0.5)";
const EMBER = "#FF7A1A";

function StatusGlyph({ state }: { state: RowState }) {
  if (state === "solved" || state === "failed") {
    const solved = state === "solved";
    return (
      <Box
        sx={{
          width: 22,
          height: 22,
          flexShrink: 0,
          borderRadius: "999px",
          display: "grid",
          placeItems: "center",
          background: solved ? "#4ade80" : "rgba(248,113,113,0.9)",
        }}
      >
        {solved ? (
          <Check size={13} color="#0A0907" strokeWidth={3.5} />
        ) : (
          <X size={13} color="#0A0907" strokeWidth={3.5} />
        )}
      </Box>
    );
  }
  // Hollow ring — brighter for the puzzle you're on than for the queue.
  return (
    <Box
      sx={{
        width: 22,
        height: 22,
        flexShrink: 0,
        borderRadius: "999px",
        border:
          state === "current"
            ? `2px solid ${EMBER}`
            : "2px solid rgba(255,240,224,0.28)",
      }}
    />
  );
}

interface PuzzleSessionRailProps {
  /** Session heading — the active theme filter, or "Tactics" when unfiltered. */
  heading: string;
  results: SessionResult[];
  currentPuzzle: PuzzleContext | null;
  upcoming: PuzzleContext[];
  onJumpTo: (id: string) => void;
  /** How many queued puzzles to list. The feed batches 20; showing all of them
   *  turns the rail into a wall, and the tail is not information the solver
   *  acts on. */
  upcomingLimit?: number;
}

export function PuzzleSessionRail({
  heading,
  results,
  currentPuzzle,
  upcoming,
  onJumpTo,
  upcomingLimit = 8,
}: PuzzleSessionRailProps) {
  const router = useRouter();
  const { user } = useAuth();

  const rows = buildRailRows({
    results,
    currentPuzzle,
    upcoming,
    upcomingLimit,
  });

  const displayName = addressAs(user);

  return (
    <Box
      component="nav"
      aria-label="Session puzzles"
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
        borderRadius: "1.5rem",
        background: RAIL_BG,
        backdropFilter: "blur(16px) saturate(150%)",
        WebkitBackdropFilter: "blur(16px) saturate(150%)",
        border: RAIL_EDGE,
        overflow: "hidden",
      }}
    >
      <Box sx={{ p: 2.5, pb: 1.5 }}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.75}
          onClick={() => router.push("/plan")}
          sx={{
            cursor: "pointer",
            color: TEXT_DIM,
            mb: 2,
            "&:hover": { color: TEXT },
            transition: "color 180ms ease-out",
          }}
        >
          <ArrowLeft size={16} />
          <Typography sx={{ fontSize: "0.88rem", fontWeight: 600 }}>
            Back to plan
          </Typography>
        </Stack>

        {/* The session's subject — content, not chrome. Serif, and lighter:
            a display serif at 800 reads as a shout, where the whole point of
            the face is that the subject feels considered. */}
        <Typography
          component="h2"
          sx={{
            color: TEXT,
            fontFamily: SERIF_DISPLAY,
            fontSize: "1.6rem",
            fontWeight: 500,
            letterSpacing: "-0.01em",
            mb: 2.25,
          }}
        >
          {heading}
        </Typography>

        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Typography
            sx={{
              color: TEXT_DIM,
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            Today&apos;s puzzles
          </Typography>
          <Box
            sx={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.1)" }}
          />
        </Stack>
      </Box>

      {/* The list scrolls; the user chip below stays pinned. */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          px: 1.25,
          pb: 1,
          "&::-webkit-scrollbar": { width: 6 },
          "&::-webkit-scrollbar-thumb": {
            background: "rgba(255,255,255,0.12)",
            borderRadius: 3,
          },
        }}
      >
        {rows.length === 0 ? (
          <Typography sx={{ color: TEXT_DIM, fontSize: "0.85rem", px: 1.25 }}>
            Puzzles will appear here as your session loads.
          </Typography>
        ) : (
          rows.map((row) => {
            const clickable = Boolean(row.jumpId);
            return (
              <Stack
                key={row.key}
                direction="row"
                alignItems="center"
                spacing={1.5}
                aria-current={row.isCurrent ? "true" : undefined}
                onClick={
                  clickable ? () => onJumpTo(row.jumpId as string) : undefined
                }
                sx={{
                  px: 1.25,
                  py: 1.15,
                  borderRadius: "0.75rem",
                  cursor: clickable ? "pointer" : "default",
                  // Highlight follows `isCurrent`, the glyph follows `state`.
                  // A solved puzzle you are still looking at is ONE row: green
                  // check, ember highlight.
                  background: row.isCurrent
                    ? "rgba(255,122,26,0.10)"
                    : "transparent",
                  border: row.isCurrent
                    ? "1px solid rgba(255,122,26,0.28)"
                    : "1px solid transparent",
                  transition: "background 180ms ease-out",
                  "&:hover": clickable
                    ? { background: "rgba(255,255,255,0.05)" }
                    : undefined,
                }}
              >
                <StatusGlyph state={row.state} />
                {/* Motif name = puzzle content, so serif. The rating beside it
                    stays monospace and the glyph stays a glyph — the row is a
                    content word wrapped in chrome, and the faces say which is
                    which. Weight carries "current" rather than a heavier face,
                    since a bold display serif at 0.9rem turns muddy. */}
                <Typography
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    color: row.state === "upcoming" ? TEXT_DIM : TEXT,
                    fontFamily: SERIF_DISPLAY,
                    fontSize: "0.95rem",
                    fontWeight: row.isCurrent ? 600 : 400,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.label}
                </Typography>
                {row.rating ? (
                  <Typography
                    sx={{
                      color: TEXT_DIM,
                      fontSize: "0.75rem",
                      fontFamily: "Monaco, Menlo, monospace",
                      flexShrink: 0,
                    }}
                  >
                    {row.rating}
                  </Typography>
                ) : null}
              </Stack>
            );
          })
        )}
      </Box>

      <Box sx={{ p: 1.25, pt: 0 }}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.25}
          sx={{
            p: 1,
            borderRadius: "0.9rem",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Avatar
            src={user?.photoURL || undefined}
            sx={{ width: 34, height: 34, bgcolor: "rgba(255,122,26,0.2)" }}
          >
            {displayName.charAt(0).toUpperCase()}
          </Avatar>
          <Typography
            sx={{
              flex: 1,
              minWidth: 0,
              color: TEXT,
              fontSize: "0.9rem",
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </Typography>
          <IconButton
            size="small"
            aria-label="Profile settings"
            onClick={() => router.push("/profile")}
            sx={{ color: TEXT_DIM, "&:hover": { color: TEXT } }}
          >
            <Settings size={16} />
          </IconButton>
        </Stack>
      </Box>
    </Box>
  );
}
