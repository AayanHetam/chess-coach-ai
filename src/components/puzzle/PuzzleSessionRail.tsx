"use client";

import { SIGN_IN_PROPS } from "@/components/ads/PartnerSlot";
import { addressAs } from "@/lib/auth/displayIdentity";
import NextLink from "next/link";
import { useRouter } from "next/router";
import {
  Avatar,
  Box,
  Button,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import { ArrowLeft, Check, Settings, UserRound, X } from "lucide-react";
import { useAuthDialog } from "@/contexts/AuthDialogContext";
import type { PuzzleContext } from "@/lib/validation/puzzleChatSchemas";
import type { SessionResult } from "@/lib/puzzleSession";
import { buildRailRows, type RowState } from "@/lib/puzzle/railRows";
import { SERIF_DISPLAY } from "@/theme/fonts";
import { useAuth } from "@/contexts/AuthContext";
import {
  ACCENT,
  FONT_MONO,
  LINE,
  MOTION,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

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
 *
 * The rail is a raised surface with a hairline, neutral like the rest of the
 * chrome; the current row is the one accent-tinted thing on it, because "you
 * are here" is an attention signal, not surface identity.
 */

function StatusGlyph({ state }: { state: RowState }) {
  if (state === "solved" || state === "failed") {
    const solved = state === "solved";
    return (
      <Box
        sx={{
          width: 22,
          height: 22,
          flexShrink: 0,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: solved ? STATUS.success : STATUS.error,
        }}
      >
        {solved ? (
          <Check size={13} color={TEXT.onAccent} strokeWidth={3} />
        ) : (
          <X size={13} color={TEXT.onAccent} strokeWidth={3} />
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
        borderRadius: "50%",
        border:
          state === "current"
            ? `2px solid ${ACCENT.main}`
            : `2px solid ${TEXT.tertiary}`,
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
  const { user, loading: authLoading } = useAuth();
  const { openAuthDialog } = useAuthDialog();

  const rows = buildRailRows({
    results,
    currentPuzzle,
    upcoming,
    upcomingLimit,
  });

  // `addressAs(null)` falls back to "Chess Player", which on this chip read
  // as an account — a guest session pretending to be signed in while the
  // header said "Sign in" (2026-09-08 QA). A visitor with no account gets
  // told so, and a way to get one.
  const displayName = user ? addressAs(user) : "Not signed in";

  return (
    <Box
      component="nav"
      aria-label="Session puzzles"
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
        borderRadius: `${RADIUS.card}px`,
        background: SURFACE.raised,
        border: `1px solid ${LINE.hairline}`,
        overflow: "hidden",
      }}
    >
      <Box sx={{ p: 2.5, pb: 1.5 }}>
        {/* A real link, so it is reachable by keyboard and opens in a new
            tab like any other; next/link keeps the partner prefix. */}
        <Stack
          component={NextLink}
          href="/plan"
          direction="row"
          alignItems="center"
          spacing={0.75}
          sx={{
            width: "fit-content",
            color: TEXT.secondary,
            textDecoration: "none",
            borderRadius: `${RADIUS.small}px`,
            mb: 2,
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
            "&:hover": { color: TEXT.primary },
            "&:active": { transform: MOTION.pressScale },
            "&:focus-visible": {
              outline: `2px solid ${TEXT.primary}`,
              outlineOffset: 2,
            },
            transition: `color ${MOTION.hover}, transform ${MOTION.press}`,
          }}
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
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
            color: TEXT.primary,
            fontFamily: SERIF_DISPLAY,
            fontSize: "1.6rem",
            fontWeight: 500,
            mb: 2.25,
          }}
        >
          {heading}
        </Typography>

        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Typography
            sx={{
              ...TYPE.label,
              color: TEXT.secondary,
              whiteSpace: "nowrap",
            }}
          >
            Today&apos;s puzzles
          </Typography>
          <Box sx={{ flex: 1, height: "1px", background: LINE.hairline }} />
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
          // Narrower than the baseline's 12px: the rail sits in the
          // one-screen layout. The thumb colour comes from the baseline.
          "&::-webkit-scrollbar": { width: 6 },
        }}
      >
        {rows.length === 0 ? (
          <Typography
            sx={{ color: TEXT.secondary, fontSize: "0.85rem", px: 1.25 }}
          >
            Puzzles will appear here as your session loads.
          </Typography>
        ) : (
          rows.map((row) => {
            const clickable = Boolean(row.jumpId);
            return (
              <Stack
                key={row.key}
                // A queued row you can jump to is a real button (keyboard,
                // focus, press); graded and current rows are not clickable
                // and stay plain rows.
                {...(clickable
                  ? {
                      component: "button" as const,
                      type: "button" as const,
                      onClick: () => onJumpTo(row.jumpId as string),
                    }
                  : {})}
                direction="row"
                alignItems="center"
                spacing={1.5}
                aria-current={row.isCurrent ? "true" : undefined}
                sx={{
                  width: "100%",
                  px: 1.25,
                  py: 1.15,
                  borderRadius: `${RADIUS.small}px`,
                  cursor: clickable ? "pointer" : "default",
                  // Highlight follows `isCurrent`, the glyph follows `state`.
                  // A solved puzzle you are still looking at is ONE row: green
                  // check, accent highlight.
                  background: row.isCurrent ? ACCENT.tint : "transparent",
                  border: row.isCurrent
                    ? `1px solid ${ACCENT.border}`
                    : "1px solid transparent",
                  transition: `background-color ${MOTION.hover}`,
                  ...(clickable && {
                    // Button reset: the row looks like its neighbours.
                    font: "inherit",
                    color: "inherit",
                    textAlign: "left",
                    margin: 0,
                    touchAction: "manipulation",
                    WebkitTapHighlightColor: "transparent",
                    "&:hover": { background: "rgba(255,255,255,0.06)" },
                    // A wide row darkens on press rather than scaling.
                    "&:active": { background: SURFACE.raisedTertiary },
                    "&:focus-visible": {
                      outline: `2px solid ${TEXT.primary}`,
                      outlineOffset: -2,
                    },
                  }),
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
                    color:
                      row.state === "upcoming" ? TEXT.secondary : TEXT.primary,
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
                      color: TEXT.secondary,
                      fontSize: "0.75rem",
                      fontFamily: FONT_MONO,
                      fontVariantNumeric: "tabular-nums",
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
          // Signed out this chip reads "Not signed in" with a Sign in
          // button, which is hidden under the ChessUSA preview prefix. A
          // signed-in chip keeps its profile control. See SIGN_IN_ATTR.
          {...(user || authLoading ? {} : SIGN_IN_PROPS)}
          direction="row"
          alignItems="center"
          spacing={1.25}
          sx={{
            p: 1,
            borderRadius: `${RADIUS.control}px`,
            background: SURFACE.raisedSecondary,
            border: `1px solid ${LINE.hairline}`,
          }}
        >
          <Avatar
            src={user?.photoURL || undefined}
            sx={{ width: 34, height: 34, bgcolor: SURFACE.raisedTertiary }}
          >
            {user ? (
              displayName.charAt(0).toUpperCase()
            ) : (
              <UserRound size={16} strokeWidth={1.75} />
            )}
          </Avatar>
          <Typography
            sx={{
              flex: 1,
              minWidth: 0,
              color: user ? TEXT.primary : TEXT.secondary,
              fontSize: "0.9rem",
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {/* Blank while auth resolves rather than flashing "Not signed
                in" at someone who is. */}
            {authLoading ? "" : displayName}
          </Typography>
          {user ? (
            <IconButton
              size="small"
              aria-label="Profile settings"
              onClick={() => router.push("/profile")}
              sx={{ color: TEXT.secondary, "&:hover": { color: TEXT.primary } }}
            >
              <Settings size={16} strokeWidth={1.75} />
            </IconButton>
          ) : authLoading ? null : (
            <Button
              size="small"
              variant="contained"
              onClick={() => openAuthDialog()}
            >
              Sign in
            </Button>
          )}
        </Stack>
      </Box>
    </Box>
  );
}
