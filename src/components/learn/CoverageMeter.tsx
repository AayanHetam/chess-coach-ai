"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Trophy } from "lucide-react";
import { share as pctOf, slotTitle, type Coverage } from "@/lib/repertoire/bracket";
import { sufficiency, verdict, type Band } from "@/lib/repertoire/levels";
import { provenanceOf } from "@/lib/repertoire/provenance";
import { pointsToNext, rankFor, type Rank } from "@/lib/repertoire/rank";
import { factsFor, type YourTree } from "@/lib/repertoire/yourTree";
import type { RepertoireMap, RepertoireSlot } from "@/types/repertoire";
import { ConfettiBurst } from "./ConfettiBurst";
import { useCountUp } from "./useCountUp";
import { EMBER, GOLD, GOOD, POP, ROSE } from "./tokens";

export interface CoverageMeterProps {
  coverage: Coverage;
  side: "white" | "black";
  meta: RepertoireMap["meta"];
  band: Band;
  rating: number | undefined;
  /** Their measured archive for this colour, or null. */
  tree: YourTree | null;
  roots: RepertoireSlot[];
  /**
   * How many picks the player has made in this sitting. Bumped by the page
   * on a pick and on nothing else, so the "+12%" and the burst fire for a
   * move the player just made and never for a bracket that arrived from the
   * account a second after the page loaded.
   */
  pickKey: number;
}

/** How long the "+N%" hangs beside the number. */
const GAIN_MS = 1400;

/**
 * The one number a player will repeat to themselves, as a score.
 *
 * Said in games rather than in slots, because "6 of 9 slots" flatters a
 * repertoire that has answered the rare half. What the game layer adds is a
 * ladder over it (`rankFor`), a goal line on the bar at the band's own enough
 * mark, a "+N%" that floats off the number on every pick, and a burst when a
 * pick carries the side over the line. None of it is a new measurement.
 */
