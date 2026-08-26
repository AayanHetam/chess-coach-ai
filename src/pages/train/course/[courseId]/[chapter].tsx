// The course trainer: one chapter, asked.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE BAND IS RESOLVED HERE AND THE URL CANNOT ARGUE
//
// `/api/opening-courses/[id]` says in its own header that its `band` parameter
// is a size boundary and not a security one, and the reader at
// /learn/[courseId] computes the band in the browser and sends it. This route
// takes neither: it reads the session cookie, resolves the rating from the
// account, and cuts the course before anything is serialised. `?band=` on this
// URL does nothing at all, and the assertion that proves it compares the two
// __NEXT_DATA__ payloads byte for byte.
//
// THIS FILE RENDERS THE CONTRACT SCREEN ONLY. The probe loop, the teach card
// and the summaries land on top of it. A half-built trainer is worse than none,
// so the screen it ships with is a complete one: what this chapter is, how much
// of it you already know, and one button.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { Box, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useAtomValue } from "jotai";
import { Chess } from "chess.js";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import OpeningDiagram from "@/components/learn/OpeningDiagram";
import { pieceSetAtom } from "@/components/board/states";
import { PuzzleBoardSurface } from "@/components/puzzle/PuzzleBoardSurface";
import type { FlashState } from "@/components/puzzle/FlashOverlay";
import { CourseRoundRail, CourseRoundStrip } from "@/components/train/CourseRoundRail";
import { CourseTeachCard } from "@/components/train/CourseTeachCard";
import { RoundSummary } from "@/components/train/RoundSummary";
import { hintAt, hintLadder, type Hint } from "@/lib/learn/hint";
import { fetchOpeningTheory } from "@/lib/theory/fetchOpeningTheory";
import type { OpeningTheory } from "@/types/theory";
// From sessionToken, not session: the latter imports `next/headers`, which is
// App-Router-only and fails the build when a pages/ page pulls it in. API
// routes under pages/api survive that import and a page does not.
import { getSessionFromCookieHeader } from "@/lib/auth/sessionToken";
import { getUserById } from "@/lib/server/users";
import { resolveUserRating } from "@/lib/coach/userRating";
import { bandFor, type BandId } from "@/lib/repertoire/levels";
import { loadCourse } from "@/lib/courses/load";
import { viewFor } from "@/lib/courses/view";
import { probesOf, toTrainerLine, type CourseProbe } from "@/lib/courses/probes";
import { keysUnder, planChapter } from "@/lib/courses/studies";
import { numbered } from "@/lib/courses/lines";
import {
  chapterParam,
  courseReaderHref,
  courseRoundHref,
  courseTrainerHref,
  roundParam,
} from "@/lib/learn/courseRoute";
import { drillHref, isDrill, studyParam } from "@/lib/learn/courseHubRoute";
import { loadChapter, writeChapter } from "@/lib/learn/chapterProgress";
import { pullChapter, pushChapter } from "@/lib/learn/chapterSync";
import {
  ROUND_SIZE,
  SITTING_ROUNDS,
  answerRound,
  drillRounds,
  startDrill,
  currentKey,
  nextDueAt,
  gradeAsk,
  isRepeat,
  recordFor,
  roundDone,
  roundTally,
  startRound,
  type Records,
  type RoundState,
} from "@/lib/learn/chapterRound";
import { createSession, submitProbe } from "@/lib/learn/trainerSession";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  courseId: string;
  courseName: string;
  side: "white" | "black";
  chapter: number;
  chapterLine: string[];
  chapterShare: number;
  band: BandId;
  bandName: string;
  theoryPlies: number;
  corpusSource: string;
  corpusGames: number;
  probes: CourseProbe[];
  total: number;
  capped: boolean;
  /**
   * A drill asks the lot; a session asks what you owe.
   *
   * One page, two queues. Two pages would be two copies of the probe loop and
   * the grading, and they would drift.
   */
  drill: boolean;
  /** The study a drill is narrowed to, when it is narrowed to one. */
  studyId: string | null;
  studyTitle: string | null;
  /** Rounds this sitting has. A session is four; a drill is however many it takes. */
  rounds: number;
}

