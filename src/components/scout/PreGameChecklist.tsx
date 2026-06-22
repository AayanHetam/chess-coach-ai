import { Box, Grid, Paper, Stack, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import { ChecklistItem } from '@/types/scout';

export interface PreGameChecklistProps {
  items: ChecklistItem[];
}

const SEVERITY_COLOR: Record<ChecklistItem['severity'], string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
};

export default function PreGameChecklist({ items }: PreGameChecklistProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: '1.5rem',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(20,22,28,0.55)',
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Icon icon="mdi:clipboard-check-outline" width={20} style={{ color: '#FB923C' }} />
          <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: 'rgba(255,255,255,0.94)' }}>
            Pre-game Checklist
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {items.length} action{items.length === 1 ? '' : 's'} to take
        </Typography>
      </Stack>

      {items.length === 0 ? (
        <Box
          sx={{
            p: 3,
            textAlign: 'center',
            color: 'text.secondary',
            borderRadius: '12px',
            border: '1px dashed rgba(255,255,255,0.12)',
          }}
        >
          <Typography variant="body2">No specific prep recommendations yet.</Typography>
        </Box>
      ) : (
        <Grid container spacing={1.5}>
          {items.map(item => {
            const color = SEVERITY_COLOR[item.severity];
            return (
              <Grid size={{ xs: 12, sm: 6 }} key={item.id}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    bgcolor: 'rgba(255,255,255,0.03)',
                    display: 'flex',
                    gap: 1.5,
                    alignItems: 'flex-start',
                    height: '100%',
                    transition: 'all 180ms ease',
                    '&:hover': {
                      border: '1px solid rgba(249,115,22,0.35)',
                      bgcolor: 'rgba(249,115,22,0.06)',
                    },
                  }}
                >
                  <Box
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      bgcolor: `${color}1a`,
                      color,
                    }}
                  >
                    <Icon icon="mdi:check-bold" width={16} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.87rem', lineHeight: 1.3, mb: 0.25, color: 'rgba(255,255,255,0.94)' }}>
                      {item.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                      {item.detail}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Paper>
  );
}
