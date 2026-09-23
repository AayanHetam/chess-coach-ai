"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { BookOpen, Check, ChevronRight, Pencil, Plus } from "lucide-react";
import type { CourseProgress } from "@/lib/courses/catalogue";
import {
  numberedLine,
  share as pctOf,
  shareOf,
  slotTitle,
  splitChildren,
  transposesInto,
  type BracketNode,
} from "@/lib/repertoire/bracket";
import { rarity } from "@/lib/repertoire/character";
import type { Band } from "@/lib/repertoire/levels";
import type { Churn, QuizAnswers } from "@/lib/repertoire/store";
import { factsFor, mainMoveAt, type YourTree } from "@/lib/repertoire/yourTree";
import type { RepertoireMap, RepertoirePick } from "@/types/repertoire";
import OpeningDiagram from "@/components/learn/OpeningDiagram";
import SlotChooser from "@/components/learn/SlotChooser";
import { ConfettiBurst } from "./ConfettiBurst";
import { EASE, EMBER, FOCUS, GLASS, GOLD, GOOD, MONO, POP } from "./tokens";

/** Progress by course id, read once by the page. Empty for a signed-out reader. */
export type CourseProgressMap = Map<string, CourseProgress>;

export interface SlotBranchProps {
  node: BracketNode;
  map: RepertoireMap;
  /** Their measured archive, or null when we have not measured this colour. */
  tree: YourTree | null;
  churn: Churn | null;
  picks: RepertoirePick[];
  quiz: QuizAnswers | null;
  band: Band;
  courses: CourseProgressMap;
  openSlot: string | null;
  onOpen: (id: string | null) => void;
  onPick: (pick: RepertoirePick) => void;
  /** Position in its list, for the entrance stagger. */
  index?: number;
}

/**
 * One slot and, once it is filled, everything it opened up.
 *
 * The card is the quest: a picture of the position it is an answer to, what
 * it is worth, and a medal that pops (with a small burst) the moment it is
 * filled. Everything the row says is what the old row said; the row just
 * says it with a board and a medal instead of a dot.
 */
