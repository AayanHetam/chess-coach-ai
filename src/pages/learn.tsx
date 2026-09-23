"use client";

// /learn: your repertoire, played as a game.
//
// Two colours, and inside each one a slot for every decision a complete
// repertoire has to make. First visit asks two questions and uses them to
// rank the suggestions; after that it goes straight to the bracket.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE IDEA THIS PAGE IS BUILT ON
//
// Everyone else shows you a repertoire somebody else chose, as a finished
// object. The interesting thing is not the lines, it is the SHAPE: which
// decisions a repertoire actually contains, and which ones a given choice
// leaves you still owing. Choosing the Grünfeld answers 1.d4 and nothing
// else; the London and the Trompowsky appear the moment it is chosen,
// weighted by how often they really occur.
//
// Every number on this page is derived, not asserted: shares come off the
// corpus for the reader's band, coverage is set membership over real move
// sequences, and the derivation is scripts/openings/build-repertoire-map.mjs.
// Nothing here decides any chess.
//
// THE GAME LAYER on top of that is derived too. The rank ladder, the rings,
// the "+12%" and the bursts are all read off the same coverage number and
// the same lock flags the page has always kept; none of them is a new
// measurement or a new store. See lib/repertoire/rank.ts and guide.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Box, Typography } from "@mui/material";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BookOpen, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Masti, MastiSays, repertoireMood, type MastiMood } from "@/components/masti";
import { resolveUserRating } from "@/lib/coach/userRating";
import { bandFor, nextBand, sufficiency, type Band } from "@/lib/repertoire/levels";
import { bandRange } from "@/lib/repertoire/provenance";
import { pullBracket, pushBracket } from "@/lib/repertoire/bracketSync";
import {
  buildBracket,
  coverage,
  focusedRoots,
  share as pctOf,
} from "@/lib/repertoire/bracket";
import {
  EMPTY,
  clearBelow,
  loadBracket,
  saveBracket,
  stampBracket,
  setPick,
  type BracketState,
  type QuizAnswers,
} from "@/lib/repertoire/store";
import { facing } from "@/lib/repertoire/sentences";
import { guideLine } from "@/lib/repertoire/guide";
import { factsFor, measuredFor } from "@/lib/repertoire/yourTree";
import { archiveAccountFor, useYourTree } from "@/lib/repertoire/useYourTree";
import { readCourseProgress } from "@/lib/learn/courseProgress";
import { RepertoireHud, type SideStat } from "@/components/learn/RepertoireHud";
import { CoverageMeter } from "@/components/learn/CoverageMeter";
import { SlotBranch, type CourseProgressMap } from "@/components/learn/SlotBranch";
import { LockBar } from "@/components/learn/LockBar";
import { Quiz, QuizSummary } from "@/components/learn/Quiz";
import { YourGamesCard } from "@/components/learn/YourGamesCard";
import { EASE, FOCUS, GOLD, GOOD, ROSE } from "@/components/learn/tokens";
import type { RepertoirePick, RepertoireMap, RepertoireSlot } from "@/types/repertoire";

type Side = "white" | "black";

/** Stable identity, so the tree hook is not handed a new array every render. */
const NO_SLOTS: RepertoireSlot[] = [];
/** Stable identity again: an inline arrow would remount every row per render. */
const NOOP = () => {};
const NO_COURSES: CourseProgressMap = new Map();

