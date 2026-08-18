"use client";

import { useCallback, useState } from "react";
import { Box, Button, TextField, Typography } from "@mui/material";
import { ShieldAlert } from "lucide-react";

/**
 * "Add an email so you can get back in."
 *
 * Signup asks for a handle and a password; the email is optional. That buys a
 * two-field signup and costs recoverability — with no address on file there is
 * nowhere to send a reset link, so a forgotten password is a lost account.
 * This is the promised nag.
 *
 * NOT dismissible-forever, unlike the handle card. A handle is a nicety; this
 * one is the difference between an account you can get back into and one you
 * cannot, so "later" hides it for this session only and it returns on the next
 * visit. It disappears permanently the moment an email exists.
 */

interface EmailCardProps {
  /** Rendered only when the account has none. */
  currentEmail?: string;
  /** Google accounts arrive with an address and no password to re-prove. */
  hasPassword: boolean;
  onSaved: () => Promise<unknown> | unknown;
}

export default function EmailCard({
  currentEmail,
  hasPassword,
  onSaved,
}: EmailCardProps) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save that email.");
        return;
      }
      await onSaved();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }, [email, password, onSaved]);

  // An account with no password came through Google, which means it already
  // has an address — there is nothing to nag about and no password to re-prove.
  if (currentEmail || hidden || !hasPassword) return null;

  return (
    <Box
      sx={{
        p: 2,
        mb: 2.5,
        borderRadius: "16px",
        background: "rgba(251,191,36,0.06)",
        border: "1px solid rgba(251,191,36,0.22)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.25 }}>
        <ShieldAlert size={16} color="#FBBF24" />
        <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: "1.05rem" }}>
          Keep your account
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          onClick={() => setHidden(true)}
          sx={{
            textTransform: "none",
            fontSize: "0.75rem",
            color: "rgba(255,255,255,0.4)",
            minWidth: 0,
          }}
        >
          Later
        </Button>
      </Box>
      <Typography
        sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.82rem", mb: 1.5 }}
      >
        You signed up without an email. If you forget your password we have
        nowhere to send a reset link, and the account is gone. Adding one also
        lets you sign in with Google.
      </Typography>

      {!open ? (
        <Button
          variant="contained"
          onClick={() => setOpen(true)}
          sx={{
            textTransform: "none",
            fontWeight: 700,
            borderRadius: "10px",
            background: "#F97316",
            "&:hover": { background: "#EA580C" },
          }}
        >
          Add email
        </Button>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <TextField
            size="small"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            inputProps={{ "aria-label": "Email" }}
            sx={fieldSx}
          />
          {/* Re-proving the password is what stops a stolen session from
              attaching its own address and then resetting the password. */}
          <TextField
            size="small"
            type="password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            inputProps={{ "aria-label": "Password" }}
            sx={fieldSx}
          />
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="contained"
              disabled={busy || !email.trim() || !password}
              onClick={save}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderRadius: "10px",
                background: "#F97316",
                "&:hover": { background: "#EA580C" },
                "&.Mui-disabled": {
                  background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.35)",
                },
              }}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button
              onClick={() => setOpen(false)}
              sx={{ textTransform: "none", color: "rgba(255,255,255,0.6)" }}
            >
              Cancel
            </Button>
          </Box>
          {error && (
            <Typography sx={{ color: "#FBBF24", fontSize: "0.78rem" }}>
              {error}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

const fieldSx = {
  "& .MuiOutlinedInput-root": {
    color: "#fff",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.04)",
  },
  "& fieldset": { borderColor: "rgba(255,255,255,0.14)" },
} as const;
