"use client";

// Filling one slot.
//
// Three tiers, in this order, because they answer three different questions:
//
//   OUR SUGGESTIONS  "what should I play here" — curated, with what it costs
//                    to learn and how much of the branch it actually answers
//   WHAT PEOPLE PLAY "what are the options" — measured off 3.4M games, named
//   THE LIBRARY      "I already know what I want" — all 3,690 named openings
//
// Nobody is ever forced through a recommendation to reach their own choice, and
// nobody is left staring at a search box with no idea what to type.

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { Chess } from "chess.js";
import { motion } from "framer-motion";
import { BookOpen, Check, Search, Shapes, X } from "lucide-react";
import type {
  OpeningEntry,
  RepertoireChoice,
  RepertoirePick,
  RepertoireSlot,
} from "@/types/repertoire";
import { numberedLine, share as pctOf } from "@/lib/repertoire/bracket";
import { classify, skeletonOf } from "@/lib/repertoire/structure";
import { rankChoices, type QuizAnswers } from "@/lib/repertoire/store";
import { levelFit, withinCeiling, type Band } from "@/lib/repertoire/levels";
import { CHARACTER_STYLE, fitOf } from "@/lib/repertoire/character";
import { coverageSentence } from "@/lib/repertoire/sentences";
import OpeningDiagram from "@/components/learn/OpeningDiagram";

const EMBER = "#FB923C";
const GOOD = "#86EFAC";
const MONO = '"SF Mono", ui-monospace, Menlo, monospace';

const LOAD_WORDS: Record<string, string> = {
  light: "little to learn",
  medium: "some theory",
  heavy: "a lot of theory",
};

export interface SlotChooserProps {
  slot: RepertoireSlot;
  quiz: QuizAnswers | null;
  /** The rating band we measured, which decides the order of the list. */
  band: Band;
  onPick: (pick: RepertoirePick) => void;
  onClose: () => void;
  /** Systems already in their bracket that this slot can transpose into. */
  transposes: Array<{ choiceId: string; name: string; atLeast: number }>;
}

export default function SlotChooser({ slot, quiz, band, onPick, onClose, transposes }: SlotChooserProps) {
  const ranked = useMemo(() => rankChoices(slot.choices, quiz, band), [slot.choices, quiz, band]);
  const panel = useRef<HTMLDivElement>(null);

  // Escape closes, and focus starts inside. A chooser you can only leave with
  // the mouse is a chooser that traps a keyboard user in a modal.
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Box
      ref={panel}
      tabIndex={-1}
      role="group"
      aria-label={`Choose what to play`}
      sx={{
        mt: 1.5,
        borderRadius: "1.25rem",
        border: `1px solid rgba(249,115,22,0.28)`,
        background: "linear-gradient(180deg, rgba(24,20,18,0.96) 0%, rgba(12,14,20,0.96) 100%)",
        backdropFilter: "blur(12px)",
        p: { xs: 2, md: 2.5 },
        outline: "none",
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, mb: 1.5 }}>
        <Typography sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.72rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Our suggestions
        </Typography>
        <Box
          component="button"
          onClick={onClose}
          aria-label="Close without choosing"
          sx={{
            display: "grid", placeItems: "center", width: 32, height: 32, mt: -0.5, mr: -0.5,
            background: "none", border: "none", cursor: "pointer", borderRadius: "8px",
            color: "rgba(255,255,255,0.4)",
            "&:hover": { color: "#fff" },
            "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
          }}
        >
          <X size={16} aria-hidden />
        </Box>
      </Box>

      {transposes.length > 0 && <Transposes transposes={transposes} />}
      <Brief slot={slot} />

      {ranked.length > 0 ? (
        <Box sx={{ display: "grid", gap: 1 }}>
          {ranked.map((choice, i) => (
            <ChoiceCard
              key={choice.id}
              choice={choice}
              slot={slot}
              index={i}
              band={band}
              quiz={quiz}
              onPick={() => onPick({ slotId: slot.id, choiceId: choice.id, label: choice.name })}
            />
          ))}
        </Box>
      ) : (
        <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.86rem", lineHeight: 1.6 }}>
          We have no curated recommendation this deep. What people actually play is below, and the
          full library is searchable.
        </Typography>
      )}

      <MoveList slot={slot} onPick={onPick} />
      <LibrarySearch slot={slot} onPick={onPick} />
    </Box>
  );
}

/**
 * "This flows back into something you already play."
 *
 * Stated as a floor and with the condition attached, because it is one. A
 * Grünfeld does not cover 1.c4: it covers about a quarter of it, and only when
 * White cooperates by playing d4.
 */
