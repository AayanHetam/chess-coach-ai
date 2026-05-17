"use client";

import { Chip } from "@mui/material";
import { INTERN_THEME_COLOR } from "@/constants";

/**
 * Persistent "EMPLOYEE" badge for the header, visible only to logged-in
 * CMIP interns. The visual hook that tells an intern at a glance: "you are
 * not viewing chessmasti.com as a customer right now."
 *
 * Always renders — gating is done by the parent (Header / EmployeeChrome).
 */
export function EmployeePill() {
  return (
    <Chip
      label="EMPLOYEE"
      size="small"
      sx={{
        backgroundColor: INTERN_THEME_COLOR,
        color: "#FFFFFF",
        fontWeight: 700,
        letterSpacing: "0.06em",
        fontSize: "0.7rem",
        height: 22,
        borderRadius: 1,
        px: 0.5,
      }}
    />
  );
}
