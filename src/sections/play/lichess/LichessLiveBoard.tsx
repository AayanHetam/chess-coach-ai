// ─────────────────────────────────────────────────────────────────────────────
// LichessLiveBoard
//
// The embedded board for playing on Lichess from inside ChessMasti. Everything
// except user input is driven by the per-game SSE stream:
//
//   • gameFull → seeds the chess.js instance from initialFen + UCI move list.
//   • gameState → replays new moves and updates clocks/status.
//
// User moves go out via `onMakeMove(uci)` and are applied **optimistically**
// to the local board so the UI feels instant. When the server echoes the move
// back via the game stream, the authoritative state takes over.
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

  // ── Derive a chess.js instance from the authoritative server move list.
  const serverChess = useMemo(() => buildChess(game, state.moves), [game, state.moves]);

  // ── Optimistic move: applied locally so the board updates instantly.
  const [pendingUci, setPendingUci] = useState<string | null>(null);

  // ── Pre-move: queued while opponent is thinking, auto-fired on our turn.
  const [premove, setPremove] = useState<{ from: Square; to: Square; promotion?: string } | null>(null);
  const premoveRef = useRef(premove);
  premoveRef.current = premove;

  // Clear the pending optimistic move once the server catches up.
  // Also attempt to execute any queued premove.
  useEffect(() => {
    setPendingUci(null);
    setSelectedSq(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.moves]);

  // Build the display chess instance (server + pending optimistic move).
  const chess = useMemo(() => {
    if (!pendingUci) return serverChess;
    const clone = new Chess(serverChess.fen());
    try {
      const from = pendingUci.slice(0, 2);
      const to = pendingUci.slice(2, 4);
      const promotion = pendingUci.length > 4 ? pendingUci[4] : undefined;
      clone.move({ from, to, promotion });
    } catch {
      return serverChess;
    }
    return clone;
  }, [serverChess, pendingUci]);

  // Track the timestamp at which we received the current state so the clocks
  // know how much to interpolate by. Reset on every state change.
  const serverAtRef = useRef<number>(Date.now());
  useEffect(() => {
    serverAtRef.current = Date.now();
  }, [state]);

  // ── Auto-fire premove when it becomes our turn ──────────────────────────
  // Runs after serverChess is rebuilt from the new state.moves.
  const submitMoveRef = useRef<((uci: string) => Promise<boolean>) | null>(null);

  useEffect(() => {
    const pm = premoveRef.current;
    if (!pm) return;
    if (state.status !== 'started') { setPremove(null); return; }
    const myTurn = serverChess.turn() === (yourColor === 'white' ? 'w' : 'b');
    if (!myTurn) return;

    // Validate premove against the NEW position.
    const legal = serverChess.moves({ square: pm.from, verbose: true });
    const match = legal.find((m) => m.to === pm.to);
    setPremove(null);
    if (match) {
      const promo =
        match.piece === 'p' && (pm.to[1] === '8' || pm.to[1] === '1')
          ? (pm.promotion ?? 'q')
          : undefined;
      const uci = `${pm.from}${pm.to}${promo ?? ''}`;
      submitMoveRef.current?.(uci);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.moves]);

  // ── Selected square + legal move highlights ──────────────────────────────
  const [selectedSq, setSelectedSq] = useState<Square | null>(null);

  const legalMovesForSelected = useMemo(() => {
    if (!selectedSq) return [];
    return serverChess.moves({ square: selectedSq, verbose: true });
  }, [serverChess, selectedSq]);

  const highlightStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};

    // Premove highlights (blue)
    if (premove) {
      styles[premove.from] = { backgroundColor: 'rgba(0, 150, 255, 0.45)' };
      styles[premove.to] = { backgroundColor: 'rgba(0, 150, 255, 0.45)' };
    }

    // Selected piece + legal move dots (orange — override premove if both)
    if (selectedSq) {
      styles[selectedSq] = { backgroundColor: 'rgba(255, 107, 53, 0.35)' };
    }
    for (const m of legalMovesForSelected) {
      const isCapture = m.captured || m.flags.includes('e');
      styles[m.to as string] = isCapture
        ? {
            background: 'radial-gradient(transparent 50%, rgba(255,107,53,0.45) 50%)',
            borderRadius: '50%',
          }
        : {
            background: 'radial-gradient(rgba(255,107,53,0.4) 22%, transparent 22%)',
            borderRadius: '50%',
          };
    }
    return styles;
  }, [selectedSq, legalMovesForSelected, premove]);

  // ── Move validation & submission ─────────────────────────────────────────
  const finished = state.status !== 'started' && state.status !== 'created';

  // Prevent moves while we're waiting for the server to confirm our optimistic move.
  const isYourTurn =
    state.status === 'started' &&
    !pendingUci &&
    serverChess.turn() === (yourColor === 'white' ? 'w' : 'b');

  const canPromotePiece = useCallback(
    (from: Square, to: Square): boolean => {
      const moves = serverChess.moves({ square: from, verbose: true });
      return moves.some(
        (m) => m.to === to && m.piece === 'p' && (to[1] === '8' || to[1] === '1')
      );
    },
    [serverChess]
  );

  const submitMove = useCallback(
    async (uci: string): Promise<boolean> => {
      // Apply optimistic update immediately.
      setPendingUci(uci);
      setPremove(null);
      setSelectedSq(null);
      const ok = await onMakeMove(uci);
      if (!ok) {
        // Server rejected — roll back optimistic move.
        setPendingUci(null);
      }
      return ok;
    },
    [onMakeMove]
  );

  // Keep ref in sync so the premove effect can call submitMove.
  useEffect(() => { submitMoveRef.current = submitMove; }, [submitMove]);

  // Helper: does a square have one of our pieces?
  const isOurPiece = useCallback(
    (sq: Square): boolean => {
      const p = serverChess.get(sq as Parameters<typeof serverChess.get>[0]);
      if (!p) return false;
      return yourColor === 'white' ? p.color === 'w' : p.color === 'b';
    },
    [serverChess, yourColor]
  );

  const onPieceDrop = useCallback(
    (source: Square, target: Square, piece: string): boolean => {
      if (finished) return false;

      // ── Your turn → real move
      if (isYourTurn) {
        const legalMoves = serverChess.moves({ square: source, verbose: true });
        const candidate = legalMoves.find((m) => m.to === target);
        if (!candidate) return false;

        const promotion =
          candidate.piece === 'p' && (target[1] === '8' || target[1] === '1')
            ? (piece[1]?.toLowerCase() ?? 'q')
            : undefined;

        void submitMove(`${source}${target}${promotion ?? ''}`);
        return true;
      }

      // ── Opponent's turn → queue premove (always auto-queen)
      if (isOurPiece(source) && source !== target) {
        setPremove({ from: source, to: target, promotion: 'q' });
        setSelectedSq(null);
        return true; // tell react-chessboard the drop was accepted
      }
      return false;
    },
    [serverChess, isYourTurn, finished, submitMove, isOurPiece]
  );

  // Click-to-move / click-to-premove
  const onSquareClick = useCallback(
    (square: Square) => {
      if (finished) { setSelectedSq(null); return; }

      // ── Your turn → normal click-to-move
      if (isYourTurn) {
        if (selectedSq) {
          const legalMoves = serverChess.moves({ square: selectedSq, verbose: true });
          const candidate = legalMoves.find((m) => m.to === square);
          if (candidate) {
            const promotion =
              candidate.piece === 'p' && (square[1] === '8' || square[1] === '1')
                ? 'q'
                : undefined;
            void submitMove(`${selectedSq}${square}${promotion ?? ''}`);
            return;
          }
        }
        // Select our piece
        if (isOurPiece(square)) {
          setSelectedSq(square === selectedSq ? null : square);
        } else {
          setSelectedSq(null);
        }
        return;
      }

      // ── Opponent's turn → click-to-premove
      if (selectedSq && isOurPiece(selectedSq) && square !== selectedSq) {
        setPremove({ from: selectedSq, to: square, promotion: 'q' });
        setSelectedSq(null);
        return;
      }
      if (isOurPiece(square)) {
        setPremove(null); // cancel old premove when selecting a new piece
        setSelectedSq(square === selectedSq ? null : square);
      } else {
        setSelectedSq(null);
        setPremove(null);
      }
    },
    [isYourTurn, finished, selectedSq, serverChess, submitMove, isOurPiece]
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
        fen={chess.fen()}
        materialSide={topColor}
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
          onSquareClick={onSquareClick}
          onPromotionPieceSelect={onPromotionPieceSelect}
          customBoardStyle={customBoardStyle}
          customPieces={customPieces}
          customSquareStyles={highlightStyles}
          boardWidth={boardSize}
          animationDuration={150}
          arePiecesDraggable={!finished}
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
                onClick={() => {
                  // Store the game PGN so the analysis page picks it up.
                  const pgn = chess.pgn({ maxWidth: 80 });
                  if (pgn) {
                    localStorage.setItem('lichess-review-pgn', pgn);
                  }
                  window.location.href = '/analysis?lichessReview=1';
                }}
                startIcon={<Icon icon="mdi:chart-line" />}
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
                Analyze with Coach
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
        fen={chess.fen()}
        materialSide={bottomColor}
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

/* ── Material helpers ──────────────────────────────────────────────────────── */
const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const PIECE_UNICODE: Record<string, string> = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛',
};
const STARTING_COUNTS: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

