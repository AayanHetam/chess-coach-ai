"use client";

import { Box, Button, CircularProgress, Stack } from "@mui/material";
import {
  ChevronRight,
  Eye,
  Lightbulb,
  Microscope,
  type LucideIcon,
} from "lucide-react";
import type { HintStage } from "@/lib/validation/puzzleHintSchemas";

/**
 * Progressive button row under the coach panel. Surfaces the next-stage
 * actions the user can take after a wrong attempt.
 *
 * Flow:
 *   - after `why_wrong` lands → ["Get a hint", "Show the answer"]
 *   - after `hint` lands       → ["Show the answer", "Deeper dive"]
 *   - after `answer` lands     → ["Deeper dive"]
 *   - after `deeper_dive`      → row hides itself
 *
 * Buttons disable while a stage is loading. `loading` carries the stage
 * currently in flight so we can show a spinner on the right button.
 *
 * The prominent stage is the one contained button; the rest are outlined.
 * The theme owns the pill, the press feedback and the colours.
 */

interface HintStageRowProps {
  /** Stages already requested in this puzzle session. */
  stagesFired: HintStage[];
  /** The stage currently in flight, if any. */
  loading: HintStage | null;
  onFire: (stage: HintStage) => void;
}

interface StageButtonSpec {
  stage: HintStage;
  label: string;
  Icon: LucideIcon;
  prominent?: boolean;
}

const BUTTON_SPECS: Record<HintStage, StageButtonSpec> = {
  why_wrong: {
    stage: "why_wrong",
    label: "Why was that wrong?",
    Icon: ChevronRight,
  },
  hint: {
    stage: "hint",
    label: "Get a hint",
    Icon: Lightbulb,
    prominent: true,
  },
  answer: { stage: "answer", label: "Show the answer", Icon: Eye },
  deeper_dive: { stage: "deeper_dive", label: "Deeper dive", Icon: Microscope },
};

export function HintStageRow({
  stagesFired,
  loading,
  onFire,
}: HintStageRowProps) {
  const visible = nextStagesAfter(stagesFired);
  if (visible.length === 0) return null;

  return (
    <Box
      sx={{
        mt: 1,
        mb: 1.5,
        ml: "44px", // align with the coach bubble (icon column + gap)
      }}
    >
      <Stack direction="row" gap={1} flexWrap="wrap" sx={{ rowGap: 1 }}>
        {visible.map((stage) => {
          const spec = BUTTON_SPECS[stage];
          const isLoading = loading === stage;
          const disabled = loading !== null;
          return (
            <Button
              key={stage}
              onClick={() => onFire(stage)}
              disabled={disabled}
              variant={spec.prominent ? "contained" : "outlined"}
              size="small"
              startIcon={
                isLoading ? (
                  <CircularProgress size={11} sx={{ color: "inherit" }} />
                ) : (
                  <spec.Icon
                    size={14}
                    strokeWidth={1.75}
                    color="currentColor"
                  />
                )
              }
            >
              {spec.label}
            </Button>
          );
        })}
      </Stack>
    </Box>
  );
}

/**
 * Which next-stage buttons to show given what's already fired.
 *
 * After why_wrong: hint + answer (skip-ahead allowed).
 * After hint: answer + deeper_dive.
 * After answer: deeper_dive.
 * After deeper_dive: nothing.
 *
 * Pre-why_wrong we don't render the row at all — why_wrong is auto-fired
 * by the parent on outcome change to "wrong".
 */
function nextStagesAfter(fired: HintStage[]): HintStage[] {
  if (!fired.includes("why_wrong")) return [];
  const out: HintStage[] = [];
  if (!fired.includes("hint")) out.push("hint");
  if (!fired.includes("answer")) out.push("answer");
  // Deeper dive surfaces after the user has seen at least one of hint/answer
  // (otherwise it'd be a redundant escalation from why_wrong alone).
  if (
    !fired.includes("deeper_dive") &&
    (fired.includes("hint") || fired.includes("answer"))
  ) {
    out.push("deeper_dive");
  }
  return out;
}
