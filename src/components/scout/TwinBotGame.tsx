import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import { Icon } from '@iconify/react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { CustomPieces, Piece, Square } from 'react-chessboard/dist/chessboard/types';
import { EngineName } from '@/types/enums';
import { useEngine } from '@/hooks/useEngine';
import { getTwinBotMove, TwinBotMove } from '@/lib/twinBot';
import { OpeningTreeNode, Platform, ProfileSnapshot } from '@/types/scout';

/** Proper chess.js clone preserving full move history. */
function cloneGame(g: Chess): Chess {
  const next = new Chess();
  try {
    next.loadPgn(g.pgn());
  } catch {
    // Fall back to FEN-only clone (history lost but position preserved).
    return new Chess(g.fen());
  }
  return next;
}

const PIECE_CODES: Piece[] = [
  'wP', 'wB', 'wN', 'wR', 'wQ', 'wK',
  'bP', 'bB', 'bN', 'bR', 'bQ', 'bK',
];

export interface TwinBotGameProps {
  open: boolean;
  onClose: () => void;
  username: string;
  yourUsername: string;
  platform: Platform;
  profile: ProfileSnapshot;
  /** The opponent's opening tree filtered to the color THEY play. */
  opponentTree: OpeningTreeNode;
  /** The color YOU chose. */
  yourColor: 'white' | 'black';
  /** Top weakness summary (for the side panel). */
  topWeakness?: {
    eco: string;
    name: string;
    totalGames: number;
    scorePct: number;
  };
  pieceSet: string;
}

interface HistoryRow {
  ply: number;
  moveNumber: number;
  whiteSan?: string;
  blackSan?: string;
  whiteMeta?: TwinBotMove;
  blackMeta?: TwinBotMove;
}

type GameResult =
  | { type: 'checkmate'; winner: 'white' | 'black' }
  | { type: 'stalemate' }
  | { type: 'resign'; winner: 'white' | 'black' }
  | { type: 'draw' };

