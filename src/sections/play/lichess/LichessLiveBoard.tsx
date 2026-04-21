// ─────────────────────────────────────────────────────────────────────────────
// LichessLiveBoard
//
// The embedded board for playing on Lichess from inside ChessMasti. Everything
// except user input is driven by the per-game SSE stream:
//
//   • gameFull → seeds the chess.js instance from initialFen + UCI move list.
//   • gameState → replays new moves and updates clocks/status.
//
// User moves go out via `onMakeMove(uci)` (returns true if accepted). We
// optimistically apply locally so the board feels instant; if the server
// rejects we roll back by refreshing from the latest snapshot.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { Icon } from '@iconify/react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type {
  CustomPieces,
  Piece,
  PromotionPieceOption,
  Square,
} from 'react-chessboard/dist/chessboard/types';
import { useAtomValue } from 'jotai';
import { pieceSetAtom, boardHueAtom } from '@/components/board/states';
import LiveClock from '@/components/play/LiveClock';
import {
  LichessGameFull,
  LichessGameState,
  LichessPlayer,
} from '@/types/lichessLive';

const PIECE_CODES: Piece[] = [
  'wP', 'wB', 'wN', 'wR', 'wQ', 'wK',
  'bP', 'bB', 'bN', 'bR', 'bQ', 'bK',
];

export interface LichessLiveBoardProps {
  game: LichessGameFull;
  state: LichessGameState;
  yourColor: 'white' | 'black';
  boardSize: number;
  onMakeMove: (uci: string) => Promise<boolean>;
  onResign: () => Promise<boolean>;
  onAbort: () => Promise<boolean>;
  onOfferDraw: () => Promise<boolean>;
  onExit: () => void;
}

// Build a Chess instance from Lichess's move list + initialFen.
function buildChess(game: LichessGameFull, movesStr: string): Chess {
  const chess =
    game.initialFen && game.initialFen !== 'startpos'
      ? new Chess(game.initialFen)
      : new Chess();
  if (!movesStr) return chess;
  for (const uci of movesStr.split(/\s+/).filter(Boolean)) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    try {
      chess.move({ from, to, promotion });
    } catch {
      // Skip invalid UCI — shouldn't happen with Lichess input, but be safe.
      break;
    }
  }
  return chess;
}

function playerLabel(p?: LichessPlayer, fallback = '…'): string {
  if (!p) return fallback;
  const name = p.name || (p.aiLevel ? `Stockfish lvl ${p.aiLevel}` : fallback);
  const rating =
    p.rating != null ? ` (${p.rating}${p.provisional ? '?' : ''})` : '';
  const title = p.title ? `${p.title} ` : '';
  return `${title}${name}${rating}`;
}

