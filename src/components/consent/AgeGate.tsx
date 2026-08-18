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

/**
 * Age-affirmation gate (TRK-6, COPPA).
 *
 * Self-contained + reusable: collects an explicit "I'm 13 or older"
 * affirmation and reports it via onConfirmed. It does NOT mutate auth state —
 * the caller wires the affirmation into signup (`ageAffirmed`); no age or
 * birth date is ever collected or transmitted. This replaced the earlier
 * neutral DOB screen; devices that resolved under-13 on that screen stay
 * locked via ageGateLock, which callers check before rendering this gate.
 */
export default function AgeGate({
  onConfirmed,
  slotSx,
}: {
  onConfirmed: () => void;
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
          Chess Masti accounts are for players aged {COPPA_MIN_AGE} and up.
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
          label={`I confirm that I'm ${COPPA_MIN_AGE} or older.`}
        />
        <Button
          variant="contained"
          onClick={onConfirmed}
          disabled={!checked}
          sx={slotSx?.button}
        >
          Continue
        </Button>
      </Stack>
    </Box>
  );
}
