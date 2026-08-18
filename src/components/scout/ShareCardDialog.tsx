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
  buildLinkedInShareUrl,
  buildRedditShareUrl,
  buildShareCardSvg,
  buildShareUrl,
  buildTwitterShareUrl,
  copyPngToClipboard,
  renderSvgToPng,
  ShareCardData,
  triggerDownload,
} from '@/lib/shareCard';

export interface ShareCardDialogProps {
  open: boolean;
  onClose: () => void;
  data: ShareCardData;
  // Minted by the parent (scout page) when the share button is clicked.
  // When present, share URLs use ?scoutId= (loads the point-in-time snapshot
  // without re-fetching games). When null/undefined, URLs fall back to
  // ?u=&p= which re-runs the scout on the recipient's machine.
  snapshotId?: string | null;
}

export default function ShareCardDialog({ open, onClose, data, snapshotId }: ShareCardDialogProps) {
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
      triggerDownload(blob, `chess-masti-scout-${data.username}.png`);
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

  const twitterUrl = buildTwitterShareUrl(data, snapshotId);
  const linkedInUrl = buildLinkedInShareUrl(data, snapshotId);
  const redditUrl = buildRedditShareUrl(data, snapshotId);
  const deepLink = buildShareUrl(data.username, data.platform, snapshotId);

  const handleCopyLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        setToast({ kind: 'err', msg: 'Clipboard not supported in this browser.' });
        return;
      }
      await navigator.clipboard.writeText(deepLink);
      setToast({ kind: 'ok', msg: 'Link copied!' });
    } catch (e) {
      setToast({ kind: 'err', msg: `Copy failed: ${(e as Error).message}` });
    }
  };

  return (
    <Backdrop
      open
      onClick={onClose}
      sx={{
        zIndex: theme => theme.zIndex.modal + 8,
        background: 'rgba(8, 9, 12, 0.72)',
        backdropFilter: 'blur(8px)',
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
          borderRadius: '1.5rem',
          background: 'linear-gradient(180deg, rgba(20,22,28,0.92), rgba(12,14,20,0.92))',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          position: 'relative',
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Icon icon="mdi:share-variant" width={20} style={{ color: '#FB923C' }} />
              <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: 'rgba(255,255,255,0.94)' }}>
                Share {data.username}&apos;s card
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Football-sticker export · PNG, Twitter, Reddit
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={onClose}
            sx={{
              color: 'rgba(255,255,255,0.62)',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
            }}
          >
            <Icon icon="mdi:close" width={18} />
          </IconButton>
        </Stack>

        {/* Preview */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            bgcolor: 'rgba(255,255,255,0.04)',
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
              bgcolor: '#F97316',
              color: '#0A0A0A',
              boxShadow: '0 6px 18px rgba(249,115,22,0.32)',
              '&:hover': {
                bgcolor: '#FB923C',
              },
              '&.Mui-disabled': {
                bgcolor: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.3)',
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
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.94)',
              '&:hover': {
                border: '1px solid #FB923C',
                bgcolor: 'rgba(255,255,255,0.04)',
              },
            }}
          >
            {copying ? 'Copying…' : 'Copy image'}
          </Button>
        </Stack>

        {/* Share-to-network row: three prominent brand-colored buttons */}
        <Typography
          variant="caption"
          sx={{
            mt: 2.5,
            mb: 1,
            display: 'block',
            textAlign: 'center',
            fontWeight: 700,
            fontSize: '0.7rem',
            letterSpacing: '0.14em',
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          OR SHARE TO
        </Typography>
        <Stack direction="row" spacing={1.25}>
          <Button
            fullWidth
            variant="contained"
            startIcon={<Icon icon="mdi:twitter" width={18} />}
            component="a"
            href={twitterUrl}
            target="_blank"
            rel="noreferrer"
            sx={{
              textTransform: 'none',
              fontWeight: 800,
              py: 1.1,
              bgcolor: '#0f1419',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.06)',
              '&:hover': { bgcolor: '#1d2226' },
              boxShadow: '0 4px 12px rgba(15,20,25,0.25)',
            }}
          >
            X
          </Button>
          <Button
            fullWidth
            variant="contained"
            startIcon={<Icon icon="mdi:linkedin" width={18} />}
            component="a"
            href={linkedInUrl}
            target="_blank"
            rel="noreferrer"
            sx={{
              textTransform: 'none',
              fontWeight: 800,
              py: 1.1,
              bgcolor: '#0a66c2',
              color: '#fff',
              '&:hover': { bgcolor: '#084d92' },
              boxShadow: '0 4px 12px rgba(10,102,194,0.3)',
            }}
          >
            LinkedIn
          </Button>
          <Button
            fullWidth
            variant="contained"
            startIcon={<Icon icon="mdi:reddit" width={18} />}
            component="a"
            href={redditUrl}
            target="_blank"
            rel="noreferrer"
            sx={{
              textTransform: 'none',
              fontWeight: 800,
              py: 1.1,
              bgcolor: '#ff4500',
              color: '#fff',
              '&:hover': { bgcolor: '#d93a00' },
              boxShadow: '0 4px 12px rgba(255,69,0,0.3)',
            }}
          >
            Reddit
          </Button>
        </Stack>

        {/* Copy link row */}
        <Button
          fullWidth
          variant="outlined"
          size="small"
          startIcon={<Icon icon="mdi:link-variant" width={16} />}
          onClick={handleCopyLink}
          sx={{
            mt: 1.5,
            textTransform: 'none',
            fontWeight: 700,
            borderColor: 'rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.62)',
            '&:hover': { borderColor: '#FB923C', color: '#FB923C' },
          }}
        >
          Copy share link
        </Button>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 1.5, display: 'block', textAlign: 'center', fontSize: '0.7rem', lineHeight: 1.4 }}
        >
          Tip: download the PNG first, then attach it to your post for the full effect.
          <br />
          <Box component="span" sx={{ opacity: 0.7 }}>
            LinkedIn doesn&apos;t pre-fill text — you&apos;ll write your own caption.
          </Box>
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
