import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Backdrop,
  Box,
  Button,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import { Icon } from '@iconify/react';
import {
  buildShareCardSvg,
  copyPngToClipboard,
  renderSvgToPng,
  ShareCardData,
  triggerDownload,
} from '@/lib/shareCard';

export interface ShareCardDialogProps {
  open: boolean;
  onClose: () => void;
  data: ShareCardData;
}

export default function ShareCardDialog({ open, onClose, data }: ShareCardDialogProps) {
  const svg = useMemo(() => buildShareCardSvg(data), [data]);
  const [copying, setCopying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  // Reset transient state on open change.
  useEffect(() => {
    if (!open) {
      setToast(null);
      setCopying(false);
      setDownloading(false);
    }
  }, [open]);

  if (!open) return null;

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const blob = await renderSvgToPng(svg);
      triggerDownload(blob, `chessstalker-${data.username}.png`);
      setToast({ kind: 'ok', msg: 'PNG downloaded.' });
    } catch (e) {
      setToast({ kind: 'err', msg: `Download failed: ${(e as Error).message}` });
    } finally {
      setDownloading(false);
    }
  };

  const handleCopy = async () => {
    try {
      setCopying(true);
      const blob = await renderSvgToPng(svg);
      const ok = await copyPngToClipboard(blob);
      setToast(
        ok
          ? { kind: 'ok', msg: 'Card copied to clipboard!' }
          : { kind: 'err', msg: 'Clipboard image copy not supported in this browser.' }
      );
    } catch (e) {
      setToast({ kind: 'err', msg: `Copy failed: ${(e as Error).message}` });
    } finally {
      setCopying(false);
    }
  };

  const shareText = encodeURIComponent(
    `${data.username} is a ${data.profile.archetype} — OVR ${data.profile.ovr}, Stalker Score ${data.stalker.total}. Analyze yours on Chess Masti AI.`
  );

  return (
    <Backdrop
      open
      onClick={onClose}
      sx={{
        zIndex: theme => theme.zIndex.modal + 8,
        background: 'rgba(5, 10, 20, 0.75)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <Paper
        onClick={e => e.stopPropagation()}
        elevation={24}
        sx={{
          width: 'min(92vw, 560px)',
          maxHeight: '92vh',
          overflow: 'auto',
          p: 3,
          borderRadius: 3,
          background: 'linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)',
          position: 'relative',
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Icon icon="mdi:share-variant" width={20} style={{ color: '#FF6B35' }} />
              <Typography sx={{ fontWeight: 800, fontSize: '1.05rem' }}>
                Share {data.username}&apos;s card
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Football-sticker export · PNG, Twitter, Reddit
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose}>
            <Icon icon="mdi:close" width={18} />
          </IconButton>
        </Stack>

        {/* Preview */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            bgcolor: 'rgba(15,23,42,0.04)',
            borderRadius: 2,
            p: 1,
            mb: 2.5,
          }}
        >
          <Box
            sx={{
              width: '100%',
              maxWidth: 320,
              aspectRatio: '720 / 1024',
              boxShadow: '0 12px 36px rgba(15,23,42,0.25)',
              borderRadius: 2,
              overflow: 'hidden',
              bgcolor: '#0b1120',
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </Box>

        {/* Action buttons */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            fullWidth
            variant="contained"
            startIcon={<Icon icon="mdi:download" />}
            onClick={handleDownload}
            disabled={downloading}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)',
              },
            }}
          >
            {downloading ? 'Rendering…' : 'Download PNG'}
          </Button>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<Icon icon="mdi:content-copy" />}
            onClick={handleCopy}
            disabled={copying}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            {copying ? 'Copying…' : 'Copy image'}
          </Button>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button
            fullWidth
            variant="text"
            size="small"
            startIcon={<Icon icon="mdi:twitter" />}
            component="a"
            href={`https://twitter.com/intent/tweet?text=${shareText}`}
            target="_blank"
            rel="noreferrer"
            sx={{ textTransform: 'none', fontWeight: 700, color: '#1da1f2' }}
          >
            Post to X
          </Button>
          <Button
            fullWidth
            variant="text"
            size="small"
            startIcon={<Icon icon="mdi:reddit" />}
            component="a"
            href={`https://www.reddit.com/r/chess/submit?title=${shareText}`}
            target="_blank"
            rel="noreferrer"
            sx={{ textTransform: 'none', fontWeight: 700, color: '#ff4500' }}
          >
            Post to Reddit
          </Button>
        </Stack>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 1.5, display: 'block', textAlign: 'center', fontSize: '0.72rem' }}
        >
          Tip: download the PNG, then attach it to your tweet/post.
        </Typography>

        <Snackbar
          open={!!toast}
          autoHideDuration={3000}
          onClose={() => setToast(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          {toast ? (
            <Alert severity={toast.kind === 'ok' ? 'success' : 'error'} variant="filled">
              {toast.msg}
            </Alert>
          ) : undefined}
        </Snackbar>
      </Paper>
    </Backdrop>
  );
}
