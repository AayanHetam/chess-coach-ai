import { Box, Button, Chip, Grid, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import { ProfileSnapshot, Platform } from '@/types/scout';

export interface ProfileCardProps {
  username: string;
  platform: Platform;
  profile: ProfileSnapshot;
  onShare?: () => void;
}

const STAT_META: Array<{
  key: 'atk' | 'def' | 'time' | 'mind';
  label: string;
  icon: string;
  tip: string;
}> = [
  { key: 'atk', label: 'ATK', icon: 'mdi:sword-cross', tip: 'Attacking aggression — win rate, checkmate finishes, and quick decisive wins.' },
  { key: 'def', label: 'DEF', icon: 'mdi:shield', tip: 'Defensive resilience — avoiding losses and holding draws.' },
  { key: 'time', label: 'TIME', icon: 'mdi:timer-outline', tip: 'Time management — fewer flag losses, steadier pacing.' },
  { key: 'mind', label: 'MIND', icon: 'mdi:brain', tip: 'Psychological composure — resistance to tilt and losing streaks.' },
];

const TC_META: Array<{
  key: 'bullet' | 'blitz' | 'rapid' | 'classical';
  label: string;
  icon: string;
  color: string;
}> = [
  { key: 'bullet', label: 'Bullet', icon: 'mdi:lightning-bolt', color: '#f59e0b' },
  { key: 'blitz', label: 'Blitz', icon: 'mdi:fire', color: '#FF6B35' },
  { key: 'rapid', label: 'Rapid', icon: 'mdi:timer-outline', color: '#22c55e' },
  { key: 'classical', label: 'Classical', icon: 'mdi:chess-queen', color: '#6366f1' },
];

function statColor(v: number): string {
  if (v >= 75) return '#22c55e';
  if (v >= 60) return '#84cc16';
  if (v >= 45) return '#f59e0b';
  return '#ef4444';
}

export default function ProfileCard({ username, platform, profile, onShare }: ProfileCardProps) {
  const recentPctClass = profile.recentAccuracy >= 60
    ? { label: 'Good', color: '#22c55e' }
    : profile.recentAccuracy >= 45
    ? { label: 'OK', color: '#f59e0b' }
    : { label: 'Cold', color: '#ef4444' };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        height: '100%',
      }}
    >
      {/* Header */}
      <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
        <Box
          sx={{
            width: 58,
            height: 58,
            borderRadius: 2,
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FF6B35',
            flexShrink: 0,
          }}
        >
          <Icon icon="mdi:chess-king" width={32} />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: '1.2rem',
              lineHeight: 1.1,
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            {username}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
            {profile.totalGames.toLocaleString()} games
            {profile.spanDays > 0 && ` · ${profile.spanDays} days`}
            {` · ${platform}`}
          </Typography>
          <Chip
            icon={<Icon icon={archetypeIcon(profile.archetype)} width={14} />}
            label={profile.archetype}
            size="small"
            sx={{
              bgcolor: 'rgba(255,107,53,0.12)',
              color: '#FF6B35',
              fontWeight: 700,
              fontSize: '0.72rem',
              '& .MuiChip-icon': { color: '#FF6B35' },
            }}
          />
        </Box>

        <Stack direction="column" alignItems="center" spacing={0.5}>
          <OvrRing value={profile.ovr} />
        </Stack>
      </Stack>

      {/* Stat row: ATK / DEF / TIME / MIND */}
      <Grid container spacing={1.25} sx={{ mb: 2 }}>
        {STAT_META.map(meta => {
          const value = profile[meta.key];
          const color = statColor(value);
          return (
            <Grid size={3} key={meta.key}>
              <Tooltip title={meta.tip} arrow>
                <Box
                  sx={{
                    textAlign: 'center',
                    p: 1,
                    borderRadius: 2,
                    bgcolor: 'rgba(0,0,0,0.02)',
                    transition: 'all 0.15s',
                    '&:hover': { bgcolor: 'rgba(255,107,53,0.06)' },
                  }}
                >
                  <Box sx={{ color, mb: 0.25 }}>
                    <Icon icon={meta.icon} width={16} />
                  </Box>
                  <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color, lineHeight: 1.1 }}>
                    {value}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: '0.62rem',
                      letterSpacing: 1.2,
                      color: 'text.secondary',
                      fontWeight: 700,
                    }}
                  >
                    {meta.label}
                  </Typography>
                  <Box sx={{ mt: 0.5, height: 3, borderRadius: 1, bgcolor: color, opacity: 0.75 }} />
                </Box>
              </Tooltip>
            </Grid>
          );
        })}
      </Grid>

      {/* Time-control ratings */}
      <Grid container spacing={1} sx={{ mb: 2 }}>
        {TC_META.map(tc => {
          const rating = profile.ratings[tc.key];
          return (
            <Grid size={6} key={tc.key}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 1.25,
                  py: 0.85,
                  borderRadius: 1.5,
                  bgcolor: 'rgba(0,0,0,0.025)',
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ color: tc.color }}>
                    <Icon icon={tc.icon} width={14} />
                  </Box>
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>
                    {tc.label}
                  </Typography>
                </Stack>
                <Typography sx={{ fontWeight: 800, fontSize: '0.9rem' }}>
                  {rating ?? '—'}
                </Typography>
              </Box>
            </Grid>
          );
        })}
      </Grid>

      {/* Recent form */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          pt: 1.5,
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Chip
          label={
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Icon icon="mdi:arrow-top-right-thin" width={14} />
              <span style={{ fontWeight: 700, fontSize: '0.72rem' }}>
                {profile.recentAccuracy}% {recentPctClass.label}
              </span>
            </Stack>
          }
          size="small"
          sx={{
            bgcolor: `${recentPctClass.color}1a`,
            color: recentPctClass.color,
            fontWeight: 700,
            '& .MuiChip-label': { px: 1 },
          }}
        />

        <Stack direction="row" spacing={0.35}>
          {profile.recent.length === 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              No recent form
            </Typography>
          ) : (
            profile.recent.slice(-20).map((r, i) => (
              <Box
                key={i}
                sx={{
                  width: 4,
                  height: r.outcome === 'win' ? 16 : r.outcome === 'draw' ? 10 : 16,
                  borderRadius: 1,
                  bgcolor:
                    r.outcome === 'win'
                      ? '#22c55e'
                      : r.outcome === 'draw'
                      ? '#9ca3af'
                      : '#ef4444',
                }}
              />
            ))
          )}
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center">
          {profile.peakRating !== undefined && (
            <Typography
              variant="caption"
              sx={{ color: '#22c55e', fontWeight: 700, fontSize: '0.75rem' }}
            >
              {profile.peakRating}↑
            </Typography>
          )}
          {profile.latestRating !== undefined && (
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>
              {profile.latestRating}
            </Typography>
          )}
          {profile.lowRating !== undefined && (
            <Typography
              variant="caption"
              sx={{ color: '#ef4444', fontWeight: 700, fontSize: '0.75rem' }}
            >
              {profile.lowRating}↓
            </Typography>
          )}
        </Stack>
      </Box>

      {/* Prominent share CTA — drives the viral loop */}
      {onShare && (
        <Button
          fullWidth
          onClick={onShare}
          startIcon={<Icon icon="mdi:share-variant" width={18} />}
          sx={{
            mt: 2,
            py: 1.25,
            textTransform: 'none',
            fontWeight: 800,
            fontSize: '0.95rem',
            color: '#fff',
            background: 'linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)',
            boxShadow: '0 6px 18px rgba(255,107,53,0.32)',
            borderRadius: 2,
            transition: 'transform 0.12s ease, box-shadow 0.12s ease',
            '&:hover': {
              background: 'linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)',
              boxShadow: '0 8px 22px rgba(255,107,53,0.44)',
              transform: 'translateY(-1px)',
            },
          }}
        >
          Share &amp; flex this scout
        </Button>
      )}
    </Paper>
  );
}

function archetypeIcon(archetype: string): string {
  if (archetype.includes('Berserker')) return 'mdi:fire';
  if (archetype.includes('Fortress')) return 'mdi:shield';
  if (archetype.includes('Clockwork')) return 'mdi:clock-fast';
  if (archetype.includes('Stoic')) return 'mdi:brain';
  return 'mdi:star-four-points';
}

function OvrRing({ value }: { value: number }) {
  const R = 26;
  const circumference = 2 * Math.PI * R;
  const offset = circumference * (1 - value / 100);
  const color = value >= 75 ? '#22c55e' : value >= 60 ? '#FF6B35' : value >= 45 ? '#f59e0b' : '#ef4444';
  return (
    <Box sx={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
      <svg width={64} height={64} viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 32 32)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
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
        <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.secondary', letterSpacing: 1.2 }}>
          OVR
        </Typography>
        <Typography sx={{ fontWeight: 800, fontSize: 17, color, lineHeight: 1 }}>
          {value}
        </Typography>
      </Box>
    </Box>
  );
}
