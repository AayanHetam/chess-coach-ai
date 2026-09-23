"use client";

import { useState } from "react";
import { Box, Typography } from "@mui/material";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { CHARACTER_STYLE } from "@/lib/repertoire/character";
import type { Churn, QuizAnswers } from "@/lib/repertoire/store";
import type { Character, TheoryLoad } from "@/types/repertoire";
import { EASE, EMBER, FOCUS, GLASS, GOLD } from "./tokens";

// ── The two questions ────────────────────────────────────────────────────────
//
// Not a personality test. They exist to rank the suggestions, and a longer
// quiz would buy a better ranking at the cost of the thing it is ranking for.
// Both are skippable, because a player who already knows what they play
// should not have to answer questions to be allowed to say so.

const LOADS: Array<{ value: TheoryLoad; title: string; body: string }> = [
  { value: "light", title: "As little as possible", body: "Setups I can play against anything." },
  { value: "medium", title: "A fair amount", body: "Real lines, as long as they repeat." },
  { value: "heavy", title: "Whatever it takes", body: "The critical stuff. I will memorise." },
];

const CHARACTERS: Array<{ value: Character; title: string; body: string }> = [
  { value: "attack", title: "I want to attack", body: "Open lines and a king to go after." },
  { value: "solid", title: "I want to be hard to beat", body: "Sound structures, few weaknesses." },
  { value: "counterattack", title: "I want to punish mistakes", body: "Let them overextend, then hit back." },
  { value: "structure", title: "I want to outplay them slowly", body: "Small edges and a long squeeze." },
];

export const LOAD_SUMMARY: Record<TheoryLoad, string> = {
  light: "as little theory as possible",
  medium: "a fair amount of theory",
  heavy: "whatever it takes",
};

export interface QuizProps {
  onDone: (quiz: QuizAnswers) => void;
  /** Their existing answers when this is a re-take, null on a first visit. */
  current: QuizAnswers | null;
}

