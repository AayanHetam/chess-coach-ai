// Public scout share page — anyone with the snapshot ID can view, no auth.
// Reuses the existing scout snapshot infrastructure
// (src/lib/scoutSnapshots.ts, /api/scouts/[id]) — we just add a dedicated
// public-facing URL so share links don't dump people into the app's
// interactive scout UI.

import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { Box, Container, Typography, Button } from "@mui/material";
import { getScoutSnapshot } from "@/lib/scoutSnapshots";
import type { ScoutSnapshotRecord } from "@/types/scoutSnapshot";
import type { OpeningSummary } from "@/types/scout";

interface ShareScoutProps {
  snapshot: ScoutSnapshotRecord | null;
}

const BG = "#08080f";
const SURFACE = "rgba(255,255,255,0.04)";
const BORDER = "rgba(255,255,255,0.08)";
const EMBER = "#FF6B2B";

function StatBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
        <Typography sx={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.65)" }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: "0.85rem", color: "#fff", fontWeight: 600 }}>
          {Math.round(clamped)}
        </Typography>
      </Box>
      <Box
        sx={{
          width: "100%",
          height: 6,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            width: `${clamped}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${EMBER}, #ff8050)`,
            borderRadius: 999,
          }}
        />
      </Box>
    </Box>
  );
}

