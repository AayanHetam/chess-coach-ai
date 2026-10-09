/**
 * The ways to answer the diagnosing question (diagnoseAsk.ts), as one row of
 * text links under it, the key moments' own links: no box, no chip.
 *
 * The threat: answer on the board, type it (only where the composer can
 * take it), no idea, or skip. The plan: tell Masti in the composer, or
 * skip.
 */
import { Box } from "@mui/material";
import type { ReactNode } from "react";
import type { DiagnoseMode, DiagnoseVariant } from "./diagnoseAsk";

export type DiagnoseAction = "board" | "type" | "no-idea" | "skip" | "plan";

function Link({
  onClick,
  pressed,
  testId,
  children,
}: {
  onClick: () => void;
  pressed?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      data-testid={testId}
      sx={{
        font: "inherit",
        fontSize: "0.78rem",
        fontWeight: 700,
        color: "#FB923C",
        background: "none",
        border: 0,
        p: 0,
        cursor: "pointer",
        whiteSpace: "nowrap",
        "&:hover": { textDecoration: "underline" },
      }}
    >
      {children}
    </Box>
  );
}

export function DiagnoseControls({
  variant,
  mode,
  canType,
  onAction,
}: {
  variant: DiagnoseVariant;
  mode: DiagnoseMode;
  /** The composer can take an answer: signed in, the coach not paused. */
  canType: boolean;
  onAction: (a: DiagnoseAction) => void;
}) {
  return (
    <Box
      data-testid="diagnose-ask"
      data-variant={variant}
      data-mode={mode}
      sx={{
        display: "flex",
        gap: 2,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {variant === "threat" ? (
        <>
          <Link onClick={() => onAction("board")} pressed={mode === "board"}>
            Answer on the board
          </Link>
          {canType && (
            <Link onClick={() => onAction("type")} pressed={mode === "type"}>
              Type it
            </Link>
          )}
          <Link onClick={() => onAction("no-idea")}>No idea</Link>
        </>
      ) : (
        <Link onClick={() => onAction("plan")} pressed={mode === "plan-type"}>
          Tell Masti
        </Link>
      )}
      <Link onClick={() => onAction("skip")}>Skip</Link>
    </Box>
  );
}

/**
 * The drill set under a graded answer (pathway 4.7, diagnoseDrills.ts): one
 * text link, the same as the ways to answer.
 */
export function DiagnoseDrillLink({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Link onClick={onClick} testId="diagnose-drill-link">
      {label}
    </Link>
  );
}
