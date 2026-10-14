"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useRouter } from "next/router";
import Head from "next/head";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import {
  Check,
  ChevronDown,
  Clock,
  Flag,
  RotateCcw,
  Timer,
  X as XIcon,
} from "lucide-react";
import { NavPill } from "@/components/ui/NavPill";
import { Masti } from "@/components/masti";
import { chessMastiDarkTheme } from "@/theme/chessMasti";
import {
  FONT_MONO,
  LINE,
  MOTION,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";
import {
  puzzleSessionHistoryAtom,
  puzzlePracticeQueueAtom,
  sessionSolvedCount,
  sessionMissed,
  sessionNetDelta,
  sessionDurationMs,
  formatDuration,
  mergeSessions,
  fetchServerSessions,
  type SavedPuzzleSession,
  type SessionResult,
} from "@/lib/puzzleSession";

function prettyTheme(t: string): string {
  return t
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

/** A rating delta reads as status only when it moved; flat is plain text. */
function deltaColor(delta: number): string {
  return delta > 0 ? STATUS.success : delta < 0 ? STATUS.error : TEXT.primary;
}

export default function PuzzleSessionsPage() {
  const router = useRouter();
  const localHistory = useAtomValue(puzzleSessionHistoryAtom);
  const setPracticeQueue = useSetAtom(puzzlePracticeQueueAtom);
  // Cross-device sessions from the server (empty for anon/offline). Merged with
  // localStorage by id so signed-in users see history from any device.
  const [serverSessions, setServerSessions] = useState<SavedPuzzleSession[]>(
    []
  );
  useEffect(() => {
    let alive = true;
    fetchServerSessions().then((s) => {
      if (alive) setServerSessions(s);
    });
    return () => {
      alive = false;
    };
  }, []);
  const history = useMemo(
    () => mergeSessions(serverSessions, localHistory),
    [serverSessions, localHistory]
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  // Auto-expand the newest session once the history atom hydrates from storage
  // (it's empty on first render). One-shot so re-collapsing stays collapsed.
  const didInitExpand = useRef(false);
  useEffect(() => {
    if (!didInitExpand.current && history.length > 0) {
      didInitExpand.current = true;
      setExpanded(history[0].id);
    }
  }, [history]);

  const practiceMissed = (session: SavedPuzzleSession) => {
    const missed = sessionMissed(session).map((r) => r.puzzle);
    if (missed.length === 0) return;
    setPracticeQueue(missed);
    router.push("/puzzles");
  };

  return (
    <ThemeProvider theme={chessMastiDarkTheme}>
      <Head>
        <title>Puzzle Sessions · Chess Masti</title>
        <meta name="color-scheme" content="dark" />
      </Head>

      <Box
        sx={{
          minHeight: "100vh",
          color: TEXT.primary,
          pt: 2,
          pb: 6,
          px: { xs: 2, md: 3 },
        }}
      >
        <NavPill active="practice" />

        <Box sx={{ maxWidth: 920, mx: "auto", mt: 3 }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 3, flexWrap: "wrap", gap: 1.5 }}
          >
            <Box>
              <Typography
                variant="h1"
                sx={{ fontSize: { xs: "1.75rem", md: TYPE.h1.fontSize } }}
              >
                Puzzle sessions
              </Typography>
              <Typography
                sx={{
                  color: TEXT.secondary,
                  fontSize: TYPE.bodySmall.fontSize,
                  mt: 0.5,
                }}
              >
                Review what you solved, what you missed, and drill the misses
                again.
              </Typography>
            </Box>
            <Button variant="outlined" onClick={() => router.push("/puzzles")}>
              Back to puzzles
            </Button>
          </Stack>

          {history.length === 0 ? (
            <Box
              sx={{
                mt: 6,
                py: 8,
                textAlign: "center",
                borderRadius: `${RADIUS.card}px`,
                background: SURFACE.raised,
                border: `1px solid ${LINE.hairline}`,
              }}
            >
              <Masti
                mood="wave"
                size={120}
                decorative
                style={{ marginBottom: 12 }}
              />
              <Typography sx={{ fontSize: "1.05rem", fontWeight: 600, mb: 1 }}>
                No sessions yet
              </Typography>
              <Typography
                sx={{ color: TEXT.secondary, fontSize: "0.9rem", mb: 2.5 }}
              >
                Solve a few puzzles and tap Finish to save a session here. It
                also saves itself after 15 minutes idle.
              </Typography>
              <Button
                variant="contained"
                onClick={() => router.push("/puzzles")}
              >
                Start solving
              </Button>
            </Box>
          ) : (
            <Stack spacing={1.5}>
              {history.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  open={expanded === session.id}
                  onToggle={() =>
                    setExpanded((cur) =>
                      cur === session.id ? null : session.id
                    )
                  }
                  onPracticeMissed={() => practiceMissed(session)}
                />
              ))}
            </Stack>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

function SessionCard({
  session,
  open,
  onToggle,
  onPracticeMissed,
}: {
  session: SavedPuzzleSession;
  open: boolean;
  onToggle: () => void;
  onPracticeMissed: () => void;
}) {
  const solved = sessionSolvedCount(session);
  const total = session.results.length;
  const missed = total - solved;
  const delta = sessionNetDelta(session);
  const when = useMemo(
    () => new Date(session.startedAt).toLocaleString(),
    [session.startedAt]
  );

  return (
    <Box
      sx={{
        borderRadius: `${RADIUS.card}px`,
        background: SURFACE.raised,
        border: `1px solid ${LINE.hairline}`,
        overflow: "hidden",
      }}
    >
      {/* Summary row (click to expand): a real button, so it takes focus
          and Enter or Space toggles it. */}
      <Box
        component="button"
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: { xs: 1.5, sm: 2.5 },
          width: "100%",
          px: { xs: 2, sm: 2.5 },
          py: 1.75,
          m: 0,
          border: "none",
          background: "transparent",
          font: "inherit",
          color: "inherit",
          textAlign: "left",
          cursor: "pointer",
          flexWrap: "wrap",
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
          transition: `background-color ${MOTION.hover}`,
          "&:hover": { background: "rgba(255,255,255,0.06)" },
          // A wide row darkens on press rather than scaling.
          "&:active": { background: SURFACE.raisedTertiary },
          "&:focus-visible": {
            outline: `2px solid ${TEXT.primary}`,
            outlineOffset: -2,
          },
        }}
      >
        {/* Spans throughout: a button holds phrasing content only. */}
        <Box
          component="span"
          sx={{
            display: "block",
            fontFamily: FONT_MONO,
            fontVariantNumeric: "tabular-nums",
            fontSize: "1.05rem",
            fontWeight: 700,
            color: deltaColor(delta),
            minWidth: 56,
          }}
        >
          {delta > 0 ? "+" : ""}
          {delta}
        </Box>

        <Box component="span" sx={{ display: "block", minWidth: 150, flex: 1 }}>
          <Typography
            component="span"
            sx={{ display: "block", fontSize: "0.9rem", fontWeight: 600 }}
          >
            {when}
          </Typography>
          <Stack
            component="span"
            direction="row"
            spacing={1.5}
            sx={{ mt: 0.4 }}
          >
            <Stat
              icon={<Check size={12} color={STATUS.success} />}
              text={`${solved} solved`}
            />
            <Stat
              icon={<XIcon size={12} color={STATUS.error} />}
              text={`${missed} missed`}
            />
            <Stat
              icon={<Timer size={12} color={TEXT.secondary} />}
              text={formatDuration(sessionDurationMs(session))}
            />
          </Stack>
        </Box>

        <Chip
          component="span"
          size="small"
          variant="outlined"
          icon={
            session.endReason === "finished" ? (
              <Flag size={12} />
            ) : (
              <Clock size={12} />
            )
          }
          label={session.endReason === "finished" ? "Finished" : "Auto-saved"}
          sx={{
            color: TEXT.secondary,
            "& .MuiChip-icon": { color: "inherit" },
          }}
        />

        <ChevronDown
          size={18}
          strokeWidth={1.75}
          style={{
            color: TEXT.secondary,
            transform: open ? "rotate(180deg)" : "none",
            transition: `transform ${MOTION.hover}`,
          }}
        />
      </Box>

      {/* Expanded per-puzzle detail */}
      {open && (
        <Box sx={{ px: { xs: 1.5, sm: 2.5 }, pb: 2 }}>
          <Box
            sx={{
              borderTop: `1px solid ${LINE.hairline}`,
              pt: 1.25,
            }}
          >
            {session.results.map((r, i) => (
              <PuzzleRow key={`${r.id}-${i}`} index={i + 1} result={r} />
            ))}
          </Box>

          {missed > 0 && (
            <Button
              onClick={onPracticeMissed}
              variant="contained"
              size="small"
              startIcon={<RotateCcw size={15} strokeWidth={1.75} />}
              sx={{ mt: 1.5 }}
            >
              Practice {missed} missed {missed === 1 ? "puzzle" : "puzzles"}{" "}
              again
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}

function PuzzleRow({
  index,
  result,
}: {
  index: number;
  result: SessionResult;
}) {
  const delta = result.ratingAfter - result.ratingBefore;
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        py: 0.85,
        borderBottom: `1px solid ${LINE.separator}`,
        "&:last-of-type": { borderBottom: "none" },
      }}
    >
      {/* The plain icon in its status colour, in a fixed box so the rows
          line up; no tinted medallion. */}
      <Box
        aria-hidden
        sx={{
          width: 22,
          height: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {result.solved ? (
          <Check size={18} strokeWidth={1.75} color={STATUS.success} />
        ) : (
          <XIcon size={18} strokeWidth={1.75} color={STATUS.error} />
        )}
      </Box>

      <Typography
        sx={{ fontSize: "0.86rem", fontWeight: 600, flex: 1, minWidth: 0 }}
      >
        {prettyTheme(result.theme)}
        {result.puzzle.rating ? (
          <Box
            component="span"
            sx={{
              ml: 0.75,
              fontSize: TYPE.caption.fontSize,
              fontWeight: 400,
              color: TEXT.secondary,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {result.puzzle.rating}
          </Box>
        ) : null}
      </Typography>

      <Typography
        sx={{
          fontSize: "0.76rem",
          color: TEXT.secondary,
          fontFamily: FONT_MONO,
          fontVariantNumeric: "tabular-nums",
          minWidth: 44,
          textAlign: "right",
        }}
      >
        {formatDuration(result.timeMs)}
      </Typography>

      <Typography
        sx={{
          fontSize: "0.78rem",
          fontWeight: 600,
          fontFamily: FONT_MONO,
          fontVariantNumeric: "tabular-nums",
          color: delta === 0 ? TEXT.tertiary : deltaColor(delta),
          minWidth: 38,
          textAlign: "right",
        }}
      >
        {delta > 0 ? "+" : ""}
        {delta}
      </Typography>
    </Box>
  );
}

function Stat({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Box
      component="span"
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.4 }}
    >
      {icon}
      <Typography
        component="span"
        sx={{ fontSize: TYPE.caption.fontSize, color: TEXT.secondary }}
      >
        {text}
      </Typography>
    </Box>
  );
}
