"use client";

import { motion } from "framer-motion";

interface BorderBeamProps {
  duration?: number;
  colorFrom?: string;
  colorTo?: string;
  borderWidth?: number;
  delay?: number;
}

export function BorderBeam({
  duration = 9,
  colorFrom = "#F97316",
  colorTo = "#A855F7",
  borderWidth = 1,
  delay = 0,
}: BorderBeamProps) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        padding: borderWidth,
        pointerEvents: "none",
        WebkitMask:
          "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
        WebkitMaskComposite: "xor",
        mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
        maskComposite: "exclude",
        overflow: "hidden",
      }}
    >
      <motion.div
        style={{
          position: "absolute",
          inset: "-100%",
          background: `conic-gradient(from 0deg, transparent 0%, transparent 70%, ${colorFrom} 85%, ${colorTo} 95%, transparent 100%)`,
        }}
        animate={{ rotate: 360 }}
        transition={{
          duration,
          repeat: Infinity,
          ease: "linear",
          delay,
        }}
      />
    </div>
  );
}
