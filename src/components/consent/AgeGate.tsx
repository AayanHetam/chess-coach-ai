"use client";

import { useState } from "react";
import {
  Box,
  Stack,
  Typography,
  Checkbox,
  FormControlLabel,
  Button,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import { COPPA_MIN_AGE } from "@/lib/tracking/age";
import Link from "next/link";

/**
 * Age-affirmation gate (TRK-6, COPPA).
 *
 * Self-contained + reusable: collects an explicit "I'm at least 13 and agree
 * to the Terms and Privacy Policy" affirmation and reports it via onConfirmed. It does NOT mutate auth state —
 * the caller wires the affirmation into signup (`ageAffirmed`); no age or
 * birth date is ever collected or transmitted. This replaced the earlier
 * neutral DOB screen; devices that resolved under-13 on that screen stay
 * locked via ageGateLock, which callers check before rendering this gate.
 *
 * Also offers an OPTIONAL email opt-in checkbox. Unlike the affirmation it
 * never gates Continue — its value just rides along in onConfirmed so every
 * signup path (dialog form, Google popup, /auth/age interstitial) captures
 * the preference on the same surface. The label must never match the e2e
 * locator for the required box (/at least 13 years old/i).
 */
export default function AgeGate({
  onConfirmed,
  slotSx,
}: {
  onConfirmed: (opts: { emailOptIn: boolean }) => void;
  /** Optional per-slot style overrides so the gate can sit on dark-glass
   *  surfaces (AuthDialog, /auth/age) without forking the component. */
  slotSx?: {
    title?: SxProps<Theme>;
    caption?: SxProps<Theme>;
    label?: SxProps<Theme>;
    checkbox?: SxProps<Theme>;
    button?: SxProps<Theme>;
  };
}) {
  const [checked, setChecked] = useState(false);
  const [emailOptIn, setEmailOptIn] = useState(false);

  return (
    <Box sx={{ maxWidth: 360 }}>
      <Stack spacing={1.5}>
        <Typography variant="subtitle1" sx={slotSx?.title}>
          Quick age check
        </Typography>
        <Typography
          variant="caption"
          sx={slotSx?.caption ?? { color: "text.secondary" }}
        >
          Chess Masti accounts are for players aged {COPPA_MIN_AGE} and up. By
          continuing, you agree to the{" "}
          <Link href="/terms" target="_blank" rel="noreferrer">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" target="_blank" rel="noreferrer">
            Privacy Policy
          </Link>
          .
        </Typography>
        <FormControlLabel
          sx={slotSx?.label}
          control={
            <Checkbox
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              sx={slotSx?.checkbox}
            />
          }
          label={`I confirm that I am at least ${COPPA_MIN_AGE} years old and agree to the Terms of Service and Privacy Policy.`}
        />
        <FormControlLabel
          sx={slotSx?.label}
          control={
            <Checkbox
              checked={emailOptIn}
              onChange={(e) => setEmailOptIn(e.target.checked)}
              sx={slotSx?.checkbox}
            />
          }
          label="Email me chess tips and updates from Chess Masti. (Optional)"
        />
        <Button
          variant="contained"
          onClick={() => onConfirmed({ emailOptIn })}
          disabled={!checked}
          sx={slotSx?.button}
        >
          Continue
        </Button>
      </Stack>
    </Box>
  );
}