export default function CourseTrainerPage(props: Props) {
  const { user } = useAuth();
  // The uid, not a linked platform handle. Mastery syncs to the account, so the
  // local copy has to be keyed by the same thing the server keys by, or a
  // player who links a chess.com account mid-way would appear to lose a month.
  const account = user?.uid ?? "";
  const [records, setRecords] = useState<Records>({});
  /**
   * Which account/chapter the records in state were read for, or null before
   * any read.
   *
   * Load-bearing, and the first two attempts at it were wrong. A boolean
   * "ready" flag is not enough: `useAuth` resolves AFTER the first render, so
   * the first read happens with no account, completes honestly with an empty
   * set, and the flag goes true. The round then builds from nothing, and when
   * the real account arrives the flag flips false→true inside one batch, which
   * React collapses to no change at all — so the round is never rebuilt and a
   * player coming back tomorrow is asked every decision they already own.
   *
   * Keying on WHOSE records these are makes the late arrival a real change.
   */
  const [recordsKey, setRecordsKey] = useState<string | null>(null);

  // Local first, always. The screen knows what you know before any network.
  useEffect(() => {
    setRecords(account ? loadChapter(account, props.courseId, props.chapter) : {});
    setRecordsKey(`${account}:${props.courseId}:${props.chapter}`);
  }, [account, props.courseId, props.chapter]);

  /**
   * The latest records, readable without subscribing to them.
   *
   * The round must be built from what is known NOW, and must NOT rebuild every
   * time an answer changes them — that would re-sort the queue underneath the
   * player mid-round.
   */
  const recordsRef = useRef(records);
  recordsRef.current = records;

  // The account copy arrives when it arrives.
  useEffect(() => {
    if (!account) return;
    let live = true;
    pullChapter({ account, courseId: props.courseId, chapter: props.chapter }).then((merged) => {
      if (live && merged) setRecords(merged);
    });
    return () => {
      live = false;
    };
  }, [account, props.courseId, props.chapter]);

  const tally = useMemo(() => roundTally(props.probes, records), [props.probes, records]);

  // ── The round.
  //
  // `?round=` is the phase. Its absence is the contract screen; a number is a
  // live round. That makes every screen a URL, so a refresh, a back button or a
  // link mailed to yourself all land where they should.
  const router = useRouter();
  const round = roundParam(router.query.round, props.rounds);
  const running = router.query.round !== undefined;

  /**
   * The href for one phase of THIS sitting.
   *
   * A drill carries `drill=1` and its study through every round, so a refresh,
   * a back button or a next-round push all stay in the drill. Losing the flag
   * on round 2 would silently turn a drill into a session — same board, same
   * grading, a different queue, and nothing on the screen would say so.
   */
  const phaseHref = useCallback(
    (r?: number) => {
      if (!props.drill) {
        return r === undefined
          ? courseTrainerHref(props.courseId, props.chapter)
          : courseRoundHref(props.courseId, props.chapter, r);
      }
      const base = drillHref(props.courseId, props.chapter, props.studyId ?? undefined);
      return r === undefined ? base : `${base}&round=${Math.max(1, r)}`;
    },
    [props.drill, props.courseId, props.chapter, props.studyId]
  );

  const [roundState, setRoundState] = useState<RoundState | null>(null);
  /**
   * The answer just given, or null while the question is open.
   *
   * `right` decides which of two very different things the panel does: say so
   * and get out of the way, or teach. Keeping them in one piece of state means
   * the board and the panel cannot disagree about which one is happening.
   */
  const [answer, setAnswer] = useState<{ san: string; right: boolean } | null>(null);
  const [flash, setFlash] = useState<{ state: FlashState; flashKey: number } | null>(null);
  const [wrongSquare, setWrongSquare] = useState<string | null>(null);
  /** Hint rungs taken on the question that is open. Resets with the question. */
  const [hints, setHints] = useState(0);
  /**
   * What this round did, and what was left before it started.
   *
   * `openBefore` is captured when the round is BUILT, not derived at the end:
   * the tally is live, so by the time the summary renders the difference has
   * already been folded in and "what changed" is unrecoverable.
   */
  const [scored, setScored] = useState({ right: 0, wrong: 0 });
  const [openBefore, setOpenBefore] = useState<number | null>(null);
  const [theory, setTheory] = useState<OpeningTheory | null>(null);
  const [saved, setSaved] = useState(true);
  const pieceSet = useAtomValue(pieceSetAtom);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const byKey = useMemo(() => {
    const map = new Map<string, CourseProbe>();
    for (const probe of props.probes) map.set(probe.key, probe);
    return map;
  }, [props.probes]);

  // A round is built once, from the records as they stood when it opened.
  // Rebuilding it on every answer would re-sort the queue underneath the player.
  const builtFor = useRef<string | null>(null);
  useEffect(() => {
    if (!running) {
      setRoundState(null);
      builtFor.current = null;
      return;
    }
    // A DRILL DOES NOT WAIT FOR RECORDS. Its queue is not chosen from them, so
    // gating on the account's arrival would only delay the first question — and
    // gating a queue on something it does not read is how a "why is this
    // ordered like that" bug gets written.
    if (!props.drill && recordsKey === null) return;
    const key = `${props.drill ? "drill" : recordsKey}#${round}`;
    if (builtFor.current === key) return;
    builtFor.current = key;
    setScored({ right: 0, wrong: 0 });
    setHints(0);
    setOpenBefore(roundTally(props.probes, recordsRef.current).open);
    setRoundState(
      props.drill
        ? startDrill(props.probes, round)
        : // The clock is what lets an earned card come back. Passed in rather
          // than read inside, so the queue stays a pure function of its inputs.
          startRound(props.probes, recordsRef.current, round, ROUND_SIZE, Date.now())
    );
  }, [running, round, props.probes, recordsKey, props.drill]);

  const probeKey = roundState ? currentKey(roundState) : null;
  const probe = probeKey ? (byKey.get(probeKey) ?? null) : null;
  const answered = answer !== null && probe !== null;
  const teaching = answered && answer !== null && !answer.right;

  // The quote, for the position being asked about. Absent for ~87% of
  // decisions, and absent means NOTHING rendered — no placeholder, no stranded
  // attribution line, no empty bordered box.
  useEffect(() => {
    setTheory(null);
    if (!probe) return;
    let live = true;
    fetchOpeningTheory([probe.fen]).then(map => {
      if (live) setTheory(map.get(probe.fen) ?? null);
    });
    return () => {
      live = false;
    };
  }, [probe]);

  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    []
  );

  const persist = useCallback(
    (next: Records) => {
      setRecords(next);
      if (!account) return;
      const ok = writeChapter(account, props.courseId, props.chapter, next, Date.now());
      setSaved(ok);
      // The account copy is best-effort and silent. The local write is the one
      // whose failure the player is told about.
      void pushChapter({ account, courseId: props.courseId, chapter: props.chapter }, next);
    },
    [account, props.courseId, props.chapter]
  );

  /**
   * A move attempted on the board.
   *
   * Illegal geometry is rejected HERE, before the machine is called. That is
   * what keeps `submitProbe`'s illegal branch unreachable: it sets
   * `feedback: 'wrong'` under a comment reading "no verdict, no penalty", and a
   * screen that forwarded raw input would flash red at a slipped finger.
   */
  const onPieceDrop = useCallback(
    (from: string, to: string): boolean => {
      if (!probe || !roundState || answer !== null) return false;
      let san: string | null = null;
      try {
        const board = new Chess(probe.fen);
        const move = board.move({ from, to, promotion: "q" });
        san = move ? move.san : null;
      } catch {
        san = null;
      }
      if (!san) return false;

      const line = toTrainerLine(probe, props.side);
      const graded = submitProbe(createSession(line, "study"), line, san);
      const right = graded.knewIt === true;
      // A hint taken on THIS question costs it, wherever the ladder stopped.
      const hinted = hints > 0;

      const now = Date.now();
      persist({
        ...records,
        [probe.key]: gradeAsk(recordFor(records, probe.key), { right, hinted, round, at: now }),
      });
      setScored(s => ({ right: s.right + (right ? 1 : 0), wrong: s.wrong + (right ? 0 : 1) }));
      setFlash({ state: right ? "green" : "red", flashKey: now });
      setWrongSquare(right ? null : to);

      setAnswer({ san, right });
      if (right) {
        // Say so, briefly, and move on. No lesson, no drill, no card — the
        // whole point of asking first.
        advanceTimer.current = setTimeout(() => {
          setWrongSquare(null);
          setFlash(null);
          setAnswer(null);
          setHints(0);
          setRoundState(s => (s ? answerRound(s, true) : s));
        }, 900);
      }
      // Wrong stops and waits. The asymmetry is deliberate: attention is spent
      // only where the learning is.
      return true;
    },
    [probe, roundState, answer, props.side, records, round, persist, hints]
  );

  const continueAfterTeach = useCallback(() => {
    setAnswer(null);
    setWrongSquare(null);
    setFlash(null);
    setHints(0);
    setRoundState(s => (s ? answerRound(s, false) : s));
  }, []);

  const exit = useCallback(() => {
    void router.push(props.drill ? drillHref(props.courseId) : courseReaderHref(props.courseId));
  }, [router, props.courseId, props.drill]);

  const restart = useCallback(() => {
    setAnswer(null);
    setWrongSquare(null);
    setFlash(null);
    setHints(0);
    setScored({ right: 0, wrong: 0 });
    setRoundState(
      props.drill ? startDrill(props.probes, round) : startRound(props.probes, records, round)
    );
  }, [props.probes, records, round, props.drill]);

  /**
   * The hint ladder for the question that is open.
   *
   * Built from the course's own move and the position it is played in. Nothing
   * is analysed and nothing is asked of a server — see lib/learn/hint.ts, whose
   * import graph is the guarantee.
   */
  const ladder: Hint[] = useMemo(
    () => (probe ? hintLadder(probe.fen, probe.san) : []),
    [probe]
  );
  const hint = hintAt(ladder, hints);
  const takeHint = useCallback(() => setHints(h => Math.min(h + 1, ladder.length)), [ladder.length]);

  // The round is over: say what it did. This used to `router.replace` straight
  // into the next round, which threw away the one number the mode can claim —
  // the open count falling — every five questions.
  if (running && roundState && roundDone(roundState)) {
    const now = Date.now();
    return (
      <>
        <Head>
          <title key="title">{`Train ${props.courseName} — Chess Masti AI`}</title>
          <meta name="robots" content="noindex" />
        </Head>
        <GradientBackdrop />
        <Box
          sx={{
            minHeight: "100dvh",
            px: { xs: 2, md: 4 },
            py: { xs: 4, md: 6 },
            display: "flex",
            justifyContent: "center",
          }}
        >
          <RoundSummary
            round={round}
            rounds={props.rounds}
            right={scored.right}
            wrong={scored.wrong}
            tally={tally}
            openBefore={openBefore}
            empty={roundState.timeline.length === 0}
            drill={props.drill}
            dueAt={props.drill ? null : nextDueAt(records)}
            nextHref={round < props.rounds ? phaseHref(round + 1) : null}
            exitHref={props.drill ? drillHref(props.courseId) : courseReaderHref(props.courseId)}
            exitLabel={props.drill ? "Drill something else" : "Back to the course"}
            now={now}
          />
        </Box>
      </>
    );
  }

  if (running && roundState && probe) {
    return (
      <RoundScreen
        props={props}
        probe={probe}
        roundState={roundState}
        tally={tally}
        answer={answer}
        teaching={teaching}
        theory={theory}
        flash={flash}
        wrongSquare={wrongSquare}
        pieceSet={pieceSet}
        repeat={isRepeat(roundState, probe.key)}
        saved={saved}
        hint={hint}
        hintsLeft={ladder.length - hints}
        onHint={takeHint}
        onPieceDrop={onPieceDrop}
        onContinue={continueAfterTeach}
        onExit={exit}
        onRestart={restart}
      />
    );
  }

  return (
    <>
      <Head>
        <title key="title">{`Train ${props.courseName} — Chess Masti AI`}</title>
        {/* Progress is per account; nothing here belongs in a shared cache. */}
        <meta name="robots" content="noindex" />
      </Head>
      <GradientBackdrop />
      <Box
        sx={{
          minHeight: "100dvh",
          px: { xs: 2, md: 4 },
          py: { xs: 2, md: 4 },
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 720 }}>
          <Link
            href={props.drill ? drillHref(props.courseId) : courseReaderHref(props.courseId)}
            style={{
              // On the ANCHOR, not on the text inside it: an <a> is inline by
              // default, so its box is the line box and a minHeight on a child
              // leaves the tappable area at 19px. Measured, not assumed.
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              minHeight: 44,
              paddingRight: "0.5rem",
              textDecoration: "none",
              color: "rgba(255,255,255,0.62)",
              fontSize: "0.85rem",
            }}
            data-testid="course-trainer-back"
          >
            <ChevronLeft size={16} aria-hidden />
            {props.drill ? "Choose what to drill" : "The course"}
          </Link>

          <Box sx={{ display: "flex", gap: 2, alignItems: "center", mt: 1 }}>
            <OpeningDiagram moves={props.chapterLine} side={props.side} px={104} />
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontFamily: "var(--font-mono, ui-monospace, monospace)",
                  fontSize: { xs: "0.95rem", md: "1.05rem" },
                  color: "rgba(255,255,255,0.92)",
                }}
              >
                {numbered(props.chapterLine)}
              </Typography>
              <Typography sx={{ color: "rgba(255,255,255,0.58)", fontSize: "0.85rem", mt: 0.5 }}>
                {Math.round(props.chapterShare * 100)}% of what you meet here
              </Typography>
            </Box>
          </Box>

          <Typography
            component="h1"
            data-testid="course-headline"
            sx={{
              mt: 4,
              fontSize: { xs: "1.1rem", md: "1.25rem" },
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.92)",
            }}
          >
            {props.drill ? "Everything, asked cold." : "Before we teach anything, we ask."}
          </Typography>

          {props.drill && (
            <Typography
              data-testid="drill-scope"
              sx={{ mt: 1, color: "rgba(255,255,255,0.58)", fontSize: "0.88rem", lineHeight: 1.6 }}
            >
              {props.studyTitle
                ? `${props.studyTitle} — every decision in it, whether or not you owe it.`
                : "Every decision in this chapter, whether or not you owe it."}
            </Typography>
          )}

          <Box
            component="dl"
            data-testid="course-buckets"
            sx={{
              mt: 3,
              display: "grid",
              gridTemplateColumns: { xs: "1fr 1fr 1fr" },
              gap: 1.5,
              m: 0,
            }}
          >
            <Bucket label="Not asked yet" value={tally.unseen} testid="bucket-unseen" />
            <Bucket label="Still learning" value={tally.learning} testid="bucket-learning" />
            <Bucket label="Known" value={tally.known} testid="bucket-known" />
          </Box>

          {props.capped && (
            <Typography
              data-testid="course-capped"
              sx={{ mt: 2, color: "rgba(255,255,255,0.58)", fontSize: "0.85rem" }}
            >
              Showing the {props.probes.length} most likely of {props.total} positions in this
              chapter.
            </Typography>
          )}

          <Box sx={{ mt: 4, display: "grid", gap: 1 }}>
            <Fact
              label="This sitting"
              value={`${props.rounds} ${props.rounds === 1 ? "round" : "rounds"} · ${ROUND_SIZE} positions a round`}
            />
            <Fact label="Shown to" value={`${props.theoryPlies} plies, the depth for your level`} />
            <Fact label="Your level" value={props.bandName} />
            {/*
              The corpus, named. NOT the band: "Frequencies from Improving"
              reads as "these are the moves players at your level make", and
              for a COURSE they are not.

              The bracket on /learn is now measured per band, but courses are
              still generated from the Elite tree, so this row keeps naming
              Elite. The two are allowed to differ; what is not allowed is this
              row claiming the band because a different screen earned it. The
              value is read from the course's own `meta.corpus`, so it can only
              change when the course is rebuilt on something else.
            */}
            <Fact
              label="Frequencies from"
              value={`${(props.corpusGames / 1e6).toFixed(1)}M games · ${props.corpusSource.split(",")[0]}`}
            />
          </Box>

          <Box sx={{ mt: 4 }}>
            <Link
              href={phaseHref(1)}
              style={{ textDecoration: "none", display: "inline-block" }}
              data-testid="course-start"
            >
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 2,
                  minHeight: 52,
                  px: 3,
                  borderRadius: "1.5rem",
                  border: "1px solid rgba(251,146,60,0.42)",
                  background: "rgba(251,146,60,0.10)",
                  color: "#FB923C",
                  fontSize: "0.98rem",
                  transition: "background 200ms ease-out",
                  "&:hover": { background: "rgba(251,146,60,0.16)" },
                }}
              >
                Start round 1
                <ArrowRight size={18} aria-hidden />
              </Box>
            </Link>
          </Box>
        </Box>
      </Box>
    </>
  );
}

