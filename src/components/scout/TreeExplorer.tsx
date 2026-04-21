import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  Link as MuiLink,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { Icon } from '@iconify/react';
import { Chessboard } from 'react-chessboard';
import { CustomPieces, Piece } from 'react-chessboard/dist/chessboard/types';
import { OpeningTreeNode } from '@/types/scout';
import { getNodeScore } from '@/lib/scoutService';
import { getLichessEval } from '@/lib/lichess';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const PIECE_CODES: Piece[] = [
  'wP', 'wB', 'wN', 'wR', 'wQ', 'wK',
  'bP', 'bB', 'bN', 'bR', 'bQ', 'bK',
];

export interface TreeExplorerProps {
  tree: OpeningTreeNode;
  currentPath: string[];
  orientation: 'white' | 'black';
  pieceSet: string;
  boardSize: number;
  minGames: number;
  historyLen: number;
  futureLen: number;
  onMoveClick: (move: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReset: () => void;
  onBreadcrumbClick: (index: number) => void;
}

export default function TreeExplorer({
  tree,
  currentPath,
  orientation,
  pieceSet,
  boardSize,
  minGames,
  historyLen,
  futureLen,
  onMoveClick,
  onBack,
  onForward,
  onReset,
  onBreadcrumbClick,
}: TreeExplorerProps) {
  const currentNode = useMemo(() => {
    let node: OpeningTreeNode | null = tree;
    for (const mv of currentPath) {
      const child: OpeningTreeNode | undefined = node?.children.find(c => c.move === mv);
      if (!child) return tree;
      node = child;
    }
    return node ?? tree;
  }, [tree, currentPath]);

  const boardFen = currentNode?.fen || STARTING_FEN;

  const turn = useMemo(() => {
    const parts = boardFen.split(' ');
    return parts[1] || 'w';
  }, [boardFen]);

  const [cloudEval, setCloudEval] = useState<{ cp?: number; mate?: number } | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  useEffect(() => {
    if (!currentNode || currentNode.fen === STARTING_FEN) {
      setCloudEval(null);
      return;
    }
    let cancelled = false;
    setEvalLoading(true);
    getLichessEval(currentNode.fen, 1)
      .then(result => {
        if (cancelled) return;
        if (result.lines.length > 0) {
          setCloudEval({ cp: result.lines[0].cp, mate: result.lines[0].mate });
        } else {
          setCloudEval(null);
        }
      })
      .catch(() => { if (!cancelled) setCloudEval(null); })
      .finally(() => { if (!cancelled) setEvalLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [currentNode]);

  const customPieces = useMemo<CustomPieces>(
    () =>
      PIECE_CODES.reduce<CustomPieces>((acc, piece) => {
        acc[piece] = ({ squareWidth }: { squareWidth: number }) => (
          <Box
            width={squareWidth}
            height={squareWidth}
            sx={{
              backgroundImage: `url(/piece/${pieceSet}/${piece}.svg)`,
              backgroundSize: 'contain',
            }}
          />
        );
        return acc;
      }, {}),
    [pieceSet]
  );

  const formatEval = (ev: { cp?: number; mate?: number } | null): string | null => {
    if (!ev) return null;
    if (ev.mate !== undefined && ev.mate !== null) return `M${ev.mate}`;
    if (ev.cp !== undefined && ev.cp !== null) return `${ev.cp >= 0 ? '+' : ''}${(ev.cp / 100).toFixed(1)}`;
    return null;
  };

  return (
    <Grid container spacing={2}>
      {/* Board column */}
      <Grid size={{ xs: 12, lg: 5 }}>
        <Paper
          elevation={0}
          sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
            <Tooltip title="Starting position (Home)">
              <span>
                <IconButton size="small" onClick={onReset} disabled={currentPath.length === 0}>
                  <Icon icon="mdi:home" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Back (←)">
              <span>
                <IconButton size="small" onClick={onBack} disabled={historyLen === 0}>
                  <Icon icon="mdi:arrow-left" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Forward (→)">
              <span>
                <IconButton size="small" onClick={onForward} disabled={futureLen === 0}>
                  <Icon icon="mdi:arrow-right" />
                </IconButton>
              </span>
            </Tooltip>
            <Box sx={{ flex: 1 }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              ply {currentPath.length}
            </Typography>
          </Box>

          {/* Breadcrumb */}
          <Box
            sx={{
              mb: 1.5,
              px: 0.75,
              py: 0.75,
              borderRadius: 1.5,
              bgcolor: 'action.hover',
              minHeight: 32,
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 0.25,
            }}
          >
            <MuiLink
              component="button"
              underline={currentPath.length === 0 ? 'none' : 'hover'}
              onClick={() => onBreadcrumbClick(-1)}
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                fontWeight: 700,
                color: currentPath.length === 0 ? '#FF6B35' : 'text.secondary',
                textDecoration: 'none',
                cursor: 'pointer',
                px: 0.5,
              }}
            >
              start
            </MuiLink>
            {currentPath.map((mv, i) => {
              const isWhiteMove = i % 2 === 0;
              const moveNumber = Math.floor(i / 2) + 1;
              const isLast = i === currentPath.length - 1;
              return (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  {isWhiteMove && (
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                      {moveNumber}.
                    </Typography>
                  )}
                  <MuiLink
                    component="button"
                    underline="hover"
                    onClick={() => onBreadcrumbClick(i)}
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: isLast ? '#FF6B35' : 'text.primary',
                      textDecoration: 'none',
                      cursor: 'pointer',
                      px: 0.25,
                      borderRadius: 0.5,
                      '&:hover': { bgcolor: 'rgba(255,107,53,0.12)' },
                    }}
                  >
                    {mv}
                  </MuiLink>
                </Box>
              );
            })}
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <Chessboard
              id="ScoutBoard"
              position={boardFen}
              boardOrientation={orientation}
              boardWidth={boardSize}
              arePiecesDraggable={false}
              customBoardStyle={{ borderRadius: '4px', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}
              customPieces={customPieces}
            />
          </Box>

          {/* Eval row */}
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="center"
            sx={{ mt: 1.5 }}
          >
            <Typography variant="caption" color="text.secondary">
              {turn === 'w' ? 'White' : 'Black'} to move
            </Typography>
            {evalLoading && <CircularProgress size={12} />}
            {cloudEval && !evalLoading && (
              <Chip
                size="small"
                label={`Eval: ${formatEval(cloudEval)}`}
                sx={{
                  fontWeight: 700,
                  bgcolor:
                    cloudEval.cp !== undefined && cloudEval.cp > 0
                      ? '#e8f5e9'
                      : cloudEval.cp !== undefined && cloudEval.cp < 0
                      ? '#ffebee'
                      : '#f5f5f5',
                  color:
                    cloudEval.cp !== undefined && cloudEval.cp > 0
                      ? '#2e7d32'
                      : cloudEval.cp !== undefined && cloudEval.cp < 0
                      ? '#c62828'
                      : '#333',
                }}
              />
            )}
          </Stack>

          {currentNode && currentNode.totalGames > 0 && (
            <Box sx={{ mt: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Opponent&apos;s record in this position ({currentNode.totalGames} games):
              </Typography>
              <WinDrawLossBar
                wins={currentNode.wins}
                draws={currentNode.draws}
                losses={currentNode.losses}
                total={currentNode.totalGames}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Score: {getNodeScore(currentNode).toFixed(0)}%
              </Typography>
            </Box>
          )}
        </Paper>
      </Grid>

      {/* Tree column */}
      <Grid size={{ xs: 12, lg: 7 }}>
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            minHeight: 400,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Icon icon="mdi:file-tree" width={20} style={{ color: '#FF6B35' }} />
              <Typography sx={{ fontWeight: 800, fontSize: '1rem' }}>Opening Tree</Typography>
            </Stack>
            {currentNode && currentNode.children.length > 0 && (
              <Chip
                size="small"
                label={`${currentNode.children.length} continuation${
                  currentNode.children.length === 1 ? '' : 's'
                }`}
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            )}
          </Stack>

          {currentNode && currentNode.children.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: 520 }}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '80px 90px 1fr 60px',
                  gap: 1,
                  px: 1,
                  py: 0.75,
                  borderBottom: '2px solid',
                  borderColor: 'divider',
                  mb: 0.5,
                  position: 'sticky',
                  top: 0,
                  bgcolor: 'background.paper',
                  zIndex: 1,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 0.5 }}>
                  MOVE
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 0.5 }}>
                  GAMES
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 0.5 }}>
                  W / D / L
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 0.5, textAlign: 'right' }}
                >
                  SCORE
                </Typography>
              </Box>

              <Box sx={{ overflowY: 'auto', flex: 1, pr: 0.5 }}>
                {currentNode.children.map((child, idx) => {
                  const score = getNodeScore(child);
                  const pct = ((child.totalGames / currentNode.totalGames) * 100).toFixed(0);
                  return (
                    <Box
                      key={child.move}
                      onClick={() => onMoveClick(child.move)}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: '80px 90px 1fr 60px',
                        gap: 1,
                        px: 1,
                        py: 0.85,
                        cursor: 'pointer',
                        borderRadius: 1,
                        bgcolor: idx % 2 === 0 ? 'action.hover' : 'transparent',
                        '&:hover': {
                          bgcolor: 'rgba(255,107,53,0.12)',
                          transform: 'translateX(2px)',
                        },
                        transition: 'all 0.15s',
                        alignItems: 'center',
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, fontFamily: 'monospace', color: '#FF6B35' }}
                      >
                        {child.move}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {child.totalGames}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          ({pct}%)
                        </Typography>
                      </Box>
                      <WinDrawLossBar
                        wins={child.wins}
                        draws={child.draws}
                        losses={child.losses}
                        total={child.totalGames}
                      />
                      <Typography
                        variant="body2"
                        sx={{
                          textAlign: 'right',
                          fontWeight: 800,
                          color: score >= 55 ? '#22c55e' : score <= 45 ? '#ef4444' : 'text.primary',
                        }}
                      >
                        {score.toFixed(0)}%
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Icon icon="mdi:leaf" width={40} style={{ color: '#999', marginBottom: 8 }} />
              <Typography color="text.secondary">
                {minGames > 1
                  ? `No continuations with \u2265 ${minGames} games. Lower the minimum to see more.`
                  : 'End of line — no further games from this position.'}
              </Typography>
            </Box>
          )}
        </Paper>
      </Grid>
    </Grid>
  );
}