export function CoverageMeter({
  coverage: cover,
  side,
  meta,
  band,
  rating,
  tree,
  roots,
  pickKey,
}: CoverageMeterProps) {
  const reduce = useReducedMotion();
  const done = Math.round(cover.answered * 100);
  const shown = useCountUp(done);
  const rank = rankFor(cover.answered, band);
  const toNext = pointsToNext(cover.answered, band);
  const state = sufficiency(cover.answered, band);
  const goal = Math.round(band.enoughAt * 100);
  const biggest = cover.open[0];
  // "A further N% is first moves too rare to plan for."
  //
  // `meta.otherFirstMoves` is the corpus residual, and once the roots above are
  // measured it belongs to a different population than everything around it.
  // Measured, the residual is simply what their own root shares do not account
  // for: the first moves they met that this map has no slot for.
  const residual = tree
    ? Math.max(0, 1 - roots.reduce((sum, s) => sum + (factsFor(tree, s.id).share ?? 0), 0))
    : meta.otherFirstMoves;

  // The reward moment. `lastDone` is the number BEFORE the render a pick
  // caused; the pick effect reads it, then the done effect below moves it on.
  // Declaration order is what makes that true, so the two stay together.
  const [gain, setGain] = useState<{ id: number; delta: number } | null>(null);
  const [burst, setBurst] = useState(0);
  const lastDone = useRef(done);
  const wasEnough = useRef(state.enough);
  useEffect(() => {
    if (pickKey === 0) return;
    const delta = done - lastDone.current;
    if (delta > 0) setGain({ id: pickKey, delta });
    // A pick that carries the side over the line is the moment the whole
    // feature exists for; a smaller pick gets a smaller burst.
    if (delta > 0 || (state.enough && !wasEnough.current)) setBurst((b) => b + 1);
    // Reads `done` and `state.enough` as they are AT the pick; re-running on
    // every coverage change would fire for the account merge too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickKey]);
  useEffect(() => {
    lastDone.current = done;
  }, [done]);
  useEffect(() => {
    wasEnough.current = state.enough;
  }, [state.enough]);
  useEffect(() => {
    if (!gain) return;
    const timer = setTimeout(() => setGain(null), GAIN_MS);
    return () => clearTimeout(timer);
  }, [gain]);

  const sideName = side === "white" ? "White" : "Black";

  return (
    <Box
      data-testid="coverage-meter"
      sx={{
        // The page's headline card wears the surface identity: gold border, a
        // faint radial tint at the top, a soft glow and a top hairline. Green
        // takes over the moment the side is enough, which is the one visual
        // promotion on the page.
        position: "relative",
        overflow: "hidden",
        mt: 2,
        p: { xs: 2, md: 2.5 },
        borderRadius: "1.5rem",
        border: `1px solid ${state.enough ? "rgba(134,239,172,0.4)" : GOLD.border}`,
        background: `radial-gradient(120% 55% at 50% 0%, ${state.enough ? "rgba(134,239,172,0.10)" : GOLD.tint}, transparent 70%), rgba(255,255,255,0.02)`,
        boxShadow: state.enough ? "0 20px 48px -28px rgba(134,239,172,0.5)" : GOLD.glow,
        transition: "border-color 300ms ease, box-shadow 300ms ease",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: "8%",
          right: "8%",
          height: "1.5px",
          background: `linear-gradient(90deg, transparent, ${state.enough ? GOOD : GOLD.base}, transparent)`,
          opacity: 0.65,
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1.5, flexWrap: "wrap" }}>
        <Box sx={{ position: "relative", lineHeight: 1 }}>
          <Typography
            component="span"
            data-testid="meter-number"
            sx={{
              display: "block",
              color: "#fff",
              fontSize: { xs: "2.6rem", md: "3.2rem" },
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {shown}%
          </Typography>
          <ConfettiBurst burst={burst} spread={state.enough ? 160 : 100} count={state.enough ? 26 : 16} />
          <AnimatePresence>
            {gain && (
              <Box
                component={motion.span}
                key={gain.id}
                data-testid="meter-gain"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: -22 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
                sx={{
                  position: "absolute",
                  left: "100%",
                  top: 0,
                  ml: 0.75,
                  color: GOOD,
                  fontWeight: 800,
                  fontSize: "1.1rem",
                  whiteSpace: "nowrap",
                  textShadow: "0 0 18px rgba(134,239,172,0.6)",
                  pointerEvents: "none",
                }}
              >
                +{gain.delta}%
              </Box>
            )}
          </AnimatePresence>
        </Box>
        <Box sx={{ pb: 0.5, minWidth: 0 }}>
          <Typography sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.86rem", lineHeight: 1.3 }}>
            answered as {sideName}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mt: 0.6 }}>
            <RankChip rank={rank} />
            {toNext !== null && rank.nextName && (
              <Typography sx={{ fontSize: "0.74rem", color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>
                +{toNext}% to {rank.nextName}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>

      {/* The bar, with the band's own finish line on it. One accessible name
          for the whole meter; the rings in the HUD are decoration over the
          same number. */}
      <Box
        role="img"
        aria-label={`${done} percent answered`}
        sx={{ position: "relative", mt: 1.75, height: 10, borderRadius: 999, background: "rgba(255,255,255,0.08)" }}
      >
        <Box
          component={motion.div}
          initial={false}
          animate={{ width: `${done}%` }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 80, damping: 20 }}
          sx={{
            height: "100%",
            borderRadius: 999,
            background: state.enough
              ? `linear-gradient(90deg, ${GOOD} 0%, #4ADE80 100%)`
              : `linear-gradient(90deg, ${EMBER} 0%, ${GOLD.bright} 100%)`,
            boxShadow: state.enough ? "0 0 16px rgba(134,239,172,0.55)" : "0 0 14px rgba(249,115,22,0.45)",
          }}
        />
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            top: -4,
            bottom: -4,
            left: `${goal}%`,
            width: 2,
            borderRadius: 1,
            background: state.enough ? GOOD : "rgba(255,255,255,0.75)",
            boxShadow: "0 0 0 2px rgba(0,0,0,0.35)",
          }}
        />
      </Box>
      <Box aria-hidden sx={{ position: "relative", height: 16, mt: 0.5 }}>
        <Typography
          component="span"
          sx={{
            position: "absolute",
            left: `${goal}%`,
            transform: "translateX(calc(-100% - 6px))",
            fontSize: "0.64rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: state.enough ? GOOD : "rgba(255,255,255,0.45)",
            whiteSpace: "nowrap",
          }}
        >
          enough at {goal}%
        </Typography>
      </Box>

      {/* The sentence this whole feature exists to be able to say. Telling
          somebody their opening work is finished is worth more to them than
          another course, and nothing else in this space will ever say it. */}
      <Box
        sx={{
          mt: 1.25,
          p: 1.5,
          borderRadius: "12px",
          display: "flex",
          alignItems: "flex-start",
          gap: 1,
          border: `1px solid ${state.enough ? "rgba(134,239,172,0.28)" : "rgba(255,255,255,0.09)"}`,
          background: state.enough ? "rgba(134,239,172,0.06)" : "rgba(255,255,255,0.02)",
        }}
      >
        {state.enough && <Check size={15} color={GOOD} aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />}
        <Box>
          <Typography sx={{ color: state.enough ? GOOD : "#fff", fontSize: "0.86rem", lineHeight: 1.5 }}>
            {verdict(cover.answered, band)}
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.78rem", lineHeight: 1.55, mt: 0.5 }}>
            {rating
              ? `Rated ${rating}, so we are treating you as ${band.name.toLowerCase()}.`
              : `Unrated, so treating you as ${band.name.toLowerCase()}.`}{" "}
            {band.advice}
          </Typography>
          {/* Where the numbers came from, in the same breath as the verdict
              they support. The corpus states itself so a page cannot say
              "share of your games" over somebody else's opponents. */}
          <Typography
            data-testid="corpus-provenance"
            sx={{ color: "rgba(255,255,255,0.34)", fontSize: "0.74rem", lineHeight: 1.5, mt: 0.75 }}
          >
            {tree
              ? `Frequencies from your own ${tree.games[side].toLocaleString("en-US")} games as ${side}.`
              : provenanceOf(meta, band, { bandKnown: rating !== undefined }).sentence}
          </Typography>
        </Box>
      </Box>

      <Typography sx={{ mt: 1.25, fontSize: "0.82rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
        {biggest ? (
          <>
            The biggest thing you have no answer for is{" "}
            {/* Rose: this is the weakness the page exists to surface. */}
            <Box component="span" sx={{ color: ROSE.bright, fontWeight: 600 }}>
              {slotTitle(biggest.slot).replace(/^Against /, "")}
            </Box>
            , at {pctOf(biggest.reach)} of {tree ? "your games" : "games"}.
          </>
        ) : (
          <>Every branch we can measure has an answer.</>
        )}
        {side === "black" && residual > 0.01 && (
          <> A further {pctOf(residual)} is first moves too rare to plan for.</>
        )}
      </Typography>
    </Box>
  );
}

/** The rung, as a chip that pops when it changes. */
function RankChip({ rank }: { rank: Rank }) {
  const reduce = useReducedMotion();
  // Three looks, stated in full: hex-plus-alpha shorthand would break on the
  // grey, which is an rgba string.
  const look =
    rank.tier === 4
      ? { fg: GOOD, border: "rgba(134,239,172,0.45)", bg: "rgba(134,239,172,0.12)" }
      : rank.tier === 0
        ? { fg: "rgba(255,255,255,0.55)", border: "rgba(255,255,255,0.16)", bg: "rgba(255,255,255,0.04)" }
        : { fg: GOLD.bright, border: GOLD.border, bg: GOLD.soft };
  return (
    <Box
      component={motion.span}
      // Remounted on every rung, so the pop plays again (the FlashOverlay trick).
      key={rank.tier}
      data-testid="rank-chip"
      initial={reduce ? false : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={POP}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.3,
        borderRadius: "999px",
        border: `1px solid ${look.border}`,
        background: look.bg,
        color: look.fg,
        fontSize: "0.74rem",
        fontWeight: 700,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      <Trophy size={12} aria-hidden />
      {rank.name}
    </Box>
  );
}

export default CoverageMeter;