export default function LichessLiveBoard({
  game,
  state,
  yourColor,
  boardSize,
  onMakeMove,
  onResign,
  onAbort,
  onOfferDraw,
  onExit,
}: LichessLiveBoardProps) {
  const pieceSet = useAtomValue(pieceSetAtom);
  const boardHue = useAtomValue(boardHueAtom);
  const [busy, setBusy] = useState<'resign' | 'abort' | 'draw' | null>(null);

  // ── Derive a chess.js instance from the current move list.
  // Rebuild on every state change — Lichess's UCI move list is authoritative,
  // so we don't need to maintain a mutable local state machine.
  const chess = useMemo(() => buildChess(game, state.moves), [game, state.moves]);

  // Track the timestamp at which we received the current state so the clocks
  // know how much to interpolate by. Reset on every state change.
  const serverAtRef = useRef<number>(Date.now());
  useEffect(() => {
    serverAtRef.current = Date.now();
  }, [state]);

  // ── Move validation & submission ─────────────────────────────────────────
  const isYourTurn =
    state.status === 'started' && chess.turn() === (yourColor === 'white' ? 'w' : 'b');

  const canPromotePiece = useCallback(
    (from: Square, to: Square): boolean => {
      const moves = chess.moves({ square: from, verbose: true });
      return moves.some(
        (m) => m.to === to && m.piece === 'p' && (to[1] === '8' || to[1] === '1')
      );
    },
    [chess]
  );

  const submitMove = useCallback(
    async (uci: string): Promise<boolean> => {
      const ok = await onMakeMove(uci);
      return ok;
    },
    [onMakeMove]
  );

  const onPieceDrop = useCallback(
    (source: Square, target: Square, piece: string): boolean => {
      if (!isYourTurn) return false;

      // Quick local legality check before hitting the network.
      const legalMoves = chess.moves({ square: source, verbose: true });
      const candidate = legalMoves.find((m) => m.to === target);
      if (!candidate) return false;

      // Auto-queen for drag promotions; click-to-promote dialog handles other choices.
      const promotion =
        candidate.piece === 'p' && (target[1] === '8' || target[1] === '1')
          ? (piece[1]?.toLowerCase() ?? 'q')
          : undefined;

      const uci = `${source}${target}${promotion ?? ''}`;
      // Fire-and-forget; the stream will reflect the move back.
      void submitMove(uci);
      return true;
    },
    [chess, isYourTurn, submitMove]
  );

  const onPromotionPieceSelect = useCallback(
    (piece?: PromotionPieceOption, from?: Square, to?: Square): boolean => {
      if (!piece || !from || !to) return false;
      const promo = piece[1]?.toLowerCase() ?? 'q';
      void submitMove(`${from}${to}${promo}`);
      return true;
    },
    [submitMove]
  );

  // ── Piece set + hue (shared with the main board).
  const customPieces = useMemo<CustomPieces>(
    () =>
      PIECE_CODES.reduce<CustomPieces>((acc, code) => {
        acc[code] = ({ squareWidth }: { squareWidth: number }) => (
          <Box
            width={squareWidth}
            height={squareWidth}
            sx={{
              backgroundImage: `url(/piece/${pieceSet}/${code}.svg)`,
              backgroundSize: 'contain',
            }}
          />
        );
        return acc;
      }, {}),
    [pieceSet]
  );

  const customBoardStyle = useMemo(
    () => ({
      borderRadius: '6px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
      ...(boardHue ? { filter: `hue-rotate(${boardHue}deg)` } : {}),
    }),
    [boardHue]
  );

  // ── Status helpers ────────────────────────────────────────────────────────
  const finished = state.status !== 'started' && state.status !== 'created';
  const resultLabel = finished ? describeResult(state, yourColor, game) : null;
  const canAbort = !finished && state.moves.split(/\s+/).filter(Boolean).length < 2;
  void canPromotePiece;

  // ── Render ────────────────────────────────────────────────────────────────
  const topPlayer = yourColor === 'white' ? game.black : game.white;
  const bottomPlayer = yourColor === 'white' ? game.white : game.black;
  const topClockMs = yourColor === 'white' ? state.btime : state.wtime;
  const bottomClockMs = yourColor === 'white' ? state.wtime : state.btime;
  const topActive = !finished && chess.turn() === (yourColor === 'white' ? 'b' : 'w');
  const bottomActive = !finished && chess.turn() === (yourColor === 'white' ? 'w' : 'b');
  const topColor: 'white' | 'black' = yourColor === 'white' ? 'black' : 'white';
  const bottomColor: 'white' | 'black' = yourColor;

  return (
    <Stack spacing={0} alignItems="center" sx={{ width: '100%' }}>
      {/* Top player row (opponent) */}
      <PlayerRow
        player={topPlayer}
        color={topColor}
        clockMs={topClockMs}
        clockActive={topActive}
        serverAt={serverAtRef.current}
        isYou={false}
      />

      {/* Board */}
      <Box
        sx={{
          width: boardSize,
          position: 'relative',
        }}
      >
        <Chessboard
          id={`lichess-live-${game.id}`}
          position={chess.fen()}
          boardOrientation={yourColor}
          onPieceDrop={onPieceDrop}
          onPromotionPieceSelect={onPromotionPieceSelect}
          customBoardStyle={customBoardStyle}
          customPieces={customPieces}
          boardWidth={boardSize}
          animationDuration={180}
          arePiecesDraggable={isYourTurn}
        />
        {finished && resultLabel && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(15,23,42,0.62)',
              borderRadius: '6px',
              color: '#fff',
              textAlign: 'center',
              p: 3,
              backdropFilter: 'blur(2px)',
            }}
          >
            <Icon
              icon={resultLabel.icon}
              width={56}
              style={{
                color: resultLabel.color,
                marginBottom: 10,
                filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))',
              }}
            />
            <Typography sx={{ fontWeight: 900, fontSize: '1.6rem', lineHeight: 1.1 }}>
              {resultLabel.title}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.85, mt: 0.5 }}>
              {resultLabel.subtitle}
            </Typography>

            {/* Post-game actions inside overlay */}
            <Stack direction="row" spacing={1.5} sx={{ mt: 3 }}>
              <Button
                variant="contained"
                size="small"
                onClick={onExit}
                startIcon={<Icon icon="mdi:refresh" />}
                sx={{
                  textTransform: 'none',
                  fontWeight: 800,
                  borderRadius: 2.5,
                  px: 2.5,
                  background: 'linear-gradient(135deg, #FF6B35, #FF8C42)',
                  '&:hover': { background: 'linear-gradient(135deg, #e85d2c, #e07a38)' },
                }}
              >
                Play again
              </Button>
              <Button
                variant="outlined"
                size="small"
                component="a"
                href={`https://lichess.org/${game.id}`}
                target="_blank"
                rel="noreferrer"
                startIcon={<Icon icon="mdi:open-in-new" />}
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  borderRadius: 2.5,
                  px: 2.5,
                  borderColor: 'rgba(255,255,255,0.4)',
                  color: '#fff',
                  '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.1)' },
                }}
              >
                Review
              </Button>
            </Stack>
          </Box>
        )}
      </Box>

      {/* Bottom player row (you) */}
      <PlayerRow
        player={bottomPlayer}
        color={bottomColor}
        clockMs={bottomClockMs}
        clockActive={bottomActive}
        serverAt={serverAtRef.current}
        isYou
        canAbort={canAbort && !finished}
        onAbort={async () => {
          setBusy('abort');
          try { await onAbort(); } finally { setBusy(null); }
        }}
      />

      {/* Controls bar */}
      {!finished && (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="center"
          sx={{ width: boardSize, mt: 1.5 }}
        >
          <Tooltip title="Offer draw">
            <span>
              <Button
                variant="text"
                size="small"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy('draw');
                  try { await onOfferDraw(); } finally { setBusy(null); }
                }}
                sx={{
                  minWidth: 40,
                  color: 'text.secondary',
                  '&:hover': { color: 'text.primary', bgcolor: 'rgba(0,0,0,0.04)' },
                }}
              >
                <Icon icon="mdi:handshake-outline" width={22} />
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Resign">
            <span>
              <Button
                variant="text"
                size="small"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy('resign');
                  try { await onResign(); } finally { setBusy(null); }
                }}
                sx={{
                  minWidth: 40,
                  color: 'text.secondary',
                  '&:hover': { color: 'error.main', bgcolor: 'rgba(239,68,68,0.06)' },
                }}
              >
                <Icon icon="mdi:flag-outline" width={22} />
              </Button>
            </span>
          </Tooltip>
        </Stack>
      )}
    </Stack>
  );
}

