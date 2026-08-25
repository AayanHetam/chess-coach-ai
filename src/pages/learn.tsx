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
import Link from "next/link";
import { BookOpen, Check, ChevronRight, Pencil, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { resolveUserRating } from "@/lib/coach/userRating";
import { bandFor, nextBand, sufficiency, verdict, type Band } from "@/lib/repertoire/levels";
import SlotChooser from "@/components/learn/SlotChooser";
import {
  buildBracket,
  coverage,
  focusedRoots,
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
import { facing } from "@/lib/repertoire/sentences";
import { CHARACTER_STYLE, rarity } from "@/lib/repertoire/character";
import { factsFor, mainMoveAt, measuredFor, type YourTree } from "@/lib/repertoire/yourTree";
import { archiveAccountFor, useYourTree } from "@/lib/repertoire/useYourTree";
import type {
  Character,
  RepertoireMap,
  RepertoirePick,
  RepertoireSlot,
  TheoryLoad,
} from "@/types/repertoire";

const EMBER = "#FB923C";
const GOOD = "#86EFAC";
const MONO = '"SF Mono", ui-monospace, Menlo, monospace';

/** Stable identity, so the tree hook is not handed a new array every render. */
const NO_SLOTS: RepertoireSlot[] = [];

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

  // Their own archive, read only when they ask for it. Never on page load: it
  // costs a fetch, and a browsing page that quietly spends somebody's
  // connection every time they open it is a page they stop opening.
  const archive = useMemo(() => archiveAccountFor(profile), [profile]);
  const mine = useYourTree({ account: archive, slots: map?.slots ?? NO_SLOTS });
  // Null unless we have enough of THIS colour to divide by. Everything
  // downstream — the bracket seed, the rows, the coverage sentence — reads this
  // one value, so there is no way for half the screen to be measured and the
  // other half to be the corpus.
  const measured = measuredFor(mine.tree, side) ? mine.tree : null;
  // The answers being re-taken, held OUTSIDE the bracket so the quiz can show
  // them as already-chosen. Clearing state.quiz is what opens the quiz screen;
  // this is what stops a re-take from feeling like starting over.
  const [editing, setEditing] = useState<QuizAnswers | null>(null);

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
  // One closure, handed to BOTH the displayed bracket and the coverage sum.
  // They each build their own tree, and giving it to only one of them is how
  // the summary came to say "1.e4, at 47% of games" directly above a row
  // reading "75% of your games".
  const rootReach = useCallback(
    (slot: RepertoireSlot) => (measured ? (factsFor(measured, slot.id).share ?? null) : null),
    [measured]
  );

  const bracket = useMemo(
    () => (map ? buildBracket(map, side, picks, maxDepth, rootReach) : []),
    [map, side, picks, maxDepth, rootReach]
  );

  // Breadth is a level question too, and a much better evidenced one than depth.
  // A beginner is asked for one White opening and two answers as Black — three
  // decisions in total — and the rarer roots are deferred rather than hidden.
  const [showAll, setShowAll] = useState(false);
  const focus = useMemo(
    () => (map ? focusedRoots(map, side, band.id) : { focus: [], deferred: [] }),
    [map, side, band.id]
  );
  // Every root for this colour, deferred ones included: the residual is what
  // their games did NOT land on, so holding some back from the sum would
  // silently move those into "too rare to plan for".
  const rootSlots = useMemo(
    () => (map ? [...focus.focus, ...focus.deferred] : []),
    [map, focus]
  );

  const visible = useMemo(() => {
    if (showAll || focus.deferred.length === 0) return bracket;
    const wanted = new Set(focus.focus.map(s => s.id));
    return bracket.filter(node => wanted.has(node.slot.id));
  }, [bracket, focus, showAll]);
  const cover = useMemo(
    () => (map ? coverage(map, side, picks, rootReach) : null),
    [map, side, picks, rootReach]
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
        <Quiz
          current={editing}
          onDone={(quiz) => {
            setEditing(null);
            persist({ ...state, quiz });
          }}
        />
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

        <YourGamesCard state={mine} account={archive} side={side} />

        <QuizSummary
          quiz={state.quiz}
          onEdit={() => {
            setEditing(state.quiz);
            setOpenSlot(null);
            persist({ ...state, quiz: null });
          }}
        />

        <SideToggle side={side} onChange={(s) => { setSide(s); setOpenSlot(null); }} />

        {cover && (
          <CoverageBar
            coverage={cover}
            side={side}
            meta={map.meta}
            band={band}
            rating={rating}
            tree={measured}
            roots={rootSlots}
          />
        )}

        <Box sx={{ display: "grid", gap: 1.5, mt: 3 }}>
          {visible.map((node) => (
            <SlotBranch
              key={node.slot.id}
              node={node}
              map={map}
              picks={picks}
              quiz={state.quiz}
              band={band}
              tree={measured}
              openSlot={openSlot}
              onOpen={setOpenSlot}
              onPick={choose}
            />
          ))}
        </Box>

        {focus.deferred.length > 0 && (
          <DeferredRoots
            slots={focus.deferred}
            showAll={showAll}
            band={band}
            onToggle={() => setShowAll((v) => !v)}
          />
        )}

        <Typography sx={{ mt: 4, fontSize: "0.76rem", color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
          Frequencies from {map.meta.games.toLocaleString()} games ({map.meta.source}) — how often
          players in that corpus meet each line, not yet how often you do. Coverage is computed from{" "}
          {map.meta.openings.toLocaleString()} named openings by comparing positions, so a line that
          transposes into yours counts as yours.
        </Typography>
      </Box>
    </Shell>
  );
}

/** The way into the course behind a choice they have already made. */
function StudyRow({ choiceId, label }: { choiceId: string; label: string }) {
  return (
    <Box
      component={Link}
      href={`/learn/${encodeURIComponent(choiceId)}`}
      sx={{
        mt: 1, ml: { xs: 1, md: 1.5 },
        display: "inline-flex", alignItems: "center", gap: 0.75,
        px: 1.5, py: 0.9, borderRadius: "999px",
        border: "1px solid rgba(249,115,22,0.35)",
        background: "rgba(249,115,22,0.08)",
        color: EMBER, fontSize: "0.8rem", fontWeight: 600, textDecoration: "none",
        transition: "background 180ms ease, border-color 180ms ease",
        "&:hover": { background: "rgba(249,115,22,0.16)", borderColor: "rgba(249,115,22,0.6)" },
        "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
      }}
    >
      <BookOpen size={14} aria-hidden /> The {label} course
    </Box>
  );
}

/**
 * The roots this band is not being asked for yet.
 *
 * Deferred, never hidden. A player who wants the whole map gets the whole map on
 * one click, and until they ask, the page shows three decisions instead of five
 * — which is the difference between a repertoire and a wall.
 */
function DeferredRoots({
  slots,
  showAll,
  band,
  onToggle,
}: {
  slots: RepertoireSlot[];
  showAll: boolean;
  band: Band;
  onToggle: () => void;
}) {
  const after = nextBand(band);
  const total = slots.reduce((sum, s) => sum + s.share, 0);
  return (
    <Box sx={{ mt: 2.5 }}>
      <Box
        component="button"
        onClick={onToggle}
        aria-expanded={showAll}
        sx={{
          appearance: "none",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: "0.9rem",
          px: 2,
          py: 1.5,
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          color: "inherit",
          transition: "background 180ms ease, border-color 180ms ease",
          "&:hover": { background: "rgba(255,255,255,0.055)", borderColor: "rgba(255,255,255,0.18)" },
          "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
        }}
      >
        <Typography sx={{ color: "rgba(255,255,255,0.82)", fontSize: "0.9rem", fontWeight: 600 }}>
          {showAll ? "Show fewer" : `${slots.length} more, when you are ready`}
        </Typography>
        <Typography sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.82rem", lineHeight: 1.6, mt: 0.4 }}>
          {showAll
            ? "These are real, they are just not what will win you points this month."
            : `${slots.map((s) => facing(s)).join(", ")} — ${pctOf(total)} of games${
                after ? `, and worth an answer around ${after.floor}` : ""
              }.`}
        </Typography>
      </Box>
    </Box>
  );
}

/** One slot and, once it is filled, everything it opened up. */
function SlotBranch({
  node,
  map,
  picks,
  quiz,
  band,
  tree,
  openSlot,
  onOpen,
  onPick,
}: {
  node: BracketNode;
  map: RepertoireMap;
  /** Their measured archive, or null when we have not measured this colour. */
  tree: YourTree | null;
  picks: RepertoirePick[];
  quiz: QuizAnswers | null;
  band: Band;
  openSlot: string | null;
  onOpen: (id: string | null) => void;
  onPick: (pick: RepertoirePick) => void;
}) {
  const open = openSlot === node.slot.id;
  const filled = Boolean(node.pick);
  // A measured share answers "how often did you MEET this", which is only the
  // same question as "how often will you meet it" at depth 0 — where what
  // arrives is decided by the opponent, not by a choice the player may not have
  // made yet. Behind a pick they have only just made, their archive honestly
  // reports zero, and zero is the wrong answer to the question the row is
  // asking. So the substitution stops at the roots, which is also exactly where
  // the corpus is most wrong about a beginner.
  const measured = node.depth === 0 && tree ? factsFor(tree, node.slot.id) : null;
  const reach = measured?.share ?? node.reach;
  const rare = rarity(reach);
  const yourMove = mainMoveAt(tree, node.slot.id);
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
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", mt: 0.25 }}>
            <Typography sx={{ fontSize: "0.78rem", color: filled ? GOOD : "rgba(255,255,255,0.45)" }}>
              {/* "of games", not "of your games". The share is measured on the
                  master corpus, not on this player's archive — see the note at
                  the foot of the page. Saying "yours" of somebody else's games
                  is the one claim on this screen nothing could back. */}
              {node.pick
                ? node.pick.label
                : `${pctOf(reach)} of ${measured ? "your games" : "games"} · nothing chosen`}
            </Typography>
            {/* A percentage flattens everything: 4% and 30% are both "a
                percentage" and scan as the same size of thing. A count of games
                does not, so rare slots say how rare in games. */}
            {!filled && rare && (
              <Typography
                component="span"
                sx={{
                  fontSize: "0.68rem", color: "rgba(255,255,255,0.4)",
                  border: "1px solid rgba(255,255,255,0.14)", borderRadius: "999px",
                  px: 0.75, py: 0.1, whiteSpace: "nowrap",
                }}
              >
                {rare}
              </Typography>
            )}
          </Box>
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
              youPlay={yourMove}
              transposes={transposesInto(map, node.slot.id, picks)}
              onPick={onPick}
              onClose={() => onOpen(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* A filled slot that maps to a curated opening has a course behind it.
          Without this the 43 courses are data nothing links to. */}
      {node.pick?.choiceId && <StudyRow choiceId={node.pick.choiceId} label={node.pick.label} />}

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
              tree={tree}
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
  tree,
  roots,
}: {
  coverage: NonNullable<ReturnType<typeof coverage>>;
  side: "white" | "black";
  meta: RepertoireMap["meta"];
  band: Band;
  rating: number | undefined;
  /** Their measured archive for this colour, or null. */
  tree: YourTree | null;
  roots: RepertoireSlot[];
}) {
  const done = Math.round(cover.answered * 100);
  const biggest = cover.open[0];
  // "A further N% is first moves too rare to plan for."
  //
  // `meta.otherFirstMoves` is the corpus residual, and once the roots above are
  // measured it belongs to a different population than everything around it.
  // Measured, the residual is simply what their own root shares do not account
  // for — the first moves they met that this map has no slot for.
  const residual = tree
    ? Math.max(0, 1 - roots.reduce((sum, s) => sum + (factsFor(tree, s.id).share ?? 0), 0))
    : meta.otherFirstMoves;
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
            , at {pctOf(biggest.reach)} of {tree ? "your games" : "games"}.
          </>
        ) : (
          <>Every branch we can measure has an answer. Nothing left to decide at this level.</>
        )}
        {side === "black" && residual > 0.01 && (
          <> A further {pctOf(residual)} is first moves too rare to plan for.</>
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

/**
 * "These numbers are not yours yet."
 *
 * The page has always said "% of your games" next to every slot, and the number
 * came from 3.4M games by players rated 2300+. At 900 that is close to inverted
 * — the London is 1.5% of the Elite corpus and it is everywhere below 1500 —
 * and the label claimed it was personal. This is the button that makes the
 * claim true, and until it is pressed the page says whose games those are.
 *
 * Opt-in, never automatic. Reading twelve months of somebody's archive because
 * they opened a page is not a thing to do to them without asking.
 */
function YourGamesCard({
  state,
  account,
  side,
}: {
  state: ReturnType<typeof useYourTree>;
  account: ReturnType<typeof archiveAccountFor>;
  side: "white" | "black";
}) {
  const enough = measuredFor(state.tree, side);
  const counted = state.tree?.games[side] ?? 0;

  // No handle stored is not an error and must not be dressed as one. It is the
  // ordinary state for somebody who signed up over the board.
  if (!account) {
    return (
      <Note>
        Add your Lichess or Chess.com username on{" "}
        <Box component={Link} href="/profile" sx={{ color: EMBER, textDecoration: "underline" }}>
          your profile
        </Box>{" "}
        and these frequencies become yours instead of the corpus average.
      </Note>
    );
  }

  if (state.phase === "loading") {
    return <Note>Reading your last 12 months on {account.platform}…</Note>;
  }

  if (state.phase === "error") {
    return (
      <Note tone="warn">
        {state.error} <Retry onClick={state.run}>Try again</Retry>
      </Note>
    );
  }

  if (state.phase === "ready" && enough) {
    return (
      <Note tone="good">
        Measured from {counted.toLocaleString()} of your own games as{" "}
        {side === "white" ? "White" : "Black"}. <Retry onClick={state.run}>Refresh</Retry>
      </Note>
    );
  }

  // Ready, but this colour is too thin to divide by. Say which, rather than
  // silently falling back to the corpus and letting the reader assume the
  // numbers changed for them.
  if (state.phase === "ready") {
    return (
      <Note>
        Only {counted.toLocaleString()} of your games as {side === "white" ? "White" : "Black"} —
        too few to work out your own frequencies, so these are still the corpus average.{" "}
        <Retry onClick={state.run}>Refresh</Retry>
      </Note>
    );
  }

  return (
    <Note>
      These frequencies come from games by players rated 2300+, and yours will be different.{" "}
      <Retry onClick={state.run}>Use my last 12 months</Retry>
    </Note>
  );
}

function Note({ children, tone }: { children: React.ReactNode; tone?: "good" | "warn" }) {
  const colour = tone === "good" ? GOOD : tone === "warn" ? EMBER : "rgba(255,255,255,0.5)";
  return (
    <Typography
      sx={{
        mb: 2, fontSize: "0.8rem", lineHeight: 1.6, color: colour,
        display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap",
      }}
    >
      {tone === "good" && <Check size={13} aria-hidden />}
      <span>{children}</span>
    </Typography>
  );
}

function Retry({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: "inline-flex", alignItems: "center", minHeight: 44, px: 1, ml: -1,
        appearance: "none", background: "none", border: "none", cursor: "pointer",
        color: EMBER, fontSize: "0.8rem", fontWeight: 600,
        textDecoration: "underline", textUnderlineOffset: 3, borderRadius: "8px",
        "&:hover": { color: "#fff" },
        "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
      }}
    >
      {children}
    </Box>
  );
}

/**
 * What we think they asked for, and a way to say otherwise.
 *
 * The quiz is answered once and then silently drives the order of every list on
 * the page for as long as the account exists. An invisible input with that much
 * reach is not a feature, it is a bug waiting to be reported as "the
 * suggestions are wrong" — so the answers are on screen, in the colour they
 * carry everywhere else, one tap from being changed.
 *
 * Editing preserves every pick. Only the ordering changes.
 */
function QuizSummary({ quiz, onEdit }: { quiz: QuizAnswers; onEdit: () => void }) {
  const style = CHARACTER_STYLE[quiz.character];
  return (
    // ONE control, not a sentence with a link on the end. At 375px the
    // separate "Change" button wrapped onto its own line and sat there
    // orphaned under a 44px gap, which read as a layout bug — and a 44px
    // target is not negotiable, so the fix is to make the whole row the
    // target rather than to shrink it.
    <Box
      component="button"
      onClick={onEdit}
      aria-label={`Ordered for ${style.label} openings and ${LOAD_SUMMARY[quiz.load]}. Change these answers.`}
      sx={{
        display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap",
        width: "100%", textAlign: "left", mb: 2.5,
        minHeight: 44, px: 1.25, py: 0.75, ml: -1.25,
        appearance: "none", background: "none", cursor: "pointer",
        border: "1px solid transparent", borderRadius: "999px",
        transition: "background 180ms ease, border-color 180ms ease",
        "&:hover": { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)" },
        "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
      }}
    >
      <Typography component="span" sx={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)" }}>
        Ordered for
      </Typography>
      <Box
        component="span"
        sx={{
          display: "inline-flex", alignItems: "center", gap: 0.6,
          px: 1, py: 0.3, borderRadius: "999px",
          border: `1px solid ${style.colour}33`, background: `${style.colour}0F`,
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
        sx={{
          fontSize: "0.78rem", color: "rgba(255,255,255,0.45)",
          textDecoration: "underline", textUnderlineOffset: 3,
        }}
      >
        Change
      </Typography>
    </Box>
  );
}

const LOAD_SUMMARY: Record<TheoryLoad, string> = {
  light: "as little theory as possible",
  medium: "a fair amount of theory",
  heavy: "whatever it takes",
};

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
function Quiz({
  onDone,
  current,
}: {
  onDone: (quiz: QuizAnswers) => void;
  /** Their existing answers when this is a re-take, null on a first visit. */
  current: QuizAnswers | null;
}) {
  // Always starts at step 0, even on a re-take. Seeding `load` from `current`
  // would jump straight to step 2 and make the first answer unreachable —
  // "change my answers" that will only let you change one of them.
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
                /* The hue this answer wears for the rest of the product. Picking
                   "I want to attack" here and then seeing red tags on the
                   attacking openings is the whole point of colouring any of
                   this — the two have to be the same red. */
                colour={CHARACTER_STYLE[option.value].colour}
                onClick={() => onDone({ load: load!, character: option.value })}
              />
            ))}
      </Box>

      <Box
        component="button"
        /* On a re-take this must hand back what they ALREADY had. Falling
           through to the medium/solid default would silently rewrite a
           deliberate "attacking, heavy" answer into its opposite, and the only
           evidence would be a suggestion order that quietly changed. */
        onClick={() => onDone(current ?? { load: "medium", character: "solid" })}
        sx={{
          mt: 2.5, minHeight: 44, px: 1, background: "none", border: "none", cursor: "pointer",
          color: "rgba(255,255,255,0.4)", fontSize: "0.82rem", borderRadius: "8px",
          "&:hover": { color: "rgba(255,255,255,0.75)" },
          "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
        }}
      >
        {current ? "Keep my current answers" : "Skip — I know what I play"}
      </Box>
    </Box>
  );
}