export default function LearnPage() {
  const { user, profile } = useAuth();
  const account = profile?.handle ?? profile?.chesscomUsername ?? profile?.lichessUsername ?? "guest";
  const reduce = useReducedMotion();

  // Measured, not asked. We already know their rating, and asking somebody
  // their level is a question people answer badly about themselves.
  const rating = resolveUserRating(profile);
  const band = useMemo(() => bandFor(rating), [rating]);

  const [map, setMap] = useState<RepertoireMap | null>(null);
  const [mapState, setMapState] = useState<"loading" | "ready" | "failed">("loading");
  const [state, setState] = useState<BracketState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [side, setSide] = useState<Side>("white");
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  // Picks made in THIS sitting. The meter's "+12%" and burst key off it, so
  // they fire for a move the player just made and never for a bracket that
  // arrived from the account a second after the page loaded.
  const [pickKey, setPickKey] = useState(0);

  // Their own archive, read only when they ask for it. Never on page load.
  const archive = useMemo(() => archiveAccountFor(profile), [profile]);
  const mine = useYourTree({ account: archive, slots: map?.slots ?? NO_SLOTS });
  // The answers being re-taken, held OUTSIDE the bracket so the quiz can show
  // them as already-chosen. Clearing state.quiz is what opens the quiz.
  const [editing, setEditing] = useState<QuizAnswers | null>(null);

  // Re-fetched when the band changes, because the FREQUENCIES differ by band:
  // the same bracket measured on beginners and on 2300s disagrees by a factor
  // of twenty-four on how often you meet a Najdorf.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/repertoire?band=${encodeURIComponent(band.id)}`)
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
  }, [band.id]);

  // Read in an effect, never during render: this is localStorage, and a server
  // render that guessed would hydrate into a different bracket.
  useEffect(() => {
    setState(loadBracket(account));
    setHydrated(true);
    // The account copy, merged in when it arrives. Never awaited before the
    // page renders. A signed-out visitor gets null, which means "carry on".
    let cancelled = false;
    void pullBracket(account).then((merged) => {
      if (cancelled || !merged) return;
      setState(merged);
    });
    return () => {
      cancelled = true;
    };
  }, [account]);

  // Where they are in the courses behind their picks. Chapter progress is
  // keyed by uid, like the catalogue reads it; one scan of the keyspace on
  // mount, and nothing for a signed-out reader.
  const uid = user?.uid ?? "";
  const [courses, setCourses] = useState<CourseProgressMap>(NO_COURSES);
  useEffect(() => {
    setCourses(uid ? readCourseProgress(uid, Date.now()) : NO_COURSES);
  }, [uid]);

  // Where the last save actually landed. Two flags, because the honest
  // sentence depends on both: a failed local write with a good account copy
  // is an inconvenience; both failing is the only case where anything is at
  // risk, and the two must not read the same.
  const [savedLocally, setSavedLocally] = useState(true);
  const [savedToAccount, setSavedToAccount] = useState(true);

  const persist = useCallback(
    (next: BracketState) => {
      // `state` is the PREVIOUS bracket and the comparison needs it, which is
      // why this reads it directly rather than through a functional update.
      const stamped = stampBracket(state, next, Date.now());
      setState(stamped);
      setSavedLocally(saveBracket(account, stamped));
      // Unconditional: a local write that failed is the case where the
      // account copy matters MOST.
      void pushBracket(stamped).then((merged) => setSavedToAccount(merged !== null));
    },
    [account, state]
  );

  const picks = side === "white" ? state.white : state.black;
  const lockedHere = state.locked[side];
  const bothLocked = state.locked.white && state.locked.black;
  /**
   * Where "Continue" goes: the first curated choice they made, White before
   * Black. A pick from the searchable library has no course behind it.
   */
  const firstCourse = useMemo(
    () => [...state.white, ...state.black].find((p) => p.choiceId)?.choiceId ?? null,
    [state.white, state.black]
  );

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
      // from the Grünfeld to the Nimzo leaves an anti-Trompowsky answer in a
      // slot the new choice never creates, still counting toward coverage.
      const cleared = clearBelow(picks, pick.slotId, childrenOf);
      const next = setPick(cleared, pick.slotId, pick);
      persist(side === "white" ? { ...state, white: next } : { ...state, black: next });
      setOpenSlot(null);
      setPickKey((k) => k + 1);
    },
    [picks, childrenOf, persist, side, state]
  );

  // How deep the bracket goes is a level question. Three layers of nested
  // branches in front of a 700 is a wall.
  const maxDepth = band.id === "new" ? 1 : band.id === "beginner" ? 2 : 3;

  // One closure per colour, handed to BOTH the displayed bracket and the
  // coverage sum. They each build their own tree, and giving the measured
  // share to only one of them is how the summary came to say "1.e4, at 47% of
  // games" directly above a row reading "75% of your games".
  const reachFor = useCallback(
    (s: Side) => {
      const tree = measuredFor(mine.tree, s) ? mine.tree : null;
      return (slot: RepertoireSlot) => (tree ? (factsFor(tree, slot.id).share ?? null) : null);
    },
    [mine.tree]
  );
  const rootReach = useMemo(() => reachFor(side), [reachFor, side]);
  // Null unless we have enough of THIS colour to divide by.
  const measured = measuredFor(mine.tree, side) ? mine.tree : null;

  const bracket = useMemo(
    () => (map ? buildBracket(map, side, picks, maxDepth, rootReach) : []),
    [map, side, picks, maxDepth, rootReach]
  );

  // Breadth is a level question too: a beginner is asked for one White opening
  // and two answers as Black, and the rarer roots are deferred, never hidden.
  const [showAll, setShowAll] = useState(false);
  const focus = useMemo(
    () => (map ? focusedRoots(map, side, band.id) : { focus: [], deferred: [] }),
    [map, side, band.id]
  );
  // Every root for this colour, deferred ones included: the residual is what
  // their games did NOT land on.
  const rootSlots = useMemo(() => (map ? [...focus.focus, ...focus.deferred] : []), [map, focus]);

  const visible = useMemo(() => {
    if (showAll || focus.deferred.length === 0) return bracket;
    const wanted = new Set(focus.focus.map((s) => s.id));
    return bracket.filter((node) => wanted.has(node.slot.id));
  }, [bracket, focus, showAll]);

  // Both colours at once, for the HUD. The shown colour's meter reads the
  // same object, so the ring and the bar cannot disagree.
  const covers = useMemo(
    () =>
      map
        ? {
            white: coverage(map, "white", state.white, reachFor("white")),
            black: coverage(map, "black", state.black, reachFor("black")),
          }
        : null,
    [map, state.white, state.black, reachFor]
  );
  const cover = covers?.[side] ?? null;
  const stats = useMemo<Record<Side, SideStat>>(() => {
    const stat = (s: Side): SideStat => {
      const answered = covers?.[s].answered ?? 0;
      return {
        done: answered,
        enough: sufficiency(answered, band).enough,
        locked: state.locked[s],
        picks: (s === "white" ? state.white : state.black).length,
      };
    };
    return { white: stat("white"), black: stat("black") };
  }, [covers, band, state.locked, state.white, state.black]);

  // Masti's face and line, both read off the same numbers.
  const enoughHere = stats[side].enough;
  const mood: MastiMood = repertoireMood({ picks: picks.length, enough: enoughHere, lockedHere, bothLocked });
  const line = guideLine({
    side,
    picks: picks.length,
    enough: enoughHere,
    locked: state.locked,
    next: cover?.open[0] ? facing(cover.open[0].slot) : null,
  });

  if (mapState === "failed") {
    return (
      <Shell>
        <Empty mood="defeated" title="The opening map is not loading" body="Your picks are safe on this device. Try again in a moment." />
      </Shell>
    );
  }
  if (!map || !hydrated) {
    return (
      <Shell>
        <Empty mood="thinking" title="Reading the opening map" body="One moment." />
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

  const decided = visible.filter((n) => n.pick).length;

  return (
    <Shell>
      <Box sx={{ maxWidth: 860, mx: "auto", px: { xs: 2, md: 3 }, py: { xs: 3, md: 5 } }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              component="h1"
              sx={{ color: "#fff", fontSize: { xs: "1.7rem", md: "2.1rem" }, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}
            >
              Your repertoire
            </Typography>
            <LevelChip band={band} rating={rating} />
          </Box>
          <Box
            component={Link}
            href="/courses"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.75,
              minHeight: 44,
              color: "rgba(255,255,255,0.55)",
              fontSize: "0.85rem",
              textDecoration: "none",
              borderRadius: "8px",
              "&:hover": { color: GOLD.bright },
              ...FOCUS,
            }}
          >
            <BookOpen size={14} aria-hidden /> Browse every course
          </Box>
        </Box>

        {/* Masti is the guide: one line, the next thing to do. */}
        <Box sx={{ mt: 2.5 }} data-testid="learn-guide">
          <MastiSays
            mood={mood}
            size={84}
            maxWidth={380}
            tone={bothLocked ? "ember" : enoughHere ? "jade" : "glass"}
            replayOnHover
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={line}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: EASE }}
                style={{ display: "block", fontWeight: 600 }}
              >
                {line}
              </motion.span>
            </AnimatePresence>
          </MastiSays>
        </Box>

        <RepertoireHud
          side={side}
          onChange={(s) => {
            setSide(s);
            setOpenSlot(null);
          }}
          stats={stats}
          band={band}
        />

        <Box sx={{ mt: 2.5 }}>
          <YourGamesCard
            state={mine}
            account={archive}
            side={side}
            churn={state.churn}
            onAnswerChurn={(churn) => persist({ ...state, churn })}
          />
          <QuizSummary
            quiz={state.quiz}
            onEdit={() => {
              setEditing(state.quiz);
              setOpenSlot(null);
              persist({ ...state, quiz: null });
            }}
          />
        </Box>

        {/* Where the last save landed, said only when it is not both places. */}
        {!savedLocally && (
          <Typography
            data-testid="bracket-save-state"
            sx={{ mt: 1.5, fontSize: "0.78rem", lineHeight: 1.55, color: savedToAccount ? "rgba(255,255,255,0.5)" : ROSE.bright }}
          >
            {savedToAccount
              ? "This device is out of storage, so your repertoire is being kept on your account instead. It will be here when you come back."
              : "Not saved, not on this device and not on your account. Your last change may be lost if you close this page."}
          </Typography>
        )}

        {/* The colour's own screen. Keyed on the colour so switching plays a
            short crossfade and every card makes its entrance again. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={side}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: EASE }}
          >
            {cover && (
              <CoverageMeter
                coverage={cover}
                side={side}
                meta={map.meta}
                band={band}
                rating={rating}
                tree={measured}
                roots={rootSlots}
                pickKey={pickKey}
              />
            )}

            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 3, mb: 1.25 }}>
              <Typography sx={{ color: GOLD.bright, fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                Decisions
              </Typography>
              <Pips done={decided} total={visible.length} />
              <Typography sx={{ fontSize: "0.76rem", color: "rgba(255,255,255,0.45)", fontVariantNumeric: "tabular-nums" }}>
                {decided} of {visible.length} decided
              </Typography>
            </Box>

            <Box sx={{ display: "grid", gap: 1.5 }}>
              {visible.map((node, i) => (
                <SlotBranch
                  key={node.slot.id}
                  node={node}
                  map={map}
                  picks={picks}
                  quiz={state.quiz}
                  band={band}
                  tree={measured}
                  churn={state.churn}
                  courses={courses}
                  openSlot={lockedHere ? null : openSlot}
                  onOpen={lockedHere ? NOOP : setOpenSlot}
                  onPick={choose}
                  index={i}
                />
              ))}
            </Box>

            <LockBar
              side={side}
              locked={state.locked}
              picks={picks}
              firstCourse={firstCourse}
              onToggle={(which) => {
                setOpenSlot(null);
                persist({ ...state, locked: { ...state.locked, [which]: !state.locked[which] } });
              }}
            />

            {focus.deferred.length > 0 && (
              <DeferredRoots slots={focus.deferred} showAll={showAll} band={band} onToggle={() => setShowAll((v) => !v)} />
            )}
          </motion.div>
        </AnimatePresence>
      </Box>
    </Shell>
  );
}

/** The band they are in, as the level badge. Measured from the rating, never asked. */
function LevelChip({ band, rating }: { band: Band; rating: number | undefined }) {
  return (
    <Box
      data-testid="level-chip"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        mt: 1,
        px: 1.25,
        py: 0.45,
        borderRadius: "999px",
        border: `1px solid ${GOLD.border}`,
        background: GOLD.tint,
      }}
    >
      <Sparkles size={13} color={GOLD.base} aria-hidden />
      <Typography component="span" sx={{ fontSize: "0.76rem", fontWeight: 700, color: GOLD.bright }}>
        {band.name}
      </Typography>
      <Typography component="span" sx={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.5)" }}>
        {rating ? bandRange(band.id) : "unrated"}
      </Typography>
    </Box>
  );
}

