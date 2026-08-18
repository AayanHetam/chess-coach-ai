import { Box, Button, Grid, Stack, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import {
  DossierPanel,
  EMBER,
  EMBER_LIGHT,
  FieldLabel,
  MONO,
  MeterRow,
  SegmentedMeter,
  VerdictPill,
  strengthColor,
  tellColor,
} from './dossier';

export interface ScoutLandingProps {
  onFocusSearch: () => void;
}

const STEPS = [
  {
    n: '01',
    icon: 'mdi:account-search-outline',
    title: 'Name the opponent',
    body: 'Any public Chess.com or Lichess handle. No signup, no account linking.',
  },
  {
    n: '02',
    icon: 'mdi:file-document-multiple-outline',
    title: 'We read their games',
    body: 'Up to two years of history — openings, clock habits, and how they behave after a loss.',
  },
  {
    n: '03',
    icon: 'mdi:target-variant',
    title: 'Play the lines that hurt',
    body: 'Prep against their actual repertoire, plus a practice bot that mimics them.',
  },
];

// Verifiable properties of the product — not usage numbers.
const CAPABILITIES = [
  { icon: 'mdi:chess-pawn', label: 'Chess.com + Lichess' },
  { icon: 'mdi:calendar-range', label: 'Up to 2 years of games' },
  { icon: 'mdi:account-off-outline', label: 'No signup' },
];

export default function ScoutLanding({ onFocusSearch }: ScoutLandingProps) {
  return (
    <Box sx={{ py: { xs: 3, md: 6 } }}>
      <Grid container spacing={{ xs: 4, md: 6 }} alignItems="center">
        <Grid size={{ xs: 12, md: 7 }}>
          {/* Eyebrow */}
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{
              display: 'inline-flex',
              px: 1.25,
              py: 0.5,
              mb: 3,
              borderRadius: '5px',
              border: '1px solid rgba(249,115,22,0.38)',
              bgcolor: 'rgba(249,115,22,0.1)',
            }}
          >
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: EMBER,
                boxShadow: `0 0 8px ${EMBER}`,
              }}
            />
            <FieldLabel color={EMBER_LIGHT} size="0.62rem">
              Opponent dossier
            </FieldLabel>
          </Stack>

          <Typography
            variant="h1"
            sx={{
              fontSize: { xs: '2.4rem', sm: '3.1rem', md: '3.9rem' },
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: '-0.035em',
              color: 'rgba(255,255,255,0.96)',
              mb: 2.5,
            }}
          >
            Read your opponent
            <br />
            <Box
              component="span"
              sx={{
                color: EMBER_LIGHT,
                textShadow: '0 0 40px rgba(249,115,22,0.35)',
              }}
            >
              before move one.
            </Box>
          </Typography>

          <Typography
            sx={{
              color: 'rgba(255,255,255,0.62)',
              fontSize: '1.06rem',
              mb: 4,
              maxWidth: 540,
              lineHeight: 1.6,
            }}
          >
            Every player leaks patterns — a narrow repertoire, a clock that runs
            dry, a slide after the first loss. We read them out of their public
            games and hand you the lines to play.
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<Icon icon="mdi:binoculars" />}
              onClick={onFocusSearch}
              sx={{
                px: 3.25,
                py: 1.35,
                fontWeight: 700,
                fontSize: '0.95rem',
                textTransform: 'none',
                borderRadius: 2,
                bgcolor: EMBER,
                color: '#0A0A0A',
                boxShadow: '0 8px 24px rgba(249,115,22,0.34)',
                transition: 'transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease',
                '&:hover': {
                  bgcolor: EMBER_LIGHT,
                  boxShadow: '0 12px 32px rgba(249,115,22,0.46)',
                  transform: 'translateY(-1px)',
                },
              }}
            >
              Scout your first opponent
            </Button>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Icon icon="mdi:check-circle" style={{ color: '#34d399' }} width={16} />
              <Typography
                variant="caption"
                sx={{ fontWeight: 600, color: 'rgba(255,255,255,0.62)' }}
              >
                Free · no account needed
              </Typography>
            </Stack>
          </Stack>

          {/* Capability strip */}
          <Stack
            direction="row"
            spacing={3}
            sx={{ mt: 4.5, flexWrap: 'wrap', gap: 2, rowGap: 1.5 }}
          >
            {CAPABILITIES.map(c => (
              <Stack key={c.label} direction="row" spacing={0.85} alignItems="center">
                <Box sx={{ color: 'rgba(255,255,255,0.35)', display: 'flex' }}>
                  <Icon icon={c.icon} width={15} />
                </Box>
                <FieldLabel color="rgba(255,255,255,0.45)" size="0.63rem">
                  {c.label}
                </FieldLabel>
              </Stack>
            ))}
          </Stack>
        </Grid>

        {/* Sample dossier — same components as the real report, so the preview
            is an honest promise of what lands after a search. */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Box sx={{ position: 'relative' }}>
            <Box
              sx={{
                position: 'absolute',
                inset: -30,
                background:
                  'radial-gradient(circle at 60% 30%, rgba(249,115,22,0.16), transparent 68%)',
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />
            <Box sx={{ position: 'relative', zIndex: 1 }}>
              <SampleDossier />
            </Box>
          </Box>
        </Grid>
      </Grid>

      {/* How it works */}
      <Box sx={{ mt: { xs: 8, md: 12 } }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
          <FieldLabel color="rgba(255,255,255,0.4)">How it works</FieldLabel>
          <Box sx={{ flex: 1, height: '1px', bgcolor: 'rgba(255,255,255,0.09)' }} />
        </Stack>

        <Grid container spacing={2.5}>
          {STEPS.map(s => (
            <Grid size={{ xs: 12, sm: 4 }} key={s.n}>
              <DossierPanel sx={{ height: '100%' }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.75 }}>
                  <Typography
                    sx={{
                      fontFamily: MONO,
                      fontSize: '1.6rem',
                      fontWeight: 700,
                      color: 'rgba(249,115,22,0.42)',
                      lineHeight: 1,
                    }}
                  >
                    {s.n}
                  </Typography>
                  <Box sx={{ flex: 1, height: '1px', bgcolor: 'rgba(255,255,255,0.08)' }} />
                  <Box sx={{ color: EMBER_LIGHT, display: 'flex' }}>
                    <Icon icon={s.icon} width={22} />
                  </Box>
                </Stack>
                <Typography
                  sx={{
                    fontWeight: 700,
                    fontSize: '1.02rem',
                    mb: 0.85,
                    color: 'rgba(255,255,255,0.94)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {s.title}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: 'rgba(255,255,255,0.58)', lineHeight: 1.55 }}
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
  { label: 'Attack', value: 79 },
  { label: 'Defence', value: 73 },
  { label: 'Clock', value: 61 },
  { label: 'Composure', value: 48 },
];

const SAMPLE_TELLS = [
  { label: 'Limited repertoire', value: 80 },
  { label: 'Time trouble', value: 71 },
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
              fontWeight: 800,
              fontSize: '1.5rem',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              color: 'rgba(255,255,255,0.96)',
              mb: 0.85,
            }}
          >
            DragonSlayer99
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Stack
              direction="row"
              spacing={0.6}
              alignItems="center"
              sx={{
                px: 1,
                py: 0.3,
                borderRadius: '4px',
                border: '1px solid rgba(249,115,22,0.42)',
                bgcolor: 'rgba(249,115,22,0.12)',
              }}
            >
              <Box sx={{ color: EMBER_LIGHT, display: 'flex' }}>
                <Icon icon="mdi:fire" width={12} />
              </Box>
              <FieldLabel color={EMBER_LIGHT} size="0.6rem">
                The Berserker
              </FieldLabel>
            </Stack>
            <FieldLabel color="rgba(255,255,255,0.4)" size="0.6rem">
              6,527 games
            </FieldLabel>
          </Stack>
        </Box>

        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography
            sx={{
              fontFamily: MONO,
              fontSize: '2.3rem',
              fontWeight: 700,
              lineHeight: 0.85,
              color: strengthColor(66),
              letterSpacing: '-0.04em',
            }}
          >
            66
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            <FieldLabel color="rgba(255,255,255,0.38)" size="0.57rem">
              Overall
            </FieldLabel>
          </Box>
        </Box>
      </Stack>

      <Stack spacing={1.35} sx={{ mb: 2.5 }}>
        {SAMPLE_DIMS.map(d => (
          <MeterRow
            key={d.label}
            label={d.label}
            value={d.value}
            color={strengthColor(d.value)}
            highlight={d.label === 'Composure'}
          />
        ))}
      </Stack>

      <Box sx={{ pt: 2, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
          <FieldLabel color={EMBER_LIGHT} size="0.62rem">
            Tells
          </FieldLabel>
          <Box sx={{ flex: 1, height: '1px', bgcolor: 'rgba(249,115,22,0.2)' }} />
          <Stack direction="row" alignItems="baseline" spacing={0.25}>
            <Typography
              sx={{
                fontFamily: MONO,
                fontSize: '1.35rem',
                fontWeight: 700,
                color: tellColor(73),
                lineHeight: 1,
              }}
            >
              73
            </Typography>
            <Typography
              sx={{ fontFamily: MONO, fontSize: '0.7rem', color: 'rgba(255,255,255,0.34)' }}
            >
              /100
            </Typography>
          </Stack>
        </Stack>

        <Stack spacing={1.25}>
          {SAMPLE_TELLS.map(t => (
            <Box key={t.label}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 0.5 }}
              >
                <FieldLabel color="rgba(255,255,255,0.72)" size="0.63rem">
                  {t.label}
                </FieldLabel>
                <Typography
                  sx={{
                    fontFamily: MONO,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: tellColor(t.value),
                  }}
                >
                  {t.value}
                </Typography>
              </Stack>
              <SegmentedMeter value={t.value} color={tellColor(t.value)} segments={24} height={8} />
            </Box>
          ))}
        </Stack>
      </Box>
    </DossierPanel>
  );
}
