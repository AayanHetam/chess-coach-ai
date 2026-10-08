"use client";

import { Box, TextField, Typography } from "@mui/material";
import { Check } from "lucide-react";
import { checkHandle, HANDLE_MAX } from "@/lib/auth/handle";

/**
 * "Pick your handle" — the name they will be addressed by, and can sign in
 * with.
 *
 * FORMAT ONLY at this point. The availability endpoint is session-gated on
 * purpose (an open one is a free oracle for enumerating which accounts exist,
 * and the handle doubles as a sign-in credential), and the visitor has no
 * session yet: the quiz runs before signup. So the green tick here says "this
 * is a usable shape", never "this one is yours" — the atomic claim that runs
 * straight after signup is what settles it, and the HandleCard on /profile
 * catches anyone whose claim lost the race.
 *
 * Optional, like the goal step. A handle is a nicety, and a wall in front of
 * the signup would cost accounts to buy a field.
 */

const handleInputSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: "12px",
    color: "rgba(255,255,255,0.94)",
    "& fieldset": { borderColor: "rgba(255,255,255,0.1)" },
    "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2)" },
    "&.Mui-focused fieldset": {
      borderColor: "rgba(249,115,22,0.55)",
      borderWidth: "1px",
    },
  },
  "& .MuiInputLabel-root": {
    color: "rgba(255,255,255,0.55)",
    "&.Mui-focused": { color: "#FB923C" },
  },
} as const;

interface HandleStepProps {
  value: string;
  onChange: (value: string) => void;
}

export default function HandleStep({ value, onChange }: HandleStepProps) {
  const typed = value.trim();
  const check = checkHandle(typed);
  const problem = typed.length > 0 && !check.ok ? check.message : undefined;

  return (
    <Box>
      <TextField
        label="Handle"
        placeholder="lazerwizard"
        fullWidth
        autoFocus
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={!!problem}
        inputProps={{ maxLength: HANDLE_MAX, "aria-label": "Handle" }}
        sx={handleInputSx}
      />

      <Box sx={{ minHeight: 22, mt: 0.75 }}>
        {problem && <Hint color="#FBBF24">{problem}</Hint>}
        {!problem && check.ok && (
          <Hint color="#4ADE80">
            <Check size={12} strokeWidth={3} /> {typed} looks good — we&apos;ll
            save it when you create your account
          </Hint>
        )}
        {!problem && !check.ok && (
          <Hint>Skip it and we&apos;ll just use your first name.</Hint>
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