function computeMaterial(fen: string): {
  white: Record<string, number>;
  black: Record<string, number>;
  whiteScore: number;
  blackScore: number;
} {
  const board = fen.split(' ')[0];
  const wCounts: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  const bCounts: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  for (const ch of board) {
    const lower = ch.toLowerCase();
    if (lower in wCounts) {
      if (ch === ch.toUpperCase()) wCounts[lower]++;
      else bCounts[lower]++;
    }
  }
  // Captured = starting - current
  const wCaptured: Record<string, number> = {};
  const bCaptured: Record<string, number> = {};
  let whiteScore = 0;
  let blackScore = 0;
  for (const p of Object.keys(STARTING_COUNTS)) {
    const wLost = STARTING_COUNTS[p] - wCounts[p];
    const bLost = STARTING_COUNTS[p] - bCounts[p];
    if (bLost > 0) wCaptured[p] = bLost; // white captured black's pieces
    if (wLost > 0) bCaptured[p] = wLost;
    whiteScore += wCounts[p] * PIECE_VALUES[p];
    blackScore += bCounts[p] * PIECE_VALUES[p];
  }
  return { white: wCaptured, black: bCaptured, whiteScore, blackScore };
}

function CapturedPieces({ fen, side }: { fen: string; side: 'white' | 'black' }) {
  const { white, black, whiteScore, blackScore } = useMemo(() => computeMaterial(fen), [fen]);
  const captured = side === 'white' ? white : black;
  const advantage = side === 'white' ? whiteScore - blackScore : blackScore - whiteScore;
  const order = ['q', 'r', 'b', 'n', 'p'];
  const opponentColor = side === 'white' ? 'b' : 'w';

  return (
    <Stack direction="row" alignItems="center" spacing={0} sx={{ minHeight: 20, flexWrap: 'wrap' }}>
      {order.map((p) => {
        const count = captured[p] ?? 0;
        if (count === 0) return null;
        return (
          <Typography key={p} component="span" sx={{ fontSize: '0.95rem', lineHeight: 1, opacity: 0.85, letterSpacing: '-1px' }}>
            {Array.from({ length: count }, () => PIECE_UNICODE[`${opponentColor}${p}`]).join('')}
          </Typography>
        );
      })}
      {advantage > 0 && (
        <Typography component="span" sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary', ml: 0.5 }}>
          +{advantage}
        </Typography>
      )}
    </Stack>
  );
}

function PlayerRow({
  player,
  color,
  clockMs,
  clockActive,
  serverAt,
  isYou,
  canAbort,
  onAbort,
  fen,
  materialSide,
}: {
  player?: LichessPlayer;
  color: 'white' | 'black';
  clockMs: number;
  clockActive: boolean;
  serverAt: number;
  isYou: boolean;
  canAbort?: boolean;
  onAbort?: () => void;
  fen: string;
  materialSide: 'white' | 'black';
}) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      sx={{ width: '100%', maxWidth: 720, px: 0.5, py: 0.75 }}
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
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.1 }}>
              {playerLabel(player, 'Opponent')}
            </Typography>
          </Stack>
          <CapturedPieces fen={fen} side={materialSide} />
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
