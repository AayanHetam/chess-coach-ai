import { Box, Button, Chip, Grid, Paper, Stack, Typography } from '@mui/material';
import { Icon } from '@iconify/react';

export interface ScoutLandingProps {
  onFocusSearch: () => void;
}

const STEPS = [
  {
    n: 1,
    icon: 'mdi:magnify',
    title: 'Search your rival',
    body: 'Enter any username from Lichess or Chess.com.',
  },
  {
    n: 2,
    icon: 'mdi:dna',
    title: 'Get their chess DNA',
    body: 'Analyzes thousands of games to surface their patterns.',
  },
  {
    n: 3,
    icon: 'mdi:target',
    title: 'Prepare & dominate',
    body: 'Personalized scouting report with exploitable lines.',
  },
];

export default function ScoutLanding({ onFocusSearch }: ScoutLandingProps) {
  return (
    <Box sx={{ py: { xs: 3, md: 6 } }}>
      <Grid container spacing={4} alignItems="center">
        <Grid size={{ xs: 12, md: 7 }}>
          <Chip
            icon={<Icon icon="mdi:star-four-points" width={14} />}
            label="NEW · Scout reports · 8 tools"
            sx={{
              bgcolor: 'rgba(249,115,22,0.18)',
              color: '#FB923C',
              border: '1px solid rgba(249,115,22,0.4)',
              fontWeight: 700,
              fontSize: '0.72rem',
              mb: 3,
              '& .MuiChip-icon': { color: '#FB923C' },
            }}
          />

          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '2.2rem', sm: '3rem', md: '3.6rem' },
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              color: 'text.primary',
              mb: 2,
            }}
          >
            Decode your{' '}
            <Box
              component="span"
              sx={{
                background: 'linear-gradient(135deg, #F97316 0%, #FB923C 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                position: 'relative',
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: -4,
                  height: 4,
                  borderRadius: 2,
                  background: 'linear-gradient(135deg, #F97316 0%, #FB923C 100%)',
                  opacity: 0.35,
                },
              }}
            >
              opponent&apos;s
            </Box>{' '}
            chess DNA
          </Typography>

          <Typography
            sx={{
              color: 'text.secondary',
              fontSize: '1.05rem',
              mb: 3.5,
              maxWidth: 560,
              lineHeight: 1.55,
            }}
          >
            Your next opponent has patterns, weaknesses, and secrets. We find them before you sit down to play.
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
            <Button
              variant="contained"
              size="large"
              startIcon={<Icon icon="mdi:binoculars" />}
              onClick={onFocusSearch}
              sx={{
                px: 3,
                py: 1.25,
                fontWeight: 700,
                fontSize: '0.95rem',
                textTransform: 'none',
                borderRadius: 2.5,
                bgcolor: '#F97316',
                color: '#0A0A0A',
                boxShadow: '0 6px 18px rgba(249,115,22,0.32)',
                '&:hover': {
                  bgcolor: '#FB923C',
                  boxShadow: '0 10px 28px rgba(249,115,22,0.45)',
                },
                '&.Mui-disabled': {
                  bgcolor: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.3)',
                },
              }}
            >
              Stalk your first opponent
            </Button>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'text.secondary' }}>
              <Icon icon="mdi:check-circle" style={{ color: '#FB923C' }} width={16} />
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                Free · No signup required
              </Typography>
            </Stack>
          </Stack>

          <Stack direction="row" spacing={{ xs: 2, sm: 4 }} sx={{ mt: 5, flexWrap: 'wrap', gap: 2 }}>
            <StatPill value="165K+" label="Scout reports" />
            <StatPill value="11M+" label="Games analyzed" />
            <StatPill value="2" label="Platforms supported" />
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Box sx={{ position: 'relative' }}>
            <Chip
              size="small"
              label="Live example"
              sx={{
                position: 'absolute',
                top: -14,
                right: 16,
                bgcolor: 'rgba(20,22,28,0.85)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                color: '#FB923C',
                fontWeight: 700,
                border: '1px solid rgba(249,115,22,0.4)',
                zIndex: 2,
                '&::before': {
                  content: '""',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: '#22c55e',
                  display: 'inline-block',
                  marginRight: 6,
                },
              }}
            />

            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: '1.5rem',
                border: '1px solid rgba(255,255,255,0.08)',
                background:
                  'linear-gradient(135deg, rgba(249,115,22,0.08), rgba(20,22,28,0.6))',
                backdropFilter: 'blur(14px) saturate(140%)',
                WebkitBackdropFilter: 'blur(14px) saturate(140%)',
                boxShadow:
                  '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
                overflow: 'hidden',
              }}
            >
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                <Box
                  sx={{
                    width: 54,
                    height: 54,
                    borderRadius: 2,
                    background:
                      'linear-gradient(135deg, rgba(40,44,55,0.9) 0%, rgba(20,22,28,0.9) 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FB923C',
                    flexShrink: 0,
                  }}
                >
                  <Icon icon="mdi:chess-king" width={30} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: 'rgba(255,255,255,0.94)' }}>
                    DragonSlayer99
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    6,527 games · 3 months
                  </Typography>
                </Box>
                <OvrRing value={73} />
              </Stack>

              <Chip
                icon={<Icon icon="mdi:fire" width={14} />}
                label="The Berserker"
                size="small"
                sx={{
                  bgcolor: 'rgba(249,115,22,0.18)',
                  color: '#FB923C',
                  border: '1px solid rgba(249,115,22,0.4)',
                  fontWeight: 700,
                  mb: 2,
                  '& .MuiChip-icon': { color: '#FB923C' },
                }}
              />

              <Grid container spacing={1.5} sx={{ mb: 2 }}>
                <StatMini label="ATK" value={79} color="#22c55e" />
                <StatMini label="DEF" value={73} color="#22c55e" />
                <StatMini label="TIME" value={73} color="#f59e0b" />
                <StatMini label="MIND" value={68} color="#ef4444" />
              </Grid>

              <Stack spacing={0.75}>
                <RatingRow icon="mdi:lightning-bolt" label="Bullet" rating={2183} />
                <RatingRow icon="mdi:fire" label="Blitz" rating={2172} />
                <RatingRow icon="mdi:timer-outline" label="Rapid" rating={2291} />
                <RatingRow icon="mdi:chess-queen" label="Classical" rating={1850} />
              </Stack>
            </Paper>
          </Box>
        </Grid>
      </Grid>

      {/* How it works */}
      <Box sx={{ mt: { xs: 6, md: 10 }, textAlign: 'center' }}>
        <Typography variant="overline" sx={{ letterSpacing: '0.14em', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>
          HOW IT WORKS
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 4 }}>
          Three steps to know your opponent better than they know themselves
        </Typography>
        <Grid container spacing={2.5} justifyContent="center">
          {STEPS.map((s, i) => (
            <Grid size={{ xs: 12, sm: 4 }} key={s.n}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  height: '100%',
                  borderRadius: '1.5rem',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(20,22,28,0.55)',
                  backdropFilter: 'blur(14px) saturate(140%)',
                  WebkitBackdropFilter: 'blur(14px) saturate(140%)',
                  boxShadow:
                    '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
                  overflow: 'hidden',
                  position: 'relative',
                  transition: 'all 180ms ease',
                  '&:hover': {
                    border: '1px solid rgba(249,115,22,0.35)',
                    transform: 'translateY(-2px)',
                    boxShadow:
                      '0 12px 28px rgba(0,0,0,0.4), 0 0 0 1px rgba(249,115,22,0.18), inset 0 1px 0 rgba(255,255,255,0.06)',
                  },
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    top: 16,
                    right: 16,
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    bgcolor: '#F97316',
                    color: '#0A0A0A',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                  }}
                >
                  {s.n}
                </Box>
                <Box sx={{ color: '#FB923C', mb: 1.5 }}>
                  <Icon icon={s.icon} width={36} />
                </Box>
                <Typography sx={{ fontWeight: 800, fontSize: '1rem', mb: 0.5, color: 'rgba(255,255,255,0.94)' }}>
                  {s.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                  {s.body}
                </Typography>
                {i < STEPS.length - 1 && (
                  <Box
                    sx={{
                      position: 'absolute',
                      right: -18,
                      top: '50%',
                      display: { xs: 'none', sm: 'block' },
                      color: '#FB923C',
                      opacity: 0.5,
                    }}
                  >
                    <Icon icon="mdi:arrow-right" width={28} />
                  </Box>
                )}
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Box>
    </Box>
  );
}

