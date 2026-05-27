"use client";

import { Box } from "@mui/material";

export function GradientBackdrop() {
  return (
    <Box
      aria-hidden
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        background: "#08090C",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.045) 1px, transparent 0)",
          backgroundSize: "32px 32px",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 25%, #000 30%, transparent 80%)",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 25%, #000 30%, transparent 80%)",
        },
        "&::after": {
          content: '""',
          position: "absolute",
          width: "70vw",
          height: "70vw",
          top: "-25vw",
          left: "-15vw",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(249,115,22,0.18), transparent 60%)",
          filter: "blur(80px)",
        },
      }}
    >
      <Box
        sx={{
          position: "absolute",
          width: "55vw",
          height: "55vw",
          bottom: "-20vw",
          right: "-18vw",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(123, 97, 255, 0.16), transparent 60%)",
          filter: "blur(80px)",
        }}
      />
    </Box>
  );
}
