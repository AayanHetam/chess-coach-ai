import {
  Backdrop,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { Icon } from '@iconify/react';

export type AnalyzingStage = 'connect' | 'download' | 'analyze';

const STAGE_ORDER: AnalyzingStage[] = ['connect', 'download', 'analyze'];

export interface AnalyzingModalProps {
  open: boolean;
  username: string;
  platform: 'chess.com' | 'lichess';
  stage: AnalyzingStage;
  progress: number; // 0-1
  onCancel?: () => void;
}

const STAGE_LABEL: Record<AnalyzingStage, string> = {
  connect: 'CONNECT',
  download: 'DOWNLOAD',
  analyze: 'ANALYZE',
};

const STAGE_BODY: Record<AnalyzingStage, { title: string; detail: string }> = {
  connect: {
    title: 'Connecting to archives..',
    detail: 'Pinging player endpoint',
  },
  download: {
    title: 'Pulling recent games..',
    detail: 'Last year of play',
  },
  analyze: {
    title: 'Analyzing patterns..',
    detail: 'Openings, traps & psychology',
  },
};

export default function AnalyzingModal({
  open,
  username,
  platform,
  stage,
  progress,
  onCancel,
}: AnalyzingModalProps) {
  const stageIdx = STAGE_ORDER.indexOf(stage);
  const { title, detail } = STAGE_BODY[stage];
  const pct = Math.round(progress * 100);

  return (
    <Backdrop
      open={open}
      sx={{
        zIndex: theme => theme.zIndex.modal + 10,
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <Paper
        elevation={24}
        sx={{
          width: 420,
          maxWidth: '92vw',
          p: 3,
          borderRadius: 3,
          background: 'linear-gradient(180deg, #0f172a 0%, #111c38 100%)',
          color: '#fff',
          border: '1px solid rgba(255,107,53,0.25)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Avatar + username */}
        <Stack direction="column" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              boxShadow: '0 0 0 6px rgba(255,107,53,0.15)',
            }}
          >
            <Typography sx={{ fontSize: 32, fontWeight: 900, color: '#fff', textTransform: 'uppercase' }}>
              {username.charAt(0) || '?'}
            </Typography>
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 16,
                height: 16,
                borderRadius: '4px',
                bgcolor: platform === 'chess.com' ? '#7fa650' : '#262421',
                border: '2px solid #0f172a',
              }}
            />
          </Box>

          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: 18, fontWeight: 800 }}>
              Analyzing{' '}
              <Box component="span" sx={{ color: '#FF6B35' }}>
                {username}
              </Box>
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', letterSpacing: 1.2 }}>
              {platform.toUpperCase()}
            </Typography>
          </Box>
        </Stack>

        {/* Step indicators */}
        <Stack direction="row" alignItems="center" justifyContent="center" sx={{ mb: 3, gap: 0 }}>
          {STAGE_ORDER.map((s, i) => {
            const done = i < stageIdx;
            const active = i === stageIdx;
            return (
              <Box
                key={s}
                sx={{ display: 'flex', alignItems: 'center', gap: 0, flex: i < STAGE_ORDER.length - 1 ? 1 : 'unset' }}
              >
                <Stack alignItems="center" spacing={0.5}>
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 14,
                      color: active || done ? '#fff' : 'rgba(255,255,255,0.5)',
                      bgcolor: active
                        ? '#FF6B35'
                        : done
                        ? 'rgba(255,107,53,0.35)'
                        : 'rgba(255,255,255,0.08)',
                      border: active ? '2px solid #FFB88A' : 'none',
                      transition: 'all 0.3s ease',
                    }}
                  >
                    {done ? <Icon icon="mdi:check-bold" width={18} /> : i + 1}
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      letterSpacing: 1.2,
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      color: active ? '#FF6B35' : 'rgba(255,255,255,0.45)',
                    }}
                  >
                    {STAGE_LABEL[s]}
                  </Typography>
                </Stack>
                {i < STAGE_ORDER.length - 1 && (
                  <Box
                    sx={{
                      flex: 1,
                      height: 2,
                      bgcolor: done ? 'rgba(255,107,53,0.35)' : 'rgba(255,255,255,0.08)',
                      mx: 1,
                      mt: -2,
                    }}
                  />
                )}
              </Box>
            );
          })}
        </Stack>

        {/* Detail card */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 2.5,
            borderRadius: 2,
            bgcolor: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <Typography sx={{ fontWeight: 700, color: '#fff', fontSize: 15, mb: 0.5 }}>
            {title}
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, mb: 1.5 }}>
            {detail}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', my: 1.5 }}>
            <CircularProgress
              size={32}
              thickness={4}
              sx={{ color: '#FF6B35' }}
            />
          </Box>

          <LinearProgress
            variant="determinate"
            value={pct}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: 'rgba(255,255,255,0.08)',
              '& .MuiLinearProgress-bar': {
                background: 'linear-gradient(90deg, #FF6B35 0%, #FFB88A 100%)',
              },
            }}
          />
          <Typography
            variant="caption"
            sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem', mt: 0.5, display: 'block' }}
          >
            {pct}%
          </Typography>
        </Paper>

        {onCancel && (
          <Button
            fullWidth
            onClick={onCancel}
            sx={{
              color: 'rgba(255,255,255,0.55)',
              textTransform: 'none',
              fontWeight: 600,
              border: '1px solid rgba(255,255,255,0.1)',
              '&:hover': {
                bgcolor: 'rgba(255,255,255,0.04)',
                color: '#fff',
              },
            }}
          >
            Cancel
          </Button>
        )}
      </Paper>
    </Backdrop>
  );
}
