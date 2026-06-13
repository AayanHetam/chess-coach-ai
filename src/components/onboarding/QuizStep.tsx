"use client";

import { ReactNode } from "react";
import { Box, Typography } from "@mui/material";

interface QuizStepProps {
  title: string;
  helper?: string;
  children: ReactNode;
}

/** Presentational shell for one quiz screen: heading + helper + content stack.
 *  The orchestrator supplies the content (option list or rating inputs). */
export default function QuizStep({ title, helper, children }: QuizStepProps) {
  return (
    <Box>
      <Typography
        component="h2"
        sx={{
          color: "#fff",
          fontWeight: 700,
          fontSize: "1.3rem",
          lineHeight: 1.25,
          mb: helper ? 0.75 : 2,
        }}
      >
        {title}
      </Typography>
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
