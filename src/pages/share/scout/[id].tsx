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
import { Masti, MastiSays } from "@/components/masti";
import type { ScoutSnapshotRecord } from "@/types/scoutSnapshot";
import type { OpeningSummary } from "@/types/scout";
import { PLATFORM_LABEL } from "@/components/scout/dossier";
import {
  ACCENT,
  FONT_MONO,
  LINE,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

interface ShareScoutProps {
  snapshot: ScoutSnapshotRecord | null;
}

// The page renders inside Layout, so buttons, the page background and the
// body text all come from buildChessMastiTheme().

const CARD_SX = {
  background: SURFACE.raised,
  border: `1px solid ${LINE.hairline}`,
  borderRadius: `${RADIUS.card}px`,
  p: 3,
} as const;

const SECTION_LABEL_SX = {
  ...TYPE.label,
  color: TEXT.secondary,
  mb: 1,
} as const;

function StatBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
        <Typography sx={{ fontSize: "0.85rem", color: TEXT.secondary }}>
          {label}
        </Typography>
        <Typography
          sx={{
            fontSize: "0.85rem",
            color: TEXT.primary,
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {Math.round(clamped)}
        </Typography>
      </Box>
      <Box
        sx={{
          width: "100%",
          height: 6,
          background: LINE.hairline,
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            width: `${clamped}%`,
            height: "100%",
            background: ACCENT.main,
            borderRadius: 3,
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
        background: SURFACE.raisedSecondary,
        border: `1px solid ${LINE.hairline}`,
        borderRadius: `${RADIUS.control}px`,
        p: 2,
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          mb: 1,
        }}
      >
        <Box>
          <Typography
            sx={{ color: TEXT.primary, fontWeight: 600, fontSize: "0.95rem" }}
          >
            {opening.name}
          </Typography>
          {opening.variation && (
            <Typography sx={{ color: TEXT.secondary, fontSize: "0.8rem" }}>
              {opening.variation}
            </Typography>
          )}
        </Box>
        <Typography
          sx={{
            color: TEXT.primary,
            fontWeight: 700,
            fontSize: "1rem",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {Math.round(opening.scorePct)}%
        </Typography>
      </Box>
      <Typography
        sx={{
          color: TEXT.secondary,
          fontSize: "0.75rem",
          fontFamily: FONT_MONO,
        }}
      >
        {opening.moves.slice(0, 6).join(" ")}
      </Typography>
      <Typography
        sx={{
          color: TEXT.secondary,
          fontSize: "0.75rem",
          mt: 0.5,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {opening.totalGames} games · {opening.wins}W / {opening.draws}D /{" "}
        {opening.losses}L
      </Typography>
    </Box>
  );
}

export default function ShareScoutPage({ snapshot }: ShareScoutProps) {
  if (!snapshot) {
    return (
      <Box sx={{ color: TEXT.primary, py: 8 }}>
        <Container maxWidth="md">
          <Masti
            mood="defeated"
            size={140}
            loops={2}
            decorative
            style={{ marginBottom: 16 }}
          />
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>
            Scout report not found
          </Typography>
          <Typography sx={{ color: TEXT.secondary, mb: 4 }}>
            This share may have been deleted or the link is incorrect.
          </Typography>
          <Button
            component={Link}
            href="/scout"
            variant="contained"
            size="large"
          >
            Scout someone yourself
          </Button>
        </Container>
      </Box>
    );
  }

  const { username, platform, analytics } = snapshot;
  const profile = analytics.profile;
  const tells = analytics.tells;
  const prepWhite = analytics.prep.asWhite.weaknesses.slice(0, 3);
  const prepBlack = analytics.prep.asBlack.weaknesses.slice(0, 3);
  const hasPrep = prepWhite.length > 0 || prepBlack.length > 0;
  const platformLabel = PLATFORM_LABEL[platform] ?? platform;
  const titleLine = `${username} · ${platformLabel}`;
  const description = `Scout report for ${username} on ${platformLabel}. Tells ${Math.round(
    tells.total
  )}/100, ${profile.totalGames} games analyzed.`;

  return (
    <>
      <Head>
        <title>{`${titleLine} · Scout report · Chess Masti`}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={`${titleLine} · Scout report`} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="article" />
        <meta
          property="og:url"
          content={`https://chessmasti.com/share/scout/${snapshot.id}`}
        />
        <meta
          property="og:image"
          content={`https://chessmasti.com/api/og/scout/${snapshot.id}`}
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${titleLine} · Scout report`} />
        <meta name="twitter:description" content={description} />
        <meta
          name="twitter:image"
          content={`https://chessmasti.com/api/og/scout/${snapshot.id}`}
        />
        <link
          rel="canonical"
          href={`https://chessmasti.com/share/scout/${snapshot.id}`}
        />
      </Head>

      <Box sx={{ color: TEXT.primary, py: { xs: 3, md: 6 } }}>
        <Container maxWidth="lg">
          {/* Header */}
          <Box sx={{ mb: 4, textAlign: "center" }}>
            <Typography
              component="h1"
              sx={{
                ...TYPE.h1,
                fontSize: { xs: "2rem", md: "3rem" },
                color: TEXT.primary,
                mb: 1,
              }}
            >
              {username}
            </Typography>
            <Typography
              sx={{ color: TEXT.secondary, fontVariantNumeric: "tabular-nums" }}
            >
              Scout report · {platformLabel} · {profile.totalGames} games ·{" "}
              {snapshot.months} months
            </Typography>
            {profile.archetype && (
              <Box
                sx={{
                  display: "inline-block",
                  mt: 2,
                  px: 1.5,
                  py: 0.5,
                  borderRadius: `${RADIUS.small}px`,
                  background: SURFACE.raisedSecondary,
                  color: TEXT.primary,
                  fontSize: "0.85rem",
                  fontWeight: 500,
                }}
              >
                {profile.archetype}
              </Box>
            )}
            {/* Masti fronts the report: a scout dossier is his idea of a
                good read, whoever it is about. Still on the server, one
                bounded burst after mount. */}
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                mt: 3,
                textAlign: "left",
              }}
            >
              <MastiSays
                mood="idea"
                size={88}
                priority
                maxWidth={440}
                data-testid="share-scout-masti"
              >
                I read {profile.totalGames} of {username}&apos;s games.{" "}
                {hasPrep
                  ? "Start with the tells, then take the openings below into your prep."
                  : "Start with the tells: that is where a player leaks."}
              </MastiSays>
            </Box>
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
            {/* Tells card */}
            <Box sx={CARD_SX}>
              <Typography sx={SECTION_LABEL_SX}>Tells</Typography>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 1.5,
                  mb: 2,
                }}
              >
                <Typography
                  sx={{
                    ...TYPE.display,
                    color: TEXT.primary,
                    lineHeight: 1,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {Math.round(tells.total)}
                </Typography>
                <Typography sx={{ color: TEXT.secondary }}>/ 100</Typography>
              </Box>
              <Typography
                sx={{ color: TEXT.secondary, mb: 2, fontSize: "0.9rem" }}
              >
                Predictability:{" "}
                <strong style={{ color: TEXT.primary }}>
                  {tells.predictability}
                </strong>
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {tells.factors.map((factor) => (
                  <StatBar
                    key={factor.id}
                    label={factor.label}
                    value={factor.score}
                  />
                ))}
              </Box>
            </Box>

            {/* Profile card */}
            <Box sx={CARD_SX}>
              <Typography sx={SECTION_LABEL_SX}>Profile</Typography>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 1.5,
                  mb: 2,
                }}
              >
                <Typography
                  sx={{
                    ...TYPE.display,
                    color: TEXT.primary,
                    lineHeight: 1,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {Math.round(profile.ovr)}
                </Typography>
                <Typography sx={{ color: TEXT.secondary }}>overall</Typography>
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
            <Box sx={{ ...CARD_SX, mb: 4 }}>
              <Typography sx={{ ...SECTION_LABEL_SX, mb: 2 }}>
                Recent form
              </Typography>
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                {profile.recent.map((r, i) => (
                  <Box
                    key={i}
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: `${RADIUS.small}px`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: TEXT.primary,
                      // Data colour: a win and a loss read apart at a glance,
                      // by a full-strength edge as well as the letter.
                      background:
                        r.outcome === "win"
                          ? STATUS.successTint
                          : r.outcome === "loss"
                            ? STATUS.errorTint
                            : SURFACE.raisedSecondary,
                      border: `1px solid ${
                        r.outcome === "win"
                          ? STATUS.success
                          : r.outcome === "loss"
                            ? STATUS.error
                            : LINE.hairline
                      }`,
                    }}
                  >
                    {r.outcome[0].toUpperCase()}
                  </Box>
                ))}
              </Box>
              <Typography
                sx={{ color: TEXT.secondary, fontSize: "0.85rem", mt: 1.5 }}
              >
                Win {Math.round(profile.winRate * 100)}% · Draw{" "}
                {Math.round(profile.drawRate * 100)}% · Loss{" "}
                {Math.round(profile.lossRate * 100)}%
              </Typography>
            </Box>
          )}

          {/* Exploitable openings */}
          {(prepWhite.length > 0 || prepBlack.length > 0) && (
            <Box sx={{ mb: 4 }}>
              <Typography
                component="h2"
                sx={{ ...TYPE.h3, color: TEXT.primary, mb: 2 }}
              >
                Exploitable openings
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                  gap: 2,
                }}
              >
                {prepWhite.length > 0 && (
                  <Box>
                    <Typography
                      sx={{ color: TEXT.secondary, fontSize: "0.85rem", mb: 1 }}
                    >
                      You play White
                    </Typography>
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 1.5,
                      }}
                    >
                      {prepWhite.map((o, i) => (
                        <OpeningRow key={i} opening={o} />
                      ))}
                    </Box>
                  </Box>
                )}
                {prepBlack.length > 0 && (
                  <Box>
                    <Typography
                      sx={{ color: TEXT.secondary, fontSize: "0.85rem", mb: 1 }}
                    >
                      You play Black
                    </Typography>
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 1.5,
                      }}
                    >
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
          <Box sx={{ ...CARD_SX, p: 4, textAlign: "center" }}>
            <Typography sx={{ ...TYPE.h3, color: TEXT.primary, mb: 1 }}>
              Scout your own opponent
            </Typography>
            <Typography sx={{ color: TEXT.secondary, mb: 3 }}>
              Paste any Lichess or Chess.com username. Get their tells, opening
              weaknesses, and tilt profile in seconds. Free.
            </Typography>
            <Box
              sx={{
                display: "flex",
                gap: 2,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <Button
                component={Link}
                href="/scout"
                variant="contained"
                size="large"
              >
                Scout an opponent
              </Button>
              <Button
                component={Link}
                href="/free-ai-chess-coach"
                variant="outlined"
                size="large"
              >
                Meet Masti, your chess coach
              </Button>
            </Box>
          </Box>
        </Container>
      </Box>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<ShareScoutProps> = async (
  ctx
) => {
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
