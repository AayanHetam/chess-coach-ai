"use client";

import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Alert,
  Stack,
  Typography,
  Box,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";

export type FlagCategory = "bad" | "inaccurate" | "incomplete";

export type FlagSubmitInput = {
  category: FlagCategory;
  whyWrong: string;
  idealResponse: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: FlagSubmitInput) => Promise<void>;
  /**
   * The full assistant message being flagged. Shown in scrollable preview so
   * the intern can re-read while explaining what's wrong.
   */
  flaggedPreview: string;
}

const WHY_MIN = 30;
const IDEAL_MIN = 50;

export function FlagModal({ open, onClose, onSubmit, flaggedPreview }: Props) {
  const [category, setCategory] = useState<FlagCategory>("bad");
  const [whyWrong, setWhyWrong] = useState("");
  const [idealResponse, setIdealResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const whyOk = whyWrong.trim().length >= WHY_MIN;
  const idealOk = idealResponse.trim().length >= IDEAL_MIN;
  const canSubmit = whyOk && idealOk && !submitting;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        category,
        whyWrong: whyWrong.trim(),
        idealResponse: idealResponse.trim(),
      });
      setCategory("bad");
      setWhyWrong("");
      setIdealResponse("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not flag. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle>Flag this coach response</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <Box>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.5 }}>
              The coach response you&apos;re flagging:
            </Typography>
            <Typography
              variant="body2"
              sx={{
                p: 1.5,
                backgroundColor: "action.hover",
                borderRadius: 1,
                maxHeight: 180,
                overflow: "auto",
                fontFamily: "monospace",
                fontSize: "0.85rem",
                whiteSpace: "pre-wrap",
              }}
            >
              {flaggedPreview}
            </Typography>
          </Box>

          <FormControl fullWidth>
            <InputLabel id="flag-category-label">Why is this flag-worthy?</InputLabel>
            <Select
              labelId="flag-category-label"
              value={category}
              label="Why is this flag-worthy?"
              onChange={(e: SelectChangeEvent) => setCategory(e.target.value as FlagCategory)}
              disabled={submitting}
            >
              <MenuItem value="bad">Bad — wrong, misleading, or low-quality</MenuItem>
              <MenuItem value="inaccurate">Inaccurate — chess-incorrect (eval, line, claim)</MenuItem>
              <MenuItem value="incomplete">Incomplete — missing a key idea or step</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Why is this analysis wrong?"
            placeholder="Be specific. What did the coach get wrong? Which claim was off, which line was wrong, what concept was missed? Cite the move/position if relevant."
            value={whyWrong}
            onChange={(e) => setWhyWrong(e.target.value)}
            multiline
            minRows={4}
            maxRows={10}
            inputProps={{ maxLength: 5000 }}
            disabled={submitting}
            fullWidth
            required
            error={whyWrong.length > 0 && !whyOk}
            helperText={
              whyOk
                ? `${whyWrong.trim().length} chars · looks good`
                : `${whyWrong.trim().length}/${WHY_MIN} chars minimum — explain specifically what's wrong`
            }
          />

          <TextField
            label="What would a better response be?"
            placeholder="Write the response the coach should have given. This is the ideal — what you wish the model said instead. Treat it as the answer key for future eval."
            value={idealResponse}
            onChange={(e) => setIdealResponse(e.target.value)}
            multiline
            minRows={6}
            maxRows={20}
            inputProps={{ maxLength: 20000 }}
            disabled={submitting}
            fullWidth
            required
            error={idealResponse.length > 0 && !idealOk}
            helperText={
              idealOk
                ? `${idealResponse.trim().length} chars · looks good`
                : `${idealResponse.trim().length}/${IDEAL_MIN} chars minimum — full ideal response, not a one-liner`
            }
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={!canSubmit}>
          {submitting ? "Submitting…" : "Submit flag"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
