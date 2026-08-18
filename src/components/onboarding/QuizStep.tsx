"use client";

import { ReactNode } from "react";
import { Box, Typography } from "@mui/material";

interface QuizStepProps {
  title: string;
  helper?: string;
  /**
   * Illustration for the QUESTION itself, shown beside the heading — as opposed
   * to `QuizOption.visual`, which illustrates an answer. Used where the
   * question is unanswerable without seeing the thing it names ("Can you spot a
   * fork or a pin?").
   */
  aside?: ReactNode;
  children: ReactNode;
}

/** Presentational shell for one quiz screen: heading + helper + content stack.
 *  The orchestrator supplies the content (option list or the username input). */
export default function QuizStep({ title, helper, aside, children }: QuizStepProps) {
  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: 1.5,
          mb: helper ? 0.75 : 2,
        }}
      >
        <Typography
          component="h2"
          sx={{
            flex: 1,
            minWidth: 0,
            color: "#fff",
            fontWeight: 700,
            fontSize: "1.3rem",
            lineHeight: 1.25,
          }}
        >
          {title}
        </Typography>
        {aside && <Box sx={{ flexShrink: 0, mt: 0.25 }}>{aside}</Box>}
      </Box>
      {helper && (
        <Typography
          sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.9rem", mb: 2 }}
        >
          {helper}
        </Typography>
      )}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
        {children}
      </Box>
    </Box>
  );
}