function Transposes({ transposes }: { transposes: SlotChooserProps["transposes"] }) {
  const best = transposes[0];
  return (
    <Box
      sx={{
        mb: 1.5, p: 1.5, borderRadius: "12px",
        border: "1px solid rgba(134,239,172,0.25)", background: "rgba(134,239,172,0.06)",
      }}
    >
      <Typography sx={{ color: GOOD, fontSize: "0.82rem", lineHeight: 1.6 }}>
        Your <strong>{best.name}</strong> already answers at least {pctOf(best.atLeast)} of this by
        transposition. The rest is a different opening and still needs a move.
      </Typography>
    </Box>
  );
}

/**
 * What this position IS, for the 35% of slots no book names.
 *
 * The structure is classified here rather than in the build, so there is one
 * classifier in the codebase instead of a copy of it in a script that would
 * drift. Everything else is counted, and the wording says which is which:
 * "most played" is not "best", and it does not pretend to be.
 */
function Brief({ slot }: { slot: RepertoireSlot }) {
  const brief = slot.brief;
  const structure = useMemo(() => {
    if (!brief || brief.mainline.length === 0) return null;
    try {
      const board = new Chess();
      for (const san of [...slot.line, ...brief.mainline]) if (!board.move(san)) return null;
      return classify(skeletonOf(board.fen()));
    } catch {
      return null;
    }
  }, [slot.line, brief]);

  if (!brief || brief.games < 200) return null;
  return (
    <Box sx={{ mb: 2, p: 1.75, borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
        <Shapes size={13} color="rgba(255,255,255,0.4)" aria-hidden />
        <Typography sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          What this becomes
        </Typography>
      </Box>
      <Typography sx={{ fontFamily: MONO, fontSize: "0.8rem", color: "rgba(255,255,255,0.75)", mb: 0.75 }}>
        {numberedLine([...slot.line, ...brief.mainline], slot.line.length)}
      </Typography>
      {structure && (
        <Typography sx={{ fontSize: "0.85rem", color: "#fff", lineHeight: 1.55, mb: 0.5 }}>
          A <strong>{structure.name}</strong>. {structure.summary}
        </Typography>
      )}
      <Typography sx={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.55 }}>
        {brief.score !== null && (
          <>White scores {Math.round(brief.score * 100)}% across {brief.games.toLocaleString()} games. </>
        )}
        {brief.breaks.length > 0 && (
          <>The pawn breaks that actually happen: {brief.breaks.map((b) => `${b.san} ${pctOf(b.share)}`).join(", ")}.</>
        )}
      </Typography>
      <Typography sx={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.35)", mt: 0.75 }}>
        Most played, not best. Counted, not recommended.
      </Typography>
    </Box>
  );
}

function ChoiceCard({
  choice,
  slot,
  index,
  band,
  quiz,
  onPick,
}: {
  choice: RepertoireChoice;
  slot: RepertoireSlot;
  index: number;
  band: Band;
  quiz: QuizAnswers | null;
  onPick: () => void;
}) {
  const branches = choice.gaps.length;
  const fit = levelFit(choice, band);
  const heavyForBand = !withinCeiling(choice, band);
  const style = CHARACTER_STYLE[choice.character];
  const fitted = fitOf(choice, quiz, band);
  return (
    <Box
      component={motion.button}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.04, 0.2), ease: [0.16, 1, 0.3, 1] }}
      onClick={onPick}
      sx={{
        textAlign: "left", width: "100%", cursor: "pointer",
        p: 1.75, borderRadius: "14px",
        border: "1px solid rgba(255,255,255,0.09)",
        background: "rgba(255,255,255,0.03)",
        transition: "border-color 180ms ease, background 180ms ease",
        "&:hover": { borderColor: "rgba(249,115,22,0.5)", background: "rgba(249,115,22,0.06)" },
        "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
      }}
    >
      <Box sx={{ display: "flex", gap: 1.75, alignItems: "flex-start", mb: 1 }}>
        {/* A name is not a picture. "Grünfeld Defence" means nothing to the
            player this page is for; the position it produces does. Same squares
            and glyphs as the onboarding quiz, so the two read as one product. */}
        <OpeningDiagram moves={choice.diagram} side={slot.side} px={84} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap", mb: 0.5 }}>
            <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: "0.95rem" }}>
              {choice.name}
            </Typography>
            <Typography sx={{ fontFamily: MONO, fontSize: "0.78rem", color: EMBER }}>
              {choice.play}
            </Typography>
          </Box>
          <Typography sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.84rem", lineHeight: 1.55 }}>
            {choice.blurb}
          </Typography>
        </Box>
      </Box>
      {/* What it actually finishes, said the way it would be said out loud. The
          percentage alone reads as two similar options when one of them ends the
          job and the other leaves homework. */}
      <Typography
        sx={{
          color: "rgba(255,255,255,0.78)",
          fontSize: "0.85rem",
          lineHeight: 1.55,
          mb: 1,
          borderLeft: "2px solid rgba(249,115,22,0.45)",
          pl: 1.25,
        }}
      >
        {coverageSentence(choice, slot)}
      </Typography>
      {/* Why it suits the level, or why it does not. The honest version of a
          recommendation is the reason attached to it. */}
      <Typography sx={{ color: fit < 0 ? EMBER : "rgba(255,255,255,0.45)", fontSize: "0.79rem", lineHeight: 1.5, mb: 1 }}>
        {fit < 0 && <strong>A long way above your level. </strong>}
        {choice.why}
      </Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        {/* What kind of game it gives you, in the colour it wears everywhere
            else. This one is unconditional: it is a property of the opening,
            not a judgement about the player, so it is on the card whether or
            not anybody answered the quiz.
            When it IS the character they asked for, the tag fills in and takes
            a tick. That carries the positive signal without spending a second
            tag on it — and it means the match is legible to somebody reading
            the shapes rather than the hues. */}
        <Tag colour={style.colour} filled={fitted.style === "match"}>
          {style.label}
        </Tag>
        {/* Theory load and level are different things, and the King's Indian is
            the case that proves it: a lot to memorise, one plan, and a fine
            choice at 900. A single difficulty number could not say that. */}
        <Tag tone={heavyForBand ? "warn" : undefined}>{LOAD_WORDS[choice.load] ?? choice.load}</Tag>
        {/* At most two, and never more: everything lining up collapses to one
            tag, and a two-band stretch swallows the style note because the
            expensive objection is the one that should be read. */}
        {fitted.recommended ? (
          <Tag tone="good">heavily recommended</Tag>
        ) : fitted.level === "stretch" ? (
          <Tag tone="warn">costs you a year first</Tag>
        ) : (
          <>
            {fitted.level === "suits" && <Tag tone="good">suits your level</Tag>}
            {/* Only for a choice that agrees with them on NEITHER axis. A
                merely-different character is the default state for three cards
                in four, and a label on the default is wallpaper.
                Neutral tone on purpose: not liking the shape of a game is a
                preference, not a hazard, and colouring this like the year-long
                warning above would rank taste alongside cost. */}
            {fitted.style === "poor" && <Tag>doesn&apos;t fit your playstyle</Tag>}
          </>
        )}
        {/* A `move` choice absorbs nothing by definition — it is a move, not a
            repertoire — so an absorb figure for it would be arithmetic dressed
            as a recommendation. Say what it actually costs you instead. */}
        {choice.coverage === "system" ? (
          <Tag tone="good">one setup, no branches</Tag>
        ) : choice.coverage === "move" ? (
          <Tag tone="warn">{branches} more decisions</Tag>
        ) : (
          branches > 0 && <Tag tone="warn">{branches} to fill in</Tag>
        )}
      </Box>
    </Box>
  );
}

