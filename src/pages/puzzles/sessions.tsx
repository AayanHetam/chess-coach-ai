"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useRouter } from "next/router";
import Head from "next/head";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { motion } from "framer-motion";
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
import {
  puzzleSessionHistoryAtom,
  puzzlePracticeQueueAtom,
  sessionSolvedCount,
  sessionMissed,
  sessionNetDelta,
  sessionDurationMs,
  formatDuration,
  type SavedPuzzleSession,
  type SessionResult,
} from "@/lib/puzzleSession";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#FF7A1A" },
    background: { default: "#0A0907", paper: "rgba(22,18,14,0.55)" },
    text: {
      primary: "rgba(255,240,224,0.94)",
      secondary: "rgba(255,240,224,0.55)",
    },
  },
  typography: { fontFamily: "Inter, sans-serif" },
});

const GREEN = "#4ade80";
const RED = "#f87171";

function prettyTheme(t: string): string {
  return t
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

export default function PuzzleSessionsPage() {
  const router = useRouter();
  const history = useAtomValue(puzzleSessionHistoryAtom);
  const setPracticeQueue = useSetAtom(puzzlePracticeQueueAtom);
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
    <ThemeProvider theme={theme}>
      <Head>
        <title>Puzzle Sessions · Chess Masti</title>
        <meta name="color-scheme" content="dark" />
        <style>{`html,body{background:#0A0907;color-scheme:dark;margin:0;}`}</style>
      </Head>

      <Box
        sx={{
          minHeight: "100vh",
          color: "rgba(255,240,224,0.94)",
          // Self-painted obsidian background — the shared GradientBackdrop sits
          // behind <body>, which CssBaseline paints white on this route.
          background:
            "radial-gradient(120% 80% at 50% 0%, rgba(249,115,22,0.07), transparent 55%), #08090C",
          pt: 2,
          pb: 6,
          px: { xs: 2, md: 3 },
        }}
      >
        <NavPill active="practice" badge={{ label: "Sessions" }} />

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
                sx={{
                  fontSize: { xs: "1.6rem", md: "2.1rem" },
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.05,
                }}
              >
                Puzzle sessions
              </Typography>
              <Typography
                sx={{ color: "rgba(255,240,224,0.5)", fontSize: "0.9rem", mt: 0.5 }}
              >
                Review what you solved, what you missed, and drill the misses
                again.
              </Typography>
            </Box>
            <Button
              onClick={() => router.push("/puzzles")}
              sx={{
                px: 2,
                py: 0.75,
                borderRadius: "999px",
                background: "linear-gradient(135deg, #FF7A1A, #FB923C)",
                color: "#0A0907",
                fontWeight: 700,
                textTransform: "none",
                "&:hover": {
                  background: "linear-gradient(135deg, #FB923C, #FBBF24)",
                },
              }}
            >
              Back to puzzles
            </Button>
          </Stack>

          {history.length === 0 ? (
            <Box
              sx={{
                mt: 6,
                py: 8,
                textAlign: "center",
                borderRadius: "1.5rem",
                background: "rgba(22,18,14,0.5)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <Typography sx={{ fontSize: "1.05rem", fontWeight: 600, mb: 1 }}>
                No sessions yet
              </Typography>
              <Typography
                sx={{ color: "rgba(255,240,224,0.5)", fontSize: "0.9rem", mb: 2.5 }}
              >
                Solve a few puzzles and tap Finish (or just go idle for 15 min)
                to bank a session here.
              </Typography>
              <Button
                onClick={() => router.push("/puzzles")}
                sx={{
                  px: 2.5,
                  py: 1,
                  borderRadius: "999px",
                  background: "linear-gradient(135deg, #FF7A1A, #FB923C)",
                  color: "#0A0907",
                  fontWeight: 700,
                  textTransform: "none",
                }}
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
                      cur === session.id ? null : session.id,
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
  const deltaColor = delta > 0 ? GREEN : delta < 0 ? RED : "#FBBF24";
  const when = useMemo(
    () => new Date(session.startedAt).toLocaleString(),
    [session.startedAt],
  );

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Box
        sx={{
          borderRadius: "1.25rem",
          background: "rgba(22,18,14,0.55)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          overflow: "hidden",
        }}
      >
        {/* Summary row (click to expand) */}
        <Box
          role="button"
          aria-expanded={open}
          onClick={onToggle}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: { xs: 1.5, sm: 2.5 },
            px: { xs: 2, sm: 2.5 },
            py: 1.75,
            cursor: "pointer",
            flexWrap: "wrap",
            "&:hover": { background: "rgba(255,255,255,0.02)" },
          }}
        >
          <Box
            sx={{
              fontFamily: "Monaco, Menlo, monospace",
              fontSize: "1.05rem",
              fontWeight: 800,
              color: deltaColor,
              minWidth: 56,
            }}
          >
            {delta > 0 ? "+" : ""}
            {delta}
          </Box>

          <Box sx={{ minWidth: 150, flex: 1 }}>
            <Typography sx={{ fontSize: "0.9rem", fontWeight: 700 }}>
              {when}
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ mt: 0.4 }}>
              <Stat icon={<Check size={12} color={GREEN} />} text={`${solved} solved`} />
              <Stat icon={<XIcon size={12} color={RED} />} text={`${missed} missed`} />
              <Stat
                icon={<Timer size={12} color="rgba(255,240,224,0.5)" />}
                text={formatDuration(sessionDurationMs(session))}
              />
            </Stack>
          </Box>

          <Chip
            size="small"
            icon={
              session.endReason === "idle" ? (
                <Clock size={12} />
              ) : (
                <Flag size={12} />
              )
            }
            label={session.endReason === "idle" ? "Auto-saved" : "Finished"}
            sx={{
              bgcolor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,240,224,0.7)",
              "& .MuiChip-icon": { color: "rgba(255,240,224,0.6)" },
            }}
          />

          <ChevronDown
            size={18}
            style={{
              color: "rgba(255,240,224,0.5)",
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform 200ms ease-out",
            }}
          />
        </Box>

        {/* Expanded per-puzzle detail */}
        {open && (
          <Box sx={{ px: { xs: 1.5, sm: 2.5 }, pb: 2 }}>
            <Box
              sx={{
                borderTop: "1px solid rgba(255,255,255,0.06)",
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
                startIcon={<RotateCcw size={15} />}
                sx={{
                  mt: 1.5,
                  px: 2,
                  py: 0.75,
                  borderRadius: "999px",
                  background:
                    "linear-gradient(135deg, rgba(255,122,26,0.18), rgba(255,140,66,0.08))",
                  border: "1px solid rgba(255,122,26,0.4)",
                  color: "#FFD1A8",
                  fontWeight: 700,
                  fontSize: "0.84rem",
                  textTransform: "none",
                  "&:hover": {
                    background:
                      "linear-gradient(135deg, rgba(255,122,26,0.28), rgba(255,140,66,0.14))",
                  },
                }}
              >
                Practice {missed} missed {missed === 1 ? "puzzle" : "puzzles"} again
              </Button>
            )}
          </Box>
        )}
      </Box>
    </motion.div>
  );
}

