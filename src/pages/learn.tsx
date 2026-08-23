"use client";

// /learn — your repertoire.
//
// Two sections, White and Black, and inside each one a slot for every decision
// a complete repertoire has to make. First visit asks two questions and uses
// them to rank the suggestions; after that it goes straight to the bracket.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE IDEA THIS PAGE IS BUILT ON
//
// Everyone else shows you a repertoire somebody else chose, as a finished
// object. The interesting thing is not the lines, it is the SHAPE: which
// decisions a repertoire actually contains, and which ones a given choice
// leaves you still owing.
//
// Choosing the Grünfeld answers 1.d4 and nothing else. After 1...Nf6 White can
// play 2.Bf4, 2.Bg5 or 2.Nc3, and there is no Grünfeld theory for any of them —
// they are 17% of what a Grünfeld player faces and they are three more
// decisions. Those slots appear the moment the Grünfeld is chosen, weighted by
// how often they really occur.
//
// Every number on this page is derived, not asserted: shares come off 3.4M
// games, coverage is set membership over real move sequences compared by
// position so transpositions resolve for free, and "this transposes into what
// you already play" is a bounded search stated as a floor. The derivation is
// scripts/openings/build-repertoire-map.mjs; nothing here decides any chess.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { Box, Typography } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight, Pencil, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { resolveUserRating } from "@/lib/coach/userRating";
import { bandFor, sufficiency, verdict, type Band } from "@/lib/repertoire/levels";
import SlotChooser from "@/components/learn/SlotChooser";
import {
  buildBracket,
  coverage,
  numberedLine,
  share as pctOf,
  slotTitle,
  transposesInto,
  type BracketNode,
} from "@/lib/repertoire/bracket";
import {
  EMPTY,
  clearBelow,
  loadBracket,
  saveBracket,
  setPick,
  type BracketState,
  type QuizAnswers,
} from "@/lib/repertoire/store";
import type { Character, RepertoireMap, RepertoirePick, TheoryLoad } from "@/types/repertoire";

const EMBER = "#FB923C";
const GOOD = "#86EFAC";
const MONO = '"SF Mono", ui-monospace, Menlo, monospace';

