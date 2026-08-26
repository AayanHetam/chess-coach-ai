import { Box, Button, Stack, Tooltip, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import { ProfileSnapshot, Platform } from '@/types/scout';
import { strengthBand } from '@/lib/scoutAnalytics';
import {
  DossierPanel,
  EMBER,
  EMBER_LIGHT,
  FieldLabel,
  MONO,
  MeterRow,
  ROSE,
  VerdictPill,
  strengthColor,
} from './dossier';

export interface ProfileCardProps {
  username: string;
  platform: Platform;
  profile: ProfileSnapshot;
  onShare?: () => void;
}

// Full words, not gamer-card abbreviations. "COMPOSURE" tells a reader what the
// number means; "MIND" needs a tooltip to mean anything at all.
const DIMENSIONS: Array<{
  key: 'atk' | 'def' | 'time' | 'mind';
  label: string;
  tip: string;
}> = [
  {
    key: 'atk',
    label: 'Attack',
    tip: 'Attacking aggression — win rate, checkmate finishes, and quick decisive wins.',
  },
  {
    key: 'def',
    label: 'Defence',
    tip: 'Defensive resilience — avoiding losses and holding draws.',
  },
  {
    key: 'time',
    label: 'Clock',
    tip: 'Time management — fewer flag losses, steadier pacing.',
  },
  {
    key: 'mind',
    label: 'Composure',
    tip: 'Psychological composure — resistance to tilt and losing streaks.',
  },
];

const TIME_CONTROLS: Array<{
  key: 'bullet' | 'blitz' | 'rapid' | 'classical';
  label: string;
}> = [
  { key: 'bullet', label: 'Bullet' },
  { key: 'blitz', label: 'Blitz' },
  { key: 'rapid', label: 'Rapid' },
  { key: 'classical', label: 'Classical' },
];

export default function ProfileCard({
  username,
  platform,
  profile,
  onShare,
}: ProfileCardProps) {
  const form =
    profile.recentAccuracy >= 60
      ? { label: 'Hot', color: '#34d399' }
      : profile.recentAccuracy >= 45
      ? { label: 'Even', color: '#fbbf24' }
      : { label: 'Cold', color: '#f87171' };

  // The lowest dimension is the one you actually play into, so name it rather
  // than leaving the reader to compare four bars.
  const weakest = DIMENSIONS.reduce((lo, d) =>
    profile[d.key] < profile[lo.key] ? d : lo
  );

  const overallColor = strengthColor(profile.ovr);

  // The rating the strength score is anchored to — shown so the number is
  // checkable rather than asserted.
  const ratingValues = Object.values(profile.ratings).filter(
    (r): r is number => typeof r === 'number' && r > 0
  );
  const anchor = ratingValues.length ? Math.max(...ratingValues) : profile.peakRating;
  const band = anchor !== undefined ? strengthBand(anchor) : undefined;

  return (
    <DossierPanel
      label="Subject"
      emphasis
      action={<VerdictPill label={platform} color="rgba(255,255,255,0.5)" />}
    >
      {/* Identity block */}
      <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mb: 2.25 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: { xs: '1.4rem', sm: '1.6rem' },
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              color: 'rgba(255,255,255,0.96)',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              mb: 0.85,
            }}
          >
            {username}
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
                border: `1px solid ${ROSE.border}`,
                bgcolor: ROSE.tint,
              }}
            >
              <Box sx={{ color: ROSE.bright, display: 'flex' }}>
                <Icon icon={archetypeIcon(profile.archetype)} width={12} />
              </Box>
              <FieldLabel color={ROSE.bright} size="0.6rem">
                {profile.archetype}
              </FieldLabel>
            </Stack>
            <FieldLabel color="rgba(255,255,255,0.4)" size="0.6rem">
              {profile.totalGames.toLocaleString()} games
              {profile.spanDays > 0 && ` · ${profile.spanDays}d`}
            </FieldLabel>
          </Stack>
        </Box>

        {/* Overall — typographic, not a ring. Captioned with the band it came
            from, because a bare "98" invites "says who?". */}
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography
            sx={{
              fontFamily: MONO,
              fontSize: '2.6rem',
              fontWeight: 700,
              lineHeight: 0.85,
              color: overallColor,
              letterSpacing: '-0.04em',
              fontVariantNumeric: 'tabular-nums',
              textShadow: `0 0 26px ${overallColor}40`,
            }}
          >
            {profile.ovr}
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            <FieldLabel color="rgba(255,255,255,0.38)" size="0.57rem">
              Overall
            </FieldLabel>
          </Box>
          {band && (
            <Box sx={{ mt: 0.35 }}>
              <FieldLabel color={overallColor} size="0.55rem">
                {band}
              </FieldLabel>
            </Box>
          )}
        </Box>
      </Stack>

      {/* Strength profile — stacked meters share a baseline, so the shape of the
          player is legible at a glance instead of four isolated numbers. */}
      <Stack spacing={1.35} sx={{ mb: 1.25 }}>
        {DIMENSIONS.map(d => (
          <Tooltip key={d.key} title={d.tip} placement="left" arrow>
            <Box sx={{ cursor: 'help' }}>
              <MeterRow
                label={d.label}
                value={profile[d.key]}
                color={strengthColor(profile[d.key])}
                highlight={d.key === weakest.key}
              />
            </Box>
          </Tooltip>
        ))}
      </Stack>

      {/* One caption for the whole block, outside the meter grid, so the four
          rows keep an even rhythm. */}
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 2.25 }}>
        <Box sx={{ color: ROSE.bright, display: 'flex' }}>
          <Icon icon="mdi:target" width={12} />
        </Box>
        <FieldLabel color={ROSE.bright} size="0.58rem">
          Weakest link · {weakest.label} — play here
        </FieldLabel>
      </Stack>

      {/* Ratings strip */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 1,
          pt: 1.75,
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {TIME_CONTROLS.map(tc => {
          const rating = profile.ratings[tc.key];
          return (
            <Box key={tc.key} sx={{ textAlign: 'center' }}>
              <Typography
                sx={{
                  fontFamily: MONO,
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: rating ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.22)',
                  lineHeight: 1.2,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {rating ?? '—'}
              </Typography>
              <FieldLabel color="rgba(255,255,255,0.36)" size="0.55rem">
                {tc.label}
              </FieldLabel>
            </Box>
          );
        })}
      </Box>

      {/* Recent form */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{ mt: 1.75, pt: 1.75, borderTop: '1px solid rgba(255,255,255,0.07)' }}
      >
        <FieldLabel color="rgba(255,255,255,0.38)" size="0.57rem">
          Form
        </FieldLabel>

        <Stack direction="row" spacing={0.3} sx={{ flex: 1, alignItems: 'center', minWidth: 0 }}>
          {profile.recent.length === 0 ? (
            <FieldLabel color="rgba(255,255,255,0.25)" size="0.57rem">
              No recent games
            </FieldLabel>
          ) : (
            profile.recent.slice(-24).map((r, i) => (
              <Box
                key={i}
                sx={{
                  flex: 1,
                  maxWidth: 6,
                  height: r.outcome === 'win' ? 18 : r.outcome === 'draw' ? 9 : 18,
                  borderRadius: '1px',
                  alignSelf: r.outcome === 'loss' ? 'flex-end' : 'flex-start',
                  bgcolor:
                    r.outcome === 'win'
                      ? '#34d399'
                      : r.outcome === 'draw'
                      ? 'rgba(255,255,255,0.3)'
                      : '#f87171',
                  opacity: 0.55 + (i / 24) * 0.45,
                }}
              />
            ))
          )}
        </Stack>

        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
          <VerdictPill label={`${profile.recentAccuracy}% ${form.label}`} color={form.color} />
        </Stack>
      </Stack>

      {/* Rating range */}
      {(profile.peakRating !== undefined || profile.lowRating !== undefined) && (
        <Stack direction="row" spacing={2} sx={{ mt: 1.25 }}>
          {profile.peakRating !== undefined && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <FieldLabel color="rgba(255,255,255,0.32)" size="0.55rem">
                Peak
              </FieldLabel>
              <Typography
                sx={{ fontFamily: MONO, fontSize: '0.72rem', fontWeight: 700, color: '#34d399' }}
              >
                {profile.peakRating}
              </Typography>
            </Stack>
          )}
          {profile.lowRating !== undefined && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <FieldLabel color="rgba(255,255,255,0.32)" size="0.55rem">
                Floor
              </FieldLabel>
              <Typography
                sx={{ fontFamily: MONO, fontSize: '0.72rem', fontWeight: 700, color: '#f87171' }}
              >
                {profile.lowRating}
              </Typography>
            </Stack>
          )}
        </Stack>
      )}

      {onShare && (
        <Button
          fullWidth
          onClick={onShare}
          startIcon={<Icon icon="mdi:share-variant" width={17} />}
          sx={{
            mt: 2.25,
            py: 1.15,
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.9rem',
            color: '#0A0A0A',
            bgcolor: EMBER,
            boxShadow: '0 6px 18px rgba(249,115,22,0.3)',
            borderRadius: 2,
            transition: 'transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease',
            '&:hover': {
              bgcolor: EMBER_LIGHT,
              boxShadow: '0 8px 24px rgba(249,115,22,0.44)',
              transform: 'translateY(-1px)',
            },
          }}
        >
          Share this dossier
        </Button>
      )}
    </DossierPanel>
  );
}

function archetypeIcon(archetype: string): string {
  if (archetype.includes('Berserker')) return 'mdi:fire';
  if (archetype.includes('Fortress')) return 'mdi:shield';
  if (archetype.includes('Clockwork')) return 'mdi:clock-fast';
  if (archetype.includes('Stoic')) return 'mdi:brain';
  return 'mdi:star-four-points';
}
