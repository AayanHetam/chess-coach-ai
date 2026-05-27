"use client";

import { Box } from "@mui/material";
import { motion, useInView } from "framer-motion";
import { useRef, type CSSProperties, type ReactNode } from "react";
import { BorderBeam } from "./BorderBeam";
import { Spotlight } from "./Spotlight";

interface BentoCardProps {
  children: ReactNode;
  // Responsive sx values: pass "span 7" or { xs: "span 12", md: "span 7" }
  gridColumn?: any;
  gridRow?: any;
  beam?: boolean;
  beamDelay?: number;
  padding?: number | string;
  // If set, the card fades + lifts in when scrolled into view, with this delay (seconds).
  // If undefined, the card is statically visible.
  revealDelay?: number;
  style?: CSSProperties;
}

export function BentoCard({
  children,
  gridColumn,
  gridRow,
  beam = false,
  beamDelay = 0,
  padding = 3.5,
  revealDelay,
  style,
}: BentoCardProps) {
  const reveal = revealDelay !== undefined;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const shouldShow = !reveal || inView;

  return (
    <Box
      ref={ref}
      sx={{ gridColumn, gridRow, display: "flex", minWidth: 0 }}
    >
      <motion.div
        initial={reveal ? { opacity: 0, y: 24 } : false}
        animate={
          shouldShow ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }
        }
        whileHover={{ scale: 1.012, y: -3 }}
        transition={{
          duration: 0.6,
          delay: revealDelay ?? 0,
          ease: [0.22, 0.61, 0.36, 1],
        }}
        style={{
          position: "relative",
          flex: 1,
          borderRadius: "1.5rem",
          background: "rgba(20, 22, 28, 0.55)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
          overflow: "hidden",
          ...style,
        }}
      >
        {beam && <BorderBeam delay={beamDelay} />}
        <Spotlight>
          <Box sx={{ position: "relative", p: padding, height: "100%" }}>
            {children}
          </Box>
        </Spotlight>
      </motion.div>
    </Box>
  );
}
