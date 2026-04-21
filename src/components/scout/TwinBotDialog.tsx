import { useState } from 'react';
import {
  Backdrop,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { Icon } from '@iconify/react';
import { Platform, ProfileSnapshot } from '@/types/scout';

export interface TwinBotDialogProps {
  open: boolean;
  onClose: () => void;
  onStart: (color: 'white' | 'black') => void;
  username: string;
  platform: Platform;
  profile: ProfileSnapshot;
}

export default function TwinBotDialog({
  open,
  onClose,
  onStart,
  username,
  platform,
  profile,
}: TwinBotDialogProps) {
  const [color, setColor] = useState<'white' | 'black'>('white');
  if (!open) return null;

  return (
    <Backdrop
      open
      sx={{
        zIndex: theme => theme.zIndex.modal + 10,
        background: 'rgba(5, 10, 20, 0.75)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={onClose}
    >
      <Paper
        elevation={24}
        onClick={e => e.stopPropagation()}
        sx={{
          width: 420,
          maxWidth: '92vw',
          p: 3,
          borderRadius: 3,
          background: 'linear-gradient(180deg, #1a2332 0%, #0f1724 100%)',
          color: '#fff',
          border: '1px solid rgba(34, 197, 94, 0.25)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          position: 'relative',
        }}
      >
        {/* Header */}
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <Icon icon="mdi:robot-outline" width={22} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', lineHeight: 1 }}>
              Twin Bot
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
              Practice against {username}&apos;s style
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={onClose}
            sx={{ color: 'rgba(255,255,255,0.6)', '&:hover': { color: '#fff' } }}
          >
            <Icon icon="mdi:close" width={18} />
          </IconButton>
        </Stack>

        {/* Player card */}
        <Paper
          elevation={0}
          sx={{
            p: 1.75,
            mb: 3,
            borderRadius: 2.5,
            bgcolor: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Box sx={{ position: 'relative' }}>
            <Box
              sx={{
                width: 54,
                height: 54,
                borderRadius: 2,
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#22c55e',
                fontWeight: 800,
                fontSize: 24,
                border: '2px solid rgba(34,197,94,0.3)',
              }}
            >
              {username.charAt(0).toUpperCase() || '?'}
            </Box>
            <Box
              sx={{
                position: 'absolute',
                right: -2,
                bottom: -2,
                width: 12,
                height: 12,
                borderRadius: '50%',
                bgcolor: platform === 'chess.com' ? '#7fa650' : '#bcbcbc',
                border: '2px solid #0f1724',
              }}
            />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1rem' }}>{username}</Typography>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.25 }}>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Icon icon="mdi:trophy" width={14} style={{ color: '#facc15' }} />
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#facc15' }}>
                  {profile.phaseElo.baseline} ELO
                </Typography>
              </Stack>
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                <Icon icon="mdi:chess-pawn" width={14} />
                <Typography sx={{ fontSize: '0.78rem' }}>
                  {profile.totalGames.toLocaleString()} games
                </Typography>
              </Stack>
            </Stack>
            <Chip
              label={profile.archetype}
              size="small"
              sx={{
                mt: 0.75,
                bgcolor: 'rgba(234, 179, 8, 0.15)',
                color: '#facc15',
                fontWeight: 700,
                fontSize: '0.68rem',
                height: 20,
              }}
            />
          </Box>
        </Paper>

        {/* Phase ELO breakdown */}
        <Box sx={{ mb: 2.5 }}>
          <Typography
            variant="caption"
            sx={{ color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, fontWeight: 700, display: 'block', mb: 1 }}
          >
            BOT STRENGTH CURVE
          </Typography>
          <Stack direction="row" spacing={1}>
            <PhasePill label="Opening" elo={profile.phaseElo.opening} icon="mdi:book-open-variant" />
            <PhasePill label="Middle" elo={profile.phaseElo.middle} icon="mdi:sword-cross" />
            <PhasePill label="Endgame" elo={profile.phaseElo.endgame} icon="mdi:flag-checkered" />
          </Stack>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.68rem', mt: 0.75, display: 'block' }}>
            In opening theory the bot plays their <strong>actual moves</strong>. After that, Maia-proxy at phase-ELO.
          </Typography>
        </Box>

        {/* Color picker */}
        <Typography
          variant="caption"
          sx={{ color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, fontWeight: 700, display: 'block', mb: 1 }}
        >
          CHOOSE YOUR COLOR
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ mb: 3 }}>
          <ColorCard
            label="White"
            selected={color === 'white'}
            onClick={() => setColor('white')}
            bgColor="#fff"
            pieceColor="#0f1724"
          />
          <ColorCard
            label="Black"
            selected={color === 'black'}
            onClick={() => setColor('black')}
            bgColor="#facc15"
            pieceColor="#0f1724"
          />
        </Stack>

        {/* Start */}
        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={() => onStart(color)}
          startIcon={<Icon icon="mdi:play" />}
          sx={{
            py: 1.25,
            fontWeight: 800,
            fontSize: '0.95rem',
            textTransform: 'none',
            borderRadius: 2.5,
            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
            boxShadow: '0 6px 24px rgba(34,197,94,0.35)',
            '&:hover': {
              background: 'linear-gradient(135deg, #1fb356 0%, #149042 100%)',
            },
          }}
        >
          Start game!
        </Button>
      </Paper>
    </Backdrop>
  );
}

function PhasePill({ label, elo, icon }: { label: string; elo: number; icon: string }) {
  return (
    <Box
      sx={{
        flex: 1,
        p: 1,
        borderRadius: 1.5,
        bgcolor: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        textAlign: 'center',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', color: '#22c55e', mb: 0.25 }}>
        <Icon icon={icon} width={14} />
      </Box>
      <Typography sx={{ fontWeight: 800, fontSize: '1.02rem', color: '#fff', lineHeight: 1.1 }}>
        {elo}
      </Typography>
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.62rem', letterSpacing: 1 }}>
        {label.toUpperCase()}
      </Typography>
    </Box>
  );
}

function ColorCard({
  label,
  selected,
  onClick,
  bgColor,
  pieceColor,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  bgColor: string;
  pieceColor: string;
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        flex: 1,
        py: 2,
        borderRadius: 2,
        border: '2px solid',
        borderColor: selected ? '#22c55e' : 'rgba(255,255,255,0.08)',
        bgcolor: selected ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.02)',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'all 0.15s',
        position: 'relative',
        '&:hover': {
          borderColor: selected ? '#22c55e' : 'rgba(34,197,94,0.4)',
          bgcolor: selected ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.05)',
        },
      }}
    >
      {selected && (
        <Box
          sx={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 16,
            height: 16,
            borderRadius: '50%',
            bgcolor: '#22c55e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon icon="mdi:check-bold" width={10} style={{ color: '#fff' }} />
        </Box>
      )}
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          bgcolor: bgColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mx: 'auto',
          mb: 0.75,
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        }}
      >
        <Icon icon="mdi:crown" width={26} style={{ color: pieceColor }} />
      </Box>
      <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff' }}>{label}</Typography>
    </Box>
  );
}
