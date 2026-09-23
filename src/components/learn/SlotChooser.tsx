"use client";

// Filling one slot.
//
// Three tiers, in this order, because they answer three different questions:
//
//   OUR SUGGESTIONS  "what should I play here": curated, ranked, and Masti
//                    names the top one and the one reason for it
//   WHAT PEOPLE PLAY "what are the options": measured off the corpus, named
//   THE LIBRARY      "I already know what I want": every named opening
//
// Nobody is ever forced through a recommendation to reach their own choice, and
// nobody is left staring at a search box with no idea what to type.
//
// EVERY CARD IS SHORT ON PURPOSE. The first version carried a blurb, a coverage
// sentence with the homework attached, and a "why", on every one of nine cards
// against 1.d4: a wall of prose that an eight-year-old scrolled straight past.
// A card is now a board, a name, one line and its tags; the blurb and the why
// ride along as a tooltip for whoever hovers.

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { Chess } from "chess.js";
import { motion, useReducedMotion } from "framer-motion";
import { BookOpen, Check, Search, Shapes, X } from "lucide-react";
import type {
  OpeningEntry,
  RepertoireChoice,
  RepertoirePick,
  RepertoireSlot,
} from "@/types/repertoire";
import { numberedLine, share as pctOf } from "@/lib/repertoire/bracket";
import { classify, skeletonOf } from "@/lib/repertoire/structure";
import { rankChoices, type Churn, type QuizAnswers } from "@/lib/repertoire/store";
import { withinCeiling, type Band } from "@/lib/repertoire/levels";
import { CHARACTER_STYLE, fitOf } from "@/lib/repertoire/character";
import { coverageBrief } from "@/lib/repertoire/sentences";
import { NO_PICK_LINE, pickLine } from "@/lib/repertoire/guide";
import { MastiAvatar } from "@/components/masti";
import OpeningDiagram from "@/components/learn/OpeningDiagram";
import { EASE, EMBER, FOCUS, GOLD, GOOD, MONO, ROSE } from "./tokens";

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
  /**
   * The move they measurably already play here, or null. A statement about
   * the past, so it is safe at ANY depth.
   */
  youPlay?: { san: string; games: number; share: number } | null;
  /** How hard their own play should push up the order. Null = never asked. */
  churn?: Churn | null;
}

export default function SlotChooser({
  slot,
  quiz,
  band,
  onPick,
  onClose,
  transposes,
  youPlay = null,
  churn = null,
}: SlotChooserProps) {
  const ranked = useMemo(
    () => rankChoices(slot.choices, quiz, band, { churn, youPlay: youPlay?.san ?? null }),
    [slot.choices, quiz, band, churn, youPlay]
  );
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

  // Masti's line: the first card and the one reason for it.
  const top = ranked[0];
  const line = top
    ? pickLine({
        name: top.name,
        coverage: top.coverage,
        recommended: fitOf(top, quiz, band).recommended,
        suits: fitOf(top, quiz, band).level === "suits",
        alreadyPlays: youPlay && youPlay.san === top.play ? youPlay.san : null,
      })
    : NO_PICK_LINE;

  return (
    <Box
      ref={panel}
      tabIndex={-1}
      role="group"
      aria-label="Choose what to play"
      sx={{
        mt: 1.5,
        borderRadius: "1.25rem",
        border: `1px solid ${GOLD.border}`,
        background: `radial-gradient(120% 55% at 50% 0%, ${GOLD.tint}, transparent 70%), linear-gradient(180deg, rgba(20,22,28,0.96) 0%, rgba(12,14,20,0.96) 100%)`,
        boxShadow: GOLD.glow,
        backdropFilter: "blur(12px)",
        p: { xs: 1.5, md: 2 },
        outline: "none",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.5 }}>
        <MastiAvatar mood={top ? "pointing" : "nervous"} size={40} />
        <Typography data-testid="chooser-line" sx={{ color: "#fff", fontWeight: 600, fontSize: "0.92rem", lineHeight: 1.35, flex: 1, minWidth: 0 }}>
          {line}
        </Typography>
        <Box
          component="button"
          onClick={onClose}
          aria-label="Close without choosing"
          sx={{
            display: "grid",
            placeItems: "center",
            width: 36,
            height: 36,
            flexShrink: 0,
            background: "none",
            border: "none",
            cursor: "pointer",
            borderRadius: "8px",
            color: "rgba(255,255,255,0.45)",
            "&:hover": { color: "#fff" },
            ...FOCUS,
          }}
        >
          <X size={16} aria-hidden />
        </Box>
      </Box>

      {transposes.length > 0 && <Transposes transposes={transposes} />}
      <Brief slot={slot} />

      {ranked.length > 0 && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1 }}>
          {ranked.map((choice, i) => (
            <ChoiceCard
              key={choice.id}
              choice={choice}
              slot={slot}
              index={i}
              band={band}
              quiz={quiz}
              youPlay={youPlay}
              onPick={() => onPick({ slotId: slot.id, choiceId: choice.id, label: choice.name })}
            />
          ))}
        </Box>
      )}

      <MoveList slot={slot} onPick={onPick} />
      <LibrarySearch slot={slot} onPick={onPick} />
    </Box>
  );
}

