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
import { OpeningSummary, TargetedPrep } from '@/types/scout';
import { formatMoveSequence } from '@/lib/scoutService';

export interface TargetedPrepProps {
  prep: TargetedPrep;
  /**
   * Called when the user clicks a line to explore it on the board.
   * `asColor` is the color the user (you) would be playing — 'white' if the
   * "as White" tab is active, 'black' otherwise. The target (opponent) plays
   * the opposite color in that line.
   */
  onExplore: (moves: string[], asColor: 'white' | 'black') => void;
}

export default function TargetedPrepPanel({ prep, onExplore }: TargetedPrepProps) {
  const [color, setColor] = useState<'white' | 'black'>('white');

  const data = color === 'white' ? prep.asWhite : prep.asBlack;
  const empty = data.weaknesses.length === 0 && data.strengths.length === 0;
  const currentColor = color;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: '1.5rem',
        border: '1px solid rgba(255,255,255,0.08)',
        bgcolor: 'rgba(20,22,28,0.55)',
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
        overflow: 'hidden',
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
            <Icon icon="mdi:target" width={20} style={{ color: '#FB923C' }} />
            <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: 'rgba(255,255,255,0.94)' }}>Targeted Preparation</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            What to play vs. what to avoid — click any line to explore on the board.
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
              color: 'rgba(255,255,255,0.62)',
            },
            '& .Mui-selected': { color: '#FB923C !important' },
            '& .MuiTabs-indicator': { background: '#FB923C', height: 3, borderRadius: 2 },
          }}
        >
          <Tab
            value="white"
            label={
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#fff', border: '1px solid #999' }} />
                <span>as White</span>
              </Stack>
            }
          />
          <Tab
            value="black"
            label={
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#3a3a3a', border: '1px solid rgba(255,255,255,0.2)' }} />
                <span>as Black</span>
              </Stack>
            }
          />
        </Tabs>
      </Stack>

      {empty ? (
        <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
          <Icon icon="mdi:database-search-outline" width={36} style={{ opacity: 0.4 }} />
          <Typography variant="body2" sx={{ mt: 1 }}>
            Not enough games as {color} to surface prep targets.
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <ColumnHeader
              kind="weak"
              count={data.weaknesses.length}
              title="Weaknesses"
              badge="EXPLOIT"
            />
            <Stack spacing={1.25}>
              {data.weaknesses.length === 0 ? (
                <EmptyColumn message="No clear weaknesses — opponent is balanced here." />
              ) : (
                data.weaknesses.map((line, i) => (
                  <OpeningCard
                    key={`w-${i}`}
                    line={line}
                    kind="weak"
                    onExplore={() => onExplore(line.moves, currentColor)}
                  />
                ))
              )}
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <ColumnHeader
              kind="strong"
              count={data.strengths.length}
              title="Strengths"
              badge="AVOID"
            />
            <Stack spacing={1.25}>
              {data.strengths.length === 0 ? (
                <EmptyColumn message="No standout strengths — less need to avoid specific lines." />
              ) : (
                data.strengths.map((line, i) => (
                  <OpeningCard
                    key={`s-${i}`}
                    line={line}
                    kind="strong"
                    onExplore={() => onExplore(line.moves, currentColor)}
                  />
                ))
              )}
            </Stack>
          </Grid>
        </Grid>
      )}
    </Paper>
  );
}

function ColumnHeader({
  kind,
  count,
  title,
  badge,
}: {
  kind: 'weak' | 'strong';
  count: number;
  title: string;
  badge: string;
}) {
  const color = kind === 'weak' ? '#22c55e' : '#ef4444';
  const icon = kind === 'weak' ? 'mdi:arrow-down-bold-circle-outline' : 'mdi:arrow-up-bold-circle-outline';
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
      <Stack direction="row" spacing={0.75} alignItems="center">
        <Icon icon={icon} width={16} style={{ color }} />
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'rgba(255,255,255,0.94)' }}>{title}</Typography>
        <Typography variant="caption" color="text.secondary">
          ({count})
        </Typography>
      </Stack>
      <Chip
        size="small"
        label={badge}
        sx={{
          fontSize: '0.6rem',
          fontWeight: 800,
          letterSpacing: 1,
          height: 20,
          bgcolor: `${color}1a`,
          color,
        }}
      />
    </Stack>
  );
}

function EmptyColumn({ message }: { message: string }) {
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        border: '1px dashed',
        borderColor: 'rgba(255,255,255,0.12)',
        textAlign: 'center',
        color: 'text.secondary',
      }}
    >
      <Typography variant="caption">{message}</Typography>
    </Box>
  );
}

function OpeningCard({
  line,
  kind,
  onExplore,
}: {
  line: OpeningSummary;
  kind: 'weak' | 'strong';
  onExplore: () => void;
}) {
  const score = line.scorePct;
  const isWeak = kind === 'weak';
  const accent = isWeak ? '#22c55e' : '#ef4444';
  const tailLabel = isWeak
    ? `${(100 - score).toFixed(1)}% Loses`
    : `${score.toFixed(1)}% Wins`;
  const ctaLabel = isWeak ? 'Play this line' : 'Avoid this line';
  const ctaIcon = isWeak ? 'mdi:play-circle' : 'mdi:close-circle-outline';

  return (
    <Box
      onClick={onExplore}
      sx={{
        p: 1.5,
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.08)',
        bgcolor: 'rgba(255,255,255,0.03)',
        cursor: 'pointer',
        transition: 'all 180ms ease',
        '&:hover': {
          borderColor: accent,
          transform: 'translateY(-1px)',
          boxShadow: `0 6px 18px ${accent}22`,
        },
      }}
    >
      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1 }}>
        <Chip
          label={line.eco}
          size="small"
          sx={{
            bgcolor: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.94)',
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: '0.72rem',
            height: 22,
            letterSpacing: 0.5,
          }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', lineHeight: 1.3, color: 'rgba(255,255,255,0.94)' }}>
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

      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Stack direction="row" spacing={0.4} alignItems="center">
            <Icon icon="mdi:chess-pawn" width={14} style={{ opacity: 0.55 }} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {line.totalGames} Games
            </Typography>
          </Stack>
          {line.lowSample && (
            <Tooltip title="Small sample — results may be noisy" arrow>
              <Chip
                label="Low sample"
                size="small"
                sx={{
                  fontSize: '0.6rem',
                  height: 18,
                  bgcolor: 'rgba(245,158,11,0.14)',
                  color: '#f59e0b',
                  fontWeight: 700,
                }}
              />
            </Tooltip>
          )}
          <Chip
            label={tailLabel}
            size="small"
            sx={{
              fontSize: '0.7rem',
              fontWeight: 700,
              height: 22,
              bgcolor: `${accent}1a`,
              color: accent,
            }}
          />
        </Stack>

        <Button
          size="small"
          startIcon={<Icon icon={ctaIcon} width={14} />}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.72rem',
            color: '#FB923C',
            '&:hover': { bgcolor: 'rgba(249,115,22,0.08)' },
          }}
        >
          {ctaLabel}
        </Button>
      </Stack>
    </Box>
  );
}
