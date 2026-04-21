// ─────────────────────────────────────────────────────────────────────────────
// ChessComPlay
//
// Chess.com's Published Data API is READ-ONLY (no OAuth for playing). So this
// section shows the user's ongoing daily games and lets them open each one on
// chess.com to make a move. Live/Blitz/Rapid games aren't exposed at all via
// the public API, so we explicitly call that out in the UI.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Icon } from '@iconify/react';
import { Chessboard } from 'react-chessboard';

interface ChessComGame {
  url: string;
  fen?: string;
  pgn?: string;
  timeControl?: string;
  timeClass?: string;
  rated: boolean;
  turn: 'white' | 'black' | null;
  moveBy: number | null;
  lastActivity: number | null;
  startTime: number | null;
  whiteUsername: string;
  blackUsername: string;
  yourTurn: boolean;
}

interface ChessComResponse {
  username: string;
  total: number;
  games: ChessComGame[];
}

const STORAGE_KEY = 'chessmasti.chesscom.username';

function humanMoveBy(moveBy: number | null): string {
  if (!moveBy) return 'No deadline';
  const diff = moveBy * 1000 - Date.now();
  if (diff <= 0) return 'Time up';
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d left`;
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}h ${m}m left`;
}

/** Convert "1/86400" etc. into "1 move / day". */
function humanTimeControl(tc?: string): string {
  if (!tc) return '—';
  const m = tc.match(/^(\d+)\/(\d+)$/);
  if (!m) return tc;
  const moves = parseInt(m[1], 10);
  const secs = parseInt(m[2], 10);
  const days = secs / 86400;
  return `${moves} move${moves > 1 ? 's' : ''} / ${days >= 1 ? `${days}d` : `${Math.round(secs / 3600)}h`}`;
}