/**
 * "This flows back into something you already play." Stated as a floor,
 * because it is one: a Grünfeld covers about a quarter of 1.c4, and only when
 * White cooperates by playing d4.
 */
function Transposes({ transposes }: { transposes: SlotChooserProps["transposes"] }) {
  const best = transposes[0];
  return (
    <Typography
      sx={{
        mb: 1.5,
        px: 1.5,
        py: 1,
        borderRadius: "12px",
        border: "1px solid rgba(134,239,172,0.25)",
        background: "rgba(134,239,172,0.06)",
        color: GOOD,
        fontSize: "0.82rem",
        lineHeight: 1.5,
      }}
    >
      Your <strong>{best.name}</strong> already covers at least {pctOf(best.atLeast)} of this by transposition.
    </Typography>
  );
}

/**
 * What this position IS, for the slots no book names: the line people play
 * from here, what it becomes, and how it scores. Counted, not recommended,
 * and it says so.
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
    <Box
      sx={{
        mb: 1.5,
        px: 1.5,
        py: 1.25,
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.02)",
        display: "grid",
        gap: 0.5,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <Shapes size={13} color="rgba(255,255,255,0.4)" aria-hidden />
        <Typography sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.68rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          What this becomes
        </Typography>
        {structure && (
          <Typography component="span" sx={{ fontSize: "0.72rem", color: GOLD.bright, ml: "auto" }}>
            {structure.name}
          </Typography>
        )}
      </Box>
      <Typography sx={{ fontFamily: MONO, fontSize: "0.8rem", color: "rgba(255,255,255,0.8)" }}>
        {numberedLine([...slot.line, ...brief.mainline], slot.line.length)}
      </Typography>
      <Typography sx={{ fontSize: "0.76rem", color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
        {brief.score !== null && (
          <>White scores {Math.round(brief.score * 100)}% across {brief.games.toLocaleString()} games. </>
        )}
        Most played, not best.
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
  youPlay,
  onPick,
}: {
  choice: RepertoireChoice;
  slot: RepertoireSlot;
  index: number;
  band: Band;
  quiz: QuizAnswers | null;
  youPlay: SlotChooserProps["youPlay"];
  onPick: () => void;
}) {
  const reduce = useReducedMotion();
  const branches = choice.gaps.length;
  const heavyForBand = !withinCeiling(choice, band);
  const style = CHARACTER_STYLE[choice.character];
  const fitted = fitOf(choice, quiz, band);
  // Compared on the move, not the name: they play "c6", not "the Caro-Kann".
  const already = Boolean(youPlay && youPlay.san === choice.play);
  return (
    <Box
      component={motion.button}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={reduce ? undefined : { y: -2 }}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.04, 0.2), ease: EASE }}
      onClick={onPick}
      // The prose that used to be on the card, for whoever wants it.
      title={`${choice.blurb} ${choice.why}`.trim()}
      sx={{
        textAlign: "left",
        width: "100%",
        cursor: "pointer",
        position: "relative",
        display: "flex",
        alignItems: "flex-start",
        gap: 1.25,
        p: 1.25,
        pl: 1.5,
        borderRadius: "14px",
        // The BOX carries the character: the hue is read before any word is.
        // The saturated hue lives only on the 3px edge, which is the one
        // element small enough to take it.
        borderTop: `1px solid ${style.colour}33`,
        borderRight: `1px solid ${style.colour}33`,
        borderBottom: `1px solid ${style.colour}33`,
        borderLeft: `3px solid ${style.colour}`,
        background: `linear-gradient(105deg, ${style.colour}14 0%, ${style.colour}08 42%, rgba(255,255,255,0.03) 78%)`,
        color: "inherit",
        transition: "border-color 180ms ease, background 180ms ease, box-shadow 180ms ease",
        "&:hover": {
          borderTopColor: `${style.colour}66`,
          borderRightColor: `${style.colour}66`,
          borderBottomColor: `${style.colour}66`,
          background: `linear-gradient(105deg, ${style.colour}26 0%, ${style.colour}12 42%, rgba(255,255,255,0.05) 78%)`,
          boxShadow: `0 14px 34px -24px ${style.colour}`,
        },
        // Focus stays EMBER: a ring that changed colour per card would read
        // as part of the content.
        ...FOCUS,
      }}
    >
      {/* A name is not a picture. The position it produces is. */}
      <OpeningDiagram moves={choice.diagram} side={slot.side} px={72} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", mb: 0.35 }}>
          <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.2 }}>
            {choice.name}
          </Typography>
          <Typography sx={{ fontFamily: MONO, fontSize: "0.78rem", color: EMBER }}>
            {choice.play}
          </Typography>
          {/* The list is ranked, so the first card is the pick. Said on the
              card as well as in Masti's line, for somebody scanning. */}
          {index === 0 && (
            <Tag colour={GOLD.bright} filled>
              Masti&apos;s pick
            </Tag>
          )}
        </Box>
        <Typography sx={{ color: "rgba(255,255,255,0.7)", fontSize: "0.8rem", lineHeight: 1.45, mb: 0.75 }}>
          {coverageBrief(choice, slot)}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.6, flexWrap: "wrap" }}>
          {/* What kind of game it gives you, in its colour; filled with a tick
              when it is the kind they asked for. */}
          <Tag colour={style.colour} filled={fitted.style === "match"}>
            {style.label}
          </Tag>
          <Tag tone={heavyForBand ? "warn" : undefined}>{LOAD_WORDS[choice.load] ?? choice.load}</Tag>
          {/* Their own play outranks every judgement: it is measured. It names
              the MOVE, because four Sicilians commit to the same 1...c5. */}
          {already && youPlay && (
            <Tag tone="good">
              you already play {youPlay.san} · {Math.round(youPlay.share * 100)}%
            </Tag>
          )}
          {fitted.recommended ? (
            <Tag tone="good">heavily recommended</Tag>
          ) : fitted.level === "stretch" ? (
            <Tag tone="warn">a long way above your level</Tag>
          ) : (
            <>
              {fitted.level === "suits" && <Tag tone="good">suits your level</Tag>}
              {/* Only for a choice that agrees with them on NEITHER axis. */}
              {fitted.style === "poor" && <Tag>doesn&apos;t fit your playstyle</Tag>}
            </>
          )}
          {choice.coverage === "system" ? (
            <Tag tone="good">one setup, no branches</Tag>
          ) : choice.coverage === "move" ? (
            <Tag tone="warn">{branches} more decisions</Tag>
          ) : (
            branches > 0 && <Tag tone="warn">{branches} to fill in</Tag>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/** What people actually play here, measured. Always available, never curated. */
function MoveList({ slot, onPick }: { slot: RepertoireSlot; onPick: (p: RepertoirePick) => void }) {
  if (slot.moves.length === 0) return null;
  return (
    <Box sx={{ mt: 2 }}>
      <Heading>What people play here</Heading>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
        {slot.moves.map((move) => (
          <Box
            key={move.san}
            component="button"
            onClick={() => onPick({ slotId: slot.id, san: move.san, label: move.name ?? move.san })}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.75,
              minHeight: 40,
              px: 1.5,
              borderRadius: "10px",
              cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.02)",
              color: "inherit",
              transition: "border-color 180ms ease",
              "&:hover": { borderColor: "rgba(249,115,22,0.5)" },
              ...FOCUS,
            }}
          >
            <Typography sx={{ fontFamily: MONO, fontSize: "0.82rem", color: "#fff" }}>{move.san}</Typography>
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
 * The full library, filtered to lines reachable from this slot. Searching
 * "London" from 1.d4 Nf6 2.Bf4 should not offer the London's lines against
 * 1...d5: real openings, unreachable from where the player is standing.
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
    <Box sx={{ mt: 2 }}>
      <Heading>Or pick your own</Heading>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.12)",
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
            flex: 1,
            minHeight: 44,
            background: "none",
            border: "none",
            outline: "none",
            color: "#fff",
            fontSize: "0.9rem",
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
                textAlign: "left",
                width: "100%",
                cursor: "pointer",
                minHeight: 44,
                px: 1.25,
                py: 0.75,
                borderRadius: "10px",
                background: "none",
                border: "1px solid transparent",
                color: "inherit",
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
              {more} more. Keep typing.
            </Typography>
          )}
        </Box>
      )}

      {query.trim().length >= 2 && results.length === 0 && state === "idle" && (
        <Typography sx={{ mt: 1, fontSize: "0.8rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.55 }}>
          Nothing named that is reachable from {slot.line.length ? numberedLine(slot.line) : "the start"}.
        </Typography>
      )}
    </Box>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
      <BookOpen size={13} color={GOLD.base} aria-hidden />
      <Typography sx={{ color: GOLD.bright, fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
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
  // Warn is rose, not ember: a cost warning is a hazard note, not an action.
  const colour = explicit ?? (tone === "good" ? GOOD : tone === "warn" ? ROSE.bright : "rgba(255,255,255,0.5)");
  const hex = colour.startsWith("#");
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.4,
        px: 0.9,
        py: 0.25,
        borderRadius: "999px",
        border: `1px solid ${hex ? `${colour}${filled ? "88" : "33"}` : "rgba(255,255,255,0.16)"}`,
        background: hex ? `${colour}${filled ? "24" : "0F"}` : "rgba(255,255,255,0.04)",
      }}
    >
      {(tone === "good" || filled) && <Check size={11} color={colour} aria-hidden />}
      <Typography sx={{ fontSize: "0.7rem", color: colour, fontWeight: filled ? 600 : 400, whiteSpace: "nowrap" }}>
        {children}
      </Typography>
    </Box>
  );
}