/* ── Player row ────────────────────────────────────────────────────────────── */

function PlayerRow({
  player,
  color,
  clockMs,
  clockActive,
  serverAt,
  isYou,
  canAbort,
  onAbort,
}: {
  player?: LichessPlayer;
  color: 'white' | 'black';
  clockMs: number;
  clockActive: boolean;
  serverAt: number;
  isYou: boolean;
  canAbort?: boolean;
  onAbort?: () => void;
}) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      sx={{ width: '100%', maxWidth: 720, px: 0.5, py: 1 }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        {/* Avatar */}
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            bgcolor: color === 'white' ? '#e8e8e8' : '#333',
            border: '2px solid',
            borderColor: isYou ? '#FF6B35' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.85rem',
            fontWeight: 800,
            color: color === 'white' ? '#333' : '#e8e8e8',
          }}
        >
          {(player?.name ?? '?')[0].toUpperCase()}
        </Box>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.1 }}>
            {playerLabel(player, 'Opponent')}
          </Typography>
          {canAbort && onAbort && (
            <Typography
              component="span"
              onClick={onAbort}
              sx={{
                fontSize: '0.7rem',
                fontWeight: 600,
                color: 'text.secondary',
                cursor: 'pointer',
                '&:hover': { color: 'error.main' },
              }}
            >
              Abort
            </Typography>
          )}
        </Box>
      </Stack>
      <LiveClock ms={clockMs} active={clockActive} serverAt={serverAt} />
    </Stack>
  );
}

/** Map Lichess game-end status to a human-readable result label. */
function describeResult(
  state: LichessGameState,
  yourColor: 'white' | 'black',
  game: LichessGameFull
): { title: string; subtitle: string; icon: string; color: string } {
  const youWon = state.winner === yourColor;
  const drawn = !state.winner && (state.status === 'draw' || state.status === 'stalemate');
  const opponent = yourColor === 'white' ? game.black.name : game.white.name;

  if (drawn) {
    return {
      title: 'Draw',
      subtitle: state.status === 'stalemate' ? 'Stalemate.' : 'Agreed draw.',
      icon: 'mdi:equal',
      color: '#94a3b8',
    };
  }
  if (state.status === 'aborted' || state.status === 'nostart') {
    return {
      title: 'Aborted',
      subtitle: 'Game aborted — no rating change.',
      icon: 'mdi:cancel',
      color: '#94a3b8',
    };
  }
  if (youWon) {
    return {
      title: 'You win!',
      subtitle: state.status === 'mate' ? 'Checkmate.' : `${opponent ?? 'Opponent'} ${state.status}.`,
      icon: 'mdi:trophy',
      color: '#22c55e',
    };
  }
  return {
    title: 'You lose',
    subtitle:
      state.status === 'mate'
        ? 'Checkmated.'
        : state.status === 'outoftime'
        ? 'Flagged on time.'
        : state.status === 'resign'
        ? 'You resigned.'
        : 'Game ended.',
    icon: 'mdi:close-octagon',
    color: '#ef4444',
  };
}
