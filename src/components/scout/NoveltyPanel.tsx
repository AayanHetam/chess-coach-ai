import { Box, Button, Chip, Grid, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import { NoveltyFinding } from '@/types/scout';
import { formatMoveSequence } from '@/lib/scoutService';

export interface NoveltyPanelProps {
  findings: NoveltyFinding[];
  /**
   * Callback when a novelty is clicked. `color` is the target's color in the
   * game where the deviation occurred — i.e., the color filter the tree
   * explorer should switch to.
   */
  onExplore: (moves: string[], targetColor: 'white' | 'black') => void;
}

export default function NoveltyPanel({ findings, onExplore }: NoveltyPanelProps) {
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
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Icon icon="mdi:alert-octagram-outline" width={20} style={{ color: '#FF6B35' }} />
          <Typography sx={{ fontWeight: 800, fontSize: '1rem' }}>Novelty finder</Typography>
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
          {findings.length} deviation{findings.length === 1 ? '' : 's'}
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Positions where the opponent <strong>left their own repertoire</strong> early. They were
        guessing — point the prep arrow right here.
      </Typography>

      {findings.length === 0 ? (
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
          <Typography variant="body2">
            No notable deviations — they stay very consistent in their lines.
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={1.5}>
          {findings.map((f, i) => (
            <Grid size={{ xs: 12, md: 6 }} key={`${f.eco}-${i}-${f.playedMove}`}>
              <NoveltyCard finding={f} onExplore={() => {
                // The deviation occurred in a game where target played a specific color.
                // Determine that color from ply parity: if ply is even, target is white.
                const targetColor: 'white' | 'black' = f.ply % 2 === 0 ? 'white' : 'black';
                onExplore(f.moves, targetColor);
              }} />
            </Grid>
          ))}
        </Grid>
      )}
    </Paper>
  );
}

function NoveltyCard({
  finding,
  onExplore,
}: {
  finding: NoveltyFinding;
  onExplore: () => void;
}) {
  const frequency = (finding.bookFrequency / Math.max(1, finding.totalGames)) * 100;
  const moveNumber = Math.floor(finding.ply / 2) + 1;
  const colorLabel = finding.ply % 2 === 0 ? 'W' : 'B';
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
          transform: 'translateY(-1px)',
          boxShadow: '0 6px 18px rgba(255,107,53,0.12)',
        },
      }}
    >
      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1 }}>
        <Chip
          label={finding.eco}
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
            {finding.name}
            {finding.variation && (
              <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500, ml: 0.5 }}>
                {finding.variation}
              </Box>
            )}
          </Typography>
          <Typography
            variant="caption"
            sx={{ fontFamily: 'monospace', color: 'text.secondary', fontSize: '0.7rem' }}
          >
            {formatMoveSequence(finding.moves.slice(0, 8))}
          </Typography>
        </Box>
      </Stack>

      {/* Usually vs This time */}
      <Box
        sx={{
          p: 1.25,
          borderRadius: 1.5,
          bgcolor: 'rgba(0,0,0,0.025)',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 1,
        }}
      >
        <Box>
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              fontWeight: 700,
              fontSize: '0.62rem',
              letterSpacing: 1.2,
            }}
          >
            USUALLY PLAYS
          </Typography>
          <Stack direction="row" spacing={0.75} alignItems="baseline">
            <Typography sx={{ fontWeight: 800, fontSize: '1rem', fontFamily: 'monospace', color: '#22c55e' }}>
              {moveNumber}
              {colorLabel === 'W' ? '.' : '…'}
              {finding.bookMove}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              {frequency.toFixed(0)}% of {finding.totalGames}
            </Typography>
          </Stack>
        </Box>
        <Box>
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              fontWeight: 700,
              fontSize: '0.62rem',
              letterSpacing: 1.2,
            }}
          >
            THIS GAME
          </Typography>
          <Stack direction="row" spacing={0.75} alignItems="baseline">
            <Typography sx={{ fontWeight: 800, fontSize: '1rem', fontFamily: 'monospace', color: '#ef4444' }}>
              {moveNumber}
              {colorLabel === 'W' ? '.' : '…'}
              {finding.playedMove}
            </Typography>
            {finding.gameLost && (
              <Tooltip title="They lost this game">
                <Chip
                  label="LOST"
                  size="small"
                  sx={{
                    fontSize: '0.6rem',
                    height: 16,
                    fontWeight: 800,
                    bgcolor: 'rgba(239,68,68,0.15)',
                    color: '#ef4444',
                    '& .MuiChip-label': { px: 0.5 },
                  }}
                />
              </Tooltip>
            )}
          </Stack>
        </Box>
      </Box>

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
          Ply {finding.ply + 1} · out of book early
        </Typography>
        <Button
          size="small"
          startIcon={<Icon icon="mdi:magnify" width={12} />}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.7rem',
            color: '#FF6B35',
            '&:hover': { bgcolor: 'rgba(255,107,53,0.08)' },
          }}
        >
          Investigate
        </Button>
      </Stack>
    </Box>
  );
}