export function Quiz({ onDone, current }: QuizProps) {
  const reduce = useReducedMotion();
  // Always starts at step 0, even on a re-take. Seeding `load` from `current`
  // would jump straight to step 2 and make the first answer unreachable.
  const [load, setLoad] = useState<TheoryLoad | null>(null);
  const step = load === null ? 0 : 1;

  return (
    <Box sx={{ maxWidth: 640, mx: "auto", px: { xs: 2, md: 3 }, py: { xs: 4, md: 7 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.5 }}>
        <Sparkles size={15} color={GOLD.base} aria-hidden />
        <Typography sx={{ color: GOLD.bright, fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
          Two questions
        </Typography>
        <Pips step={step} />
      </Box>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, x: -28 }}
          transition={{ duration: 0.18, ease: EASE }}
        >
          <Typography
            component="h1"
            sx={{ color: "#fff", fontSize: { xs: "1.5rem", md: "1.9rem" }, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.25, mb: 0.75 }}
          >
            {step === 0 ? "How much theory do you actually want to learn?" : "And what kind of game do you want out of it?"}
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.9rem", lineHeight: 1.6, mb: 2.5 }}>
            {step === 0 ? "No wrong answer. Both are complete repertoires." : "This orders the list. It hides nothing."}
          </Typography>

          <Box sx={{ display: "grid", gap: 1 }}>
            {step === 0
              ? LOADS.map((option, i) => (
                  <QuizOption
                    key={option.value}
                    index={i}
                    title={option.title}
                    body={option.body}
                    selected={current?.load === option.value}
                    onClick={() => setLoad(option.value)}
                  />
                ))
              : CHARACTERS.map((option, i) => (
                  <QuizOption
                    key={option.value}
                    index={i}
                    title={option.title}
                    body={option.body}
                    selected={current?.character === option.value}
                    // The hue this answer wears for the rest of the product.
                    colour={CHARACTER_STYLE[option.value].colour}
                    onClick={() => onDone({ load: load!, character: option.value })}
                  />
                ))}
          </Box>
        </motion.div>
      </AnimatePresence>

      <Box
        component="button"
        // On a re-take this hands back what they ALREADY had rather than the
        // medium/solid default, which would silently rewrite a deliberate answer.
        onClick={() => onDone(current ?? { load: "medium", character: "solid" })}
        sx={{
          mt: 2.5,
          minHeight: 44,
          px: 1,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "rgba(255,255,255,0.4)",
          fontSize: "0.82rem",
          borderRadius: "8px",
          "&:hover": { color: "rgba(255,255,255,0.75)" },
          ...FOCUS,
        }}
      >
        {current ? "Keep my current answers" : "Skip, I know what I play"}
      </Box>
    </Box>
  );
}

/** Two pips. The current one is ember and long; done ones stay lit. */
function Pips({ step }: { step: number }) {
  return (
    <Box aria-label={`Step ${step + 1} of 2`} role="img" sx={{ display: "inline-flex", gap: 0.5, ml: 0.5 }}>
      {[0, 1].map((i) => (
        <Box
          key={i}
          sx={{
            height: 6,
            width: i === step ? 22 : 8,
            borderRadius: 999,
            background: i <= step ? EMBER : "rgba(255,255,255,0.18)",
            boxShadow: i === step ? "0 0 10px rgba(249,115,22,0.6)" : "none",
            transition: "width 220ms cubic-bezier(0.16,1,0.3,1), background 180ms ease",
            "@media (prefers-reduced-motion: reduce)": { transition: "none" },
          }}
        />
      ))}
    </Box>
  );
}

export interface QuizOptionProps {
  title: string;
  body: string;
  index: number;
  /** The character hue, when this option has one. Theory-load options do not. */
  colour?: string;
  /** Already their answer, on a re-take. */
  selected?: boolean;
  onClick: () => void;
}

export function QuizOption({ title, body, index, colour, selected, onClick }: QuizOptionProps) {
  const reduce = useReducedMotion();
  const accent = colour ?? EMBER;
  return (
    <Box
      component={motion.button}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={reduce ? undefined : { y: -2 }}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      transition={{ duration: 0.22, delay: index * 0.05, ease: EASE }}
      onClick={onClick}
      aria-pressed={selected ? true : undefined}
      sx={{
        textAlign: "left",
        width: "100%",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        p: { xs: 1.75, md: 2 },
        borderRadius: "1.25rem",
        border: `1px solid ${selected ? `${accent}80` : "rgba(255,255,255,0.1)"}`,
        background: selected ? `${accent}14` : GLASS,
        backdropFilter: "blur(12px)",
        color: "inherit",
        transition: "border-color 180ms ease, background 180ms ease, box-shadow 180ms ease",
        "&:hover": { borderColor: `${accent}8C`, background: `${accent}14`, boxShadow: `0 14px 34px -22px ${accent}` },
        "&:focus-visible": { outline: `2px solid ${accent}`, outlineOffset: 2 },
      }}
    >
      {/* A dot rather than a tinted card; only the character step has one. */}
      {colour && (
        <Box
          aria-hidden
          sx={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, background: colour, boxShadow: `0 0 10px ${colour}66` }}
        />
      )}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
          <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: "1rem" }}>{title}</Typography>
          {/* Selection survives somebody who cannot separate the hues: a word as well as a tint. */}
          {selected && (
            <Typography sx={{ fontSize: "0.68rem", color: accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              your answer
            </Typography>
          )}
        </Box>
        <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.84rem", lineHeight: 1.5, mt: 0.25 }}>{body}</Typography>
      </Box>
    </Box>
  );
}

/**
 * What we think they asked for, and a way to say otherwise.
 *
 * The quiz drives the order of every list on the page for as long as the
 * account exists. An invisible input with that much reach is a bug waiting to
 * be reported as "the suggestions are wrong", so the answers are on screen,
 * in the colour they carry everywhere else, one tap from being changed.
 * Editing preserves every pick. Only the ordering changes.
 */