function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <Box>
      <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: '#FB923C', lineHeight: 1, fontFamily: 'Monaco, Menlo, monospace' }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
    </Box>
  );
}

function OvrRing({ value }: { value: number }) {
  const circumference = 2 * Math.PI * 22;
  const offset = circumference * (1 - value / 100);
  return (
    <Box sx={{ position: 'relative', width: 54, height: 54, flexShrink: 0 }}>
      <svg width={54} height={54} viewBox="0 0 54 54">
        <circle cx="27" cy="27" r="22" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
        <circle
          cx="27"
          cy="27"
          r="22"
          fill="none"
          stroke="#FB923C"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 27 27)"
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
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2 }}>
          OVR
        </Typography>
        <Typography sx={{ fontWeight: 800, fontSize: 14, color: '#FB923C', lineHeight: 1, fontFamily: 'Monaco, Menlo, monospace' }}>
          {value}
        </Typography>
      </Box>
    </Box>
  );
}

function StatMini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Grid size={3}>
      <Box sx={{ textAlign: 'center' }}>
        <Box sx={{ color }}>
          <Icon
            icon={
              label === 'ATK'
                ? 'mdi:sword-cross'
                : label === 'DEF'
                ? 'mdi:shield'
                : label === 'TIME'
                ? 'mdi:timer-outline'
                : 'mdi:brain'
            }
            width={14}
          />
        </Box>
        <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color, lineHeight: 1.1, fontFamily: 'Monaco, Menlo, monospace' }}>
          {value}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: '0.6rem', letterSpacing: 1.2, color: 'text.secondary', fontWeight: 700 }}>
          {label}
        </Typography>
        <Box sx={{ mt: 0.5, height: 2, borderRadius: 1, bgcolor: color, opacity: 0.6 }} />
      </Box>
    </Grid>
  );
}

function RatingRow({ icon, label, rating }: { icon: string; label: string; rating: number }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 1.25,
        py: 0.75,
        borderRadius: 1.5,
        bgcolor: 'rgba(255,255,255,0.04)',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <Box sx={{ color: '#FB923C' }}>
          <Icon icon={icon} width={14} />
        </Box>
        <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.72rem' }}>
          {label}
        </Typography>
      </Stack>
      <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', color: 'rgba(255,255,255,0.94)', fontFamily: 'Monaco, Menlo, monospace' }}>{rating}</Typography>
    </Box>
  );
}