/**
 * The board, the rail and the panel, in the proven three-region shape.
 *
 * `interactive` only while a question is open: once they have answered, the
 * board shows the course move and stops accepting input, so a second drag
 * cannot overwrite a verdict they have not read yet.
 */
function RoundScreen({
  props,
  probe,
  roundState,
  tally,
  answer,
  teaching,
  theory,
  flash,
  wrongSquare,
  pieceSet,
  repeat,
  saved,
  hint,
  hintsLeft,
  onHint,
  onPieceDrop,
  onContinue,
  onExit,
  onRestart,
}: {
  props: Props;
  probe: CourseProbe;
  roundState: RoundState;
  tally: ReturnType<typeof roundTally>;
  answer: { san: string; right: boolean } | null;
  teaching: boolean;
  theory: OpeningTheory | null;
  flash: { state: FlashState; flashKey: number } | null;
  wrongSquare: string | null;
  pieceSet: string;
  repeat: boolean;
  saved: boolean;
  hint: Hint | null;
  hintsLeft: number;
  onHint: () => void;
  onPieceDrop: (from: string, to: string) => boolean;
  onContinue: () => void;
  onExit: () => void;
  onRestart: () => void;
}) {
  // The board shows the position AFTER the course move once they have missed
  // it, so the answer is on the board and not only in the panel.
  const shown = useMemo(() => {
    if (!answer) return probe.fen;
    try {
      const board = new Chess(probe.fen);
      return board.move(probe.san) ? board.fen() : probe.fen;
    } catch {
      return probe.fen;
    }
  }, [answer, probe]);

  const railProps = {
    round: roundState.round,
    rounds: props.rounds,
    progress: roundState.progress,
    size: roundState.size,
    tally,
    asked: Math.min(roundState.at + 1, roundState.timeline.length),
    // The timeline, not the round size: a miss appends to it, so counting
    // against `size` produces "position 6 of 5" the moment anything goes wrong.
    asks: roundState.timeline.length,
    onExit,
    onRestart,
  };

  return (
    <>
      <Head>
        <title key="title">{`Train ${props.courseName} — Chess Masti AI`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <GradientBackdrop />
      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, minHeight: "100dvh" }}>
        <CourseRoundStrip {...railProps} title={numbered(props.chapterLine)} />
        <CourseRoundRail {...railProps} />

        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            px: 2,
            py: { xs: 2, md: 3 },
            gap: 1,
          }}
        >
          <Box sx={{ width: "100%", maxWidth: 560 }}>
            <PuzzleBoardSurface
              fen={shown}
              orientation={props.side}
              interactive={answer === null}
              onPieceDrop={onPieceDrop}
              wrongSquare={wrongSquare}
              flash={flash}
              pieceSet={pieceSet}
              underlaySquareStyles={hintSquares(hint)}
              // The default animation is long enough that a fast second tap
              // lands mid-animation and is dropped, which on a phone reads as
              // the board ignoring you.
              animationMs={150}
              boardId="course-round"
            />
          </Box>
          <Typography
            sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.78rem", fontVariantNumeric: "tabular-nums" }}
          >
            {answer
              ? `You played ${answer.san}`
              : `You play ${props.side === "white" ? "White" : "Black"}`}
          </Typography>
        </Box>

        <Box
          sx={{
            width: { xs: "100%", md: 380 },
            flexShrink: 0,
            px: { xs: 2, md: 3 },
            py: { xs: 2, md: 4 },
            borderLeft: { md: "1px solid rgba(255,255,255,0.06)" },
          }}
        >
          {teaching && answer ? (
            <CourseTeachCard
              probe={probe}
              played={answer.san}
              side={props.side}
              theory={theory}
              onContinue={onContinue}
            />
          ) : answer?.right ? (
            <Box data-testid="verdict-correct" sx={{ display: "grid", gap: 1 }}>
              <Typography
                role="status"
                aria-live="polite"
                sx={{
                  fontSize: "1rem",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.92)",
                }}
              >
                Correct.
              </Typography>
              {/* The move alone. A sentence about it would be a sentence we
                  composed, and there is nothing to add to a right answer. */}
              <Typography
                sx={{
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  fontSize: "1.1rem",
                  textTransform: "none",
                  color: "#FB923C",
                }}
              >
                {answer.san}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: "grid", gap: 1.5 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Typography
                  sx={{
                    fontSize: "1rem",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.92)",
                  }}
                >
                  Your move
                </Typography>
                {/* Item history as state, not as a sentence. */}
                {repeat && (
                  <Typography
                    data-testid="asked-again"
                    sx={{
                      fontSize: "0.7rem",
                      px: 1,
                      py: 0.25,
                      borderRadius: "0.6rem",
                      border: "1px solid rgba(255,255,255,0.14)",
                      color: "rgba(255,255,255,0.55)",
                    }}
                  >
                    Asked again
                  </Typography>
                )}
              </Box>
              <Typography sx={{ color: "rgba(255,255,255,0.62)", fontSize: "0.9rem" }}>
                Play the move this course plays here.
              </Typography>

              {/*
                THE HINT COSTS THE ROUND. `gradeAsk` lands a hinted answer on -1
                whatever they then play, so `known` can never come to mean `was
                shown` — and the button says so before it is pressed, because a
                cost a player only learns about afterwards is a trick.
              */}
              {hint && (
                <Typography
                  data-testid="hint-text"
                  role="status"
                  aria-live="polite"
                  sx={{ color: "#FB923C", fontSize: "0.95rem" }}
                >
                  {hint.text}
                </Typography>
              )}
              {hintsLeft > 0 && (
                <Box
                  component="button"
                  onClick={onHint}
                  data-testid="hint-button"
                  sx={{
                    appearance: "none",
                    justifySelf: "start",
                    minHeight: 44,
                    px: 2,
                    borderRadius: "0.9rem",
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.7)",
                    fontSize: "0.84rem",
                    cursor: "pointer",
                    transition: "background 200ms ease-out",
                    "&:hover": { background: "rgba(255,255,255,0.09)", color: "#fff" },
                    "&:focus-visible": { outline: "2px solid #FB923C", outlineOffset: 2 },
                  }}
                >
                  {hint ? "Narrow it down" : "Hint — this one will not count as known"}
                </Box>
              )}
            </Box>
          )}

          {/* The failure worth telling them about. An unsaved chapter is
              otherwise pixel-identical to an unstudied one. */}
          {!saved && (
            <Typography
              data-testid="not-saved"
              sx={{ mt: 2, color: "rgba(255,255,255,0.5)", fontSize: "0.78rem" }}
            >
              Not saved on this device.
            </Typography>
          )}
        </Box>
      </Box>
    </>
  );
}