function QuizOption({
  title,
  body,
  index,
  colour,
  selected,
  onClick,
}: {
  title: string;
  body: string;
  index: number;
  /** The character hue, when this option has one. Theory-load options do not. */
  colour?: string;
  /** Already their answer, on a re-take. */
  selected?: boolean;
  onClick: () => void;
}) {
  const accent = colour ?? EMBER;
  return (
    <Box
      component={motion.button}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClick}
      aria-pressed={selected ? true : undefined}
      sx={{
        textAlign: "left", width: "100%", cursor: "pointer",
        display: "flex", alignItems: "flex-start", gap: 1.25,
        p: 2, borderRadius: "1.25rem",
        border: `1px solid ${selected ? `${accent}80` : "rgba(255,255,255,0.1)"}`,
        background: selected
          ? `${accent}14`
          : "linear-gradient(180deg, rgba(20,22,28,0.8) 0%, rgba(12,14,20,0.8) 100%)",
        backdropFilter: "blur(12px)",
        transition: "border-color 180ms ease, background 180ms ease",
        "&:hover": { borderColor: `${accent}8C`, background: `${accent}14` },
        "&:focus-visible": { outline: `2px solid ${accent}`, outlineOffset: 2 },
      }}
    >
      {/* A dot rather than a tinted card. Washing the whole option in colour
          would make four cards of four different brightnesses and turn a list
          into a fruit salad; a 10px chip carries the same code at a fraction of
          the ink. Only the character step has one — theory load is a quantity,
          not a flavour, and giving it a hue would imply a fifth character. */}
      {colour && (
        <Box
          aria-hidden
          sx={{
            width: 10, height: 10, borderRadius: "50%", flexShrink: 0, mt: 0.75,
            background: colour, boxShadow: `0 0 10px ${colour}66`,
          }}
        />
      )}
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.4 }}>
          <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: "1rem" }}>{title}</Typography>
          {/* Selection has to survive somebody who cannot separate the hues, so
              it is a word as well as a tint. */}
          {selected && (
            <Typography sx={{ fontSize: "0.68rem", color: accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              your answer
            </Typography>
          )}
        </Box>
        <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.86rem", lineHeight: 1.55 }}>{body}</Typography>
      </Box>
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
