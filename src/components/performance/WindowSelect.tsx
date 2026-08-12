"use client";

import { MenuItem, Select } from "@mui/material";

/**
 * The "last N" dropdown, shared by the puzzle and game sections.
 *
 * Generic over the option value so both `PuzzleWindow` (20|50|100|500|"all")
 * and `GameWindow` (10|25|50) keep their literal types at the call site — the
 * page never has to cast a string back into a window.
 */

interface WindowSelectProps<T extends string | number> {
  value: T;
  options: readonly T[];
  onChange: (next: T) => void;
  /** Noun for the options, e.g. "puzzles" → "Last 50 puzzles". */
  noun: string;
  ariaLabel: string;
}

function optionLabel(value: string | number, noun: string): string {
  return value === "all" ? `All ${noun}` : `Last ${value} ${noun}`;
}

export function WindowSelect<T extends string | number>({
  value,
  options,
  onChange,
  noun,
  ariaLabel,
}: WindowSelectProps<T>) {
  return (
    <Select
      value={String(value)}
      size="small"
      inputProps={{ "aria-label": ariaLabel }}
      onChange={(e) => {
        const raw = e.target.value;
        // Map back through the options list rather than parsing, so the
        // caller's literal union survives and "all" is never coerced to NaN.
        const next = options.find((o) => String(o) === raw);
        if (next !== undefined) onChange(next);
      }}
      MenuProps={{
        PaperProps: {
          sx: {
            mt: 0.5,
            background: "rgba(18,20,26,0.97)",
            backdropFilter: "blur(14px) saturate(140%)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "0.75rem",
            "& .MuiMenuItem-root": {
              fontSize: "0.82rem",
              color: "rgba(255,255,255,0.82)",
              "&:hover": { background: "rgba(249,115,22,0.1)" },
              "&.Mui-selected": {
                background: "rgba(249,115,22,0.16)",
                color: "#FDBA74",
                "&:hover": { background: "rgba(249,115,22,0.22)" },
              },
            },
          },
        },
      }}
      sx={{
        fontSize: "0.78rem",
        fontWeight: 600,
        color: "rgba(255,255,255,0.8)",
        borderRadius: "0.6rem",
        background: "rgba(255,255,255,0.04)",
        "& .MuiOutlinedInput-notchedOutline": {
          borderColor: "rgba(255,255,255,0.12)",
        },
        "&:hover .MuiOutlinedInput-notchedOutline": {
          borderColor: "rgba(249,115,22,0.4)",
        },
        "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
          borderColor: "rgba(249,115,22,0.55)",
        },
        "& .MuiSelect-select": { py: 0.6, pl: 1.25 },
        "& .MuiSvgIcon-root": { color: "rgba(255,255,255,0.5)" },
      }}
    >
      {options.map((o) => (
        <MenuItem key={String(o)} value={String(o)}>
          {optionLabel(o, noun)}
        </MenuItem>
      ))}
    </Select>
  );
}
