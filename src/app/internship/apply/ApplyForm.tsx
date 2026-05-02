"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { TRACKS, TRACK_LABELS, EDUCATION_STATUSES, EDUCATION_LABELS } from "@/lib/cmip/types";
import { submitApplication, type SubmitState } from "./actions";

const initialState: SubmitState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="contained"
      size="large"
      disabled={pending}
      sx={{
        px: 5,
        py: 1.5,
        fontSize: "1rem",
        fontWeight: 700,
        borderRadius: 2.5,
        background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
        boxShadow: "0 8px 24px rgba(255,107,53,0.35)",
        textTransform: "none",
        minWidth: 200,
        "&:hover": {
          background: "linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)",
        },
      }}
    >
      {pending ? <CircularProgress size={22} sx={{ color: "#fff" }} /> : "Submit application"}
    </Button>
  );
}

const MOTIVATION_MIN = 100;
const MOTIVATION_MAX = 800;

export default function ApplyForm() {
  const router = useRouter();
  const [state, formAction] = useActionState(submitApplication, initialState);
  const [tracks, setTracks] = useState<string[]>([]);
  const [motivation, setMotivation] = useState("");
  const [proudOf, setProudOf] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (state.status === "ok") {
      router.push("/internship/apply/thanks");
    }
  }, [state.status, router]);

  const fieldErrors = state.status === "error" ? state.fieldErrors ?? {} : {};
  const trackError = fieldErrors["tracks"];
  const counter = (val: string) => {
    const len = val.trim().length;
    const ok = len >= MOTIVATION_MIN && len <= MOTIVATION_MAX;
    return { len, ok };
  };
  const motivationCount = counter(motivation);
  const proudCount = counter(proudOf);

  return (
    <Box
      component="form"
      action={formAction}
      sx={{ display: "flex", flexDirection: "column", gap: 3 }}
      noValidate
    >
      {/* Honeypot — visually hidden but in the DOM. */}
      <Box
        sx={{
          position: "absolute",
          left: "-10000px",
          top: "auto",
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
        aria-hidden="true"
      >
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </Box>

      {state.status === "error" && (
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {state.error}
        </Alert>
      )}

      <Section title="About you">
        <TextField
          label="Full name"
          name="fullName"
          required
          fullWidth
          error={!!fieldErrors.fullName}
          helperText={fieldErrors.fullName}
          inputProps={{ maxLength: 120 }}
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          required
          fullWidth
          error={!!fieldErrors.email}
          helperText={fieldErrors.email}
          inputProps={{ maxLength: 200 }}
        />
        <TextField
          label="Phone (optional)"
          name="phone"
          fullWidth
          error={!!fieldErrors.phone}
          helperText={fieldErrors.phone}
          inputProps={{ maxLength: 40 }}
        />
        <TextField
          label="Location / time zone"
          name="location"
          required
          fullWidth
          placeholder="e.g. Mumbai, IST"
          error={!!fieldErrors.location}
          helperText={fieldErrors.location || "Where you'll be working from."}
          inputProps={{ maxLength: 200 }}
        />
      </Section>

      <Section title="Education">
        <FormControl required fullWidth error={!!fieldErrors.educationStatus}>
          <InputLabel id="education-status-label">Current status</InputLabel>
          <Select
            labelId="education-status-label"
            name="educationStatus"
            label="Current status"
            defaultValue=""
          >
            {EDUCATION_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {EDUCATION_LABELS[s]}
              </MenuItem>
            ))}
          </Select>
          {fieldErrors.educationStatus && (
            <FormHelperText>{fieldErrors.educationStatus}</FormHelperText>
          )}
        </FormControl>
        <TextField
          label="School / institution"
          name="school"
          required
          fullWidth
          error={!!fieldErrors.school}
          helperText={fieldErrors.school}
          inputProps={{ maxLength: 200 }}
        />
      </Section>

      <Section title="Track interest">
        <FormControl required component="fieldset" error={!!trackError} sx={{ width: "100%" }}>
          <Typography sx={{ fontSize: "0.95rem", color: "#444", mb: 1 }}>
            Pick at least one. You can pick multiple if you're genuinely interested in more than one.
          </Typography>
          <FormGroup>
            {TRACKS.map((t) => (
              <FormControlLabel
                key={t}
                control={
                  <Checkbox
                    name="tracks"
                    value={t}
                    checked={tracks.includes(t)}
                    onChange={(e) => {
                      setTracks((prev) =>
                        e.target.checked ? [...prev, t] : prev.filter((x) => x !== t),
                      );
                    }}
                    sx={{ "&.Mui-checked": { color: "#FF6B35" } }}
                  />
                }
                label={TRACK_LABELS[t]}
              />
            ))}
          </FormGroup>
          {trackError && <FormHelperText>{trackError}</FormHelperText>}
        </FormControl>
      </Section>

      <Section title="Chess background (optional)">
        <TextField
          label="Lichess or Chess.com username"
          name="chessUsername"
          fullWidth
          error={!!fieldErrors.chessUsername}
          helperText={fieldErrors.chessUsername}
          inputProps={{ maxLength: 80 }}
        />
        <TextField
          label="Approximate rating + platform"
          name="chessRating"
          fullWidth
          placeholder="e.g. 1850 chess.com rapid"
          error={!!fieldErrors.chessRating}
          helperText={fieldErrors.chessRating}
          inputProps={{ maxLength: 40 }}
        />
      </Section>

      <Section title="Links (optional)">
        <TextField
          label="LinkedIn / GitHub / portfolio URL"
          name="portfolioUrl"
          type="url"
          fullWidth
          placeholder="https://..."
          error={!!fieldErrors.portfolioUrl}
          helperText={fieldErrors.portfolioUrl}
          inputProps={{ maxLength: 500 }}
        />
        <TextField
          label="Resume URL (Drive, Dropbox, etc.)"
          name="resumeUrl"
          type="url"
          fullWidth
          placeholder="https://..."
          error={!!fieldErrors.resumeUrl}
          helperText={fieldErrors.resumeUrl || "We don't accept file uploads in v1 — paste a link."}
          inputProps={{ maxLength: 500 }}
        />
      </Section>

      <Section title="Tell us about you">
        <TextField
          label="Why CMIP?"
          name="motivation"
          required
          fullWidth
          multiline
          minRows={4}
          value={motivation}
          onChange={(e) => setMotivation(e.target.value.slice(0, MOTIVATION_MAX))}
          error={!!fieldErrors.motivation}
          helperText={
            fieldErrors.motivation ||
            `${motivationCount.len} / ${MOTIVATION_MAX} characters (min ${MOTIVATION_MIN})`
          }
          FormHelperTextProps={{
            sx: {
              color: motivationCount.ok ? undefined : motivationCount.len > 0 ? "#d32f2f" : undefined,
            },
          }}
        />
        <TextField
          label="A project or accomplishment you're proud of"
          name="proudOf"
          required
          fullWidth
          multiline
          minRows={4}
          value={proudOf}
          onChange={(e) => setProudOf(e.target.value.slice(0, MOTIVATION_MAX))}
          error={!!fieldErrors.proudOf}
          helperText={
            fieldErrors.proudOf ||
            `${proudCount.len} / ${MOTIVATION_MAX} characters (min ${MOTIVATION_MIN})`
          }
          FormHelperTextProps={{
            sx: {
              color: proudCount.ok ? undefined : proudCount.len > 0 ? "#d32f2f" : undefined,
            },
          }}
        />
      </Section>

      <Section title="Logistics">
        <TextField
          label="Hours per week available"
          name="hoursPerWeek"
          type="number"
          required
          fullWidth
          inputProps={{ min: 1, max: 60 }}
          error={!!fieldErrors.hoursPerWeek}
          helperText={fieldErrors.hoursPerWeek || "Most interns commit ~5–10 hrs/week."}
        />
        <TextField
          label="Earliest start date"
          name="earliestStartDate"
          type="date"
          required
          fullWidth
          InputLabelProps={{ shrink: true }}
          error={!!fieldErrors.earliestStartDate}
          helperText={fieldErrors.earliestStartDate}
        />
        <TextField
          label="How did you hear about us? (optional)"
          name="hearAbout"
          fullWidth
          error={!!fieldErrors.hearAbout}
          helperText={fieldErrors.hearAbout}
          inputProps={{ maxLength: 300 }}
        />
      </Section>

      <Box
        sx={{
          p: 2.5,
          borderRadius: 2,
          background: "#FFF8F5",
          border: "1px solid rgba(255,107,53,0.2)",
        }}
      >
        <FormControlLabel
          control={
            <Checkbox
              name="acknowledgeInterview"
              required
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              sx={{ "&.Mui-checked": { color: "#FF6B35" } }}
            />
          }
          label={
            <Typography sx={{ fontSize: "0.95rem", color: "#1a1a2e" }}>
              I understand an <strong>interview is required</strong> as part of the application
              process.
            </Typography>
          }
        />
        {fieldErrors.acknowledgeInterview && (
          <FormHelperText error sx={{ ml: 4 }}>
            {fieldErrors.acknowledgeInterview}
          </FormHelperText>
        )}
      </Box>

      <Box sx={{ display: "flex", justifyContent: { xs: "stretch", sm: "flex-end" }, mt: 2 }}>
        <SubmitButton />
      </Box>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box
      sx={{
        p: { xs: 2.5, md: 3.5 },
        borderRadius: 3,
        border: "1px solid rgba(0,0,0,0.06)",
        background: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        gap: 2.5,
      }}
    >
      <Typography
        variant="overline"
        sx={{ color: "#FF6B35", fontWeight: 700, letterSpacing: 1.5, fontSize: "0.75rem" }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}