/** One pip per root decision, lit as it is filled. Decorative: the count is beside it. */
function Pips({ done, total }: { done: number; total: number }) {
  if (total <= 0) return null;
  return (
    <Box aria-hidden sx={{ display: "inline-flex", gap: 0.5 }}>
      {Array.from({ length: total }, (_, i) => (
        <Box
          key={i}
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: i < done ? GOOD : "rgba(255,255,255,0.14)",
            boxShadow: i < done ? "0 0 8px rgba(134,239,172,0.6)" : "none",
            transform: i < done ? "scale(1)" : "scale(0.8)",
            transition: "background 220ms ease, transform 220ms cubic-bezier(0.16,1,0.3,1)",
            "@media (prefers-reduced-motion: reduce)": { transition: "none" },
          }}
        />
      ))}
    </Box>
  );
}

/**
 * The roots this band is not being asked for yet. Deferred, never hidden: a
 * player who wants the whole map gets it on one click.
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
          ...FOCUS,
        }}
      >
        <Typography sx={{ color: "rgba(255,255,255,0.82)", fontSize: "0.9rem", fontWeight: 600 }}>
          {showAll ? "Show fewer" : `${slots.length} more, when you are ready`}
        </Typography>
        <Typography sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.82rem", lineHeight: 1.6, mt: 0.4 }}>
          {showAll
            ? "Real, just rarer at your level."
            : `${slots.map((s) => facing(s)).join(", ")} · ${pctOf(total)} of games${
                after ? ` · worth it around ${after.floor}` : ""
              }`}
        </Typography>
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
          SELF_CHROMED_ROUTES, so it already gets both. */}
      <Box sx={{ minHeight: "100dvh" }}>{children}</Box>
    </>
  );
}

function Empty({ title, body, mood }: { title: string; body: string; mood?: MastiMood }) {
  return (
    <Box sx={{ maxWidth: 520, mx: "auto", px: 3, py: 10 }}>
      {/* Masti reads while the map loads and is dizzy when it will not; the
          copy underneath already says which, so he is decorative. */}
      {mood && <Masti mood={mood} size={120} loops={mood === "thinking" ? 0 : 2} decorative style={{ marginBottom: 12 }} />}
      <Typography sx={{ color: "#fff", fontSize: "1.1rem", fontWeight: 700, mb: 1 }}>{title}</Typography>
      <Typography sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.92rem", lineHeight: 1.65 }}>{body}</Typography>
    </Box>
  );
}