/** What people actually play here, measured. Always available, never curated. */
function MoveList({ slot, onPick }: { slot: RepertoireSlot; onPick: (p: RepertoirePick) => void }) {
  if (slot.moves.length === 0) return null;
  return (
    <Box sx={{ mt: 2.5 }}>
      <Heading>What people play here</Heading>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
        {slot.moves.map((move) => (
          <Box
            key={move.san}
            component="button"
            onClick={() =>
              onPick({ slotId: slot.id, san: move.san, label: move.name ?? move.san })
            }
            sx={{
              display: "inline-flex", alignItems: "center", gap: 0.75,
              minHeight: 40, px: 1.5, borderRadius: "10px", cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)",
              transition: "border-color 180ms ease",
              "&:hover": { borderColor: "rgba(249,115,22,0.5)" },
              "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
            }}
          >
            <Typography sx={{ fontFamily: MONO, fontSize: "0.82rem", color: "#fff" }}>
              {move.san}
            </Typography>
            <Typography sx={{ fontSize: "0.74rem", color: "rgba(255,255,255,0.4)", fontVariantNumeric: "tabular-nums" }}>
              {pctOf(move.share)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/**
 * The full library.
 *
 * Filtered to lines reachable from this slot. Searching "London" from the slot
 * for 1.d4 Nf6 2.Bf4 should not offer the London's own lines against 1...d5:
 * they are real openings and they are unreachable from where the player is
 * standing, which makes them worse than no result at all.
 */
function LibrarySearch({ slot, onPick }: { slot: RepertoireSlot; onPick: (p: RepertoirePick) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OpeningEntry[]>([]);
  const [more, setMore] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setMore(0);
      setState("idle");
      return;
    }
    let cancelled = false;
    setState("loading");
    // Debounced: a request per keystroke would be a request per keystroke.
    const timer = setTimeout(() => {
      const url = `/api/openings/search?q=${encodeURIComponent(query)}&line=${encodeURIComponent(slot.line.join(","))}`;
      fetch(url)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((data) => {
          if (cancelled) return;
          setResults(data.results ?? []);
          setMore(data.more ?? 0);
          setState("idle");
        })
        .catch(() => {
          if (!cancelled) setState("failed");
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, slot.line]);

  return (
    <Box sx={{ mt: 2.5 }}>
      <Heading>Or pick your own</Heading>
      <Box
        sx={{
          display: "flex", alignItems: "center", gap: 1, px: 1.5,
          borderRadius: "12px", border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.25)",
          "&:focus-within": { borderColor: EMBER },
        }}
      >
        <Search size={15} color="rgba(255,255,255,0.4)" aria-hidden />
        <Box
          component="input"
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          placeholder="Search every named opening"
          aria-label="Search every named opening"
          sx={{
            flex: 1, minHeight: 44, background: "none", border: "none", outline: "none",
            color: "#fff", fontSize: "0.9rem",
            "&::placeholder": { color: "rgba(255,255,255,0.35)" },
          }}
        />
      </Box>

      {state === "failed" && (
        <Typography role="status" sx={{ mt: 1, fontSize: "0.8rem", color: "rgba(255,255,255,0.5)" }}>
          Could not reach the library. The suggestions above still work.
        </Typography>
      )}

      {results.length > 0 && (
        <Box sx={{ mt: 1, maxHeight: 240, overflowY: "auto", display: "grid", gap: 0.25 }}>
          {results.map((entry) => (
            <Box
              key={`${entry.name}-${entry.moves.length}`}
              component="button"
              onClick={() =>
                onPick({
                  slotId: slot.id,
                  san: entry.moves[slot.line.length],
                  label: entry.name,
                  fromLibrary: true,
                })
              }
              sx={{
                textAlign: "left", width: "100%", cursor: "pointer", minHeight: 44,
                px: 1.25, py: 0.75, borderRadius: "10px",
                background: "none", border: "1px solid transparent",
                "&:hover": { background: "rgba(255,255,255,0.05)" },
                "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: -2 },
              }}
            >
              <Typography sx={{ color: "#fff", fontSize: "0.85rem" }}>{entry.name}</Typography>
              <Typography sx={{ fontFamily: MONO, fontSize: "0.74rem", color: "rgba(255,255,255,0.4)" }}>
                {entry.eco ? `${entry.eco} · ` : ""}
                {numberedLine(entry.moves.slice(0, 8))}
              </Typography>
            </Box>
          ))}
          {more > 0 && (
            <Typography sx={{ px: 1.25, py: 0.75, fontSize: "0.76rem", color: "rgba(255,255,255,0.4)" }}>
              {more} more. Keep typing to narrow it down.
            </Typography>
          )}
        </Box>
      )}

      {query.trim().length >= 2 && results.length === 0 && state === "idle" && (
        <Typography sx={{ mt: 1, fontSize: "0.8rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.55 }}>
          Nothing named that is reachable from {slot.line.length ? numberedLine(slot.line) : "the start"}.
          An opening can be real and still not arise here.
        </Typography>
      )}
    </Box>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
      <BookOpen size={13} color="rgba(255,255,255,0.35)" aria-hidden />
      <Typography sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {children}
      </Typography>
    </Box>
  );
}

function Tag({
  children,
  tone,
  colour: explicit,
  filled,
}: {
  children: React.ReactNode;
  tone?: "good" | "warn";
  /** A character hue. Overrides `tone`, which only knows good/warn/neutral. */
  colour?: string;
  /** Emphasised: this is the thing they asked for. */
  filled?: boolean;
}) {
  const colour = explicit ?? (tone === "good" ? GOOD : tone === "warn" ? EMBER : "rgba(255,255,255,0.5)");
  return (
    <Box
      sx={{
        display: "inline-flex", alignItems: "center", gap: 0.4,
        px: 0.9, py: 0.3, borderRadius: "999px",
        border: `1px solid ${colour}${filled ? "88" : "33"}`,
        background: `${colour}${filled ? "24" : "0F"}`,
      }}
    >
      {(tone === "good" || filled) && <Check size={11} color={colour} aria-hidden />}
      <Typography sx={{ fontSize: "0.7rem", color: colour, fontWeight: filled ? 600 : 400 }}>
        {children}
      </Typography>
    </Box>
  );
}