export function SlotBranch({
  node,
  map,
  picks,
  quiz,
  band,
  tree,
  churn,
  courses,
  openSlot,
  onOpen,
  onPick,
  index = 0,
}: SlotBranchProps) {
  const reduce = useReducedMotion();
  const open = openSlot === node.slot.id;
  const filled = Boolean(node.pick);
  // A measured share answers "how often did you MEET this", which is only the
  // same question as "how often will you meet it" at depth 0, where what
  // arrives is decided by the opponent. Behind a pick they have only just
  // made, their archive honestly reports zero, and zero is the wrong answer to
  // the question the row is asking. So the substitution stops at the roots.
  const measured = node.depth === 0 && tree ? factsFor(tree, node.slot.id) : null;
  const reach = measured?.share ?? node.reach;
  const rare = rarity(reach);
  const yourMove = mainMoveAt(tree, node.slot.id);
  // Branches we can advise on stay rows; the rest collapse. Measured on the
  // shipped map, 120 of 126 reachable branches carry no curated choice.
  const kids = useMemo(() => splitChildren(node.children), [node.children]);
  /** A branch of a decision already made, rather than a decision in its own right. */
  const sub = node.depth > 0;

  // The burst fires on the TRANSITION to filled, never on a card that mounts
  // already filled from storage: a page that threw confetti at every reload
  // would be a page throwing confetti at nothing.
  const wasFilled = useRef(filled);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (filled && !wasFilled.current) setBurst((b) => b + 1);
    wasFilled.current = filled;
  }, [filled]);

  return (
    <Box sx={{ pl: sub ? { xs: 1.5, md: 3 } : 0 }}>
      <Box
        component={motion.div}
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: Math.min(index * 0.05, 0.3), ease: EASE }}
        sx={{ position: "relative" }}
      >
        <Box
          component="button"
          onClick={() => onOpen(open ? null : node.slot.id)}
          aria-expanded={open}
          data-testid={sub ? "slot-sub" : "slot-root"}
          sx={{
            width: "100%",
            textAlign: "left",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: { xs: 1.25, md: 1.5 },
            // A sub-decision must not look like a root one: depth costs
            // height, radius and one step of contrast, the same hierarchy a
            // heading gets over its body text.
            minHeight: sub ? 52 : 68,
            px: { xs: sub ? 1.25 : 1.5, md: sub ? 1.75 : 2 },
            py: sub ? 0.9 : 1.25,
            borderRadius: sub ? "0.9rem" : "1.25rem",
            border: `1px solid ${
              filled ? "rgba(134,239,172,0.3)" : sub ? "rgba(255,255,255,0.06)" : GOLD.border
            }`,
            background: filled
              ? "linear-gradient(180deg, rgba(20,30,24,0.75) 0%, rgba(12,14,20,0.75) 100%)"
              : sub
                ? "rgba(255,255,255,0.018)"
                : `radial-gradient(120% 60% at 50% 0%, ${GOLD.tint}, transparent 70%), ${GLASS}`,
            // Only the roots are glass. Blurring every nested row cost a paint
            // per row for an effect nobody can see behind 2%-alpha fill.
            backdropFilter: sub ? "none" : "blur(12px)",
            color: "inherit",
            transition: "border-color 180ms ease, background 180ms ease, transform 180ms ease, box-shadow 180ms ease",
            "&:hover": {
              borderColor: filled ? GOOD : "rgba(249,115,22,0.55)",
              transform: "translateY(-1px)",
              boxShadow: filled ? "0 12px 30px -20px rgba(134,239,172,0.5)" : "0 12px 30px -20px rgba(249,115,22,0.5)",
            },
            "@media (prefers-reduced-motion: reduce)": { transition: "none", "&:hover": { transform: "none" } },
            ...FOCUS,
          }}
        >
          <Medal filled={filled} sub={sub} />
          {/* A name is not a picture. The position the decision is about,
              from the side that has to make it. */}
          <OpeningDiagram moves={node.slot.line} side={node.slot.side} px={sub ? 40 : 52} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              sx={{
                color: sub ? "rgba(255,255,255,0.85)" : "#fff",
                fontWeight: sub ? 600 : 700,
                fontSize: sub ? { xs: "0.84rem", md: "0.88rem" } : { xs: "0.95rem", md: "1rem" },
                lineHeight: 1.25,
              }}
            >
              {slotTitle(node.slot)}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", mt: 0.35 }}>
              <Typography sx={{ fontSize: "0.78rem", color: filled ? GOOD : "rgba(255,255,255,0.5)", fontWeight: filled ? 600 : 400 }}>
                {/* "of games", not "of your games", unless the share really was
                    measured on their archive. */}
                {node.pick
                  ? node.pick.label
                  : `${pctOf(reach)} of ${measured ? "your games" : "games"} · nothing chosen`}
              </Typography>
              {/* 4% and 30% both scan as "a percentage"; a count of games does not. */}
              {!filled && rare && (
                <Typography
                  component="span"
                  sx={{
                    fontSize: "0.68rem",
                    color: "rgba(255,255,255,0.4)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: "999px",
                    px: 0.75,
                    py: 0.1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {rare}
                </Typography>
              )}
            </Box>
          </Box>
          {node.slot.line.length > 0 && (
            <Typography
              sx={{
                display: { xs: "none", sm: "block" },
                fontFamily: MONO,
                fontSize: "0.75rem",
                color: "rgba(255,255,255,0.3)",
                flexShrink: 0,
              }}
            >
              {numberedLine(node.slot.line)}
            </Typography>
          )}
          {filled ? (
            <Pencil size={14} color="rgba(255,255,255,0.35)" aria-hidden />
          ) : (
            <ChevronRight size={16} color={EMBER} aria-hidden />
          )}
        </Box>
        <ConfettiBurst burst={burst} spread={110} count={18} />
      </Box>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <SlotChooser
              slot={node.slot}
              quiz={quiz}
              band={band}
              youPlay={yourMove}
              churn={churn}
              transposes={transposesInto(map, node.slot.id, picks)}
              onPick={onPick}
              onClose={() => onOpen(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* A filled slot that maps to a curated opening has a course behind it,
          and the course's own progress rides along so the bracket and the
          learning are one loop. */}
      {node.pick?.choiceId && (
        <StudyRow choiceId={node.pick.choiceId} label={node.pick.label} progress={courses.get(node.pick.choiceId)} />
      )}

      {(kids.decisions.length > 0 || kids.unhelped.length > 0) && (
        <Box
          sx={{
            mt: 1.25,
            display: "grid",
            gap: 1,
            borderLeft: "1px solid rgba(255,255,255,0.08)",
            ml: { xs: 1, md: 1.5 },
          }}
        >
          {kids.decisions.map((child, i) => (
            <SlotBranch
              key={child.slot.id}
              node={child}
              map={map}
              picks={picks}
              quiz={quiz}
              band={band}
              tree={tree}
              churn={churn}
              courses={courses}
              openSlot={openSlot}
              onOpen={onOpen}
              onPick={onPick}
              index={i}
            />
          ))}
          {/* Branches with nothing behind them. One line, not N tasks. */}
          {kids.unhelped.length > 0 && <NoAnswerYet nodes={kids.unhelped} />}
        </Box>
      )}
    </Box>
  );
}

/**
 * Filled or not, as a shape and a colour: a dashed empty ring with a plus, or
 * a solid green medal with a tick. Remounted on the change, so the tick lands
 * with a pop, and drawn from the still under reduced motion.
 */
function Medal({ filled, sub }: { filled: boolean; sub: boolean }) {
  const reduce = useReducedMotion();
  const size = sub ? 22 : 28;
  return (
    <Box
      component={motion.span}
      key={filled ? "filled" : "open"}
      aria-hidden
      data-testid={filled ? "medal-filled" : "medal-open"}
      initial={reduce || !filled ? false : { scale: 0.4, rotate: -30 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={POP}
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        background: filled ? GOOD : "transparent",
        border: filled ? "none" : `1.5px dashed rgba(255,255,255,${sub ? 0.25 : 0.35})`,
        color: filled ? "#0B1410" : "rgba(255,255,255,0.45)",
        boxShadow: filled ? "0 0 0 4px rgba(134,239,172,0.14), 0 0 18px rgba(134,239,172,0.35)" : "none",
      }}
    >
      {filled ? <Check size={sub ? 12 : 15} strokeWidth={3} /> : <Plus size={sub ? 11 : 13} />}
    </Box>
  );
}

/** The way into the course behind a choice, with where they are in it. */
function StudyRow({
  choiceId,
  label,
  progress,
}: {
  choiceId: string;
  label: string;
  progress?: CourseProgress;
}) {
  const started = progress?.started ?? 0;
  const due = progress?.due ?? 0;
  return (
    <Box sx={{ mt: 1, ml: { xs: 1, md: 1.5 }, display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
      <Box
        component={Link}
        href={`/learn/${encodeURIComponent(choiceId)}`}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          px: 1.5,
          py: 0.9,
          minHeight: 40,
          borderRadius: "999px",
          // Courses are the lessons area, and lessons wear gold sitewide.
          border: `1px solid ${GOLD.border}`,
          background: GOLD.tint,
          color: GOLD.bright,
          fontSize: "0.8rem",
          fontWeight: 600,
          textDecoration: "none",
          transition: "background 180ms ease, border-color 180ms ease",
          "&:hover": { background: GOLD.soft, borderColor: GOLD.base },
          ...FOCUS,
        }}
      >
        <BookOpen size={14} aria-hidden /> {label} course
      </Box>
      {started > 0 && (
        <Typography component="span" sx={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.5)" }}>
          {started} {started === 1 ? "chapter" : "chapters"} in
        </Typography>
      )}
      {due > 0 && (
        <Typography
          component="span"
          data-testid="course-due-chip"
          sx={{
            fontSize: "0.7rem",
            fontWeight: 700,
            color: EMBER,
            border: "1px solid rgba(249,115,22,0.4)",
            background: "rgba(249,115,22,0.1)",
            borderRadius: "999px",
            px: 0.9,
            py: 0.15,
          }}
        >
          {due} due
        </Typography>
      )}
    </Box>
  );
}

/**
 * The branches we have no answer for.
 *
 * The honest form of a gap. Collapsed, never hidden: the move list and the
 * library behind each slot are real, and what it says when closed is what
 * those branches are worth, not a count of our failures.
 */
function NoAnswerYet({ nodes }: { nodes: BracketNode[] }) {
  const [open, setOpen] = useState(false);
  const total = shareOf(nodes);
  return (
    <Box>
      <Box
        component="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        sx={{
          appearance: "none",
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          background: "none",
          border: "1px dashed rgba(255,255,255,0.14)",
          borderRadius: "0.9rem",
          px: 1.75,
          py: 1.1,
          minHeight: 44,
          color: "inherit",
          transition: "border-color 180ms ease, background 180ms ease",
          "&:hover": { borderColor: "rgba(255,255,255,0.26)", background: "rgba(255,255,255,0.02)" },
          ...FOCUS,
        }}
      >
        <Typography sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.82rem", fontWeight: 600 }}>
          {open ? "Hide these" : `${nodes.length} more branches, ${pctOf(total)} of games`}
        </Typography>
        <Typography sx={{ color: "rgba(255,255,255,0.38)", fontSize: "0.76rem", lineHeight: 1.5, mt: 0.3 }}>
          {/* Said plainly, and without a claim about the player invented to
              make our gap sound smaller. */}
          We have no recommended answer for these yet. Pick one yourself, or leave them.
        </Typography>
      </Box>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <Box sx={{ display: "grid", gap: 0.75, mt: 1 }}>
              {nodes.map((n) => (
                <Box
                  key={n.slot.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                    px: 1.5,
                    py: 1,
                    borderRadius: "0.75rem",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <Typography sx={{ color: "rgba(255,255,255,0.62)", fontSize: "0.82rem", minWidth: 0 }}>
                    {slotTitle(n.slot)}
                  </Typography>
                  <Typography sx={{ fontFamily: MONO, fontSize: "0.72rem", color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>
                    {numberedLine(n.slot.line)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
}

export default SlotBranch;
