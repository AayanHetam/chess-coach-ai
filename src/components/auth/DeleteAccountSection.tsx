"use client";

import { useState } from "react";
import {
  Box,
  Stack,
  Button,
  Typography,
  TextField,
  Alert,
  Dialog,
  DialogContent,
  DialogActions,
} from "@mui/material";

/**
 * "Delete my account" — the in-app half of the right to erasure.
 *
 * The destructive control is deliberately two-stage. The section shows only a
 * text button; the irreversible part lives behind a dialog that will not enable
 * its confirm button until the person types DELETE. That phrase is re-checked
 * server-side (`/api/account/delete`), so the guard is not merely cosmetic —
 * the UI can be bypassed, the route cannot.
 *
 * What it deletes is spelled out BEFORE the click rather than in a policy page,
 * because "delete account" reads as "log me out for good" to a lot of people
 * and this also takes their saved games and coach history with it.
 *
 * On success the server has already cleared the session cookie, so the only
 * correct next move is a hard navigation — any client state still in memory
 * belongs to a uid that no longer exists.
 */

const CONFIRM_PHRASE = "DELETE";

export default function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = typed.trim() === CONFIRM_PHRASE;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setTyped("");
    setError(null);
  };

  const submit = async () => {
    if (!armed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: CONFIRM_PHRASE }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "Could not delete the account.");
        setBusy(false);
        return;
      }
      // Full reload, not a router push: the session cookie is gone and every
      // in-memory context still holds the deleted uid.
      window.location.href = "/?deleted=1";
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  };

  return (
    <Box>
      <Typography
        variant="subtitle2"
        sx={{ mb: 1, fontWeight: 700, color: "error.main" }}
      >
        Delete account
      </Typography>
      <Typography
        variant="body2"
        sx={{ mb: 1.5, color: "text.secondary", lineHeight: 1.6 }}
      >
        Permanently deletes your account, saved games, coach conversations,
        puzzle history, course progress and leaderboard entry. This cannot be
        undone and there is no recovery window.
      </Typography>
      <Button
        color="error"
        variant="outlined"
        onClick={() => setOpen(true)}
        sx={{ textTransform: "none", fontWeight: 600 }}
      >
        Delete my account
      </Button>

      <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
        <DialogContent>
          <Stack spacing={2}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Delete your account?
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              This removes your account and everything tied to it — saved games,
              coach chats, puzzle and course progress, and your public
              leaderboard entry. Your handle is released for anyone to claim.
              It cannot be undone.
            </Typography>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label={`Type ${CONFIRM_PHRASE} to confirm`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={busy}
              inputProps={{ "aria-label": "Type DELETE to confirm" }}
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={close}
            disabled={busy}
            sx={{ textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={submit}
            disabled={!armed || busy}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            {busy ? "Deleting…" : "Delete forever"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
