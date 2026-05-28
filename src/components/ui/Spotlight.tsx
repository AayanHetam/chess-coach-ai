"use client";

import { Box } from "@mui/material";
import { useEffect, useRef, type ReactNode } from "react";

interface SpotlightProps {
  children: ReactNode;
  color?: string;
  size?: number;
}

export function Spotlight({
  children,
  color = "rgba(249, 115, 22, 0.18)",
  size = 420,
}: SpotlightProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
      el.style.setProperty("--my", `${e.clientY - rect.top}px`);
    };
    el.addEventListener("mousemove", onMove);
    return () => el.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <Box
      ref={ref}
      sx={{
        position: "relative",
        height: "100%",
        width: "100%",
        borderRadius: "inherit",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          pointerEvents: "none",
          background: `radial-gradient(${size}px circle at var(--mx, 50%) var(--my, 50%), ${color}, transparent 60%)`,
          opacity: 0,
          transition: "opacity 240ms cubic-bezier(0.22, 0.61, 0.36, 1)",
        },
        "&:hover::before": { opacity: 1 },
      }}
    >
      {children}
    </Box>
  );
}