export function QuizSummary({ quiz, onEdit }: { quiz: QuizAnswers; onEdit: () => void }) {
  const style = CHARACTER_STYLE[quiz.character];
  return (
    // ONE control, not a sentence with a link on the end: at 375px a separate
    // "Change" button wrapped onto its own line, and a 44px target is not
    // negotiable, so the whole row is the target.
    <Box
      component="button"
      onClick={onEdit}
      aria-label={`Ordered for ${style.label} openings and ${LOAD_SUMMARY[quiz.load]}. Change these answers.`}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        flexWrap: "wrap",
        textAlign: "left",
        minHeight: 40,
        px: 1.25,
        py: 0.5,
        ml: -1.25,
        appearance: "none",
        background: "none",
        cursor: "pointer",
        color: "inherit",
        border: "1px solid transparent",
        borderRadius: "999px",
        transition: "background 180ms ease, border-color 180ms ease",
        "&:hover": { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)" },
        ...FOCUS,
      }}
    >
      <Typography component="span" sx={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)" }}>
        Ordered for
      </Typography>
      <Box
        component="span"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.6,
          px: 1,
          py: 0.3,
          borderRadius: "999px",
          border: `1px solid ${style.colour}33`,
          background: `${style.colour}0F`,
        }}
      >
        <Box component="span" sx={{ width: 7, height: 7, borderRadius: "50%", background: style.colour }} />
        <Typography component="span" sx={{ fontSize: "0.72rem", color: style.colour }}>
          {style.label}
        </Typography>
      </Box>
      <Typography component="span" sx={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)" }}>
        · {LOAD_SUMMARY[quiz.load]}
      </Typography>
      <Typography
        component="span"
        sx={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.45)", textDecoration: "underline", textUnderlineOffset: 3 }}
      >
        Change
      </Typography>
    </Box>
  );
}

// ── Churn ────────────────────────────────────────────────────────────────────

const CHURN_OPTIONS: Array<{ value: Churn; title: string; body: string }> = [
  { value: "keep", title: "Keep what I play", body: "My openings first. Just show me the gaps." },
  { value: "some", title: "Change one or two", body: "Swap the weak ones." },
  { value: "rebuild", title: "Start from scratch", body: "Rank on what suits me." },
];

/**
 * The question that decides how hard the ranking argues with them.
 *
 * Deliberately not folded into the two-question quiz. That one asks how much
 * theory they want to CARRY; this asks how far they will MOVE, and those are
 * two different answers from the same person.
 */
export function ChurnQuestion({ onAnswer, onCancel }: { onAnswer: (churn: Churn) => void; onCancel: () => void }) {
  const reduce = useReducedMotion();
  return (
    <Box
      component={motion.div}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE }}
      sx={{ mb: 2.5, p: { xs: 2, md: 2.5 }, borderRadius: "1.25rem", border: `1px solid ${GOLD.border}`, background: GOLD.tint }}
    >
      <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: "1rem", mb: 0.5 }}>
        How much of what you play should change?
      </Typography>
      <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.84rem", lineHeight: 1.6, mb: 2 }}>
        Asked once, before we read your games. You can change it later.
      </Typography>
      <Box sx={{ display: "grid", gap: 1 }}>
        {CHURN_OPTIONS.map((option, i) => (
          <QuizOption key={option.value} index={i} title={option.title} body={option.body} onClick={() => onAnswer(option.value)} />
        ))}
      </Box>
      <Box
        component="button"
        onClick={onCancel}
        sx={{
          mt: 1.5,
          minHeight: 44,
          px: 1,
          ml: -1,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "rgba(255,255,255,0.4)",
          fontSize: "0.8rem",
          borderRadius: "8px",
          "&:hover": { color: "rgba(255,255,255,0.75)" },
          ...FOCUS,
        }}
      >
        Not now
      </Box>
    </Box>
  );
}
