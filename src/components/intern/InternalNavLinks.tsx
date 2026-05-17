"use client";

import Link from "next/link";
import { Stack, Button } from "@mui/material";

/**
 * Internal-only nav items, surfaced in the header for CMIP interns.
 *
 * v1 (CMIP-1.A): just the entry point to /intern. Submissions + Quota
 * sub-routes land in CMIP-1.C; this stays a single CTA until then so we
 * don't ship dead links.
 *
 * Always renders — visibility gating is the parent's job (Header read of
 * useViewer().isIntern).
 */
export function InternalNavLinks() {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Button
        component={Link}
        href="/intern"
        size="small"
        variant="text"
        sx={{
          textTransform: "none",
          fontWeight: 500,
        }}
      >
        Intern dashboard
      </Button>
    </Stack>
  );
}
