import { Box, Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import { StalkerScore } from '@/types/scout';

export interface StalkerScoreCardProps {
  stalker: StalkerScore;
}

const FACTOR_META: Record<
  StalkerScore['factors'][number]['id'],
  { icon: string; tip: string }
> = {
  time_trouble: {
    icon: 'mdi:clock-alert-outline',
    tip: 'How often they lose on time or grind into long flag-danger endgames.',
  },
  tilts: {
    icon: 'mdi:emoticon-confused-outline',
    tip: 'Tendency to string losses after a loss — rapid tilt spirals.',
  },
  limited_rep: {
    icon: 'mdi:book-open-variant',
    tip: 'How narrow their opening repertoire is — few first moves = predictable.',
  },
  repetitive: {
    icon: 'mdi:repeat',
    tip: 'Share of games concentrated in their top-3 first moves.',
  },
};

function factorColor(v: number): string {
  if (v >= 70) return '#ef4444';
  if (v >= 50) return '#f59e0b';
  if (v >= 35) return '#FB923C';
  return '#22c55e';
}

function predictabilityColor(p: StalkerScore['predictability']): string {
  if (p === 'High') return '#ef4444';
  if (p === 'Medium') return '#FB923C';
  return '#22c55e';
}

export default function StalkerScoreCard({ stalker }: StalkerScoreCardProps) {
  const predColor = predictabilityColor(stalker.predictability);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: '1.5rem',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(20,22,28,0.55)',
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        boxShadow:
          '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
        overflow: 'hidden',
        height: '100%',
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Icon icon="mdi:eye-outline" width={20} style={{ color: '#FB923C' }} />
          <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: 'rgba(255,255,255,0.94)' }}>
            Stalker Score
          </Typography>
          <Tooltip title="How exploitable this opponent is. Higher = easier to prep against." arrow>
            <Box sx={{ color: 'rgba(255,255,255,0.5)', display: 'flex', cursor: 'help' }}>
              <Icon icon="mdi:help-circle-outline" width={14} />
            </Box>
          </Tooltip>
        </Stack>
        <Chip
          size="small"
          label={`Predictability ${stalker.predictability}`}
          sx={{
            bgcolor: `${predColor}1a`,
            color: predColor,
            fontWeight: 700,
            fontSize: '0.7rem',
          }}
        />
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems="center">
        <StalkerGauge value={stalker.total} />

        <Box sx={{ flex: 1, width: '100%' }}>
          <Stack spacing={1.25}>
            {stalker.factors.map(factor => (
              <FactorRow
                key={factor.id}
                icon={FACTOR_META[factor.id].icon}
                label={factor.label}
                value={factor.score}
                tip={FACTOR_META[factor.id].tip}
              />
            ))}
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
}

function StalkerGauge({ value }: { value: number }) {
  // Three-quarter arc gauge like chessstalker reference.
  const R = 52;
  const ARC_LEN = 2 * Math.PI * R * 0.75; // 270°
  const offset = ARC_LEN * (1 - value / 100);
  const color = value >= 70 ? '#ef4444' : value >= 50 ? '#FB923C' : value >= 30 ? '#f59e0b' : '#22c55e';

  return (
    <Box sx={{ position: 'relative', width: 132, height: 132, flexShrink: 0 }}>
      <svg width={132} height={132} viewBox="0 0 132 132" style={{ transform: 'rotate(135deg)' }}>
        <circle
          cx="66"
          cy="66"
          r={R}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${ARC_LEN} ${ARC_LEN * 2}`}
        />
        <circle
          cx="66"
          cy="66"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${ARC_LEN} ${ARC_LEN * 2}`}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
        />
      </svg>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography sx={{ fontSize: '2.25rem', fontWeight: 800, color, lineHeight: 1 }}>
          {value}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: 0.5 }}
        >
          /100
        </Typography>
      </Box>
    </Box>
  );
}

function FactorRow({
  icon,
  label,
  value,
  tip,
}: {
  icon: string;
  label: string;
  value: number;
  tip: string;
}) {
  const color = factorColor(value);
  return (
    <Tooltip title={tip} placement="left" arrow>
      <Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ color: 'text.secondary' }}>
              <Icon icon={icon} width={14} />
            </Box>
            <Typography
              variant="caption"
              sx={{ fontWeight: 600, fontSize: '0.78rem', color: 'rgba(255,255,255,0.94)' }}
            >
              {label}
            </Typography>
          </Stack>
          <Typography sx={{ fontWeight: 800, color, fontSize: '0.9rem' }}>{value}</Typography>
        </Stack>
        <Box
          sx={{
            height: 5,
            borderRadius: 2,
            bgcolor: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              width: `${value}%`,
              height: '100%',
              borderRadius: 2,
              bgcolor: color,
              transition: 'width 0.6s ease',
            }}
          />
        </Box>
      </Box>
    </Tooltip>
  );
}