function Bucket({ label, value, testid }: { label: string; value: number; testid: string }) {
  return (
    <Box
      sx={{
        borderRadius: "1.5rem",
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(12px)",
        px: 2,
        py: 1.75,
      }}
    >
      <Box component="dt" sx={{ color: "rgba(255,255,255,0.52)", fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {label}
      </Box>
      <Box
        component="dd"
        data-testid={testid}
        sx={{ m: 0, mt: 0.5, fontSize: "1.6rem", color: "rgba(255,255,255,0.92)", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </Box>
    </Box>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        display: "grid",
        // Stacked at 375 and aligned above it. A flex row with a minWidth label
        // wraps its VALUE onto a line of its own, which reads as a broken pair
        // rather than as a wrap — measured on the phone, not reasoned about.
        gridTemplateColumns: { xs: "1fr", sm: "132px 1fr" },
        columnGap: 2,
        rowGap: 0.25,
        alignItems: "baseline",
      }}
    >
      <Typography sx={{ color: "rgba(255,255,255,0.48)", fontSize: "0.8rem" }}>{label}</Typography>
      <Typography sx={{ color: "rgba(255,255,255,0.78)", fontSize: "0.88rem" }}>{value}</Typography>
    </Box>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const courseId = Array.isArray(ctx.params?.courseId) ? ctx.params?.courseId[0] : ctx.params?.courseId;
  const chapter = chapterParam(ctx.params?.chapter);
  if (chapter === null) return { notFound: true };

  // `loadCourse` is the guard, not a shape check: it validates the id against
  // the catalogue and never builds a path for one that is not in it. A regex in
  // front of it looked like defence and was measurably nothing — deleting it
  // left every test green, because an id that fails the shape also fails the
  // catalogue.
  const course = courseId ? loadCourse(courseId) : null;
  if (!course || !courseId) return { notFound: true };

  // The band comes from the account, never from the request. A failed profile
  // read degrades to "we do not know you", which is the middle band — being
  // wrong downward costs a strong player depth for one session, and being wrong
  // upward hands a beginner theory the whole cut exists to keep from them.
  let rating: number | undefined;
  try {
    const session = await getSessionFromCookieHeader(ctx.req.headers.cookie);
    if (session?.uid) {
      const user = await getUserById(session.uid);
      rating = resolveUserRating(user);
    }
  } catch {
    rating = undefined;
  }
  const band = bandFor(rating);

  const view = viewFor(course, band);
  const chapterView = view.chapters.find((c) => c.i === chapter);
  if (!chapterView) return { notFound: true };

  const found = probesOf(view, chapter, course.meta.side);
  let { probes, total, capped } = found;

  // ── Drill: everything, and optionally only one study of it.
  //
  // The scope is applied to the PROBES, not to the round: narrowing later would
  // leave `total` and the contract screen's counts describing the chapter while
  // the session asked a study, which is the same class of mistake as counting
  // decisions with an unbounded walk.
  const drill = isDrill(ctx.query.drill);
  const studyId = drill ? studyParam(ctx.query.study) : null;
  let studyTitle: string | null = null;
  if (studyId) {
    const plan = planChapter(view.nodes, chapterView, view.maxPly, course.meta.side);
    const study = plan.studies.find(candidate => candidate.id === studyId);
    // A study id that is not one of this chapter's studies is not a scope. Fall
    // back to the whole chapter rather than to an empty session.
    if (study) {
      const keys = keysUnder(view.nodes, study.at, view.maxPly, chapter);
      const narrowed = probes.filter(probe => keys.has(probe.key));
      if (narrowed.length > 0) {
        probes = narrowed;
        total = narrowed.length;
        capped = false;
        studyTitle = study.title;
      }
    }
  }

  // Progress is per account and this page carries a band chosen from it.
  ctx.res.setHeader("Cache-Control", "private, no-store");

  return {
    props: {
      courseId,
      courseName: course.meta.name,
      side: course.meta.side,
      chapter,
      chapterLine: chapterView.line,
      chapterShare: chapterView.share,
      band: band.id,
      bandName: band.name,
      theoryPlies: view.theoryPlies,
      corpusSource: course.meta.corpus.source,
      corpusGames: course.meta.corpus.games,
      probes,
      total,
      capped,
      drill,
      studyId: studyId && studyTitle ? studyId : null,
      studyTitle,
      // A session is a fixed sitting. A drill is however many rounds its scope
      // takes, because the player chose the scope and a drill that stopped at
      // 20 of 47 would be a session wearing a drill's name.
      rounds: drill ? Math.max(1, drillRounds(probes.length)) : SITTING_ROUNDS,
    },
  };
};

/**
 * The squares a hint rung lights, in the board's underlay.
 *
 * The underlay sits below every built-in cue, so a hint cannot paint over the
 * wrong-move flash or the last-move highlight — the verdict always wins.
 */
function hintSquares(hint: Hint | null): Record<string, React.CSSProperties> {
  if (!hint || hint.squares.length === 0) return {};
  const styles: Record<string, React.CSSProperties> = {};
  for (const square of hint.squares) {
    styles[square] = { background: "rgba(251,146,60,0.28)", boxShadow: "inset 0 0 0 2px #FB923C" };
  }
  return styles;
}
