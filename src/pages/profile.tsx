import { useCallback, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import Head from "next/head";
import { useRouter } from "next/router";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { PageTitle } from "@/components/pageTitle";
import { chessMastiDarkTheme } from "@/theme/chessMasti";
import { SERIF_DISPLAY } from "@/theme/fonts";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
import ProfileDialog from "@/components/auth/ProfileDialog";
import { PanelCard } from "@/components/performance/PanelCard";
import { PuzzlePerformanceCard } from "@/components/performance/PuzzlePerformanceCard";
import { RatingTrendCard } from "@/components/performance/RatingTrendCard";
import { RecentGamesCard } from "@/components/performance/RecentGamesCard";
import { useGameDatabase } from "@/hooks/useGameDatabase";
import { useAuth } from "@/contexts/AuthContext";
import { FOCUS_THEME_LABELS } from "@/components/onboarding/quizThemes";

/**
 * /profile — the performance dashboard.
 *
 * Rebuilt 2026-08-11 around one rule: every number on this page comes from a
 * store something actually writes to.
 *
 * What was removed and why: the old page read `gameRecordsAtom`, which has no
 * writer anywhere in the codebase. Four sections depended on it — "Games
 * Analyzed" (permanently 0), the win/draw/loss pie, the phase-accuracy bar
 * chart, and "Training Recommendations", which was generating generic advice
 * from an empty profile under a heading that claimed it was personalised. The
 * record and win rate now come from games fetched live from the user's linked
 * platforms, so they are real. Phase accuracy has no source at all and is gone
 * until one exists.
 *
 * Opening-drill progress moved off this page too — it is real (written by
 * /openings) but out of scope here, which is games and puzzles.
 */
export default function Profile() {
  const router = useRouter();
  const { user, profile: account, loading: authLoading } = useAuth();
  const { games: savedGames, deleteGame } = useGameDatabase(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const personalized = !!account?.onboardingCompletedAt;

  const handleDeleteSavedGame = useCallback(
    async (gameId: number) => {
      if (
        typeof window !== "undefined" &&
        !window.confirm(
          "Delete this saved game and its coach conversation? This can't be undone."
        )
      ) {
        return;
      }
      try {
        await deleteGame(gameId);
      } catch (err) {
        console.warn("[profile] delete saved game failed:", err);
      }
    },
    [deleteGame]
  );

  const sortedSavedGames = useMemo(
    () =>
      [...(savedGames ?? [])].sort((a, b) => {
        const da = (a.date ?? "").replace(/\./g, "-");
        const db = (b.date ?? "").replace(/\./g, "-");
        if (da && db && da !== db) return db.localeCompare(da);
        return (b.id ?? 0) - (a.id ?? 0);
      }),
    [savedGames]
  );

  return (
    <ThemeProvider theme={chessMastiDarkTheme}>
      <PageTitle title="Chess Masti AI - Performance" />
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#08090C" />
        <style>{`html,body{background-color:#08090C;color-scheme:dark;margin:0;}::-webkit-scrollbar{width:10px;height:10px;}::-webkit-scrollbar-track{background:#08090C;}::-webkit-scrollbar-thumb{background:rgba(249,115,22,0.18);border-radius:5px;}`}</style>
      </Head>

      <GradientBackdrop />

      <Box
        sx={{
          minHeight: "100vh",
          color: "rgba(255,255,255,0.94)",
          pt: 2,
          pb: 6,
          px: { xs: 2, md: 3 },
        }}
      >
        <NavPill active="profile" />

        <Box
          sx={{
            maxWidth: 1120,
            mx: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 2.5,
          }}
        >
          {/* Header. Serif for the page name, sans for everything else — the
              same content/chrome split the puzzle screen uses. */}
          <Box sx={{ mb: 0.5 }}>
            <Typography
              component="h1"
              sx={{
                fontFamily: SERIF_DISPLAY,
                fontSize: { xs: "1.9rem", md: "2.3rem" },
                fontWeight: 500,
                letterSpacing: "-0.02em",
                color: "rgba(255,255,255,0.96)",
                lineHeight: 1.15,
              }}
            >
              Performance
            </Typography>
            <Typography
              sx={{
                fontSize: "0.86rem",
                color: "rgba(255,255,255,0.45)",
                mt: 0.5,
              }}
            >
              How you&apos;re playing now — not how you played a year ago. Every
              panel windows to your recent work.
            </Typography>
          </Box>

          <PuzzlePerformanceCard />
          <RatingTrendCard />
          <RecentGamesCard onLinkAccount={() => setSettingsOpen(true)} />

          {/* Saved games — analysed games with their coach transcript intact.
              Distinct from Recent games above: these are yours on our side,
              those are pulled from the platforms. */}
          {user && (
            <PanelCard
              title="Saved analyses"
              subtitle={
                sortedSavedGames.length > 0
                  ? `${sortedSavedGames.length} saved game${sortedSavedGames.length === 1 ? "" : "s"}, coach conversations included`
                  : undefined
              }
              action={
                <Button
                  size="small"
                  onClick={() => router.push("/analysis")}
                  sx={{
                    textTransform: "none",
                    fontSize: "0.78rem",
                    color: "rgba(255,255,255,0.55)",
                    "&:hover": {
                      color: "#FB923C",
                      background: "rgba(249,115,22,0.06)",
                    },
                  }}
                >
                  Analyse a new game
                </Button>
              }
            >
              {sortedSavedGames.length === 0 ? (
                <Box
                  sx={{
                    p: 3,
                    textAlign: "center",
                    borderRadius: "0.9rem",
                    border: "1px dashed rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <Typography
                    sx={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.5)" }}
                  >
                    Nothing saved yet. Hit &ldquo;Analyze now&rdquo; on a game
                    above, then save it — the PGN, the engine eval, and the
                    whole coach conversation come back with it.
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ mx: -1.25 }}>
                  {sortedSavedGames.map((g) => {
                    const transcript = (
                      g as typeof g & {
                        coachTranscript?: Array<{
                          role: string;
                          content: string;
                        }>;
                      }
                    ).coachTranscript;
                    const transcriptCount = transcript?.length ?? 0;
                    return (
                      <Box
                        key={g.id}
                        sx={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0,1fr) auto auto",
                          alignItems: "center",
                          gap: 1.5,
                          px: 1.25,
                          py: 1.1,
                          borderRadius: "0.75rem",
                          transition: "background 160ms ease",
                          "&:hover": { background: "rgba(255,255,255,0.035)" },
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            sx={{
                              fontSize: "0.85rem",
                              color: "rgba(255,255,255,0.88)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {g.white?.name || "White"} vs{" "}
                            {g.black?.name || "Black"}
                          </Typography>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.75,
                              mt: 0.15,
                            }}
                          >
                            <Typography
                              sx={{
                                fontSize: "0.7rem",
                                color: "rgba(255,255,255,0.38)",
                              }}
                            >
                              {[g.event, g.date?.replace(/\./g, "-")]
                                .filter(Boolean)
                                .join(" · ") || "Saved game"}
                            </Typography>
                            {g.result && g.result !== "*" && (
                              <Chip
                                label={g.result}
                                size="small"
                                sx={{
                                  height: 16,
                                  fontSize: "0.62rem",
                                  background: "rgba(255,255,255,0.06)",
                                  color: "rgba(255,255,255,0.6)",
                                  fontFamily: "Monaco, Menlo, monospace",
                                }}
                              />
                            )}
                            {transcriptCount > 0 && (
                              <Tooltip
                                title={`${transcriptCount} coach message${transcriptCount === 1 ? "" : "s"} saved`}
                              >
                                <Box
                                  sx={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 0.3,
                                  }}
                                >
                                  <ForumOutlinedIcon
                                    sx={{ fontSize: 12, color: "#FB923C" }}
                                  />
                                  <Typography
                                    sx={{
                                      fontSize: "0.68rem",
                                      color: "#FB923C",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {transcriptCount}
                                  </Typography>
                                </Box>
                              </Tooltip>
                            )}
                          </Box>
                        </Box>

                        <Button
                          size="small"
                          onClick={() =>
                            router.push(`/analysis?gameId=${g.id}`)
                          }
                          sx={{
                            textTransform: "none",
                            fontSize: "0.76rem",
                            fontWeight: 600,
                            borderRadius: "0.6rem",
                            px: 1.25,
                            color: "#FB923C",
                            border: "1px solid rgba(249,115,22,0.32)",
                            background: "rgba(249,115,22,0.06)",
                            "&:hover": {
                              background: "rgba(249,115,22,0.14)",
                              borderColor: "rgba(249,115,22,0.5)",
                            },
                          }}
                        >
                          Open
                        </Button>

                        <IconButton
                          size="small"
                          aria-label="Delete saved game"
                          onClick={() => handleDeleteSavedGame(g.id)}
                          sx={{
                            color: "rgba(255,255,255,0.35)",
                            "&:hover": {
                              color: "#FCA5A5",
                              background: "rgba(239,68,68,0.1)",
                            },
                          }}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </PanelCard>
          )}

          {!user && !authLoading && (
            <PanelCard>
              <Typography
                sx={{
                  fontSize: "0.85rem",
                  color: "rgba(255,255,255,0.8)",
                  mb: 0.5,
                }}
              >
                Sign in to sync this dashboard across devices.
              </Typography>
              <Typography
                sx={{ fontSize: "0.76rem", color: "rgba(255,255,255,0.45)" }}
              >
                Your puzzle history is saved locally on this device either way.
                Signing in also lets us pull your chess.com and Lichess games in
                automatically.
              </Typography>
            </PanelCard>
          )}

          {/* Personalisation — moved to the bottom. It configures the coach
              rather than reporting performance, so it should not be the first
              thing between the user and their numbers. */}
          {user && (
            <PanelCard>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  flexWrap: "wrap",
                }}
              >
                <AutoAwesomeIcon sx={{ color: "#FB923C", fontSize: 20 }} />
                <Box sx={{ flex: 1, minWidth: 220 }}>
                  <Typography
                    sx={{
                      fontSize: "0.9rem",
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.9)",
                    }}
                  >
                    {personalized
                      ? "Your coaching profile"
                      : "Personalize your coaching"}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "0.78rem",
                      color: "rgba(255,255,255,0.45)",
                      mt: 0.25,
                    }}
                  >
                    {personalized
                      ? "Your coach is tuned to your level, goals, and focus areas."
                      : "A 2-minute quiz tunes your analysis, puzzles, and training plan."}
                  </Typography>
                  {personalized && !!account?.focusThemes?.length && (
                    <Box
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 0.6,
                        mt: 1,
                      }}
                    >
                      {account.focusThemes.slice(0, 6).map((t) => (
                        <Chip
                          key={t}
                          size="small"
                          label={
                            FOCUS_THEME_LABELS[
                              t as keyof typeof FOCUS_THEME_LABELS
                            ] ?? t
                          }
                          sx={{
                            height: 22,
                            bgcolor: "rgba(249,115,22,0.12)",
                            color: "#FDBA74",
                            fontSize: "0.7rem",
                          }}
                        />
                      ))}
                    </Box>
                  )}
                </Box>
                {/* No retake affordance. The quiz is one-time — /onboarding
                    redirects a completed user straight to /plan — so a
                    "Retake quiz" button would be a dead end. Carried over
                    from the behaviour main settled on in #290. */}
                {!personalized && (
                  <Button
                    onClick={() => router.push("/onboarding")}
                    sx={{
                      textTransform: "none",
                      fontWeight: 600,
                      fontSize: "0.8rem",
                      borderRadius: "0.6rem",
                      px: 2,
                      whiteSpace: "nowrap",
                      color: "#FB923C",
                      border: "1px solid rgba(249,115,22,0.4)",
                      "&:hover": { background: "rgba(249,115,22,0.1)" },
                    }}
                  >
                    Start quiz
                  </Button>
                )}
              </Box>
            </PanelCard>
          )}

          {/* Quick actions, as quiet links rather than four heavy buttons. */}
          <Box
            sx={{
              display: "flex",
              gap: 2.5,
              flexWrap: "wrap",
              justifyContent: "center",
              pt: 0.5,
            }}
          >
            {[
              { label: "Train puzzles", href: "/puzzles" },
              { label: "Puzzle sessions", href: "/puzzles/sessions" },
              { label: "Today's plan", href: "/plan" },
              { label: "Analyse a game", href: "/analysis" },
            ].map((a) => (
              <Button
                key={a.href}
                onClick={() => router.push(a.href)}
                sx={{
                  textTransform: "none",
                  fontSize: "0.8rem",
                  color: "rgba(255,255,255,0.45)",
                  minWidth: 0,
                  "&:hover": { color: "#FB923C", background: "transparent" },
                }}
              >
                {a.label}
              </Button>
            ))}
          </Box>
        </Box>
      </Box>

      <ProfileDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab="chess"
      />
    </ThemeProvider>
  );
}