function PuzzleRow({ index, result }: { index: number; result: SessionResult }) {
  const delta = result.ratingAfter - result.ratingBefore;
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        py: 0.85,
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        "&:last-of-type": { borderBottom: "none" },
      }}
    >
      <Box
        sx={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          background: result.solved
            ? "rgba(74,222,128,0.14)"
            : "rgba(248,113,113,0.14)",
          border: `1px solid ${result.solved ? "rgba(74,222,128,0.4)" : "rgba(248,113,113,0.4)"}`,
        }}
      >
        {result.solved ? (
          <Check size={13} color={GREEN} />
        ) : (
          <XIcon size={13} color={RED} />
        )}
      </Box>

      <Typography sx={{ fontSize: "0.86rem", fontWeight: 600, flex: 1, minWidth: 0 }}>
        {prettyTheme(result.theme)}
        {result.puzzle.rating ? (
          <Box
            component="span"
            sx={{
              ml: 0.75,
              fontSize: "0.74rem",
              color: "rgba(255,240,224,0.4)",
              fontFamily: "Monaco, Menlo, monospace",
            }}
          >
            {result.puzzle.rating}
          </Box>
        ) : null}
      </Typography>

      <Typography
        sx={{
          fontSize: "0.76rem",
          color: "rgba(255,240,224,0.5)",
          fontFamily: "Monaco, Menlo, monospace",
          minWidth: 44,
          textAlign: "right",
        }}
      >
        {formatDuration(result.timeMs)}
      </Typography>

      <Typography
        sx={{
          fontSize: "0.78rem",
          fontWeight: 700,
          fontFamily: "Monaco, Menlo, monospace",
          color: delta > 0 ? GREEN : delta < 0 ? RED : "rgba(255,240,224,0.4)",
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
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.4 }}>
      {icon}
      <Typography sx={{ fontSize: "0.74rem", color: "rgba(255,240,224,0.55)" }}>
        {text}
      </Typography>
    </Box>
  );
}
