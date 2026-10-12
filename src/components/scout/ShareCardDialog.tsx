import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  IconButton,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { Icon } from "@iconify/react";
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
} from "@/lib/shareCard";
import { ROSE } from "./dossier";
import { RADIUS, SURFACE, TEXT, TYPE } from "@/theme/tokens";

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

export default function ShareCardDialog({
  open,
  onClose,
  data,
  snapshotId,
}: ShareCardDialogProps) {
  const svg = useMemo(() => buildShareCardSvg(data), [data]);
  const [copying, setCopying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);

  // Reset transient state on open change.
  useEffect(() => {
    if (!open) {
      setToast(null);
      setCopying(false);
      setDownloading(false);
    }
  }, [open]);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const blob = await renderSvgToPng(svg);
      triggerDownload(blob, `chess-masti-scout-${data.username}.png`);
      setToast({ kind: "ok", msg: "PNG downloaded." });
    } catch (e) {
      setToast({
        kind: "err",
        msg: `Download failed: ${(e as Error).message}`,
      });
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
          ? { kind: "ok", msg: "Card copied to clipboard." }
          : {
              kind: "err",
              msg: "Clipboard image copy not supported in this browser.",
            }
      );
    } catch (e) {
      setToast({ kind: "err", msg: `Copy failed: ${(e as Error).message}` });
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
        setToast({
          kind: "err",
          msg: "Clipboard not supported in this browser.",
        });
        return;
      }
      await navigator.clipboard.writeText(deepLink);
      setToast({ kind: "ok", msg: "Link copied." });
    } catch (e) {
      setToast({ kind: "err", msg: `Copy failed: ${(e as Error).message}` });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      // Backdrop's aria-hidden="true" was swallowing clicks on focused
      // descendants (see issue #35 / PR #30) — Dialog handles focus trap,
      // aria, and event propagation correctly. The theme styles the paper.
      PaperProps={{ sx: { width: "min(92vw, 560px)", maxHeight: "92vh" } }}
    >
      <DialogContent sx={{ p: 3 }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 2 }}
        >
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Icon
                icon="mdi:share-variant"
                width={20}
                style={{ color: ROSE.bright }}
              />
              <Typography sx={{ ...TYPE.h4, color: TEXT.primary }}>
                Share {data.username}&apos;s card
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Download the card as a PNG, or share it to X, LinkedIn or Reddit
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={onClose}
            aria-label="Close"
            sx={{ color: TEXT.secondary }}
          >
            <Icon icon="mdi:close" width={18} />
          </IconButton>
        </Stack>

        {/* Preview */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            bgcolor: SURFACE.raisedSecondary,
            borderRadius: `${RADIUS.control}px`,
            p: 1,
            mb: 2.5,
          }}
        >
          <Box
            sx={{
              width: "100%",
              maxWidth: 320,
              aspectRatio: "720 / 1024",
              borderRadius: `${RADIUS.small}px`,
              overflow: "hidden",
              bgcolor: "#0b1120",
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </Box>

        {/* Action buttons */}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button
            fullWidth
            variant="contained"
            startIcon={<Icon icon="mdi:download" />}
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? "Rendering…" : "Download PNG"}
          </Button>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<Icon icon="mdi:content-copy" />}
            onClick={handleCopy}
            disabled={copying}
          >
            {copying ? "Copying…" : "Copy image"}
          </Button>
        </Stack>

        {/* Share-to-network row */}
        <Typography
          variant="caption"
          sx={{
            ...TYPE.label,
            mt: 2.5,
            mb: 1,
            display: "block",
            textAlign: "center",
            color: TEXT.secondary,
          }}
        >
          Or share to
        </Typography>
        <Stack direction="row" spacing={1.25}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<Icon icon="mdi:twitter" width={18} />}
            component="a"
            href={twitterUrl}
            target="_blank"
            rel="noreferrer"
          >
            X
          </Button>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<Icon icon="mdi:linkedin" width={18} />}
            component="a"
            href={linkedInUrl}
            target="_blank"
            rel="noreferrer"
          >
            LinkedIn
          </Button>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<Icon icon="mdi:reddit" width={18} />}
            component="a"
            href={redditUrl}
            target="_blank"
            rel="noreferrer"
          >
            Reddit
          </Button>
        </Stack>

        {/* Copy link row */}
        <Button
          fullWidth
          variant="text"
          size="small"
          startIcon={<Icon icon="mdi:link-variant" width={16} />}
          onClick={handleCopyLink}
          sx={{ mt: 1.5 }}
        >
          Copy share link
        </Button>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            mt: 1.5,
            display: "block",
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          Tip: download the PNG first, then attach it to your post for the full
          effect.
          <br />
          <Box component="span" sx={{ opacity: 0.7 }}>
            LinkedIn doesn&apos;t pre-fill text, so you&apos;ll write your own
            caption.
          </Box>
        </Typography>

        <Snackbar
          open={!!toast}
          autoHideDuration={3000}
          onClose={() => setToast(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          {toast ? (
            <Alert
              severity={toast.kind === "ok" ? "success" : "error"}
              variant="filled"
            >
              {toast.msg}
            </Alert>
          ) : undefined}
        </Snackbar>
      </DialogContent>
    </Dialog>
  );
}
