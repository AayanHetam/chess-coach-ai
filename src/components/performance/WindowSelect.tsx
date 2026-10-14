"use client";

import { MenuItem, Select } from "@mui/material";
import { TEXT, TYPE } from "@/theme/tokens";

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
      // The menu paper, its rows and the outlined input are styled by the theme.
      sx={{
        fontSize: TYPE.bodySmall.fontSize,
        fontWeight: 600,
        color: TEXT.primary,
        "& .MuiSelect-select": { py: 0.6, pl: 1.25 },
        "& .MuiSvgIcon-root": { color: TEXT.secondary },
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
