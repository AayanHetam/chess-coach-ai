import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
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
import { loadPieceAssets, PieceAssetMap } from '@/lib/chessPieceAssets';
// Reuse PNG/canvas helpers — they're generic, not Stalker-card-specific.
import { copyPngToClipboard, renderSvgToPng, triggerDownload } from '@/lib/shareCard';

export interface AnalysisSnippetDialogProps {
  open: boolean;
  onClose: () => void;
  data: AnalysisSnippetData;
}

export default function AnalysisSnippetDialog({ open, onClose, data }: AnalysisSnippetDialogProps) {
  const [pieceAssets, setPieceAssets] = useState<PieceAssetMap | null>(null);
  const [copying, setCopying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  // Load real piece SVGs on first open. Module-level cache in chessPieceAssets
  // means subsequent opens resolve synchronously from cache.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadPieceAssets()
      .then(assets => {
        if (!cancelled) setPieceAssets(assets);
      })
      .catch(err => {
        if (!cancelled) {
          setToast({ kind: 'err', msg: `Failed to load piece assets: ${(err as Error).message}` });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setToast(null);
      setCopying(false);
      setDownloading(false);
    }
  }, [open]);

  const svg = useMemo(
    () => (pieceAssets ? buildAnalysisSnippetSvg(data, pieceAssets) : ''),
    [data, pieceAssets]
  );

  const twitterUrl = buildSnippetTwitterShareUrl(data);
  const linkedInUrl = buildSnippetLinkedInShareUrl(data);
  const redditUrl = buildSnippetRedditShareUrl(data);
  const deepLink = buildSnippetUrl(data.fen);

  // Extract a useful diagnostic message from anything the rasterizer might
  // reject with. Image.onerror passes an Event, not an Error, which is why
  // the old `(e as Error).message` produced "Download failed: undefined".
  const errMsg = (e: unknown): string => {
    if (e instanceof Error) return e.message;
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object' && 'type' in e) {
      return `Image load error: ${(e as { type: string }).type}`;
    }
    return 'unknown (check console)';
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const blob = await renderSvgToPng(svg);
      // Filename: short FEN slug so users can tell their downloads apart.
      const slug = data.fen.split(' ')[0]?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'position';
      triggerDownload(blob, `chessmasti-analysis-${slug}.png`);
      setToast({ kind: 'ok', msg: 'PNG downloaded.' });
    } catch (e) {
      console.error('Snippet PNG download failed:', e);
      setToast({ kind: 'err', msg: `Download failed: ${errMsg(e)}` });
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
      console.error('Snippet image copy failed:', e);
      setToast({ kind: 'err', msg: `Copy failed: ${errMsg(e)}` });
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
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      // Backdrop's aria-hidden was swallowing clicks on focused descendants;
      // Dialog handles focus trap, aria, and event propagation correctly.
      PaperProps={{
        sx: {
          width: 'min(94vw, 760px)',
          maxHeight: '92vh',
          borderRadius: 3,
          background: 'linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)',
        },
      }}
      slotProps={{
        backdrop: {
          sx: {
            background: 'rgba(5, 10, 20, 0.78)',
            backdropFilter: 'blur(6px)',
          },
        },
      }}
    >
      <DialogContent sx={{ p: 3 }}>
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

        {/* Card preview (landscape — keep the 1200/675 = 16/9 aspect).
            Until piece assets resolve, show a centered spinner at the same
            aspect ratio so the dialog doesn't jump when the SVG lands. */}
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
          {pieceAssets ? (
            <Box
              sx={{
                width: '100%',
                maxWidth: 680,
                aspectRatio: '1200 / 675',
                boxShadow: '0 12px 36px rgba(15,23,42,0.25)',
                borderRadius: 2,
                overflow: 'hidden',
                bgcolor: '#0b1120',
                // Force inline SVG to fill the box. Without this, the SVG's
                // intrinsic 1200×675 attrs render at full size and overflow:
                // hidden clips the right/lower portions.
                '& svg': { width: '100%', height: '100%', display: 'block' },
              }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <Box
              sx={{
                width: '100%',
                maxWidth: 680,
                aspectRatio: '1200 / 675',
                borderRadius: 2,
                bgcolor: '#0b1120',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CircularProgress size={28} sx={{ color: '#FF6B35' }} />
            </Box>
          )}
        </Box>

        {/* Primary action row — Download / Copy image.
            Both gated on pieceAssets so the user can't render an empty SVG. */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            fullWidth
            variant="contained"
            startIcon={<Icon icon="mdi:download" />}
            onClick={handleDownload}
            disabled={downloading || !pieceAssets}
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
            disabled={copying || !pieceAssets}
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
      </DialogContent>
    </Dialog>
  );
}
