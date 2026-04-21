import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Grid,
  Paper,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import { Icon } from '@iconify/react';
import { CollisionLine, Collisions } from '@/types/scout';
import { formatMoveSequence } from '@/lib/scoutService';

export interface CollisionPanelProps {
  collisions: Collisions;
  targetUsername: string;
  onExplore: (moves: string[], asColor: 'white' | 'black') => void;
}

export default function CollisionPanel({
  collisions,
  targetUsername,
  onExplore,
}: CollisionPanelProps) {
  const [color, setColor] = useState<'white' | 'black'>('white');
  const lines =
    color === 'white' ? collisions.whenYouPlayWhite : collisions.whenYouPlayBlack;
  const empty =
    collisions.whenYouPlayWhite.length === 0 &&
    collisions.whenYouPlayBlack.length === 0;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Icon icon="mdi:crosshairs-gps" width={20} style={{ color: '#FF6B35' }} />
            <Typography sx={{ fontWeight: 800, fontSize: '1rem' }}>
              Collisions · You vs {targetUsername}
            </Typography>
            <Chip
              label="NEW"
              size="small"
              sx={{
                bgcolor: 'rgba(255,107,53,0.15)',
                color: '#FF6B35',
                fontWeight: 800,
                fontSize: '0.6rem',
                height: 18,
                letterSpacing: 1,
              }}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Lines where <strong>your</strong> repertoire meets <strong>their</strong> weakness.
            Ranked by overall edge.
          </Typography>
        </Box>

        <Tabs
          value={color}
          onChange={(_, v) => setColor(v)}
          sx={{
            minHeight: 36,
            '& .MuiTab-root': {
              minHeight: 36,
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.82rem',
              px: 2,
            },
            '& .Mui-selected': { color: '#FF6B35 !important' },
            '& .MuiTabs-indicator': { background: '#FF6B35', height: 3, borderRadius: 2 },
          }}
        >
          <Tab
            value="white"
            label={
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: '#fff',
                    border: '1px solid #999',
                  }}
                />
                <span>you as White</span>
              </Stack>
            }
          />
          <Tab
            value="black"
            label={
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#333' }} />
                <span>you as Black</span>
              </Stack>
            }
          />
        </Tabs>
      </Stack>

      {empty ? (
        <EmptyState yourGames={collisions.yourGames} />
      ) : (
        <>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              Your overall win rate:{' '}
              <strong style={{ color: '#22c55e' }}>
                {(collisions.yourWinRate * 100).toFixed(0)}%
              </strong>{' '}
              across {collisions.yourGames} games
            </Typography>
          </Stack>

          {lines.length === 0 ? (
            <EmptyState
              yourGames={collisions.yourGames}
              message="No significant edges on this side — their weaknesses don't overlap with your repertoire."
            />
          ) : (
            <Grid container spacing={1.5}>
              {lines.map((line, i) => (
                <Grid size={{ xs: 12, md: 6 }} key={`${line.eco}-${i}`}>
                  <CollisionCard line={line} onExplore={() => onExplore(line.moves, color)} />
                </Grid>
              ))}
            </Grid>
          )}
        </>
      )}
    </Paper>
  );
}

function EmptyState({
  yourGames,
  message,
}: {
  yourGames: number;
  message?: string;
}) {
  return (
    <Box
      sx={{
        p: 3,
        textAlign: 'center',
        color: 'text.secondary',
        borderRadius: 2,
        border: '1px dashed',
        borderColor: 'divider',
      }}
    >
      <Icon icon="mdi:crosshairs-off" width={36} style={{ opacity: 0.4 }} />
      <Typography variant="body2" sx={{ mt: 1 }}>
        {message ??
          (yourGames === 0
            ? 'No games found for your username yet.'
            : "Your repertoire and theirs don't overlap on enough shared lines yet.")}
      </Typography>
    </Box>
  );
}

function CollisionCard({
  line,
  onExplore,
}: {
  line: CollisionLine;
  onExplore: () => void;
}) {
  return (
    <Box
      onClick={onExplore}
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        cursor: 'pointer',
        transition: 'all 0.15s',
        '&:hover': {
          borderColor: '#FF6B35',
          boxShadow: '0 6px 18px rgba(255,107,53,0.12)',
          transform: 'translateY(-1px)',
        },
      }}
    >
      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1 }}>
        <Chip
          label={line.eco}
          size="small"
          sx={{
            bgcolor: '#0f172a',
            color: '#fff',
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: '0.72rem',
            height: 22,
          }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', lineHeight: 1.3 }}>
            {line.name}
            {line.variation && (
              <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500, ml: 0.5 }}>
                {line.variation}
              </Box>
            )}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontFamily: 'monospace',
              color: 'text.secondary',
              fontSize: '0.7rem',
            }}
          >
            {formatMoveSequence(line.moves.slice(0, 8))}
            {line.moves.length > 8 ? '…' : ''}
          </Typography>
        </Box>
      </Stack>

      {/* YOU vs THEM bars */}
      <Stack spacing={0.75}>
        <EdgeBar
          label="YOU"
          games={line.yourGames}
          score={line.yourScorePct}
          color="#22c55e"
          strong
        />
        <EdgeBar
          label="THEM"
          games={line.theirGames}
          score={line.theirScorePct}
          color="#ef4444"
        />
      </Stack>

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1.25 }}>
        <Tooltip title="Higher edge = better your-vs-them differential scaled by sample confidence.">
          <Chip
            icon={<Icon icon="mdi:trending-up" width={12} />}
            label={`+${Math.round(line.edge)}`}
            size="small"
            sx={{
              fontSize: '0.7rem',
              fontWeight: 800,
              height: 22,
              bgcolor: 'rgba(34,197,94,0.15)',
              color: '#22c55e',
              '& .MuiChip-icon': { color: '#22c55e' },
            }}
          />
        </Tooltip>
        <Button
          size="small"
          startIcon={<Icon icon="mdi:play-circle-outline" width={14} />}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.72rem',
            color: '#FF6B35',
            '&:hover': { bgcolor: 'rgba(255,107,53,0.08)' },
          }}
        >
          Explore line
        </Button>
      </Stack>
    </Box>
  );
}

function EdgeBar({
  label,
  games,
  score,
  color,
  strong = false,
}: {
  label: string;
  games: number;
  score: number;
  color: string;
  strong?: boolean;
}) {
  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.25 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: strong ? 800 : 700,
            fontSize: '0.68rem',
            letterSpacing: 1,
            color,
          }}
        >
          {label}
        </Typography>
        <Stack direction="row" spacing={0.75} alignItems="baseline">
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
            {games} games
          </Typography>
          <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', color }}>
            {score.toFixed(0)}%
          </Typography>
        </Stack>
      </Stack>
      <Box sx={{ height: 5, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <Box
          sx={{
            width: `${Math.max(3, Math.min(100, score))}%`,
            height: '100%',
            borderRadius: 2,
            bgcolor: color,
            transition: 'width 0.4s ease',
          }}
        />
      </Box>
    </Box>
  );
}