export default function LearnPage() {
  const { profile } = useAuth();
  const account = profile?.handle ?? profile?.chesscomUsername ?? profile?.lichessUsername ?? "guest";

  // Measured, not asked. We already know their rating, and asking somebody
  // their level is both a question we can answer ourselves and a question
  // people answer badly about themselves.
  const rating = resolveUserRating(profile);
  const band = useMemo(() => bandFor(rating), [rating]);

  const [map, setMap] = useState<RepertoireMap | null>(null);
  const [mapState, setMapState] = useState<"loading" | "ready" | "failed">("loading");
  const [state, setState] = useState<BracketState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [side, setSide] = useState<"white" | "black">("white");
  const [openSlot, setOpenSlot] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/repertoire")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: RepertoireMap) => {
        if (cancelled) return;
        setMap(data);
        setMapState("ready");
      })
      .catch(() => !cancelled && setMapState("failed"));
    return () => {
      cancelled = true;
    };
  }, []);

  // Read in an effect, never during render: this is localStorage, and a server
  // render that guessed would hydrate into a different bracket.
  useEffect(() => {
    setState(loadBracket(account));
    setHydrated(true);
  }, [account]);

  const persist = useCallback(
    (next: BracketState) => {
      setState(next);
      saveBracket(account, { ...next, updatedAt: Date.now() });
    },
    [account]
  );

  const picks = side === "white" ? state.white : state.black;

  const childrenOf = useCallback(
    (slotId: string, choiceId?: string) => {
      const slot = map?.slots.find((s) => s.id === slotId);
      const choice = slot?.choices.find((c) => c.id === choiceId);
      return (choice?.gaps ?? []).map((g) => g.slot);
    },
    [map]
  );

  const choose = useCallback(
    (pick: RepertoirePick) => {
      // Changing a slot clears everything it had opened. Otherwise switching
      // from the Grünfeld to the Nimzo leaves an anti-Trompowsky answer sitting
      // in a slot the new choice never creates, still counting toward coverage.
      const cleared = clearBelow(picks, pick.slotId, childrenOf);
      const next = setPick(cleared, pick.slotId, pick);
      persist(side === "white" ? { ...state, white: next } : { ...state, black: next });
      setOpenSlot(null);
    },
    [picks, childrenOf, persist, side, state]
  );

  // How deep the bracket goes is a level question. Three layers of nested
  // branches in front of a 700 is a wall, and every one of those branches is a
  // line they will meet a handful of times a year.
  const maxDepth = band.id === "new" ? 1 : band.id === "beginner" ? 2 : 3;
  const bracket = useMemo(
    () => (map ? buildBracket(map, side, picks, maxDepth) : []),
    [map, side, picks, maxDepth]
  );
  const cover = useMemo(
    () => (map ? coverage(map, side, picks) : null),
    [map, side, picks]
  );

  if (mapState === "failed") {
    return (
      <Shell>
        <Empty
          title="The opening map is not loading"
          body="Nothing is lost — anything you have already chosen is saved on this device. Try again in a moment."
        />
      </Shell>
    );
  }
  if (!map || !hydrated) {
    return (
      <Shell>
        <Empty title="Reading the opening map" body="Three and a half million games' worth." />
      </Shell>
    );
  }

  if (!state.quiz) {
    return (
      <Shell>
        <Quiz onDone={(quiz) => persist({ ...state, quiz })} />
      </Shell>
    );
  }

  return (
    <Shell>
      <Box sx={{ maxWidth: 860, mx: "auto", px: { xs: 2, md: 3 }, py: { xs: 3, md: 5 } }}>
        <Typography component="h1" sx={{ color: "#fff", fontSize: { xs: "1.6rem", md: "2rem" }, fontWeight: 800, letterSpacing: "-0.02em", mb: 0.75 }}>
          Your repertoire
        </Typography>
        <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.95rem", lineHeight: 1.65, mb: 3, maxWidth: 620 }}>
          One slot for every decision a complete repertoire has to make, sized by how often you will
          actually meet it and pitched at the level you are actually at. Fill one and the branches it
          leaves open appear underneath.
        </Typography>

        <SideToggle side={side} onChange={(s) => { setSide(s); setOpenSlot(null); }} />

        {cover && <CoverageBar coverage={cover} side={side} meta={map.meta} band={band} rating={rating} />}

        <Box sx={{ display: "grid", gap: 1.5, mt: 3 }}>
          {bracket.map((node) => (
            <SlotBranch
              key={node.slot.id}
              node={node}
              map={map}
              picks={picks}
              quiz={state.quiz}
              band={band}
              openSlot={openSlot}
              onOpen={setOpenSlot}
              onPick={choose}
            />
          ))}
        </Box>

        <Typography sx={{ mt: 4, fontSize: "0.76rem", color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
          Frequencies from {map.meta.games.toLocaleString()} games ({map.meta.source}). Coverage is
          computed from {map.meta.openings.toLocaleString()} named openings by comparing positions,
          so a line that transposes into yours counts as yours.
        </Typography>
      </Box>
    </Shell>
  );
}

/** One slot and, once it is filled, everything it opened up. */
function SlotBranch({
  node,
  map,
  picks,
  quiz,
  band,
  openSlot,
  onOpen,
  onPick,
}: {
  node: BracketNode;
  map: RepertoireMap;
  picks: RepertoirePick[];
  quiz: QuizAnswers | null;
  band: Band;
  openSlot: string | null;
  onOpen: (id: string | null) => void;
  onPick: (pick: RepertoirePick) => void;
}) {
  const open = openSlot === node.slot.id;
  const filled = Boolean(node.pick);
  return (
    <Box sx={{ pl: node.depth > 0 ? { xs: 1.5, md: 3 } : 0 }}>
      <Box
        component="button"
        onClick={() => onOpen(open ? null : node.slot.id)}
        aria-expanded={open}
        sx={{
          width: "100%", textAlign: "left", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 1.5,
          minHeight: 56, px: { xs: 1.75, md: 2.25 }, py: 1.5,
          borderRadius: "1.25rem",
          border: `1px solid ${filled ? "rgba(134,239,172,0.28)" : "rgba(255,255,255,0.1)"}`,
          background: filled
            ? "linear-gradient(180deg, rgba(20,30,24,0.75) 0%, rgba(12,14,20,0.75) 100%)"
            : "linear-gradient(180deg, rgba(20,22,28,0.8) 0%, rgba(12,14,20,0.8) 100%)",
          backdropFilter: "blur(12px)",
          transition: "border-color 180ms ease, background 180ms ease",
          "&:hover": { borderColor: filled ? GOOD : "rgba(249,115,22,0.5)" },
          "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
        }}
      >
        {/* Shape as well as colour: an unfilled slot is an outline and a filled
            one is solid, so the two states survive a reader who cannot separate
            ember from green. */}
        <Box
          sx={{
            width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
            background: filled ? GOOD : "transparent",
            border: filled ? "none" : "1.5px solid rgba(255,255,255,0.3)",
          }}
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ color: "#fff", fontWeight: 600, fontSize: { xs: "0.92rem", md: "0.98rem" } }}>
            {slotTitle(node.slot)}
          </Typography>
          <Typography sx={{ fontSize: "0.78rem", color: filled ? GOOD : "rgba(255,255,255,0.45)", mt: 0.25 }}>
            {node.pick ? node.pick.label : `${pctOf(node.reach)} of your games · nothing chosen`}
          </Typography>
        </Box>
        {node.slot.line.length > 0 && (
          <Typography sx={{ display: { xs: "none", sm: "block" }, fontFamily: MONO, fontSize: "0.75rem", color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>
            {numberedLine(node.slot.line)}
          </Typography>
        )}
        {filled ? (
          <Pencil size={14} color="rgba(255,255,255,0.35)" aria-hidden />
        ) : (
          <ChevronRight size={16} color={EMBER} aria-hidden />
        )}
      </Box>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: "hidden" }}
          >
            <SlotChooser
              slot={node.slot}
              quiz={quiz}
              band={band}
              transposes={transposesInto(map, node.slot.id, picks)}
              onPick={onPick}
              onClose={() => onOpen(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {node.children.length > 0 && (
        <Box sx={{ mt: 1.5, display: "grid", gap: 1.25, borderLeft: "1px solid rgba(255,255,255,0.08)", ml: { xs: 1, md: 1.5 } }}>
          {node.children.map((child) => (
            <SlotBranch
              key={child.slot.id}
              node={child}
              map={map}
              picks={picks}
              quiz={quiz}
              band={band}
              openSlot={openSlot}
              onOpen={onOpen}
              onPick={onPick}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

/**
 * The one number a player will repeat to themselves.
 *
 * Said in games rather than in slots, because "6 of 9 slots" flatters a
 * repertoire that has answered the rare half. A slot nobody has filled counts
 * as fully open.
 */
function CoverageBar({
  coverage: cover,
  side,
  meta,
  band,
  rating,
}: {
  coverage: NonNullable<ReturnType<typeof coverage>>;
  side: "white" | "black";
  meta: RepertoireMap["meta"];
  band: Band;
  rating: number | undefined;
}) {
  const done = Math.round(cover.answered * 100);
  const biggest = cover.open[0];
  const state = sufficiency(cover.answered, band);
  return (
    <Box sx={{ mt: 2.5, p: { xs: 2, md: 2.5 }, borderRadius: "1.5rem", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap", mb: 1.25 }}>
        <Typography sx={{ color: "#fff", fontSize: "1.5rem", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
          {done}%
        </Typography>
        <Typography sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.9rem" }}>
          of what you will face as {side === "white" ? "White" : "Black"} has an answer
        </Typography>
      </Box>
      <Box
        role="img"
        aria-label={`${done} percent answered`}
        sx={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}
      >
        <Box
          sx={{
            width: `${done}%`, height: "100%", borderRadius: 999,
            background: `linear-gradient(90deg, ${EMBER} 0%, ${GOOD} 100%)`,
            transition: "width 220ms cubic-bezier(0.16,1,0.3,1)",
            "@media (prefers-reduced-motion: reduce)": { transition: "none" },
          }}
        />
      </Box>
      {/* The sentence this whole feature exists to be able to say. Telling
          somebody their opening work is finished is worth more to them than
          another course, and nothing else in this space will ever say it. */}
      <Box
        sx={{
          mt: 1.5, p: 1.5, borderRadius: "12px",
          display: "flex", alignItems: "flex-start", gap: 1,
          border: `1px solid ${state.enough ? "rgba(134,239,172,0.28)" : "rgba(255,255,255,0.09)"}`,
          background: state.enough ? "rgba(134,239,172,0.06)" : "rgba(255,255,255,0.02)",
        }}
      >
        {state.enough && <Check size={15} color={GOOD} aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />}
        <Box>
          <Typography sx={{ color: state.enough ? GOOD : "#fff", fontSize: "0.86rem", lineHeight: 1.55 }}>
            {verdict(cover.answered, band)}
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.78rem", lineHeight: 1.55, mt: 0.5 }}>
            {rating ? `Rated ${rating}, ` : "Unrated, so "}
            {rating ? `so we are treating you as ${band.name.toLowerCase()}` : `treating you as ${band.name.toLowerCase()}`}
            . {band.advice}
          </Typography>
        </Box>
      </Box>

      <Typography sx={{ mt: 1.25, fontSize: "0.82rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
        {biggest ? (
          <>
            The biggest thing you have no answer for is{" "}
            <Box component="span" sx={{ color: "#fff" }}>{slotTitle(biggest.slot).replace(/^Against /, "")}</Box>
            , at {pctOf(biggest.reach)} of your games.
          </>
        ) : (
          <>Every branch we can measure has an answer. Nothing left to decide at this level.</>
        )}
        {side === "black" && meta.otherFirstMoves > 0.01 && (
          <> A further {pctOf(meta.otherFirstMoves)} is first moves too rare to plan for.</>
        )}
      </Typography>
    </Box>
  );
}

function SideToggle({ side, onChange }: { side: "white" | "black"; onChange: (s: "white" | "black") => void }) {
  return (
    <Box role="tablist" aria-label="Repertoire colour" sx={{ display: "inline-flex", gap: 0.5, p: 0.5, borderRadius: "999px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.25)" }}>
      {(["white", "black"] as const).map((option) => (
        <Box
          key={option}
          component="button"
          role="tab"
          aria-selected={side === option}
          onClick={() => onChange(option)}
          sx={{
            minHeight: 40, px: 2.25, borderRadius: "999px", cursor: "pointer", border: "none",
            background: side === option ? "rgba(249,115,22,0.16)" : "transparent",
            color: side === option ? EMBER : "rgba(255,255,255,0.55)",
            fontSize: "0.85rem", fontWeight: 600,
            transition: "background 180ms ease, color 180ms ease",
            "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
          }}
        >
          As {option === "white" ? "White" : "Black"}
        </Box>
      ))}
    </Box>
  );
}

// ── The quiz ─────────────────────────────────────────────────────────────────

const LOADS: Array<{ value: TheoryLoad; title: string; body: string }> = [
  { value: "light", title: "As little as possible", body: "Give me setups I can play against almost anything, and I will learn the ideas instead of the moves." },
  { value: "medium", title: "A fair amount", body: "I will learn real lines, but I want them to repeat rather than branch forever." },
  { value: "heavy", title: "Whatever it takes", body: "I want the critical stuff, and I accept that means memorising." },
];

const CHARACTERS: Array<{ value: Character; title: string; body: string }> = [
  { value: "attack", title: "I want to attack", body: "Sharp positions, open lines, and a king to go after." },
  { value: "solid", title: "I want to be hard to beat", body: "Sound structures, few weaknesses, and no early disasters." },
  { value: "counterattack", title: "I want to punish mistakes", body: "Let them overextend, then hit back. Unbalanced from early on." },
  { value: "structure", title: "I want to outplay them slowly", body: "Small edges, good pawns, and a long squeeze." },
];

/**
 * Two questions.
 *
 * Not a personality test. They exist to rank the suggestions, and a longer quiz
 * would buy a better ranking at the cost of the thing it is ranking for. Both
 * are skippable, because a player who already knows what they play should not
 * have to answer questions to be allowed to say so.
 */
function Quiz({ onDone }: { onDone: (quiz: QuizAnswers) => void }) {
  const [load, setLoad] = useState<TheoryLoad | null>(null);
  const step = load === null ? 0 : 1;

  return (
    <Box sx={{ maxWidth: 640, mx: "auto", px: { xs: 2, md: 3 }, py: { xs: 4, md: 7 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <Sparkles size={15} color={EMBER} aria-hidden />
        <Typography sx={{ color: EMBER, fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
          Two questions · step {step + 1} of 2
        </Typography>
      </Box>
      <Typography component="h1" sx={{ color: "#fff", fontSize: { xs: "1.5rem", md: "1.9rem" }, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.25, mb: 1 }}>
        {step === 0 ? "How much theory do you actually want to learn?" : "And what kind of game do you want out of it?"}
      </Typography>
      <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.92rem", lineHeight: 1.65, mb: 3 }}>
        {step === 0
          ? "There is no right answer. A system opening and a main line are both complete repertoires; they cost different things."
          : "We use this to order the suggestions, not to hide any of them. You will still see everything."}
      </Typography>

      <Box sx={{ display: "grid", gap: 1 }}>
        {step === 0
          ? LOADS.map((option, i) => (
              <QuizOption key={option.value} index={i} title={option.title} body={option.body} onClick={() => setLoad(option.value)} />
            ))
          : CHARACTERS.map((option, i) => (
              <QuizOption key={option.value} index={i} title={option.title} body={option.body} onClick={() => onDone({ load: load!, character: option.value })} />
            ))}
      </Box>

      <Box
        component="button"
        onClick={() => onDone({ load: "medium", character: "solid" })}
        sx={{
          mt: 2.5, minHeight: 44, px: 1, background: "none", border: "none", cursor: "pointer",
          color: "rgba(255,255,255,0.4)", fontSize: "0.82rem", borderRadius: "8px",
          "&:hover": { color: "rgba(255,255,255,0.75)" },
          "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
        }}
      >
        Skip — I know what I play
      </Box>
    </Box>
  );
}

function QuizOption({ title, body, index, onClick }: { title: string; body: string; index: number; onClick: () => void }) {
  return (
    <Box
      component={motion.button}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClick}
      sx={{
        textAlign: "left", width: "100%", cursor: "pointer",
        p: 2, borderRadius: "1.25rem",
        border: "1px solid rgba(255,255,255,0.1)",
        background: "linear-gradient(180deg, rgba(20,22,28,0.8) 0%, rgba(12,14,20,0.8) 100%)",
        backdropFilter: "blur(12px)",
        transition: "border-color 180ms ease, background 180ms ease",
        "&:hover": { borderColor: "rgba(249,115,22,0.55)", background: "rgba(249,115,22,0.06)" },
        "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
      }}
    >
      <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: "1rem", mb: 0.4 }}>{title}</Typography>
      <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.86rem", lineHeight: 1.55 }}>{body}</Typography>
    </Box>
  );
}

// ── Shell ────────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Head>
        <title key="title">Your repertoire — Chess Masti AI</title>
        <meta
          key="description"
          name="description"
          content="Build a complete opening repertoire: every decision it contains, weighted by how often you will actually face it."
        />
      </Head>
      {/* No GradientBackdrop and no NavPill here: /learn is not in Layout's
          SELF_CHROMED_ROUTES, so it already gets both. Mounting a second set
          double-stacks the gradient and ships two navigation pills. */}
      <Box sx={{ minHeight: "100dvh" }}>{children}</Box>
    </>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <Box sx={{ maxWidth: 520, mx: "auto", px: 3, py: 10 }}>
      <Typography sx={{ color: "#fff", fontSize: "1.1rem", fontWeight: 700, mb: 1 }}>{title}</Typography>
      <Typography sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.92rem", lineHeight: 1.65 }}>{body}</Typography>
    </Box>
  );
}
