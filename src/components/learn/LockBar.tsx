"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { ChevronRight, Lock, LockOpen } from "lucide-react";
import type { RepertoirePick } from "@/types/repertoire";
import { ConfettiBurst } from "./ConfettiBurst";
import { EASE, EMBER, FOCUS, GOOD, POP } from "./tokens";

export interface LockBarProps {
  side: "white" | "black";
  locked: { white: boolean; black: boolean };
  picks: RepertoirePick[];
  firstCourse: string | null;
  onToggle: (which: "white" | "black") => void;
}

/**
 * A place to stop.
 *
 * A repertoire builder with no end state leaves people rearranging it forever
 * instead of going and learning one. Locking is not a data guarantee (one tap
 * unlocks it and nothing downstream refuses to work on an open colour); it is
 * a statement that this colour is decided, and the stamp lands like one.
 *
 * Continue waits for BOTH. Half a repertoire is the state everybody is
 * already in, and shipping them into a course from it is how they end up with
 * four chapters of the Caro-Kann and no idea what to do against 1.d4.
 */
export function LockBar({ side, locked, picks, firstCourse, onToggle }: LockBarProps) {
  const reduce = useReducedMotion();
  const here = locked[side];
  const label = side === "white" ? "White" : "Black";
  const other = side === "white" ? "Black" : "White";
  const both = locked.white && locked.black;
  // Locking an empty colour would be committing to nothing.
  const canLock = picks.length > 0;

  // The big burst fires when the SECOND lock lands in this sitting, not when a
  // page opens on a repertoire that was finished last month.
  const wasBoth = useRef(both);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (both && !wasBoth.current) setBurst((b) => b + 1);
    wasBoth.current = both;
  }, [both]);

  return (
    <Box sx={{ mt: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Box
          component="button"
          onClick={() => canLock && onToggle(side)}
          disabled={!canLock}
          aria-pressed={here}
          data-testid="lock-toggle"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.75,
            minHeight: 44,
            px: 2,
            borderRadius: "999px",
            appearance: "none",
            cursor: canLock ? "pointer" : "not-allowed",
            opacity: canLock ? 1 : 0.4,
            border: `1px solid ${here ? "rgba(134,239,172,0.5)" : "rgba(255,255,255,0.16)"}`,
            background: here ? "rgba(134,239,172,0.12)" : "rgba(255,255,255,0.03)",
            color: here ? GOOD : "rgba(255,255,255,0.85)",
            fontSize: "0.86rem",
            fontWeight: 600,
            boxShadow: here ? "0 0 22px rgba(134,239,172,0.25)" : "none",
            transition: "background 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
            "&:hover": canLock ? { borderColor: here ? GOOD : "rgba(249,115,22,0.5)" } : {},
            ...FOCUS,
          }}
        >
          {/* The stamp: remounted on every change so a lock lands from above
              with a pop, and an unlock simply swaps the glyph. */}
          <Box
            component={motion.span}
            key={here ? "locked" : "open"}
            aria-hidden
            initial={reduce || !here ? false : { scale: 1.8, rotate: -14, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={POP}
            sx={{ display: "inline-flex" }}
          >
            {here ? <Lock size={14} /> : <LockOpen size={14} />}
          </Box>
          {here ? `${label} is locked` : `Lock ${label}`}
        </Box>

        <Typography sx={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.45)" }}>
          {!canLock
            ? `Choose something as ${label} first.`
            : here
              ? "Tap to unlock."
              : locked[side === "white" ? "black" : "white"]
                ? "Lock this one too and you are done."
                : `Lock it when it is decided. ${other} needs one too.`}
        </Typography>
      </Box>

      {both && firstCourse && (
        <Box
          component={motion.div}
          data-testid="repertoire-done"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          sx={{
            position: "relative",
            mt: 2,
            p: { xs: 2, md: 2.5 },
            borderRadius: "1.25rem",
            border: "1px solid rgba(249,115,22,0.45)",
            background: "radial-gradient(120% 80% at 50% 0%, rgba(249,115,22,0.16), transparent 70%), rgba(255,255,255,0.02)",
            boxShadow: "0 20px 48px -28px rgba(249,115,22,0.55)",
            display: "flex",
            alignItems: "center",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <ConfettiBurst burst={burst} spread={150} count={26} />
          <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>
            <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: "1.05rem", letterSpacing: "-0.01em" }}>
              Repertoire locked.
            </Typography>
            <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.84rem", mt: 0.25 }}>
              Both colours decided. Now learn it.
            </Typography>
          </Box>
          <Box
            component={Link}
            href={`/learn/${encodeURIComponent(firstCourse)}`}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.75,
              minHeight: 48,
              px: 2.5,
              borderRadius: "999px",
              textDecoration: "none",
              // The one solid fill on the page: the primary action.
              background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
              color: "#fff",
              fontSize: "0.92rem",
              fontWeight: 700,
              boxShadow: "0 10px 30px -12px rgba(249,115,22,0.7)",
              transition: "transform 180ms ease, box-shadow 180ms ease",
              "&:hover": { transform: "translateY(-1px)", boxShadow: "0 14px 34px -12px rgba(249,115,22,0.8)" },
              "@media (prefers-reduced-motion: reduce)": { transition: "none", "&:hover": { transform: "none" } },
              "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 3 },
            }}
          >
            Continue — start learning <ChevronRight size={16} aria-hidden />
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default LockBar;
