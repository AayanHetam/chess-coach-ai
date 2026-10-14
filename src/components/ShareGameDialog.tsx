// Share-this-game dialog — mints a public /share/game/[id] URL by POSTing
// the current game state (PGN, headers, eval, optional coach transcript)
// to /api/games/share. The minted URL is displayed with copy buttons and
// a row of pre-filled social-share intents.
//
// Pattern mirrors the existing scout ShareCardDialog: open immediately for
// UX, POST in the background, hydrate the URL field once the response
// lands. If POST fails the dialog surfaces the error inline rather than
// leaving the user on a stale spinner.

import { useEffect, useState } from "react";
import {
  Alert,
  Backdrop,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Icon } from "@iconify/react";
import type { GameShareCreateRequest } from "@/types/gameShare";
import {
  LINE,
  MATERIAL,
  RADIUS,
  SHADOW,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

export interface ShareGameDialogProps {
  open: boolean;
  onClose: () => void;
  /** Built by the caller from gameAtom + gameEvalAtom + optional transcript. */
  payload: GameShareCreateRequest | null;
}

const SITE_URL = "https://chessmasti.com";

function buildShareText(playerLine: string, url: string): string {
  return `Coached this on Chess Masti: ${playerLine}. Free chess coach: ${url} #ChessMasti #Chess`;
}

export default function ShareGameDialog({
  open,
  onClose,
  payload,
}: ShareGameDialogProps) {
  const [shareId, setShareId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);

  // Reset state on open/close.
  useEffect(() => {
    if (!open) {
      setShareId(null);
      setError(null);
      setPosting(false);
      setNote("");
      setToast(null);
    }
  }, [open]);

  // Auto-POST once when the dialog opens (only if payload available, only
  // once per open cycle — guarded by shareId+posting).
  useEffect(() => {
    if (!open || !payload || shareId || posting || error) return;
    let cancelled = false;
    setPosting(true);
    (async () => {
      try {
        const res = await fetch("/api/games/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ ...payload, note: note.trim() || null }),
        });
        if (cancelled) return;
        if (res.status === 401) {
          setError("Please sign in to create a share link.");
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body?.error || `Share failed (status ${res.status}).`);
          return;
        }
        const json = await res.json();
        if (typeof json?.id === "string") {
          setShareId(json.id);
        } else {
          setError("Share failed: the server returned no ID.");
        }
      } catch (err) {
        if (!cancelled) {
          setError(`Share failed: ${(err as Error).message}`);
        }
      } finally {
        if (!cancelled) setPosting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // We deliberately only run this when the dialog *opens* — note edits
    // don't re-POST. To update the note, the user closes and reopens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const shareUrl = shareId ? `${SITE_URL}/share/game/${shareId}` : null;
  const playerLine =
    payload?.white && payload?.black
      ? `${payload.white} vs ${payload.black}${payload.result ? `, ${payload.result}` : ""}`
      : "my game";

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      if (!navigator.clipboard?.writeText) {
        setToast({
          kind: "err",
          msg: "Clipboard not supported in this browser.",
        });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setToast({ kind: "ok", msg: "Link copied" });
    } catch (e) {
      setToast({ kind: "err", msg: `Copy failed: ${(e as Error).message}` });
    }
  };

  const twitterUrl = shareUrl
    ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(buildShareText(playerLine, shareUrl))}`
    : null;
  const linkedInUrl = shareUrl
    ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
    : null;
  const redditUrl = shareUrl
    ? `https://www.reddit.com/r/chess/submit?title=${encodeURIComponent(
        // Only what is true on every deploy: the claim checks are behind a
        // flag, so the post does not promise them.
        "Coached my game on Chess Masti, a free chess coach"
      )}&url=${encodeURIComponent(shareUrl)}`
    : null;

  return (
    <Backdrop
      open
      onClick={onClose}
      sx={{
        zIndex: (theme) => theme.zIndex.modal + 8,
        background: MATERIAL.scrim,
      }}
    >
      <Paper
        onClick={(e) => e.stopPropagation()}
        elevation={0}
        sx={{
          width: "min(92vw, 540px)",
          maxHeight: "92vh",
          overflow: "auto",
          p: 3,
          borderRadius: `${RADIUS.sheet}px`,
          background: SURFACE.overlay,
          border: `1px solid ${LINE.hairline}`,
          boxShadow: SHADOW.modal,
          position: "relative",
        }}
      >
        {/* Header */}
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
                style={{ color: TEXT.secondary }}
              />
              <Typography component="h2" sx={{ ...TYPE.h4 }}>
                Share this game
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Public link · anyone with the URL can view
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose}>
            <Icon icon="mdi:close" width={18} />
          </IconButton>
        </Stack>

        {/* No payload available */}
        {!payload && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Load a game first, then share it.
          </Alert>
        )}

        {/* Error */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Posting */}
        {posting && !error && (
          <Box
            role="status"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              p: 2,
              borderRadius: `${RADIUS.control}px`,
              background: SURFACE.raisedSecondary,
              border: `1px solid ${LINE.hairline}`,
              mb: 2,
            }}
          >
            <CircularProgress size={16} sx={{ color: TEXT.secondary }} />
            <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}>
              Generating share link
            </Typography>
          </Box>
        )}

        {/* Share URL ready */}
        {shareUrl && (
          <>
            <TextField
              fullWidth
              size="small"
              value={shareUrl}
              InputProps={{
                readOnly: true,
                sx: { fontSize: TYPE.bodySmall.fontSize },
              }}
              sx={{ mb: 2 }}
            />

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              sx={{ mb: 2 }}
            >
              <Button
                fullWidth
                variant="contained"
                startIcon={<Icon icon="mdi:content-copy" />}
                onClick={handleCopyLink}
              >
                Copy link
              </Button>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<Icon icon="mdi:open-in-new" />}
                component="a"
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open
              </Button>
            </Stack>

            <Typography
              sx={{
                display: "block",
                textAlign: "center",
                ...TYPE.label,
                color: TEXT.secondary,
                mt: 1,
                mb: 1,
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
                href={twitterUrl || undefined}
                target="_blank"
                rel="noreferrer"
                disabled={!twitterUrl}
                sx={{ py: 1.1 }}
              >
                X
              </Button>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<Icon icon="mdi:linkedin" width={18} />}
                component="a"
                href={linkedInUrl || undefined}
                target="_blank"
                rel="noreferrer"
                disabled={!linkedInUrl}
                sx={{ py: 1.1 }}
              >
                LinkedIn
              </Button>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<Icon icon="mdi:reddit" width={18} />}
                component="a"
                href={redditUrl || undefined}
                target="_blank"
                rel="noreferrer"
                disabled={!redditUrl}
                sx={{ py: 1.1 }}
              >
                Reddit
              </Button>
            </Stack>
          </>
        )}

        {/* Note input — only meaningful pre-mint */}
        {!shareUrl && !error && payload && (
          <TextField
            label="Add a note (optional)"
            placeholder="What did the coach catch in this game?"
            fullWidth
            multiline
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={posting}
            inputProps={{ maxLength: 2000 }}
            sx={{ mt: 1 }}
          />
        )}

        <Typography
          sx={{
            mt: 2.5,
            display: "block",
            textAlign: "center",
            ...TYPE.caption,
            color: TEXT.secondary,
          }}
        >
          The link is public. Anyone with the URL can view the game and the
          coach&apos;s analysis.
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
      </Paper>
    </Backdrop>
  );
}
