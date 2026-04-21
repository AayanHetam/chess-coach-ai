// ─────────────────────────────────────────────────────────────────────────────
// LichessLivePlay
//
// Top-level orchestrator for the "play on Lichess from inside ChessMasti" flow.
// Renders one of four sub-views driven by the hook's `phase`:
//
//   idle     →  connect + seek-setup card
//   seeking  →  "searching for opponent" spinner with cancel
//   playing  →  <LichessLiveBoard /> embedded, fully playable
//   finished →  board with result overlay + "play another" CTA
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { Icon } from '@iconify/react';
import { useLichessLiveGame, SeekOptions } from '@/hooks/useLichessLiveGame';
import { useScreenSize } from '@/hooks/useScreenSize';
import LichessLiveBoard from './LichessLiveBoard';

/* ── Time-control presets ─────────────────────────────────────────────────── */
const TIME_CONTROLS: Array<{
  label: string;
  time: number;
  increment: number;
  speed: string;
  icon: string;
}> = [
  { label: '1+0',  time: 1,  increment: 0,  speed: 'bullet',    icon: 'mdi:bullet' },
  { label: '2+1',  time: 2,  increment: 1,  speed: 'bullet',    icon: 'mdi:bullet' },
  { label: '3+0',  time: 3,  increment: 0,  speed: 'blitz',     icon: 'mdi:lightning-bolt' },
  { label: '3+2',  time: 3,  increment: 2,  speed: 'blitz',     icon: 'mdi:lightning-bolt' },
  { label: '5+0',  time: 5,  increment: 0,  speed: 'blitz',     icon: 'mdi:lightning-bolt' },
  { label: '5+3',  time: 5,  increment: 3,  speed: 'blitz',     icon: 'mdi:lightning-bolt' },
  { label: '10+0', time: 10, increment: 0,  speed: 'rapid',     icon: 'mdi:rabbit' },
  { label: '10+5', time: 10, increment: 5,  speed: 'rapid',     icon: 'mdi:rabbit' },
  { label: '15+10',time: 15, increment: 10, speed: 'rapid',     icon: 'mdi:rabbit' },
  { label: '30+0', time: 30, increment: 0,  speed: 'classical', icon: 'mdi:turtle' },
];

const SPEED_LABEL: Record<string, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
};

