"use client";

import { useState } from "react";
import { Box, Stack, Typography, TextField, Button } from "@mui/material";
import { isUnderCoppaAge, COPPA_MIN_AGE } from "@/lib/tracking/age";

/**
 * Neutral date-of-birth age gate (TRK-6, COPPA).
 *
 * Self-contained + reusable: collects a DOB and reports back whether the user
 * is under 13 via onResolved. It does NOT mutate auth state — wiring it into the
 * signup flow and enforcing under-13 restricted mode (no behavioral analytics /
 * no conversation retention unless verifiable parental consent) is a deliberate
 * FOLLOW-UP that must be done with the auth flow and qualified legal review.
 * Shipping the component here so that integration is a small, reviewed step
 * rather than bundled into this PR. See TRACKING_PLAN.md §4.1.
 */
export default function AgeGate({
  onResolved,
}: {
  onResolved: (result: { birthDate: Date; isUnder13: boolean }) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const birthDate = new Date(value);
    if (!value || Number.isNaN(birthDate.getTime()) || birthDate > new Date()) {
      setError("Please enter a valid date of birth.");
      return;
    }
    setError(null);
    onResolved({ birthDate, isUnder13: isUnderCoppaAge(birthDate, new Date()) });
  };

  return (
    <Box sx={{ maxWidth: 360 }}>
      <Stack spacing={1.5}>
        <Typography variant="subtitle1">What's your date of birth?</Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          We ask so we can keep accounts for under-{COPPA_MIN_AGE}s appropriately
          private.
        </Typography>
        <TextField
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={!!error}
          helperText={error ?? " "}
          inputProps={{ "aria-label": "Date of birth" }}
          fullWidth
        />
        <Button variant="contained" onClick={submit} disabled={!value}>
          Continue
        </Button>
      </Stack>
    </Box>
  );
}
