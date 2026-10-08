"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, TextField, Typography } from "@mui/material";
import { AtSign, Check } from "lucide-react";
import { checkHandle, HANDLE_MAX } from "@/lib/auth/handle";
import {
  fetchHandleAvailability,
  postHandleClaim,
} from "@/lib/auth/handleClient";

/**
 * Claim a handle from /profile.
 *
 * The onboarding quiz now asks for one, so new accounts arrive with it set and
 * never see this card. It stays for the two cases the quiz cannot cover:
 * accounts that predate the question entirely, and the signup whose claim lost
 * the race to another user in the seconds after they submitted it.
 *
 * Dismissible on purpose: nothing about the product stops working without a
 * handle, so a wall would cost sessions to buy a field.
 */

const DISMISS_KEY = "cm_handle_prompt_dismissed_v1";

interface HandleCardProps {
  currentHandle?: string;
  onClaimed: () => Promise<unknown> | unknown;
}

export default function HandleCard({
  currentHandle,
  onClaimed,
}: HandleCardProps) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<
    "idle" | "checking" | "free" | "taken" | "invalid" | "saving" | "done"
  >("idle");
  const [message, setMessage] = useState<string | undefined>();
  const [dismissed, setDismissed] = useState(true); // assume dismissed until read
  const seqRef = useRef(0);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  // Live availability. Debounced, and every response carries the sequence it
  // was issued for — otherwise a slow "free" for an old keystroke can land
  // after a fast "taken" for the current one and show the wrong answer.
  useEffect(() => {
    const local = checkHandle(value);
    if (!local.ok) {
      setStatus(value.length === 0 ? "idle" : "invalid");
      setMessage(value.length === 0 ? undefined : local.message);
      return;
    }
    setStatus("checking");
    setMessage(undefined);
    const seq = ++seqRef.current;
    const timer = setTimeout(async () => {
      const { available, message: reason } =
        await fetchHandleAvailability(value);
      if (seq !== seqRef.current) return;
      if (available === undefined) {
        // Unknown, not "free". Claiming is the real gate anyway.
        setStatus("idle");
        setMessage(undefined);
        return;
      }
      setStatus(available ? "free" : "taken");
      setMessage(available ? undefined : reason);
    }, 350);
    return () => clearTimeout(timer);
  }, [value]);

  const claim = useCallback(async () => {
    setStatus("saving");
    const result = await postHandleClaim(value);
    if (result.status === "ok" || result.status === "unchanged") {
      setStatus("done");
      await onClaimed();
      return;
    }
    setStatus(result.status === "taken" ? "taken" : "invalid");
    setMessage(result.message ?? "Could not claim that handle.");
  }, [value, onClaimed]);

  if (currentHandle || dismissed || status === "done") return null;

  const canClaim = status === "free";

  return (
    <Box
      sx={{
        p: 2,
        mb: 2.5,
        borderRadius: "16px",
        background: "rgba(249,115,22,0.06)",
        border: "1px solid rgba(249,115,22,0.22)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.25 }}>
        <AtSign size={16} color="#FB923C" />
        <Typography
          sx={{ color: "#fff", fontWeight: 800, fontSize: "1.05rem" }}
        >
          Pick your handle
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* private mode — dismissing for this session is enough */
            }
            setDismissed(true);
          }}
          sx={{
            textTransform: "none",
            fontSize: "0.75rem",
            color: "rgba(255,255,255,0.4)",
            minWidth: 0,
          }}
        >
          Not now
        </Button>
      </Box>
      <Typography
        sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.82rem", mb: 1.5 }}
      >
        It&apos;s how we&apos;ll address you, and you can sign in with it
        instead of your email. Don&apos;t use your full name — other players can
        see this.
      </Typography>

      <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
        <TextField
          size="small"
          placeholder="lazerwizard"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputProps={{ maxLength: HANDLE_MAX, "aria-label": "Handle" }}
          sx={{
            flex: 1,
            "& .MuiOutlinedInput-root": {
              color: "#fff",
              borderRadius: "10px",
              background: "rgba(255,255,255,0.04)",
            },
            "& fieldset": { borderColor: "rgba(255,255,255,0.14)" },
          }}
        />
        <Button
          variant="contained"
          disabled={!canClaim}
          onClick={claim}
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
          {status === "saving" ? "Claiming…" : "Claim"}
        </Button>
      </Box>

      <Box sx={{ minHeight: 20, mt: 0.75 }}>
        {status === "checking" && <Hint>Checking…</Hint>}
        {status === "free" && (
          <Hint color="#4ADE80">
            <Check size={12} strokeWidth={3} /> {value} is free
          </Hint>
        )}
        {(status === "taken" || status === "invalid") && message && (
          <Hint color="#FBBF24">{message}</Hint>
        )}
      </Box>
    </Box>
  );
}

function Hint({
  children,
  color = "rgba(255,255,255,0.45)",
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <Typography
      component="div"
      sx={{
        color,
        fontSize: "0.78rem",
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
      }}
    >
      {children}
    </Typography>
  );
}
