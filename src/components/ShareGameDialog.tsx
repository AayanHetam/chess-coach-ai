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

export interface ShareGameDialogProps {
  open: boolean;
  onClose: () => void;
  /** Built by the caller from gameAtom + gameEvalAtom + optional transcript. */
  payload: GameShareCreateRequest | null;
}

const SITE_URL = "https://chessmasti.com";

function buildShareText(playerLine: string, url: string): string {
  return `Coached this on Chess Masti AI — ${playerLine}. Free AI chess coach: ${url} #ChessMasti #Chess #AI`;
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
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

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
          setError("Share failed — server returned no ID.");
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
        setToast({ kind: "err", msg: "Clipboard not supported in this browser." });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setToast({ kind: "ok", msg: "Link copied!" });
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
        "Coached my game on Chess Masti AI — free AI chess coach with engine-grounded analysis"
      )}&url=${encodeURIComponent(shareUrl)}`
    : null;

  return (
    <Backdrop
      open
      onClick={onClose}
      sx={{
        zIndex: (theme) => theme.zIndex.modal + 8,
        background: "rgba(5, 10, 20, 0.75)",
        backdropFilter: "blur(6px)",
      }}
    >
      <Paper
        onClick={(e) => e.stopPropagation()}
        elevation={24}
        sx={{
          width: "min(92vw, 540px)",
          maxHeight: "92vh",
          overflow: "auto",
          p: 3,
          borderRadius: 3,
          background: "linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)",
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
              <Icon icon="mdi:share-variant" width={20} style={{ color: "#FF6B35" }} />
              <Typography sx={{ fontWeight: 800, fontSize: "1.05rem" }}>
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
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              p: 2,
              borderRadius: 2,
              background: "rgba(255,107,53,0.08)",
              border: "1px solid rgba(255,107,53,0.18)",
              mb: 2,
            }}
          >
            <CircularProgress size={18} sx={{ color: "#FF6B35" }} />
            <Typography sx={{ fontSize: "0.9rem", color: "text.secondary" }}>
              Generating share link…
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
              InputProps={{ readOnly: true, sx: { fontFamily: "ui-monospace, monospace", fontSize: "0.85rem" } }}
              sx={{ mb: 2 }}
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }}>
              <Button
                fullWidth
                variant="contained"
                startIcon={<Icon icon="mdi:content-copy" />}
                onClick={handleCopyLink}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)",
                  },
                }}
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
                sx={{ textTransform: "none", fontWeight: 700 }}
              >
                Open
              </Button>
            </Stack>

            <Typography
              variant="caption"
              sx={{
                display: "block",
                textAlign: "center",
                fontWeight: 700,
                fontSize: "0.7rem",
                letterSpacing: 1.5,
                color: "text.secondary",
                mt: 1,
                mb: 1,
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
                href={twitterUrl || undefined}
                target="_blank"
                rel="noreferrer"
                disabled={!twitterUrl}
                sx={{
                  textTransform: "none",
                  fontWeight: 800,
                  py: 1.1,
                  bgcolor: "#0f1419",
                  color: "#fff",
                  "&:hover": { bgcolor: "#1d2226" },
                }}
              >
                X
              </Button>
              <Button
                fullWidth
                variant="contained"
                startIcon={<Icon icon="mdi:linkedin" width={18} />}
                component="a"
                href={linkedInUrl || undefined}
                target="_blank"
                rel="noreferrer"
                disabled={!linkedInUrl}
                sx={{
                  textTransform: "none",
                  fontWeight: 800,
                  py: 1.1,
                  bgcolor: "#0a66c2",
                  color: "#fff",
                  "&:hover": { bgcolor: "#084d92" },
                }}
              >
                LinkedIn
              </Button>
              <Button
                fullWidth
                variant="contained"
                startIcon={<Icon icon="mdi:reddit" width={18} />}
                component="a"
                href={redditUrl || undefined}
                target="_blank"
                rel="noreferrer"
                disabled={!redditUrl}
                sx={{
                  textTransform: "none",
                  fontWeight: 800,
                  py: 1.1,
                  bgcolor: "#ff4500",
                  color: "#fff",
                  "&:hover": { bgcolor: "#d93a00" },
                }}
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
          variant="caption"
          color="text.secondary"
          sx={{
            mt: 2.5,
            display: "block",
            textAlign: "center",
            fontSize: "0.7rem",
            lineHeight: 1.5,
          }}
        >
          The link is public. Anyone with the URL can view the game and the coach&apos;s analysis.
        </Typography>

        <Snackbar
          open={!!toast}
          autoHideDuration={3000}
          onClose={() => setToast(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          {toast ? (
            <Alert severity={toast.kind === "ok" ? "success" : "error"} variant="filled">
              {toast.msg}
            </Alert>
          ) : undefined}
        </Snackbar>
      </Paper>
    </Backdrop>
  );
}
