import { Box, Button, Grid, Stack, Typography } from "@mui/material";
import { Icon } from "@iconify/react";
import { SIGN_IN_PROPS } from "@/components/ads/PartnerSlot";
import {
  DossierPanel,
  FieldLabel,
  MeterRow,
  ROSE,
  SegmentedMeter,
  VerdictPill,
  strengthColor,
  tellColor,
} from "./dossier";
import { LINE, RADIUS, STATUS, TEXT, TYPE } from "@/theme/tokens";

export interface ScoutLandingProps {
  onFocusSearch: () => void;
}

const STEPS = [
  {
    n: "01",
    icon: "mdi:account-search-outline",
    title: "Name the opponent",
    body: "Any public Chess.com or Lichess handle: nothing to connect or link on their end.",
  },
  {
    n: "02",
    icon: "mdi:file-document-multiple-outline",
    title: "We read their games",
    body: "Up to two years of history: openings, clock habits, and how they behave after a loss.",
  },
  {
    n: "03",
    icon: "mdi:target-variant",
    title: "Play the lines that hurt",
    body: "Prep against their actual repertoire, plus a practice bot that mimics them.",
  },
];

// Verifiable properties of the product — not usage numbers.
const CAPABILITIES = [
  { icon: "mdi:chess-pawn", label: "Chess.com + Lichess" },
  { icon: "mdi:calendar-range", label: "Up to 2 years of games" },
  { icon: "mdi:account-off-outline", label: "No opponent account needed" },
];

export default function ScoutLanding({ onFocusSearch }: ScoutLandingProps) {
  return (
    <Box sx={{ py: { xs: 3, md: 6 } }}>
      <Grid container spacing={{ xs: 4, md: 6 }} alignItems="center">
        <Grid size={{ xs: 12, md: 7 }}>
          <Typography
            variant="h1"
            sx={{
              ...TYPE.display,
              fontSize: { xs: "2.4rem", sm: "3.1rem", md: "3.9rem" },
              lineHeight: 1.05,
              color: TEXT.primary,
              mb: 2.5,
            }}
          >
            Read your opponent
            <br />
            before move one.
          </Typography>

          <Typography
            sx={{
              color: TEXT.secondary,
              fontSize: "1.06rem",
              mb: 4,
              maxWidth: 540,
              lineHeight: 1.6,
            }}
          >
            Every player leaks patterns: a narrow repertoire, a clock that runs
            dry, a slide after the first loss. We read them out of their public
            games and hand you the lines to play.
          </Typography>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ sm: "center" }}
          >
            <Button
              variant="outlined"
              size="large"
              startIcon={<Icon icon="mdi:binoculars" />}
              onClick={onFocusSearch}
            >
              Scout your first opponent
            </Button>
            <Stack
              // Hidden under the ChessUSA preview prefix. See SIGN_IN_ATTR.
              {...SIGN_IN_PROPS}
              direction="row"
              spacing={0.75}
              alignItems="center"
            >
              <Icon
                icon="mdi:check-circle"
                style={{ color: STATUS.success }}
                width={16}
              />
              <Typography
                variant="caption"
                sx={{ fontWeight: 600, color: TEXT.secondary }}
              >
                Free · quick sign-in
              </Typography>
            </Stack>
          </Stack>

          {/* Capability strip */}
          <Stack
            direction="row"
            spacing={3}
            sx={{ mt: 4.5, flexWrap: "wrap", gap: 2, rowGap: 1.5 }}
          >
            {CAPABILITIES.map((c) => (
              <Stack
                key={c.label}
                direction="row"
                spacing={0.85}
                alignItems="center"
              >
                <Box sx={{ color: TEXT.secondary, display: "flex" }}>
                  <Icon icon={c.icon} width={16} />
                </Box>
                <FieldLabel>{c.label}</FieldLabel>
              </Stack>
            ))}
          </Stack>
        </Grid>

        {/* Sample dossier — same components as the real report, so the preview
            is an honest promise of what lands after a search. */}
        <Grid size={{ xs: 12, md: 5 }}>
          <SampleDossier />
        </Grid>
      </Grid>

      {/* How it works */}
      <Box sx={{ mt: { xs: 8, md: 12 } }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
          <FieldLabel>How it works</FieldLabel>
          <Box sx={{ flex: 1, height: "1px", bgcolor: LINE.hairline }} />
        </Stack>

        <Grid container spacing={2.5}>
          {STEPS.map((s) => (
            <Grid size={{ xs: 12, sm: 4 }} key={s.n}>
              <DossierPanel sx={{ height: "100%" }}>
                <Stack
                  direction="row"
                  spacing={1.5}
                  alignItems="center"
                  sx={{ mb: 1.75 }}
                >
                  <Typography
                    sx={{
                      fontSize: "1.6rem",
                      fontWeight: 700,
                      color: TEXT.tertiary,
                      lineHeight: 1,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {s.n}
                  </Typography>
                  <Box
                    sx={{ flex: 1, height: "1px", bgcolor: LINE.hairline }}
                  />
                  <Box sx={{ color: ROSE.bright, display: "flex" }}>
                    <Icon icon={s.icon} width={20} />
                  </Box>
                </Stack>
                <Typography
                  sx={{
                    ...TYPE.h5,
                    mb: 0.85,
                    color: TEXT.primary,
                  }}
                >
                  {s.title}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: TEXT.secondary, lineHeight: 1.55 }}
                >
                  {s.body}
                </Typography>
              </DossierPanel>
            </Grid>
          ))}
        </Grid>
      </Box>
    </Box>
  );
}

