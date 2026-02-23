import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Grid,
  Typography,
  Box,
  Button,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
  Alert,
  Chip,
  LinearProgress,
  Paper,
  IconButton,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { Icon } from '@iconify/react';
import { Chessboard } from 'react-chessboard';
import { CustomPieces, Piece } from 'react-chessboard/dist/chessboard/types';
import { useAtomValue } from 'jotai';
import { pieceSetAtom } from '@/components/board/states';
import { useScreenSize } from '@/hooks/useScreenSize';
import { PageTitle } from '@/components/pageTitle';
import {
  Platform,
  ScoutGame,
  ScoutResult,
  OpeningTreeNode,
  PrepLine,
} from '@/types/scout';
import {
  buildOpeningTree,
  getNodeScore,
  generatePrepLines,
  formatMoveSequence,
  getTreeNodeAtPath,
} from '@/lib/scoutService';
import { getLichessEval } from '@/lib/lichess';

const PIECE_CODES: Piece[] = [
  'wP', 'wB', 'wN', 'wR', 'wQ', 'wK',
  'bP', 'bB', 'bN', 'bR', 'bQ', 'bK',
];

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function WinDrawLossBar({ wins, draws, losses, total }: { wins: number; draws: number; losses: number; total: number }) {
  if (total === 0) return null;
  const wPct = (wins / total) * 100;
  const dPct = (draws / total) * 100;
  const lPct = (losses / total) * 100;

  return (
    <Tooltip title={`W: ${wins} (${wPct.toFixed(0)}%) | D: ${draws} (${dPct.toFixed(0)}%) | L: ${losses} (${lPct.toFixed(0)}%)`}>
      <Box sx={{ display: 'flex', height: 18, borderRadius: 1, overflow: 'hidden', minWidth: 120, width: '100%' }}>
        {wPct > 0 && (
          <Box sx={{
            width: `${wPct}%`,
            bgcolor: '#4caf50',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {wPct >= 15 && <Typography variant="caption" sx={{ color: '#fff', fontSize: '0.65rem', fontWeight: 700 }}>{wPct.toFixed(0)}%</Typography>}
          </Box>
        )}
        {dPct > 0 && (
          <Box sx={{
            width: `${dPct}%`,
            bgcolor: '#9e9e9e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {dPct >= 15 && <Typography variant="caption" sx={{ color: '#fff', fontSize: '0.65rem', fontWeight: 700 }}>{dPct.toFixed(0)}%</Typography>}
          </Box>
        )}
        {lPct > 0 && (
          <Box sx={{
            width: `${lPct}%`,
            bgcolor: '#f44336',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {lPct >= 15 && <Typography variant="caption" sx={{ color: '#fff', fontSize: '0.65rem', fontWeight: 700 }}>{lPct.toFixed(0)}%</Typography>}
          </Box>
        )}
      </Box>
    </Tooltip>
  );
}

export default function ScoutPage() {
  const pieceSet = useAtomValue(pieceSetAtom);
  const screenSize = useScreenSize();

  const [username, setUsername] = useState('');
  const [platform, setPlatform] = useState<Platform>('chess.com');
  const [months, setMonths] = useState(12);
  const [colorFilter, setColorFilter] = useState<'white' | 'black' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scoutResult, setScoutResult] = useState<ScoutResult | null>(null);
  const [tree, setTree] = useState<OpeningTreeNode | null>(null);
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [prepLines, setPrepLines] = useState<PrepLine[]>([]);
  const [cloudEval, setCloudEval] = useState<{ cp?: number; mate?: number; bestMove?: string } | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  const currentNode = useMemo(() => {
    if (!tree) return null;
    return getTreeNodeAtPath(tree, currentPath) || tree;
  }, [tree, currentPath]);

  const boardFen = currentNode?.fen || STARTING_FEN;

  const boardOrientation = useMemo(() => {
    return colorFilter === 'black' ? 'black' as const : 'white' as const;
  }, [colorFilter]);

  const boardSize = useMemo(() => {
    const w = screenSize.width || 800;
    const h = screenSize.height || 600;
    if (w < 900) return Math.min(w - 32, 400);
    return Math.min(380, h * 0.6);
  }, [screenSize]);

  const customPieces = useMemo(
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
          setCloudEval({
            cp: result.lines[0].cp,
            mate: result.lines[0].mate,
            bestMove: result.bestMove,
          });
        } else {
          setCloudEval(null);
        }
      })
      .catch(() => { if (!cancelled) setCloudEval(null); })
      .finally(() => { if (!cancelled) setEvalLoading(false); });
    return () => { cancelled = true; };
  }, [currentNode]);

  const handleSearch = useCallback(async () => {
    if (!username.trim() || !colorFilter) return;
    setLoading(true);
    setError(null);
    setScoutResult(null);
    setTree(null);
    setCurrentPath([]);
    setPrepLines([]);
    setCloudEval(null);

    try {
      const res = await fetch('/api/scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), platform, months }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch games');
      }

      setScoutResult(data);

      const openingTree = buildOpeningTree(data.games, username.trim(), colorFilter!);
      setTree(openingTree);

      const preps = generatePrepLines(openingTree);
      setPrepLines(preps);
    } catch (err: any) {
      setError(err?.message || 'Failed to scout player');
    } finally {
      setLoading(false);
    }
  }, [username, platform, months, colorFilter]); // colorFilter is guaranteed non-null by guard above

  useEffect(() => {
    if (!scoutResult || !colorFilter) return;
    const openingTree = buildOpeningTree(scoutResult.games, scoutResult.username, colorFilter);
    setTree(openingTree);
    setCurrentPath([]);
    setPrepLines(generatePrepLines(openingTree));
  }, [colorFilter, scoutResult]);

  const handleMoveClick = useCallback((move: string) => {
    setCurrentPath(prev => [...prev, move]);
  }, []);

  const handleBack = useCallback(() => {
    setCurrentPath(prev => prev.slice(0, -1));
  }, []);

  const handleReset = useCallback(() => {
    setCurrentPath([]);
  }, []);

  const handlePrepLineClick = useCallback((line: PrepLine) => {
    setCurrentPath(line.moves);
  }, []);

  const formatEval = (ev: { cp?: number; mate?: number } | null) => {
    if (!ev) return null;
    if (ev.mate !== undefined && ev.mate !== null) return `M${ev.mate}`;
    if (ev.cp !== undefined && ev.cp !== null) return `${ev.cp >= 0 ? '+' : ''}${(ev.cp / 100).toFixed(1)}`;
    return null;
  };

  const turnAtCurrentPosition = useMemo(() => {
    if (!boardFen) return 'w';
    const parts = boardFen.split(' ');
    return parts[1] || 'w';
  }, [boardFen]);

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', px: { xs: 1, sm: 2 }, py: 2 }}>
      <PageTitle title="Chess Masti AI - Scout" />

      {/* Header */}
      <Box sx={{ mb: 3, textAlign: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
          <Icon icon="mdi:binoculars" width={32} style={{ color: '#FF6B35' }} />
          <Typography variant="h4" sx={{ fontWeight: 800, background: 'linear-gradient(45deg, #FF6B35, #FF8C42)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Scout
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Analyze any player&apos;s opening repertoire. Find weaknesses. Prepare to win.
        </Typography>
      </Box>

      {/* Search Panel */}
      <Paper elevation={2} sx={{ p: 2.5, mb: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <TextField
            label="Username"
            placeholder="Enter opponent username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            size="small"
            sx={{ minWidth: 200, flex: 1 }}
          />

          <ToggleButtonGroup
            value={platform}
            exclusive
            onChange={(_, val) => val && setPlatform(val)}
            size="small"
          >
            <ToggleButton value="chess.com" sx={{ textTransform: 'none', px: 2 }}>
              Chess.com
            </ToggleButton>
            <ToggleButton value="lichess" sx={{ textTransform: 'none', px: 2 }}>
              Lichess
            </ToggleButton>
          </ToggleButtonGroup>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Time Range</InputLabel>
            <Select value={months} onChange={e => setMonths(Number(e.target.value))} label="Time Range">
              <MenuItem value={3}>3 months</MenuItem>
              <MenuItem value={6}>6 months</MenuItem>
              <MenuItem value={12}>1 year</MenuItem>
              <MenuItem value={24}>2 years</MenuItem>
            </Select>
          </FormControl>

          <Box>
            <Typography variant="caption" color={colorFilter ? 'text.secondary' : 'error'} sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
              Analyze as {colorFilter ? '' : '(required)'}
            </Typography>
            <ToggleButtonGroup
              value={colorFilter}
              exclusive
              onChange={(_, val) => val && setColorFilter(val)}
              size="small"
            >
              <ToggleButton value="white" sx={{ textTransform: 'none', px: 2 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#fff', border: '1px solid #999', mr: 0.75 }} /> White
              </ToggleButton>
              <ToggleButton value="black" sx={{ textTransform: 'none', px: 2 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#333', mr: 0.75 }} /> Black
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Button
            variant="contained"
            onClick={handleSearch}
            disabled={loading || !username.trim() || !colorFilter}
            startIcon={loading ? <CircularProgress size={16} /> : <Icon icon="mdi:magnify" />}
            sx={{
              px: 3,
              fontWeight: 700,
              borderRadius: 2,
              textTransform: 'none',
              background: 'linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)',
              '&:hover': { background: 'linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)' },
            }}
          >
            {loading ? 'Scouting...' : 'Scout'}
          </Button>
        </Box>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {loading && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <CircularProgress sx={{ color: '#FF6B35', mb: 2 }} />
          <Typography color="text.secondary">Fetching games from {platform}...</Typography>
          <Typography variant="caption" color="text.secondary">This may take a moment for large game histories</Typography>
        </Box>
      )}

      {/* Stats Summary */}
      {scoutResult && !loading && (
        <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          <Chip icon={<Icon icon="mdi:account" />} label={`${scoutResult.username} on ${scoutResult.platform}`} color="primary" variant="outlined" />
          <Chip icon={<Icon icon="mdi:chess-pawn" />} label={`${scoutResult.totalGames} games`} variant="outlined" />
          {scoutResult.totalGames < 50 && (
            <Chip icon={<Icon icon="mdi:alert" />} label="Limited data - results may be less reliable" color="warning" variant="outlined" />
          )}
          {tree && <Chip icon={<Icon icon="mdi:file-tree" />} label={`${tree.totalGames} games as ${colorFilter}`} variant="outlined" />}
        </Box>
      )}

      {/* Main Content: Board + Tree */}
      {tree && !loading && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {/* Board Column */}
          <Grid size={{ xs: 12, lg: 5 }}>
            <Paper elevation={1} sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
              {/* Breadcrumb */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5, flexWrap: 'wrap' }}>
                <IconButton size="small" onClick={handleReset} disabled={currentPath.length === 0}>
                  <Icon icon="mdi:home" />
                </IconButton>
                <IconButton size="small" onClick={handleBack} disabled={currentPath.length === 0}>
                  <Icon icon="mdi:arrow-left" />
                </IconButton>
                <Typography variant="body2" sx={{ fontWeight: 600, ml: 1, fontFamily: 'monospace' }}>
                  {currentPath.length > 0 ? formatMoveSequence(currentPath) : 'Starting position'}
                </Typography>
              </Box>

              {/* Board */}
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Chessboard
                  id="ScoutBoard"
                  position={boardFen}
                  boardOrientation={boardOrientation}
                  boardWidth={boardSize}
                  arePiecesDraggable={false}
                  customBoardStyle={{ borderRadius: '4px', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}
                  customPieces={customPieces}
                />
              </Box>

              {/* Eval display */}
              <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {turnAtCurrentPosition === 'w' ? 'White' : 'Black'} to move
                </Typography>
                {evalLoading && <CircularProgress size={12} />}
                {cloudEval && !evalLoading && (
                  <Chip
                    size="small"
                    label={`Eval: ${formatEval(cloudEval)}`}
                    sx={{
                      fontWeight: 700,
                      bgcolor: cloudEval.cp !== undefined && cloudEval.cp > 0 ? '#e8f5e9' : cloudEval.cp !== undefined && cloudEval.cp < 0 ? '#ffebee' : '#f5f5f5',
                      color: cloudEval.cp !== undefined && cloudEval.cp > 0 ? '#2e7d32' : cloudEval.cp !== undefined && cloudEval.cp < 0 ? '#c62828' : '#333',
                    }}
                  />
                )}
              </Box>

              {/* Current node stats */}
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

          {/* Tree Column */}
          <Grid size={{ xs: 12, lg: 7 }}>
            <Paper elevation={1} sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', minHeight: 400 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Icon icon="mdi:file-tree" style={{ color: '#FF6B35' }} />
                Opening Tree
              </Typography>

              {currentNode && currentNode.children.length > 0 ? (
                <Box>
                  {/* Table Header */}
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: '80px 70px 1fr 60px',
                    gap: 1,
                    px: 1,
                    py: 0.75,
                    borderBottom: '2px solid',
                    borderColor: 'divider',
                    mb: 0.5,
                  }}>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>Move</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>Games</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>Win / Draw / Loss</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, textAlign: 'right' }}>Score</Typography>
                  </Box>

                  {/* Move Rows */}
                  {currentNode.children.map((child, idx) => {
                    const score = getNodeScore(child);
                    const pct = ((child.totalGames / currentNode.totalGames) * 100).toFixed(0);

                    return (
                      <Box
                        key={child.move}
                        onClick={() => handleMoveClick(child.move)}
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: '80px 70px 1fr 60px',
                          gap: 1,
                          px: 1,
                          py: 0.75,
                          cursor: 'pointer',
                          borderRadius: 1,
                          bgcolor: idx % 2 === 0 ? 'action.hover' : 'transparent',
                          '&:hover': { bgcolor: 'action.selected' },
                          transition: 'background-color 0.15s',
                          alignItems: 'center',
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                          {child.move}
                        </Typography>
                        <Box>
                          <Typography variant="body2">{child.totalGames}</Typography>
                          <Typography variant="caption" color="text.secondary">({pct}%)</Typography>
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
                            fontWeight: 700,
                            color: score >= 55 ? '#2e7d32' : score <= 45 ? '#c62828' : 'text.primary',
                          }}
                        >
                          {score.toFixed(0)}%
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Icon icon="mdi:leaf" width={40} style={{ color: '#999', marginBottom: 8 }} />
                  <Typography color="text.secondary">
                    {currentNode ? 'End of line - fewer than 5 games continue from here' : 'No data available'}
                  </Typography>
                  {currentPath.length > 0 && (
                    <Button size="small" onClick={handleBack} startIcon={<Icon icon="mdi:arrow-left" />} sx={{ mt: 1, textTransform: 'none' }}>
                      Go back
                    </Button>
                  )}
                </Box>
              )}
            </Paper>

            {/* Prep Recommendations */}
            {prepLines.length > 0 && (
              <Paper elevation={1} sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', mt: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Icon icon="mdi:target" style={{ color: '#FF6B35' }} />
                  Preparation Targets
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Lines where your opponent struggles most. Click to explore on the board.
                </Typography>

                {prepLines.map((line, idx) => (
                  <Box
                    key={idx}
                    onClick={() => handlePrepLineClick(line)}
                    sx={{
                      p: 1.5,
                      mb: 1,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover', borderColor: '#FF6B35' },
                      transition: 'all 0.15s',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                        {formatMoveSequence(line.moves)}
                      </Typography>
                      <Chip
                        size="small"
                        label={`${line.opponentScore.toFixed(0)}%`}
                        sx={{
                          fontWeight: 700,
                          bgcolor: '#ffebee',
                          color: '#c62828',
                        }}
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {line.recommendation}
                    </Typography>
                    <Box sx={{ mt: 0.5 }}>
                      <WinDrawLossBar wins={line.wins} draws={line.draws} losses={line.losses} total={line.totalGames} />
                    </Box>
                  </Box>
                ))}
              </Paper>
            )}
          </Grid>
        </Grid>
      )}

      {/* Empty state */}
      {!tree && !loading && !error && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Icon icon="mdi:binoculars" width={64} style={{ color: '#ccc', marginBottom: 16 }} />
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
            Enter a username to start scouting
          </Typography>
          <Typography variant="body2" color="text.secondary">
            We&apos;ll fetch their games and build an opening tree showing their repertoire, win rates, and exploitable lines.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
