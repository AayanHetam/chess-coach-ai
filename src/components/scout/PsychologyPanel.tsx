import { Box, Grid, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import { PsychologySnapshot, RecentFormBucket } from '@/types/scout';

export interface PsychologyPanelProps {
  psychology: PsychologySnapshot;
  recentBuckets: RecentFormBucket[];
}

export default function PsychologyPanel({ psychology, recentBuckets }: PsychologyPanelProps) {
  const rows: Array<{
    label: string;
    value: string;
    icon: string;
    tip: string;
    color: string;
  }> = [
    {
      label: 'Avg game length',
      value: `${Math.round(psychology.avgGameLength)} plies`,
      icon: 'mdi:timer-sand',
      tip: 'Average plies per game — higher = grinds long games.',
      color: '#6366f1',
    },
    {
      label: 'Timeouts',
      value: `${Math.round(psychology.timeoutRate * 100)}%`,
      icon: 'mdi:clock-alert-outline',
      tip: 'Share of losses that ended on the clock.',
      color: psychology.timeoutRate > 0.15 ? '#ef4444' : '#f59e0b',
    },
    {
      label: 'Quick losses',
      value: `${Math.round(psychology.quickLossRate * 100)}%`,
      icon: 'mdi:flash',
      tip: 'Losses under 50 plies — vulnerable to tactics & traps.',
      color: psychology.quickLossRate > 0.2 ? '#ef4444' : '#f59e0b',
    },
    {
      label: 'Win by mate',
      value: `${Math.round(psychology.checkmateRate * 100)}%`,
      icon: 'mdi:sword-cross',
      tip: 'Share of wins finished by checkmate — attacking bias.',
      color: '#22c55e',
    },
    {
      label: 'Longest win streak',
      value: `${psychology.maxWinStreak}`,
      icon: 'mdi:trophy-outline',
      tip: 'Longest consecutive win streak in window.',
      color: '#22c55e',
    },
    {
      label: 'Longest loss streak',
      value: `${psychology.maxLossStreak}`,
      icon: 'mdi:emoticon-confused-outline',
      tip: 'Longest consecutive loss streak — tilt signal.',
      color: psychology.maxLossStreak >= 4 ? '#ef4444' : '#f59e0b',
    },
  ];

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
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Icon icon="mdi:brain" width={20} style={{ color: '#FF6B35' }} />
        <Typography sx={{ fontWeight: 800, fontSize: '1rem' }}>Psychology & Recent</Typography>
      </Stack>

      <Grid container spacing={1} sx={{ mb: 2 }}>
        {rows.map(r => (
          <Grid size={{ xs: 6 }} key={r.label}>
            <Tooltip title={r.tip} arrow>
              <Box
                sx={{
                  p: 1.25,
                  borderRadius: 2,
                  bgcolor: 'rgba(0,0,0,0.02)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Box sx={{ color: r.color, display: 'flex' }}>
                  <Icon icon={r.icon} width={18} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', lineHeight: 1 }}>
                    {r.label}
                  </Typography>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: r.color, lineHeight: 1.1 }}>
                    {r.value}
                  </Typography>
                </Box>
              </Box>
            </Tooltip>
          </Grid>
        ))}
      </Grid>

      <Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.5, color: 'text.secondary' }}>
            RECENT FORM (groups of 10, oldest → newest)
          </Typography>
        </Stack>
        {recentBuckets.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No recent games to plot.
          </Typography>
        ) : (
          <Stack direction="row" spacing={0.5} alignItems="flex-end" sx={{ height: 64 }}>
            {recentBuckets.map((b, i) => {
              const total = Math.max(1, b.wins + b.draws + b.losses);
              return (
                <Tooltip
                  key={i}
                  title={`Games ${b.label} · W ${b.wins} / D ${b.draws} / L ${b.losses}`}
                  arrow
                >
                  <Box
                    sx={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column-reverse',
                      height: '100%',
                      bgcolor: 'rgba(0,0,0,0.04)',
                      borderRadius: 1,
                      overflow: 'hidden',
                      cursor: 'help',
                    }}
                  >
                    <Box sx={{ height: `${(b.wins / total) * 100}%`, bgcolor: '#22c55e' }} />
                    <Box sx={{ height: `${(b.draws / total) * 100}%`, bgcolor: '#9ca3af' }} />
                    <Box sx={{ height: `${(b.losses / total) * 100}%`, bgcolor: '#ef4444' }} />
                  </Box>
                </Tooltip>
              );
            })}
          </Stack>
        )}
      </Box>
    </Paper>
  );
}
