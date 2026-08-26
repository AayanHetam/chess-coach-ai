import { Box, Stack, Tooltip, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import type { HeadToHead, DimensionComparison, RatingPoint } from '@/lib/scout/headToHead';
import { biggestEdge, biggestGap, ratingTrend } from '@/lib/scout/headToHead';
import {
  DossierPanel,
  FieldLabel,
  MONO,
  ROSE,
  VerdictPill,
} from './dossier';

export interface HeadToHeadPanelProps {
  h2h: HeadToHead;
  comparison: DimensionComparison[];
  series: RatingPoint[];
  yourName: string;
  theirName: string;
}

const GOOD = '#34d399';
const BAD = '#f87171';

export default function HeadToHeadPanel({
  h2h,
  comparison,
  series,
  yourName,
  theirName,
}: HeadToHeadPanelProps) {
  const yourPct = Math.round(h2h.expected * 100);
  const theirPct = 100 - yourPct;
  const edge = biggestEdge(comparison);
  const gap = biggestGap(comparison);
  const favoured = h2h.gap > 0;

  return (
    <DossierPanel
      label={`Head to head · ${yourName} vs ${theirName}`}
      emphasis
      action={
        h2h.timeClass ? (
          <VerdictPill label={h2h.timeClass} color="rgba(255,255,255,0.45)" />
        ) : undefined
      }
    >
      {/* Expected score */}
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between" sx={{ mb: 1 }}>
        <Box>
          <FieldLabel color="rgba(255,255,255,0.38)" size="0.57rem">
            You · {h2h.yourRating}
          </FieldLabel>
          <Typography
            sx={{
              fontFamily: MONO,
              fontSize: '2.1rem',
              fontWeight: 700,
              lineHeight: 1,
              color: favoured ? BAD : GOOD,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {yourPct}%
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <FieldLabel color="rgba(255,255,255,0.38)" size="0.57rem">
            {theirName} · {h2h.theirRating}
          </FieldLabel>
          <Typography
            sx={{
              fontFamily: MONO,
              fontSize: '2.1rem',
              fontWeight: 700,
              lineHeight: 1,
              color: 'rgba(255,255,255,0.55)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {theirPct}%
          </Typography>
        </Box>
      </Stack>

      {/* Odds bar */}
      <Tooltip
        arrow
        title="Elo expected score. Draws count as half, so this is not a win probability."
      >
        <Box
          sx={{
            display: 'flex',
            height: 10,
            borderRadius: '3px',
            overflow: 'hidden',
            bgcolor: 'rgba(255,255,255,0.07)',
            cursor: 'help',
            mb: 1,
          }}
        >
          <Box
            sx={{
              width: `${yourPct}%`,
              bgcolor: favoured ? BAD : GOOD,
              transition: 'width 420ms ease',
            }}
          />
        </Box>
      </Tooltip>

      <Typography sx={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.62)', lineHeight: 1.45 }}>
        {h2h.gap === 0 ? (
          'Dead even on rating.'
        ) : (
          <>
            {favoured ? `${theirName} is` : 'You are'}{' '}
            <Box component="span" sx={{ color: 'rgba(255,255,255,0.92)', fontWeight: 600 }}>
              {Math.abs(h2h.gap)} points
            </Box>{' '}
            ahead — expect to score {yourPct} in 100.
          </>
        )}
      </Typography>

      {/* A self-reported rating is not evidence, and the odds inherit that. */}
      {h2h.yourRatingSource === 'self-reported' && (
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1 }}>
          <Box sx={{ color: '#fbbf24', display: 'flex' }}>
            <Icon icon="mdi:alert-outline" width={12} />
          </Box>
          <FieldLabel color="#fbbf24" size="0.55rem">
            Based on your self-reported rating
          </FieldLabel>
        </Stack>
      )}

      {/* Where the edge is */}
      <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <FieldLabel color="rgba(255,255,255,0.38)" size="0.57rem">
          Profile edge
        </FieldLabel>
        <Stack spacing={1.1} sx={{ mt: 1.25 }}>
          {comparison.map(c => (
            <DeltaRow key={c.key} cmp={c} />
          ))}
        </Stack>

        {edge && gap && (
          <Stack direction="row" spacing={2} sx={{ mt: 1.75, flexWrap: 'wrap', gap: 1.25 }}>
            {edge.delta > 0 && (
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Box sx={{ color: ROSE.bright, display: 'flex' }}>
                  <Icon icon="mdi:target" width={12} />
                </Box>
                <FieldLabel color={ROSE.bright} size="0.55rem">
                  Steer toward {edge.label.toLowerCase()}
                </FieldLabel>
              </Stack>
            )}
            {gap.delta < 0 && (
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Box sx={{ color: 'rgba(255,255,255,0.5)', display: 'flex' }}>
                  <Icon icon="mdi:shield-outline" width={12} />
                </Box>
                <FieldLabel color="rgba(255,255,255,0.5)" size="0.55rem">
                  Avoid {gap.label.toLowerCase()}
                </FieldLabel>
              </Stack>
            )}
          </Stack>
        )}
      </Box>

      {/* Their trajectory */}
      {series.length > 1 && (
        <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <FieldLabel color="rgba(255,255,255,0.38)" size="0.57rem">
              {theirName}&apos;s trajectory
            </FieldLabel>
            <TrendChip series={series} />
          </Stack>
          <Sparkline series={series} />
        </Box>
      )}
    </DossierPanel>
  );
}

function DeltaRow({ cmp }: { cmp: DimensionComparison }) {
  const mine = cmp.delta > 0;
  const magnitude = Math.min(50, Math.abs(cmp.delta));
  const width = (magnitude / 50) * 50; // % of half-width

  return (
    <Stack direction="row" alignItems="center" spacing={1.25}>
      <Box sx={{ width: 78, flexShrink: 0 }}>
        <FieldLabel color="rgba(255,255,255,0.62)" size="0.58rem">
          {cmp.label}
        </FieldLabel>
      </Box>

      {/* Diverging bar: left of centre is theirs, right is yours. */}
      <Box sx={{ flex: 1, position: 'relative', height: 10, minWidth: 0 }}>
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '3px',
            bgcolor: 'rgba(255,255,255,0.05)',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: '1px',
            bgcolor: 'rgba(255,255,255,0.22)',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            top: 1,
            bottom: 1,
            borderRadius: '2px',
            bgcolor: mine ? GOOD : BAD,
            opacity: 0.85,
            ...(mine
              ? { left: '50%', width: `${width}%` }
              : { right: '50%', width: `${width}%` }),
            transition: 'width 380ms ease',
          }}
        />
      </Box>

      <Typography
        sx={{
          fontFamily: MONO,
          fontSize: '0.76rem',
          fontWeight: 700,
          color: mine ? GOOD : BAD,
          width: 34,
          textAlign: 'right',
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {cmp.delta > 0 ? '+' : ''}
        {cmp.delta}
      </Typography>
    </Stack>
  );
}

function TrendChip({ series }: { series: RatingPoint[] }) {
  const trend = ratingTrend(series);
  if (trend === null) return null;
  const rising = trend > 0;
  const color = trend === 0 ? 'rgba(255,255,255,0.5)' : rising ? GOOD : BAD;
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Box sx={{ color, display: 'flex' }}>
        <Icon icon={rising ? 'mdi:trending-up' : trend === 0 ? 'mdi:trending-neutral' : 'mdi:trending-down'} width={13} />
      </Box>
      <Typography sx={{ fontFamily: MONO, fontSize: '0.75rem', fontWeight: 700, color }}>
        {trend > 0 ? '+' : ''}
        {trend}
      </Typography>
    </Stack>
  );
}

/**
 * Rating over time. Replaces the win/loss blocks, which showed 24 results but
 * not the shape — whether they are climbing into this game or sliding.
 */
function Sparkline({ series }: { series: RatingPoint[] }) {
  const W = 100;
  const H = 30;
  const ratings = series.map(p => p.rating);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const span = Math.max(1, max - min);

  const pts = series.map((p, i) => {
    const x = (i / (series.length - 1)) * W;
    const y = H - ((p.rating - min) / span) * H;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const trend = ratingTrend(series) ?? 0;
  const stroke = trend > 0 ? GOOD : trend < 0 ? BAD : ROSE.base;

  return (
    <Box sx={{ position: 'relative' }}>
      <Box
        component="svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        sx={{ width: '100%', height: 48, display: 'block', overflow: 'visible' }}
      >
        <polyline
          points={pts.join(' ')}
          fill="none"
          stroke={stroke}
          strokeWidth={1.4}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </Box>
      {/* Endpoints, not min/max. On a left-to-right time axis a reader takes
          the two end labels as "started here, ended here" — and those are the
          numbers the trend chip is the difference of. */}
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
        <FieldLabel color="rgba(255,255,255,0.3)" size="0.53rem">
          {series[0].rating}
        </FieldLabel>
        <FieldLabel color="rgba(255,255,255,0.3)" size="0.53rem">
          {series[series.length - 1].rating}
        </FieldLabel>
      </Stack>
    </Box>
  );
}
