import { Box, Grid, Stack, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import { DossierPanel, FieldLabel, ROSE } from './dossier';
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
    <DossierPanel label="Pre-game checklist"
      action={<FieldLabel color="rgba(255,255,255,0.4)" size="0.6rem">{`${items.length} action${items.length === 1 ? '' : 's'}`}</FieldLabel>}>
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
                      border: `1px solid ${ROSE.border}`,
                      bgcolor: ROSE.tint,
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
    </DossierPanel>
  );
}