// ─── Sample dossier ─────────────────────────────────────────────────────────

const SAMPLE_DIMS = [
  { label: "Attack", value: 79 },
  { label: "Defence", value: 73 },
  { label: "Clock", value: 61 },
  { label: "Composure", value: 48 },
];

const SAMPLE_TELLS = [
  { label: "Limited repertoire", value: 80 },
  { label: "Time trouble", value: 71 },
];

function SampleDossier() {
  return (
    <DossierPanel
      label="Sample dossier"
      emphasis
      action={<VerdictPill label="Example" color="rgba(255,255,255,0.45)" />}
    >
      <Stack direction="row" alignItems="flex-start" sx={{ mb: 2.25 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              ...TYPE.h3,
              fontSize: "1.5rem",
              fontWeight: 700,
              lineHeight: 1.05,
              color: TEXT.primary,
              mb: 0.85,
            }}
          >
            DragonSlayer99
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
          >
            <Stack
              direction="row"
              spacing={0.6}
              alignItems="center"
              sx={{
                px: 1,
                py: 0.3,
                borderRadius: `${RADIUS.small}px`,
                bgcolor: ROSE.soft,
              }}
            >
              <Box sx={{ color: ROSE.bright, display: "flex" }}>
                <Icon icon="mdi:fire" width={12} />
              </Box>
              <FieldLabel color={ROSE.bright}>The Berserker</FieldLabel>
            </Stack>
            <FieldLabel>6,527 games</FieldLabel>
          </Stack>
        </Box>

        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
          <Typography
            sx={{
              ...TYPE.h1,
              fontSize: "2.3rem",
              lineHeight: 0.85,
              color: strengthColor(66),
              fontVariantNumeric: "tabular-nums",
            }}
          >
            66
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            <FieldLabel>Overall</FieldLabel>
          </Box>
        </Box>
      </Stack>

      <Stack spacing={1.35} sx={{ mb: 2.5 }}>
        {SAMPLE_DIMS.map((d) => (
          <MeterRow
            key={d.label}
            label={d.label}
            value={d.value}
            color={strengthColor(d.value)}
            highlight={d.label === "Composure"}
          />
        ))}
      </Stack>

      <Box sx={{ pt: 2, borderTop: `1px solid ${LINE.hairline}` }}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{ mb: 1.5 }}
        >
          <FieldLabel color={TEXT.primary}>Tells</FieldLabel>
          <Box sx={{ flex: 1, height: "1px", bgcolor: LINE.hairline }} />
          <Stack direction="row" alignItems="baseline" spacing={0.25}>
            <Typography
              sx={{
                fontSize: "1.35rem",
                fontWeight: 700,
                color: tellColor(73),
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              73
            </Typography>
            <Typography
              sx={{
                fontSize: "0.75rem",
                color: TEXT.secondary,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              /100
            </Typography>
          </Stack>
        </Stack>

        <Stack spacing={1.25}>
          {SAMPLE_TELLS.map((t) => (
            <Box key={t.label}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 0.5 }}
              >
                <FieldLabel color={TEXT.primary}>{t.label}</FieldLabel>
                <Typography
                  sx={{
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    color: tellColor(t.value),
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {t.value}
                </Typography>
              </Stack>
              <SegmentedMeter
                value={t.value}
                color={tellColor(t.value)}
                segments={24}
                height={8}
              />
            </Box>
          ))}
        </Stack>
      </Box>
    </DossierPanel>
  );
}