export default function LichessLivePlay() {
  const screen = useScreenSize();
  const {
    authenticated,
    user,
    authChecked,
    phase,
    game,
    gameState,
    yourColor,
    streamError,
    connect,
    disconnect,
    seekGame,
    cancelSeek,
    makeMove,
    resign,
    abort,
    offerDraw,
    reset,
  } = useLichessLiveGame();

  // Form state for the lobby.
  const [tc, setTc] = useState(TIME_CONTROLS[3]); // 3+2 default
  const [rated, setRated] = useState(true);
  const [color, setColor] = useState<'random' | 'white' | 'black'>('random');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Parse query params from the OAuth callback for a one-shot toast.
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const lichess = url.searchParams.get('lichess');
    if (lichess === 'connected') {
      setBanner({ kind: 'ok', msg: 'Lichess connected. Ready to play!' });
    } else if (lichess === 'error') {
      const reason = url.searchParams.get('reason') ?? 'unknown';
      setBanner({ kind: 'err', msg: `Lichess sign-in failed (${reason}).` });
    }
    if (lichess) {
      url.searchParams.delete('lichess');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const boardSize = useMemo(() => {
    const width = screen.width;
    const height = screen.height;
    if (typeof window === 'undefined') return 520;
    if (window.innerWidth < 900) return Math.min(width - 24, height - 200);
    return Math.min(Math.min(width - 360, 720), height * 0.74);
  }, [screen]);

  /* ── Not authenticated ─────────────────────────────────────────────────── */
  if (authChecked && !authenticated) {
    return (
      <Box sx={{ maxWidth: 480, mx: 'auto' }}>
        <Stack spacing={4} alignItems="center" sx={{ py: 6 }}>
          {/* Logo / hero */}
          <Box
            sx={{
              width: 88,
              height: 88,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(255,107,53,0.25)',
            }}
          >
            <Icon icon="simple-icons:lichess" width={44} style={{ color: '#fff' }} />
          </Box>

          <Stack spacing={1} alignItems="center" textAlign="center">
            <Typography sx={{ fontWeight: 900, fontSize: '1.6rem', lineHeight: 1.2 }}>
              Play live on Lichess
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 340 }}>
              Real opponents. Real ratings. Powered by Lichess, played right here on ChessMasti.
            </Typography>
          </Stack>

          {banner && (
            <Alert
              severity={banner.kind === 'ok' ? 'success' : 'error'}
              onClose={() => setBanner(null)}
              sx={{ width: '100%' }}
            >
              {banner.msg}
            </Alert>
          )}

          {/* Features */}
          <Stack
            spacing={2}
            sx={{
              width: '100%',
              bgcolor: 'rgba(255,107,53,0.04)',
              borderRadius: 3,
              p: 2.5,
            }}
          >
            <FeaturePill icon="mdi:earth" text="Play real opponents worldwide" />
            <FeaturePill icon="mdi:lightning-bolt" text="Bullet, Blitz, Rapid & Classical" />
            <FeaturePill icon="mdi:chart-line" text="Your Lichess rating updates normally" />
            <FeaturePill icon="mdi:shield-check-outline" text="Secure OAuth — no passwords stored" />
          </Stack>

          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={connect}
            startIcon={<Icon icon="simple-icons:lichess" />}
            sx={{
              textTransform: 'none',
              fontWeight: 800,
              py: 1.6,
              fontSize: '1.05rem',
              borderRadius: 3,
              background: 'linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)',
              boxShadow: '0 4px 20px rgba(255,107,53,0.3)',
              '&:hover': {
                background: 'linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)',
                boxShadow: '0 6px 24px rgba(255,107,53,0.4)',
              },
            }}
          >
            Connect with Lichess
          </Button>

          <Typography variant="caption" color="text.secondary">
            <Icon
              icon="mdi:lock-outline"
              width={12}
              style={{ verticalAlign: 'middle', marginRight: 4 }}
            />
            Only <strong>board:play</strong> and <strong>challenge</strong> scopes. Revoke any time
            from Lichess settings.
          </Typography>
        </Stack>
      </Box>
    );
  }

  /* ── Playing / finished ────────────────────────────────────────────────── */
  if ((phase === 'playing' || phase === 'finished') && game && gameState && yourColor) {
    return (
      <Stack spacing={2} alignItems="center" sx={{ width: '100%' }}>
        {streamError && (
          <Alert severity="warning" sx={{ alignSelf: 'stretch' }}>
            {streamError} — trying to reconnect…
          </Alert>
        )}
        <LichessLiveBoard
          game={game}
          state={gameState}
          yourColor={yourColor}
          boardSize={boardSize}
          onMakeMove={makeMove}
          onResign={resign}
          onAbort={abort}
          onOfferDraw={offerDraw}
          onExit={reset}
        />
      </Stack>
    );
  }

  /* ── Seeking ───────────────────────────────────────────────────────────── */
  if (phase === 'seeking') {
    return (
      <Box sx={{ maxWidth: 520, mx: 'auto' }}>
        <Stack spacing={3} alignItems="center" sx={{ py: 4 }}>
          {/* Top status */}
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                bgcolor: '#FF6B35',
                animation: 'pulse 1.4s ease-in-out infinite',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                  '50%': { opacity: 0.5, transform: 'scale(0.85)' },
                },
              }}
            />
            <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>
              Waiting for opponent…
            </Typography>
          </Stack>

          {/* Board-like seek overlay */}
          <Box
            sx={{
              width: '100%',
              aspectRatio: '1',
              maxWidth: 400,
              borderRadius: 4,
              background: 'linear-gradient(145deg, rgba(255,107,53,0.08) 0%, rgba(255,140,66,0.15) 50%, rgba(255,107,53,0.06) 100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Chessboard pattern overlay */}
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                opacity: 0.06,
                backgroundImage: `
                  linear-gradient(45deg, #FF6B35 25%, transparent 25%),
                  linear-gradient(-45deg, #FF6B35 25%, transparent 25%),
                  linear-gradient(45deg, transparent 75%, #FF6B35 75%),
                  linear-gradient(-45deg, transparent 75%, #FF6B35 75%)
                `,
                backgroundSize: '60px 60px',
                backgroundPosition: '0 0, 0 30px, 30px -30px, -30px 0px',
              }}
            />

            <Icon
              icon="mdi:crown"
              width={64}
              style={{
                color: '#FF6B35',
                marginBottom: 12,
                filter: 'drop-shadow(0 4px 12px rgba(255,107,53,0.3))',
              }}
            />
            <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', color: '#FF6B35' }}>
              Finding opponent…
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {tc.label} {SPEED_LABEL[tc.speed] ?? tc.speed} · {rated ? 'Rated' : 'Casual'}
            </Typography>
          </Box>

          <Button
            variant="outlined"
            onClick={cancelSeek}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 3,
              px: 4,
              borderColor: 'divider',
              color: 'text.primary',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
            }}
          >
            Abort
          </Button>
        </Stack>
      </Box>
    );
  }

  /* ── Idle / Lobby ──────────────────────────────────────────────────────── */
  return (
    <Box sx={{ maxWidth: 520, mx: 'auto' }}>
      <Stack spacing={3}>
        {/* ── Profile card ── */}
        <Box
          sx={{
            borderRadius: 4,
            border: '1px solid',
            borderColor: 'divider',
            p: 3,
            bgcolor: 'background.paper',
          }}
        >
          <Stack spacing={2.5}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" spacing={2} alignItems="center">
                {/* Avatar circle */}
                <Box
                  sx={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '1.3rem',
                    fontWeight: 900,
                    boxShadow: '0 2px 12px rgba(255,107,53,0.2)',
                  }}
                >
                  {(user?.username ?? '?')[0].toUpperCase()}
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', lineHeight: 1.2 }}>
                    {user?.title ? `${user.title} ` : ''}
                    {user?.username}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    on Lichess
                  </Typography>
                </Box>
              </Stack>
              <Button
                size="small"
                variant="text"
                onClick={disconnect}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  color: 'text.secondary',
                  fontSize: '0.78rem',
                  '&:hover': { color: 'error.main' },
                }}
              >
                Disconnect
              </Button>
            </Stack>

            {/* Rating stat */}
            {user?.rating && (
              <Box
                sx={{
                  display: 'flex',
                  gap: 3,
                  bgcolor: 'rgba(0,0,0,0.025)',
                  borderRadius: 2.5,
                  p: 1.5,
                  px: 2,
                }}
              >
                <StatItem
                  label={SPEED_LABEL[user.ratingPerf ?? ''] ?? 'RATING'}
                  value={String(user.rating)}
                  icon="mdi:chart-line"
                />
              </Box>
            )}
          </Stack>
        </Box>

        {banner && (
          <Alert severity={banner.kind === 'ok' ? 'success' : 'error'} onClose={() => setBanner(null)}>
            {banner.msg}
          </Alert>
        )}

        {(streamError || submitError) && (
          <Alert severity="error" onClose={() => setSubmitError(null)}>
            {submitError ?? streamError}
          </Alert>
        )}

        {/* ── Start a game card ── */}
        <Box
          sx={{
            borderRadius: 4,
            border: '1px solid',
            borderColor: 'divider',
            p: 3,
            bgcolor: 'background.paper',
          }}
        >
          <Stack spacing={3}>
            <Typography sx={{ fontWeight: 900, fontSize: '1.2rem', letterSpacing: '-0.01em' }}>
              START A GAME
            </Typography>

            {/* Rated toggle */}
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
                Rated game
              </Typography>
              <Switch
                checked={rated}
                onChange={(e) => setRated(e.target.checked)}
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': {
                    color: '#FF6B35',
                  },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                    backgroundColor: '#FF6B35',
                  },
                }}
              />
            </Stack>

            <Divider />

            {/* Time control */}
            <Box>
              <Typography
                sx={{ fontWeight: 600, fontSize: '0.8rem', color: 'text.secondary', mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                Time control
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                  gap: 1,
                }}
              >
                {TIME_CONTROLS.map((opt) => {
                  const selected = opt.label === tc.label;
                  return (
                    <Button
                      key={opt.label}
                      onClick={() => setTc(opt)}
                      variant={selected ? 'contained' : 'outlined'}
                      size="small"
                      sx={{
                        textTransform: 'none',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        borderRadius: 2.5,
                        py: 1,
                        minWidth: 0,
                        ...(selected
                          ? {
                              background: 'linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)',
                              boxShadow: '0 2px 8px rgba(255,107,53,0.3)',
                              border: 'none',
                              '&:hover': {
                                background: 'linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)',
                              },
                            }
                          : {
                              borderColor: 'divider',
                              color: 'text.primary',
                              '&:hover': {
                                bgcolor: 'rgba(255,107,53,0.06)',
                                borderColor: '#FF6B35',
                              },
                            }),
                      }}
                    >
                      {opt.label}
                    </Button>
                  );
                })}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {SPEED_LABEL[tc.speed] ?? tc.speed}
                {tc.increment > 0 ? ` with ${tc.increment}s increment` : ''}
              </Typography>
            </Box>

            <Divider />

            {/* Color select */}
            <Box>
              <Typography
                sx={{ fontWeight: 600, fontSize: '0.8rem', color: 'text.secondary', mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                Your color
              </Typography>
              <Stack direction="row" spacing={1}>
                {(['random', 'white', 'black'] as const).map((c) => {
                  const sel = color === c;
                  const colorIcon =
                    c === 'random'
                      ? 'mdi:shuffle-variant'
                      : c === 'white'
                      ? 'mdi:circle-outline'
                      : 'mdi:circle';
                  return (
                    <Button
                      key={c}
                      onClick={() => setColor(c)}
                      variant={sel ? 'contained' : 'outlined'}
                      size="small"
                      startIcon={<Icon icon={colorIcon} width={16} />}
                      sx={{
                        textTransform: 'capitalize',
                        fontWeight: 700,
                        borderRadius: 2.5,
                        flex: 1,
                        ...(sel
                          ? {
                              background: 'linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)',
                              border: 'none',
                              '&:hover': {
                                background: 'linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)',
                              },
                            }
                          : {
                              borderColor: 'divider',
                              color: 'text.primary',
                              '&:hover': {
                                bgcolor: 'rgba(255,107,53,0.06)',
                                borderColor: '#FF6B35',
                              },
                            }),
                      }}
                    >
                      {c}
                    </Button>
                  );
                })}
              </Stack>
            </Box>

            {/* Start button */}
            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={async () => {
                setSubmitError(null);
                const opts: SeekOptions = {
                  time: tc.time,
                  increment: tc.increment,
                  rated,
                  color,
                };
                // Fire-and-forget — seekGame runs in the background consuming the stream.
                void seekGame(opts).catch((e) => setSubmitError((e as Error).message));
              }}
              sx={{
                textTransform: 'none',
                fontWeight: 800,
                py: 1.6,
                fontSize: '1.05rem',
                borderRadius: 3,
                background: 'linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)',
                boxShadow: '0 4px 20px rgba(255,107,53,0.3)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)',
                  boxShadow: '0 6px 24px rgba(255,107,53,0.4)',
                },
              }}
            >
              Start game
            </Button>
          </Stack>
        </Box>

        {/* Footer */}
        <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center" sx={{ pb: 2 }}>
          <Icon icon="simple-icons:lichess" width={14} style={{ color: '#999' }} />
          <Typography variant="caption" color="text.secondary">
            Powered by Lichess
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
}

/* ── Sub-components ────────────────────────────────────────────────────────── */

function FeaturePill({ icon, text }: { icon: string; text: string }) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center">
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          bgcolor: 'rgba(255,107,53,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon icon={icon} width={16} style={{ color: '#FF6B35' }} />
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {text}
      </Typography>
    </Stack>
  );
}

function StatItem({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Icon icon={icon} width={18} style={{ color: '#FF6B35' }} />
      <Box>
        <Typography
          sx={{
            fontWeight: 300,
            fontSize: '0.65rem',
            color: 'text.secondary',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            lineHeight: 1,
          }}
        >
          {label}
        </Typography>
        <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', lineHeight: 1.1 }}>
          {value}
        </Typography>
      </Box>
    </Stack>
  );
}
