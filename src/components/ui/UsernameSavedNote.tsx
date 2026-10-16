"use client";

import { useCallback, useState } from "react";
import { Snackbar } from "@mui/material";
import {
  usernameSavedMessage,
  type PlatformUsername,
} from "@/lib/chessAccounts";

/**
 * "Saved hikaru as your Chess.com username", shown once, after the first game
 * a reader loads from a username of their own.
 *
 * Rendered by whatever opens the load dialog rather than inside it: the dialog
 * has closed by the time the profile answers. The note is kept apart from
 * `open` so its words stay put while it slides away.
 */
export function useUsernameSavedNote() {
  const [note, setNote] = useState<PlatformUsername | null>(null);
  const [open, setOpen] = useState(false);

  const show = useCallback((saved: PlatformUsername) => {
    setNote(saved);
    setOpen(true);
  }, []);

  const element = (
    <Snackbar
      open={open}
      autoHideDuration={5000}
      onClose={() => setOpen(false)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      message={note ? usernameSavedMessage(note) : ""}
    />
  );

  return { show, element };
}