function OpeningRow({ opening }: { opening: OpeningSummary }) {
  return (
    <Box
      sx={{
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        borderRadius: "0.75rem",
        p: 2,
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
        <Box>
          <Typography sx={{ color: "#fff", fontWeight: 600, fontSize: "0.95rem" }}>
            {opening.name}
          </Typography>
          {opening.variation && (
            <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.8rem" }}>
              {opening.variation}
            </Typography>
          )}
        </Box>
        <Typography sx={{ color: EMBER, fontWeight: 700, fontSize: "1rem" }}>
          {Math.round(opening.scorePct)}%
        </Typography>
      </Box>
      <Typography
        sx={{
          color: "rgba(255,255,255,0.55)",
          fontSize: "0.75rem",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        {opening.moves.slice(0, 6).join(" ")}
      </Typography>
      <Typography sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.75rem", mt: 0.5 }}>
        {opening.totalGames} games · {opening.wins}W / {opening.draws}D / {opening.losses}L
      </Typography>
    </Box>
  );
}

export default function ShareScoutPage({ snapshot }: ShareScoutProps) {
  if (!snapshot) {
    return (
      <Box sx={{ background: BG, minHeight: "100vh", color: "#fff", py: 8 }}>
        <Container maxWidth="md">
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>
            Scout report not found
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.6)", mb: 4 }}>
            This share may have been deleted or the link is incorrect.
          </Typography>
          <Button
            component={Link}
            href="/scout"
            variant="contained"
            sx={{ background: EMBER, "&:hover": { background: "#ff8050" } }}
          >
            Scout someone yourself
          </Button>
        </Container>
      </Box>
    );
  }

  const { username, platform, analytics } = snapshot;
  const profile = analytics.profile;
  const stalker = analytics.stalker;
  const prepWhite = analytics.prep.asWhite.weaknesses.slice(0, 3);
  const prepBlack = analytics.prep.asBlack.weaknesses.slice(0, 3);
  const titleLine = `${username} · ${platform}`;
  const description = `Scout report for ${username} on ${platform}. Stalker Score ${Math.round(
    stalker.total
  )}/100, ${profile.totalGames} games analyzed.`;

  return (
    <>
      <Head>
        <title>{`${titleLine} — Scout Report — Chess Masti AI`}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={`${titleLine} — Scout Report`} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={`https://chessmasti.com/share/scout/${snapshot.id}`} />
        <meta property="og:image" content={`https://chessmasti.com/api/og/scout/${snapshot.id}`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${titleLine} — Scout Report`} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={`https://chessmasti.com/api/og/scout/${snapshot.id}`} />
        <link rel="canonical" href={`https://chessmasti.com/share/scout/${snapshot.id}`} />
      </Head>

      <Box sx={{ background: BG, minHeight: "100vh", color: "rgba(255,255,255,0.85)", py: { xs: 3, md: 6 } }}>
        <Container maxWidth="lg">
          {/* Header */}
          <Box sx={{ mb: 4, textAlign: "center" }}>
            <Typography
              sx={{
                fontSize: "0.75rem",
                letterSpacing: 2,
                color: EMBER,
                fontWeight: 700,
                mb: 1,
              }}
            >
              SCOUT REPORT
            </Typography>
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: "2rem", md: "3rem" },
                fontWeight: 800,
                color: "#fff",
                mb: 1,
              }}
            >
              {username}
            </Typography>
            <Typography sx={{ color: "rgba(255,255,255,0.55)" }}>
              {platform} · {profile.totalGames} games · {snapshot.months} months
            </Typography>
            {profile.archetype && (
              <Box
                sx={{
                  display: "inline-block",
                  mt: 2,
                  px: 2,
                  py: 0.5,
                  borderRadius: 999,
                  background: SURFACE,
                  border: `1px solid ${BORDER}`,
                  color: "rgba(255,255,255,0.7)",
                  fontSize: "0.85rem",
                }}
              >
                {profile.archetype}
              </Box>
            )}
          </Box>

          {/* Two-column layout */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: 3,
              mb: 4,
            }}
          >
            {/* Stalker Score card */}
            <Box
              sx={{
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                borderRadius: "1rem",
                p: 3,
              }}
            >
              <Typography sx={{ color: EMBER, fontSize: "0.75rem", letterSpacing: 1.5, fontWeight: 700, mb: 1 }}>
                STALKER SCORE
              </Typography>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, mb: 2 }}>
                <Typography sx={{ color: "#fff", fontSize: "3.5rem", fontWeight: 800, lineHeight: 1 }}>
                  {Math.round(stalker.total)}
                </Typography>
                <Typography sx={{ color: "rgba(255,255,255,0.5)" }}>/ 100</Typography>
              </Box>
              <Typography sx={{ color: "rgba(255,255,255,0.7)", mb: 2, fontSize: "0.9rem" }}>
                Predictability: <strong style={{ color: "#fff" }}>{stalker.predictability}</strong>
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {stalker.factors.map((factor) => (
                  <StatBar key={factor.id} label={factor.label} value={factor.score} />
                ))}
              </Box>
            </Box>

            {/* Profile card */}
            <Box
              sx={{
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                borderRadius: "1rem",
                p: 3,
              }}
            >
              <Typography sx={{ color: EMBER, fontSize: "0.75rem", letterSpacing: 1.5, fontWeight: 700, mb: 1 }}>
                PROFILE
              </Typography>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, mb: 2 }}>
                <Typography sx={{ color: "#fff", fontSize: "3.5rem", fontWeight: 800, lineHeight: 1 }}>
                  {Math.round(profile.ovr)}
                </Typography>
                <Typography sx={{ color: "rgba(255,255,255,0.5)" }}>OVR</Typography>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <StatBar label="Attack" value={profile.atk} />
                <StatBar label="Defense" value={profile.def} />
                <StatBar label="Time" value={profile.time} />
                <StatBar label="Composure" value={profile.mind} />
              </Box>
            </Box>
          </Box>

          {/* Recent form */}
          {profile.recent && profile.recent.length > 0 && (
            <Box
              sx={{
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                borderRadius: "1rem",
                p: 3,
                mb: 4,
              }}
            >
              <Typography sx={{ color: EMBER, fontSize: "0.75rem", letterSpacing: 1.5, fontWeight: 700, mb: 2 }}>
                RECENT FORM
              </Typography>
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                {profile.recent.map((r, i) => (
                  <Box
                    key={i}
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: 0.75,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      color: "#fff",
                      background:
                        r.outcome === "win"
                          ? "rgba(34, 197, 94, 0.3)"
                          : r.outcome === "loss"
                            ? "rgba(239, 68, 68, 0.3)"
                            : "rgba(148, 163, 184, 0.3)",
                      border: `1px solid ${
                        r.outcome === "win"
                          ? "rgba(34, 197, 94, 0.5)"
                          : r.outcome === "loss"
                            ? "rgba(239, 68, 68, 0.5)"
                            : "rgba(148, 163, 184, 0.5)"
                      }`,
                    }}
                  >
                    {r.outcome[0].toUpperCase()}
                  </Box>
                ))}
              </Box>
              <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.85rem", mt: 1.5 }}>
                Win {Math.round(profile.winRate * 100)}% · Draw {Math.round(profile.drawRate * 100)}% · Loss {Math.round(profile.lossRate * 100)}%
              </Typography>
            </Box>
          )}

          {/* Exploitable openings */}
          {(prepWhite.length > 0 || prepBlack.length > 0) && (
            <Box sx={{ mb: 4 }}>
              <Typography
                component="h2"
                sx={{ fontWeight: 700, color: "#fff", fontSize: "1.25rem", mb: 2 }}
              >
                Exploitable openings
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                {prepWhite.length > 0 && (
                  <Box>
                    <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.85rem", mb: 1 }}>
                      You play White
                    </Typography>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                      {prepWhite.map((o, i) => (
                        <OpeningRow key={i} opening={o} />
                      ))}
                    </Box>
                  </Box>
                )}
                {prepBlack.length > 0 && (
                  <Box>
                    <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.85rem", mb: 1 }}>
                      You play Black
                    </Typography>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                      {prepBlack.map((o, i) => (
                        <OpeningRow key={i} opening={o} />
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>
          )}

          {/* CTA */}
          <Box
            sx={{
              background: SURFACE,
              border: `1px solid ${EMBER}33`,
              borderRadius: "1rem",
              p: 4,
              textAlign: "center",
            }}
          >
            <Typography sx={{ fontWeight: 700, color: "#fff", fontSize: "1.5rem", mb: 1 }}>
              Scout your own opponent
            </Typography>
            <Typography sx={{ color: "rgba(255,255,255,0.65)", mb: 3 }}>
              Paste any Lichess or Chess.com username. Get the Stalker Score, opening weaknesses,
              and tilt profile in seconds. Free.
            </Typography>
            <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
              <Button
                component={Link}
                href="/scout"
                variant="contained"
                sx={{
                  background: EMBER,
                  fontWeight: 700,
                  px: 3,
                  py: 1.25,
                  textTransform: "none",
                  fontSize: "1rem",
                  "&:hover": { background: "#ff8050" },
                }}
              >
                Scout an opponent
              </Button>
              <Button
                component={Link}
                href="/free-ai-chess-coach"
                variant="outlined"
                sx={{
                  borderColor: BORDER,
                  color: "rgba(255,255,255,0.75)",
                  fontWeight: 600,
                  px: 3,
                  py: 1.25,
                  textTransform: "none",
                  fontSize: "1rem",
                  "&:hover": { borderColor: "rgba(255,255,255,0.25)", color: "#fff" },
                }}
              >
                Try the AI coach
              </Button>
            </Box>
          </Box>
        </Container>
      </Box>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<ShareScoutProps> = async (ctx) => {
  const rawId = ctx.params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || typeof id !== "string" || id.length > 64) {
    return { props: { snapshot: null } };
  }
  try {
    const snapshot = await getScoutSnapshot(id);
    return { props: { snapshot } };
  } catch (err) {
    console.error("[share/scout] getServerSideProps", err);
    return { props: { snapshot: null } };
  }
};
