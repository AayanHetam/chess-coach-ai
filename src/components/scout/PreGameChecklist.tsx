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
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Icon icon="mdi:clipboard-check-outline" width={20} style={{ color: '#FF6B35' }} />
          <Typography sx={{ fontWeight: 800, fontSize: '1rem' }}>Pre-game Checklist</Typography>
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
            borderRadius: 2,
            border: '1px dashed',
            borderColor: 'divider',
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
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    gap: 1.5,
                    alignItems: 'flex-start',
                    height: '100%',
                    transition: 'all 0.15s',
                    '&:hover': {
                      borderColor: '#FF6B35',
                      bgcolor: 'rgba(255,107,53,0.03)',
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
                    <Typography sx={{ fontWeight: 700, fontSize: '0.87rem', lineHeight: 1.3, mb: 0.25 }}>
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
