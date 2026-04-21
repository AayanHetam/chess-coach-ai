import { Box, Paper, Stack, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import { FrequentRival } from '@/types/scout';

export interface RivalsPanelProps {
  rivals: FrequentRival[];
}

function scoreColor(pct: number): string {
  if (pct >= 60) return '#22c55e';
  if (pct >= 45) return '#f59e0b';
  return '#ef4444';
}

export default function RivalsPanel({ rivals }: RivalsPanelProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        height: '100%',
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Icon icon="mdi:account-group" width={20} style={{ color: '#FF6B35' }} />
        <Typography sx={{ fontWeight: 800, fontSize: '1rem' }}>Frequent Rivals</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
          (3+ games)
        </Typography>
      </Stack>

      {rivals.length === 0 ? (
        <Box
          sx={{
            p: 2,
            textAlign: 'center',
            color: 'text.secondary',
            borderRadius: 2,
            border: '1px dashed',
            borderColor: 'divider',
          }}
        >
          <Typography variant="body2">No repeat opponents in this window.</Typography>
        </Box>
      ) : (
        <Stack spacing={1}>
          {rivals.slice(0, 6).map(r => {
            const color = scoreColor(r.scorePct);
            return (
              <Box
                key={r.name}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0,1fr) auto auto',
                  gap: 1.5,
                  alignItems: 'center',
                  px: 1.25,
                  py: 0.75,
                  borderRadius: 1.5,
                  bgcolor: 'rgba(0,0,0,0.02)',
                }}
              >
                <Typography
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.name}
                </Typography>

                <Stack direction="row" spacing={0.25} alignItems="center">
                  <Pill label="W" value={r.wins} color="#22c55e" />
                  <Pill label="D" value={r.draws} color="#9ca3af" />
                  <Pill label="L" value={r.losses} color="#ef4444" />
                </Stack>

                <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', color, minWidth: 44, textAlign: 'right' }}>
                  {r.scorePct.toFixed(0)}%
                </Typography>
              </Box>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box
      sx={{
        minWidth: 30,
        px: 0.75,
        py: 0.2,
        borderRadius: 1,
        bgcolor: `${color}1a`,
        color,
        fontWeight: 800,
        fontSize: '0.7rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {label} {value}
    </Box>
  );
}
