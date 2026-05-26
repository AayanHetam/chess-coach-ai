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
  AnalysisSnippetData,
  buildAnalysisSnippetSvg,
  buildSnippetLinkedInShareUrl,
  buildSnippetRedditShareUrl,
  buildSnippetTwitterShareUrl,
  buildSnippetUrl,
} from '@/lib/analysisSnippet';
// Reuse PNG/canvas helpers — they're generic, not Stalker-card-specific.
import { copyPngToClipboard, renderSvgToPng, triggerDownload } from '@/lib/shareCard';

export interface AnalysisSnippetDialogProps {
  open: boolean;
  onClose: () => void;
  data: AnalysisSnippetData;
}

export default function AnalysisSnippetDialog({ open, onClose, data }: AnalysisSnippetDialogProps) {
  const svg = useMemo(() => buildAnalysisSnippetSvg(data), [data]);
  const [copying, setCopying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    if (!open) {
      setToast(null);
      setCopying(false);
      setDownloading(false);
    }
  }, [open]);

  if (!open) return null;

  const twitterUrl = buildSnippetTwitterShareUrl(data);
  const linkedInUrl = buildSnippetLinkedInShareUrl(data);
  const redditUrl = buildSnippetRedditShareUrl(data);
  const deepLink = buildSnippetUrl(data.fen);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const blob = await renderSvgToPng(svg);
      // Filename: short FEN slug so users can tell their downloads apart.
      const slug = data.fen.split(' ')[0]?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'position';
      triggerDownload(blob, `chessmasti-analysis-${slug}.png`);
      setToast({ kind: 'ok', msg: 'PNG downloaded.' });
    } catch (e) {
      setToast({ kind: 'err', msg: `Download failed: ${(e as Error).message}` });
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyImage = async () => {
    try {
      setCopying(true);
      const blob = await renderSvgToPng(svg);
      const ok = await copyPngToClipboard(blob);
      setToast(
        ok
          ? { kind: 'ok', msg: 'Image copied to clipboard!' }
          : { kind: 'err', msg: 'Clipboard image copy not supported in this browser.' }
      );
    } catch (e) {
      setToast({ kind: 'err', msg: `Copy failed: ${(e as Error).message}` });
    } finally {
      setCopying(false);
    }
  };

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
        background: 'rgba(5, 10, 20, 0.78)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <Paper
        onClick={e => e.stopPropagation()}
        elevation={24}
        sx={{
          // Landscape preview needs more width — cap at 760 so it doesn't dominate small screens.
          width: 'min(94vw, 760px)',
          maxHeight: '92vh',
          overflow: 'auto',
          p: 3,
          borderRadius: 3,
          background: 'linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)',
          position: 'relative',
        }}
      >
        {/* Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Icon icon="mdi:share-variant" width={20} style={{ color: '#FF6B35' }} />
              <Typography sx={{ fontWeight: 800, fontSize: '1.05rem' }}>
                Share this analysis
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Board + coach explanation · PNG, social, copy link
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} aria-label="Close share dialog">
            <Icon icon="mdi:close" width={18} />
          </IconButton>
        </Stack>

        {/* Card preview (landscape — keep the 1200/675 = 16/9 aspect) */}
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
              maxWidth: 680,
              aspectRatio: '1200 / 675',
              boxShadow: '0 12px 36px rgba(15,23,42,0.25)',
              borderRadius: 2,
              overflow: 'hidden',
              bgcolor: '#0b1120',
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </Box>

        {/* Primary action row — Download / Copy image */}
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
            onClick={handleCopyImage}
            disabled={copying}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            {copying ? 'Copying…' : 'Copy image'}
          </Button>
        </Stack>

        {/* Social row */}
        <Typography
          variant="caption"
          sx={{
            mt: 2.5,
            mb: 1,
            display: 'block',
            textAlign: 'center',
            fontWeight: 700,
            fontSize: '0.7rem',
            letterSpacing: 1.5,
            color: 'text.secondary',
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
            borderColor: 'divider',
            color: 'text.secondary',
            '&:hover': { borderColor: '#FF6B35', color: '#FF6B35' },
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