function WinDrawLossBar({
  wins,
  draws,
  losses,
  total,
}: {
  wins: number;
  draws: number;
  losses: number;
  total: number;
}) {
  if (total === 0) return null;
  const wPct = (wins / total) * 100;
  const dPct = (draws / total) * 100;
  const lPct = (losses / total) * 100;
  return (
    <Tooltip
      title={`W: ${wins} (${wPct.toFixed(0)}%) | D: ${draws} (${dPct.toFixed(0)}%) | L: ${losses} (${lPct.toFixed(0)}%)`}
    >
      <Box sx={{ display: 'flex', height: 18, borderRadius: 1, overflow: 'hidden', minWidth: 120, width: '100%' }}>
        {wPct > 0 && (
          <Box
            sx={{
              width: `${wPct}%`,
              bgcolor: '#22c55e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {wPct >= 15 && (
              <Typography variant="caption" sx={{ color: '#fff', fontSize: '0.65rem', fontWeight: 700 }}>
                {wPct.toFixed(0)}%
              </Typography>
            )}
          </Box>
        )}
        {dPct > 0 && (
          <Box
            sx={{
              width: `${dPct}%`,
              bgcolor: '#9ca3af',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {dPct >= 15 && (
              <Typography variant="caption" sx={{ color: '#fff', fontSize: '0.65rem', fontWeight: 700 }}>
                {dPct.toFixed(0)}%
              </Typography>
            )}
          </Box>
        )}
        {lPct > 0 && (
          <Box
            sx={{
              width: `${lPct}%`,
              bgcolor: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {lPct >= 15 && (
              <Typography variant="caption" sx={{ color: '#fff', fontSize: '0.65rem', fontWeight: 700 }}>
                {lPct.toFixed(0)}%
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Tooltip>
  );
}