export default function TwinBotGame({
  open,
  onClose,
  username,
  yourUsername,
  platform,
  profile,
  opponentTree,
  yourColor,
  topWeakness,
  pieceSet,
}: TwinBotGameProps) {
  const engine = useEngine(EngineName.Stockfish16_1Lite);

  const [game, setGame] = useState(() => new Chess());
  const [historyMeta, setHistoryMeta] = useState<TwinBotMove[]>([]);
  const [botThinking, setBotThinking] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [evalMode, setEvalMode] = useState(false);
  const [lastBotMove, setLastBotMove] = useState<{ from: Square; to: Square } | null>(null);

  const botColor: 'white' | 'black' = yourColor === 'white' ? 'black' : 'white';
  const botIsWhite = botColor === 'white';

  // Reset when opened.
  useEffect(() => {
    if (!open) return;
    const fresh = new Chess();
    setGame(fresh);
    setHistoryMeta([]);
    setResult(null);
    setLastBotMove(null);
  }, [open, username, yourColor]);

  // TTS on open (say usernames).
  useEffect(() => {
    if (!open) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    // Only speak once.
    const timer = setTimeout(() => {
      try {
        const utter = new SpeechSynthesisUtterance(
          `Twin Bot of ${username} versus ${yourUsername || 'you'}.`
        );
        utter.rate = 0.95;
        utter.volume = 0.6;
        window.speechSynthesis.speak(utter);
      } catch {
        // ignore
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    };
  }, [open, username, yourUsername]);

  // Build SAN history array (oldest → newest).
  const sanHistory = useMemo(() => game.history(), [game]);

  const rows: HistoryRow[] = useMemo(() => {
    const result: HistoryRow[] = [];
    for (let i = 0; i < sanHistory.length; i++) {
      const moveNumber = Math.floor(i / 2) + 1;
      const isWhite = i % 2 === 0;
      const meta = historyMeta[i];
      if (isWhite) {
        result.push({
          ply: i,
          moveNumber,
          whiteSan: sanHistory[i],
          whiteMeta: meta,
        });
      } else {
        const last = result[result.length - 1];
        if (last && !last.blackSan) {
          last.blackSan = sanHistory[i];
          last.blackMeta = meta;
        } else {
          result.push({
            ply: i,
            moveNumber,
            blackSan: sanHistory[i],
            blackMeta: meta,
          });
        }
      }
    }
    return result;
  }, [sanHistory, historyMeta]);

  // Game end detection.
  useEffect(() => {
    if (!open || result) return;
    if (game.isCheckmate()) {
      const winner = game.turn() === 'w' ? 'black' : 'white';
      setResult({ type: 'checkmate', winner });
    } else if (game.isStalemate()) {
      setResult({ type: 'stalemate' });
    } else if (game.isDraw()) {
      setResult({ type: 'draw' });
    }
  }, [game, open, result]);

  // Guard against concurrent bot moves (can happen if effect fires twice).
  const botInFlightRef = useRef(false);

  // Bot-move driver.
  const runBotMove = useCallback(async () => {
    if (result) return;
    if (game.isGameOver()) return;
    const isBotTurn = (game.turn() === 'w') === botIsWhite;
    if (!isBotTurn) return;
    if (botInFlightRef.current) return;
    botInFlightRef.current = true;
    setBotThinking(true);
    // Snapshot the FEN we were asked about so we can bail if it changed mid-think.
    const snapFen = game.fen();
    try {
      const move = await getTwinBotMove({
        tree: opponentTree,
        historyMoves: game.history(),
        fen: snapFen,
        phaseElo: profile.phaseElo,
        engine,
      });
      if (!move) return;

      // If the user navigated/reset while we were thinking, drop the move.
      if (snapFen !== game.fen()) return;

      const next = cloneGame(game);
      let applied: ReturnType<Chess['move']> | null = null;
      try {
        applied = next.move(move.san);
      } catch {
        applied = null;
      }
      if (!applied) return;

      setGame(next);
      setLastBotMove({ from: applied.from as Square, to: applied.to as Square });
      setHistoryMeta(prev => [...prev, move]);
    } finally {
      botInFlightRef.current = false;
      setBotThinking(false);
    }
  }, [botIsWhite, engine, game, opponentTree, profile.phaseElo, result]);

  // Kick off bot moves when it's the bot's turn.
  useEffect(() => {
    if (!open) return;
    if (result) return;
    const isBotTurn = (game.turn() === 'w') === botIsWhite;
    if (isBotTurn) {
      runBotMove();
    }
  }, [open, game, botIsWhite, runBotMove, result]);

  // User move handler
  const onPieceDrop = useCallback(
    (source: string, target: string, piece: string): boolean => {
      if (result) return false;
      const isUserTurn = (game.turn() === 'w') === (yourColor === 'white');
      if (!isUserTurn) return false;
      const promotion = piece?.[1]?.toLowerCase() === 'p' && (target[1] === '8' || target[1] === '1')
        ? (piece?.[2]?.toLowerCase() ?? 'q')
        : undefined;
      const next = cloneGame(game);
      let san: string | null = null;
      try {
        const m = next.move({ from: source, to: target, promotion });
        san = m?.san ?? null;
      } catch {
        return false;
      }
      if (!san) return false;
      setGame(next);
      // Tag user moves distinctly so the history panel can style them neutrally
      // (they're not bot book/engine moves).
      setHistoryMeta(prev => [
        ...prev,
        { san, uci: source + target + (promotion ?? ''), source: 'book' as const },
      ]);
      setLastBotMove(null);
      return true;
    },
    [game, result, yourColor]
  );

  // Controls
  const handleResign = useCallback(() => {
    if (result) return;
    setResult({ type: 'resign', winner: botColor });
  }, [botColor, result]);

  const handleNew = useCallback(() => {
    setGame(new Chess());
    setHistoryMeta([]);
    setResult(null);
    setLastBotMove(null);
  }, []);

  const handleBack = useCallback(() => {
    // Undo the last two plies (bot + user), or just one if only one.
    setGame(prev => {
      const next = cloneGame(prev);
      const h = next.history();
      const undoCount = Math.min(2, h.length);
      for (let i = 0; i < undoCount; i++) next.undo();
      setHistoryMeta(m => m.slice(0, Math.max(0, m.length - undoCount)));
      return next;
    });
    setResult(null);
    setLastBotMove(null);
  }, []);

  // Piece rendering via selected piece set.
  const customPieces = useMemo<CustomPieces>(
    () =>
      PIECE_CODES.reduce<CustomPieces>((acc, p) => {
        acc[p] = ({ squareWidth }: { squareWidth: number }) => (
          <Box
            width={squareWidth}
            height={squareWidth}
            sx={{ backgroundImage: `url(/piece/${pieceSet}/${p}.svg)`, backgroundSize: 'contain' }}
          />
        );
        return acc;
      }, {}),
    [pieceSet]
  );

  const customArrows = useMemo<[Square, Square, string?][]>(() => {
    if (!lastBotMove) return [];
    return [[lastBotMove.from, lastBotMove.to, 'rgba(34, 197, 94, 0.7)']];
  }, [lastBotMove]);

  const isUserTurn = useMemo(() => {
    return (game.turn() === 'w') === (yourColor === 'white');
  }, [game, yourColor]);

  const currentMoveNumber = Math.floor(sanHistory.length / 2) + 1;
  const showBotLine = historyMeta.slice(-6).filter(m => m.source === 'book');
  const bestLineText = showBotLine
    .slice(-6)
    .map((m, i) => {
      const num = Math.floor((sanHistory.length - showBotLine.length + i) / 2) + 1;
      return i % 2 === 0 ? `${num}. ${m.san}` : m.san;
    })
    .join(' ');

  if (!open) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: theme => theme.zIndex.modal + 5,
        bgcolor: '#0b1120',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Top bar */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1.25, borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box
            sx={{
              width: 30,
              height: 30,
              borderRadius: 1.5,
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon icon="mdi:robot-outline" width={18} />
          </Box>
          <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>Twin Bot</Typography>
          <Chip
            size="small"
            label={`v ${yourUsername || 'you'}`}
            sx={{
              fontSize: '0.68rem',
              fontWeight: 700,
              bgcolor: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.8)',
              letterSpacing: 0.5,
              height: 20,
            }}
          />
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            size="small"
            icon={
              isUserTurn ? (
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#22c55e' }} />
              ) : (
                <CircularProgress size={10} sx={{ color: '#f59e0b' }} />
              )
            }
            label={
              result
                ? 'Game over'
                : isUserTurn
                ? `Your turn · Move ${currentMoveNumber}`
                : `${username} thinking…`
            }
            sx={{
              bgcolor: 'rgba(255,255,255,0.05)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.78rem',
            }}
          />
          <IconButton
            size="small"
            onClick={onClose}
            sx={{ color: 'rgba(255,255,255,0.6)', '&:hover': { color: '#fff' } }}
          >
            <Icon icon="mdi:close" width={20} />
          </IconButton>
        </Stack>
      </Stack>

      {/* Body: left panel | board | right history */}
      <Box
        sx={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '260px 1fr 280px' },
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* ── Left panel ── */}
        <Box
          sx={{
            display: { xs: 'none', lg: 'flex' },
            flexDirection: 'column',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            bgcolor: 'rgba(255,255,255,0.02)',
            p: 1.5,
            gap: 1.5,
            overflowY: 'auto',
          }}
        >
          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#fff',
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: 1.5,
                  background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  color: '#22c55e',
                }}
              >
                {username.charAt(0).toUpperCase() || '?'}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff' }}>
                  {username}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    label={`${profile.phaseElo.baseline}`}
                    size="small"
                    sx={{
                      fontSize: '0.65rem',
                      height: 18,
                      fontWeight: 700,
                      bgcolor: 'rgba(234, 179, 8, 0.15)',
                      color: '#facc15',
                    }}
                  />
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.7rem' }}>
                    {profile.totalGames.toLocaleString()} games
                  </Typography>
                </Stack>
              </Box>
            </Stack>

            <Box
              sx={{
                mt: 1.25,
                p: 1,
                borderRadius: 1,
                bgcolor: 'rgba(234, 179, 8, 0.08)',
                border: '1px solid rgba(234, 179, 8, 0.2)',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: 'rgba(255,255,255,0.5)',
                  letterSpacing: 1,
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  display: 'block',
                }}
              >
                Archetype
              </Typography>
              <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', color: '#facc15' }}>
                {profile.archetype}
              </Typography>
            </Box>
          </Paper>

          {topWeakness && (
            <Paper
              elevation={0}
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.18)',
              }}
            >
              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75 }}>
                <Icon icon="mdi:shield-alert-outline" width={14} style={{ color: '#f87171' }} />
                <Typography
                  variant="caption"
                  sx={{ color: '#f87171', fontWeight: 800, letterSpacing: 0.5, fontSize: '0.68rem' }}
                >
                  WEAKNESS WITH {botColor.toUpperCase()}
                </Typography>
              </Stack>
              <Chip
                label={topWeakness.eco}
                size="small"
                sx={{
                  bgcolor: '#0b1120',
                  color: '#fff',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  height: 20,
                  fontSize: '0.65rem',
                  mb: 0.5,
                }}
              />
              <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', lineHeight: 1.3 }}>
                {topWeakness.name}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.7rem' }}>
                {topWeakness.totalGames} games · {(100 - topWeakness.scorePct).toFixed(0)}% losses
              </Typography>
            </Paper>
          )}

          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: 'rgba(255,255,255,0.55)',
                letterSpacing: 1,
                fontWeight: 700,
                fontSize: '0.65rem',
                display: 'block',
                mb: 0.5,
              }}
            >
              BOT REPERTOIRE
            </Typography>
            {opponentTree.children.length === 0 ? (
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                No book available
              </Typography>
            ) : (
              <Stack spacing={0.5}>
                {[...opponentTree.children]
                  .sort((a, b) => b.totalGames - a.totalGames)
                  .slice(0, 5)
                  .map(c => {
                    const pct = ((c.totalGames / opponentTree.totalGames) * 100).toFixed(0);
                    return (
                      <Box
                        key={c.move}
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontFamily: 'monospace',
                        }}
                      >
                        <Typography sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#fff' }}>
                          {c.move}
                        </Typography>
                        <Typography
                          sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}
                        >
                          {pct}%
                        </Typography>
                      </Box>
                    );
                  })}
              </Stack>
            )}
          </Paper>

          <Box sx={{ flex: 1 }} />

          {/* Maia badge at bottom */}
          <Paper
            elevation={0}
            sx={{
              p: 1,
              borderRadius: 1.5,
              bgcolor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: '#22c55e',
                boxShadow: '0 0 6px #22c55e',
              }}
            />
            <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>
              Maia-proxy · {profile.phaseElo.baseline}
            </Typography>
          </Paper>
        </Box>

        {/* ── Center: board ── */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 2,
            minWidth: 0,
            overflowY: 'auto',
          }}
        >
          <Box sx={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Opponent banner */}
            <PlayerBanner
              side="opponent"
              name={username}
              rating={profile.phaseElo.baseline}
              color={botColor}
              platform={platform}
              active={!isUserTurn && !result}
              thinking={botThinking}
            />

            <BoardWrapper>
              <Chessboard
                id="TwinBotBoard"
                position={game.fen()}
                boardOrientation={yourColor}
                onPieceDrop={onPieceDrop}
                arePiecesDraggable={!result && isUserTurn}
                customArrows={customArrows}
                customPieces={customPieces}
                customBoardStyle={{
                  borderRadius: 6,
                  boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
                }}
                customDarkSquareStyle={{ backgroundColor: '#6b8e5a' }}
                customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
              />
            </BoardWrapper>

            {/* You banner */}
            <PlayerBanner
              side="you"
              name={yourUsername || 'You'}
              color={yourColor}
              platform={platform}
              active={isUserTurn && !result}
            />

            {/* Controls row */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1 }}>
              <Chip
                size="small"
                label={
                  result
                    ? formatResult(result, botColor)
                    : isUserTurn
                    ? 'Your turn · White'
                    : `${username} · Black`
                }
                sx={{
                  bgcolor: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                }}
              />
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Icon icon="mdi:undo" width={14} />}
                  onClick={handleBack}
                  disabled={sanHistory.length === 0}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    color: '#fff',
                    borderColor: 'rgba(255,255,255,0.2)',
                    '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.04)' },
                    '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.08)' },
                  }}
                >
                  Back
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Icon icon="mdi:refresh" width={14} />}
                  onClick={handleNew}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    color: '#fff',
                    borderColor: 'rgba(255,255,255,0.2)',
                    '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.04)' },
                  }}
                >
                  New
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<Icon icon="mdi:flag" width={14} />}
                  onClick={handleResign}
                  disabled={!!result}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    bgcolor: '#ef4444',
                    '&:hover': { bgcolor: '#dc2626' },
                  }}
                >
                  Resign
                </Button>
              </Stack>
            </Stack>

            {result && (
              <Paper
                elevation={0}
                sx={{
                  mt: 1,
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  color: '#fff',
                  textAlign: 'center',
                }}
              >
                <Typography sx={{ fontWeight: 800, fontSize: '1rem' }}>
                  {formatResult(result, botColor, true)}
                </Typography>
              </Paper>
            )}
          </Box>
        </Box>

        {/* ── Right: history ── */}
        <Box
          sx={{
            display: { xs: 'none', lg: 'flex' },
            flexDirection: 'column',
            borderLeft: '1px solid rgba(255,255,255,0.06)',
            bgcolor: 'rgba(255,255,255,0.02)',
            minHeight: 0,
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ px: 1.5, py: 1, borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: 1, fontSize: '0.7rem' }}>
              HISTORY
            </Typography>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="caption" sx={{ color: evalMode ? '#22c55e' : 'rgba(255,255,255,0.5)', fontSize: '0.65rem', fontWeight: 700 }}>
                {evalMode ? 'ON' : 'OFF'}
              </Typography>
              <Switch
                size="small"
                checked={evalMode}
                onChange={e => setEvalMode(e.target.checked)}
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: '#22c55e' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#22c55e' },
                }}
              />
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.65rem', fontWeight: 700 }}>
                {sanHistory.length}
              </Typography>
            </Stack>
          </Stack>

          {evalMode && bestLineText && (
            <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, display: 'block', mb: 0.25 }}>
                BEST LINE
              </Typography>
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>
                {bestLineText}…
              </Typography>
            </Box>
          )}

          <Box sx={{ flex: 1, overflowY: 'auto', px: 1, py: 0.5 }}>
            {rows.length === 0 && (
              <Box sx={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', mt: 3, fontSize: '0.8rem' }}>
                No moves yet. {isUserTurn ? 'Your move.' : 'Bot thinking…'}
              </Box>
            )}
            {rows.map(r => (
              <Box
                key={r.ply}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '28px 1fr 1fr',
                  gap: 0.5,
                  alignItems: 'center',
                  px: 0.5,
                  py: 0.5,
                  fontFamily: 'monospace',
                  borderRadius: 0.75,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                }}
              >
                <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>
                  {r.moveNumber}.
                </Typography>
                <MoveCell san={r.whiteSan} meta={r.whiteMeta} isBot={botIsWhite} />
                <MoveCell san={r.blackSan} meta={r.blackMeta} isBot={!botIsWhite} />
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function formatResult(r: GameResult, botColor: 'white' | 'black', verbose = false): string {
  if (r.type === 'checkmate') {
    const you = botColor === 'white' ? r.winner === 'black' : r.winner === 'white';
    return verbose
      ? `${you ? 'You win' : 'Bot wins'} by checkmate!`
      : you
      ? 'You win · Mate'
      : 'Bot wins · Mate';
  }
  if (r.type === 'resign') {
    const you = r.winner !== botColor;
    return verbose
      ? `${you ? 'Bot resigned' : 'You resigned'}`
      : you
      ? 'Bot resigned'
      : 'You resigned';
  }
  if (r.type === 'stalemate') return verbose ? 'Draw by stalemate' : 'Draw · Stalemate';
  return verbose ? 'Draw' : 'Draw';
}

function BoardWrapper({ children }: { children: React.ReactNode }) {
  return <Box sx={{ width: '100%' }}>{children}</Box>;
}

function PlayerBanner({
  side,
  name,
  rating,
  color,
  platform,
  active,
  thinking,
}: {
  side: 'opponent' | 'you';
  name: string;
  rating?: number;
  color: 'white' | 'black';
  platform: Platform;
  active: boolean;
  thinking?: boolean;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1,
        borderRadius: 1.5,
        bgcolor: 'rgba(255,255,255,0.04)',
        border: '1px solid',
        borderColor: active ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.06)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: 'border-color 0.2s',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: 1,
            background: side === 'opponent'
              ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
              : 'linear-gradient(135deg, #334155 0%, #475569 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#22c55e',
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          {name.charAt(0).toUpperCase()}
        </Box>
        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {name}
        </Typography>
        {rating !== undefined && (
          <Chip
            label={rating}
            size="small"
            sx={{
              fontSize: '0.65rem',
              height: 18,
              fontWeight: 700,
              bgcolor: 'rgba(234, 179, 8, 0.15)',
              color: '#facc15',
            }}
          />
        )}
        {thinking && <CircularProgress size={10} sx={{ color: '#f59e0b' }} />}
      </Stack>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Box sx={{ width: 8, height: 8, borderRadius: 1, bgcolor: color === 'white' ? '#fff' : '#111', border: color === 'white' ? '1px solid #999' : 'none' }} />
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.7rem', fontWeight: 700 }}>
          {color === 'white' ? 'White' : 'Black'}
        </Typography>
      </Stack>
    </Paper>
  );
}

function MoveCell({ san, meta, isBot }: { san?: string; meta?: TwinBotMove; isBot: boolean }) {
  if (!san) return <Box />;
  const isBookBot = isBot && meta?.source === 'book';
  const isEngineBot = isBot && meta?.source === 'engine';
  const confidence = meta?.confidence;
  const bgColor = isBookBot
    ? 'rgba(34, 197, 94, 0.18)'
    : isEngineBot
    ? 'rgba(239, 68, 68, 0.18)'
    : 'transparent';
  const fgColor = isBookBot ? '#22c55e' : isEngineBot ? '#f87171' : 'rgba(255,255,255,0.6)';
  return (
    <Tooltip
      title={
        isBookBot
          ? `Book move · played in ${meta?.bookGames}/${meta?.parentGames} games (${confidence?.toFixed(0)}%)`
          : isEngineBot
          ? `Out of theory · Maia-proxy @ ${meta?.engineElo} (depth ${meta?.engineDepth}, ${meta?.phase})`
          : ''
      }
      arrow
      placement="top"
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 0.5,
          px: 0.75,
          py: 0.25,
          borderRadius: 0.75,
          bgcolor: 'transparent',
          cursor: isBot ? 'help' : 'default',
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#fff' }}>{san}</Typography>
        {isBookBot && confidence !== undefined && (
          <Chip
            label={`${Math.round(confidence)}%`}
            size="small"
            sx={{
              fontSize: '0.6rem',
              height: 16,
              fontWeight: 800,
              bgcolor: bgColor,
              color: fgColor,
              '& .MuiChip-label': { px: 0.5 },
            }}
          />
        )}
        {isEngineBot && (
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: fgColor,
            }}
          />
        )}
      </Box>
    </Tooltip>
  );
}