export default function ChessComPlay() {
  const [username, setUsername] = useState('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChessComResponse | null>(null);

  // Restore last-used username from localStorage (client-only).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setUsername(saved);
      setInput(saved);
    }
  }, []);

  const fetchGames = useCallback(async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chesscom/ongoing?username=${encodeURIComponent(name)}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? 'Failed to fetch games');
        setData(null);
      } else {
        setData(body as ChessComResponse);
        localStorage.setItem(STORAGE_KEY, name);
      }
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch whenever we have a settled username.
  useEffect(() => {
    if (username) void fetchGames(username);
  }, [username, fetchGames]);

  const summary = useMemo(() => {
    if (!data) return null;
    const toMove = data.games.filter((g) => g.yourTurn).length;
    return { total: data.total, toMove };
  }, [data]);

  return (
    <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
      <CardContent>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 46,
                  height: 46,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'rgba(129,151,73,0.15)',
                  color: '#81b64c',
                }}
              >
                <Icon icon="simple-icons:chessdotcom" width={24} />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: '1.2rem' }}>
                  Your Chess.com daily games
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Read-only · Chess.com doesn&apos;t expose playing via public API
                </Typography>
              </Box>
            </Stack>
            {username && (
              <IconButton
                size="small"
                onClick={() => fetchGames(username)}
                disabled={loading}
                sx={{ color: 'text.secondary' }}
              >
                <Icon icon="mdi:refresh" width={18} />
              </IconButton>
            )}
          </Stack>

          <Alert severity="info" icon={<Icon icon="mdi:information-outline" />}>
            Chess.com hasn&apos;t published an API for live matchmaking. You can see your
            ongoing <strong>daily</strong> games here and jump back to chess.com to make
            a move. For live play <em>inside</em> ChessMasti, use the Lichess tab.
          </Alert>

          <Divider />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              size="small"
              fullWidth
              label="Chess.com username"
              placeholder="e.g. hikaru"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && input.trim()) setUsername(input.trim());
              }}
              InputProps={{
                startAdornment: (
                  <Icon icon="mdi:account" width={18} style={{ color: '#64748b', marginRight: 6 }} />
                ),
              }}
            />
            <Button
              variant="contained"
              onClick={() => setUsername(input.trim())}
              disabled={!input.trim() || loading}
              startIcon={loading ? <CircularProgress size={14} /> : <Icon icon="mdi:magnify" />}
              sx={{
                textTransform: 'none',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #81b64c 0%, #6b9a3d 100%)',
                '&:hover': { background: 'linear-gradient(135deg, #6b9a3d 0%, #5a8332 100%)' },
                minWidth: 120,
              }}
            >
              Load games
            </Button>
          </Stack>

          {summary && (
            <Stack direction="row" spacing={1}>
              <Chip
                size="small"
                label={`${summary.total} ongoing`}
                sx={{ fontWeight: 700 }}
              />
              {summary.toMove > 0 && (
                <Chip
                  size="small"
                  color="warning"
                  label={`${summary.toMove} waiting on you`}
                  sx={{ fontWeight: 800 }}
                />
              )}
            </Stack>
          )}

          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

          {/* Games grid */}
          {data && data.games.length === 0 && !error && (
            <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
              <Icon icon="mdi:chess-pawn" width={40} style={{ opacity: 0.4 }} />
              <Typography variant="body2" sx={{ mt: 1 }}>
                No ongoing daily games for <strong>{data.username}</strong>.
              </Typography>
            </Box>
          )}

          {data && data.games.length > 0 && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                gap: 2,
              }}
            >
              {data.games.map((g) => (
                <ChessComGameCard key={g.url} game={g} you={data.username} />
              ))}
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function ChessComGameCard({ game, you }: { game: ChessComGame; you: string }) {
  const youAreWhite = game.whiteUsername.toLowerCase() === you.toLowerCase();
  const opponent = youAreWhite ? game.blackUsername : game.whiteUsername;
  const yourColor: 'white' | 'black' = youAreWhite ? 'white' : 'black';

  return (
    <Box
      component="a"
      href={game.url}
      target="_blank"
      rel="noreferrer"
      sx={{
        display: 'block',
        borderRadius: 2,
        border: '1px solid',
        borderColor: game.yourTurn ? '#FF6B35' : 'divider',
        bgcolor: game.yourTurn ? 'rgba(255,107,53,0.04)' : 'background.paper',
        p: 1.25,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'all 0.15s',
        '&:hover': {
          boxShadow: '0 6px 20px rgba(15,23,42,0.08)',
          transform: 'translateY(-2px)',
          borderColor: game.yourTurn ? '#e85d2c' : '#94a3b8',
        },
      }}
    >
      <Box sx={{ position: 'relative', mb: 1 }}>
        <Box sx={{ pointerEvents: 'none' }}>
          <Chessboard
            id={`cc-${game.url}`}
            position={game.fen || 'start'}
            boardOrientation={yourColor}
            arePiecesDraggable={false}
            customBoardStyle={{ borderRadius: 4 }}
          />
        </Box>
        {game.yourTurn && (
          <Chip
            size="small"
            color="warning"
            label="Your move"
            sx={{
              position: 'absolute',
              top: 4,
              right: 4,
              fontWeight: 800,
              fontSize: '0.65rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            }}
          />
        )}
      </Box>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            bgcolor: yourColor === 'white' ? '#fff' : '#111',
            border: '1px solid #888',
            flexShrink: 0,
          }}
        />
        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
          vs <strong>{opponent}</strong>
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        <Chip
          size="small"
          label={humanTimeControl(game.timeControl)}
          sx={{ fontSize: '0.65rem', height: 18, fontWeight: 700 }}
        />
        <Tooltip title={game.moveBy ? new Date(game.moveBy * 1000).toLocaleString() : ''}>
          <Chip
            size="small"
            label={humanMoveBy(game.moveBy)}
            sx={{
              fontSize: '0.65rem',
              height: 18,
              fontWeight: 700,
              bgcolor: game.yourTurn ? 'rgba(255,107,53,0.12)' : 'rgba(0,0,0,0.04)',
              color: game.yourTurn ? '#FF6B35' : 'text.secondary',
            }}
          />
        </Tooltip>
        {game.rated && (
          <Chip
            size="small"
            color="warning"
            label="Rated"
            sx={{ fontSize: '0.6rem', height: 18, fontWeight: 800 }}
          />
        )}
      </Stack>
    </Box>
  );
}
