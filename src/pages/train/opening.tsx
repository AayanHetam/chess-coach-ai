"use client";

// The opening trainer.
//
// Three regions: the session rail, the board, the teaching panel. The layout
// and the act order are specified in docs/OPENING_TRAINER_SPEC.md; read that
// before moving things, because the order of the acts is the product and not a
// presentation choice.
//
// This route owns wiring only. The session rules live in trainerSession (pure,
// tested); the board look lives in PuzzleBoardSurface (shared with every other
// solving surface); the numbers come from the repertoire screen. Nothing here
// decides anything about chess.

import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Box, Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import { Chess } from "chess.js";
import { useAuth } from "@/contexts/AuthContext";
import { pieceSetAtom } from "@/components/board/states";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { PuzzleBoardSurface } from "@/components/puzzle/PuzzleBoardSurface";
import type { FlashState } from "@/components/puzzle/FlashOverlay";
import TrainerRail, { TrainerRailStrip } from "@/components/train/TrainerRail";
import TrainerPanel from "@/components/train/TrainerPanel";
import { useRepertoireHole } from "@/lib/learn/useRepertoireHole";
import { formatLine, holeLine, type RepertoireHole } from "@/lib/learn/repertoireHole";
import {
  advance,
  createSession,
  goalFor,
  isUsersPly,
  steps as railSteps,
  submitMove,
  type TrainerLine,
} from "@/lib/learn/trainerSession";
import {
  clearSession,
  describeProgress,
  lineKeyOf,
  loadSession,
  markRepaired,
  saveSession,
} from "@/lib/learn/trainerProgress";
import { modeOf, parseTrainerQuery, resolveHole } from "@/lib/learn/trainerRoute";
import {
  describeNext,
  findCard,
  recordReview,
  scheduleAfterRepair,
  type ReviewCard,
} from "@/lib/learn/reviewSchedule";
import { fetchOpeningTheory } from "@/lib/theory/fetchOpeningTheory";
import { fetchMasterViews } from "@/lib/master/useMasterIdeas";
import type { OpeningTheory } from "@/types/theory";
import type { MasterView } from "@/lib/master/ideas";

/**
 * What to drill, in order of what we can actually defend.
 *
 * The engine first, because a centipawn gap is a measurement. Then master
 * practice, because "the strongest players choose something else here" is a
 * count. If neither disagrees with the move they already play, there is nothing
 * to drill and the session says so rather than inventing an exercise.
 */
export function targetFor(hole: RepertoireHole, master: MasterView | null): TrainerLine["target"] {
  if (hole.diagnosis === "move" && hole.betterMove) {
    return { san: hole.betterMove, source: "engine" };
  }
  const habit = hole.line[hole.line.length - 1]?.san;
  const top = master?.choices?.[0]?.san;
  if (top && habit && top !== habit) return { san: top, source: "masters" };
  return undefined;
}

export default function OpeningTrainerPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const pieceSet = useAtomValue(pieceSetAtom);

  const account = useMemo(() => {
    if (profile?.chesscomUsername)
      return { platform: "chess.com" as const, username: profile.chesscomUsername };
    if (profile?.lichessUsername)
      return { platform: "lichess" as const, username: profile.lichessUsername };
    return { platform: "chess.com" as const, username: null };
  }, [profile?.chesscomUsername, profile?.lichessUsername]);

  const repertoire = useRepertoireHole(account);
  const accountId = `${account.platform}:${account.username ?? ""}`;

  // Which of the three ways in this is. Parsed once, off the query, so the
  // rest of the page never re-derives "is this a review" from a raw string.
  const request = useMemo(
    () => parseTrainerQuery(router.query),
    [router.query]
  );
  const mode = modeOf(request);

  // A review is served from its own card and needs no measurement, no engine
  // and no archive. That independence is the point: see reviewSchedule.ts.
  const [card, setCard] = useState<ReviewCard | null>(null);
  useEffect(() => {
    if (request.kind !== "review" || !account.username) {
      setCard(null);
      return;
    }
    setCard(findCard(accountId, request.lineKey));
  }, [request, accountId, account.username]);

  const resolved = useMemo(
    () => resolveHole(repertoire.reports, request),
    [repertoire.reports, request]
  );
  const hole = resolved.status === "ready" ? resolved.hole : null;

  const [theory, setTheory] = useState<OpeningTheory | null>(null);
  const [master, setMaster] = useState<MasterView | null>(null);

  useEffect(() => {
    if (!hole || mode === "review") return;
    let cancelled = false;
    const habit = hole.line[hole.line.length - 1]?.san;
    void fetchOpeningTheory([hole.fen]).then((m) => {
      if (!cancelled) setTheory(m.get(hole.fen) ?? null);
    });
    void fetchMasterViews([{ fen: hole.parentFen, yourMove: habit }], hole.color).then((ctx) => {
      if (!cancelled) setMaster(ctx.byFen.get(hole.parentFen) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [hole, mode]);

  // The line to drill. A review takes it from the card verbatim; everything
  // else builds it from the measurement plus whatever the engine and the
  // masters have to say.
  const line: TrainerLine | null = useMemo(() => {
    if (mode === "review") return card?.line ?? null;
    if (!hole) return null;
    return { ...holeLine(hole), target: targetFor(hole, master) };
  }, [mode, card, hole, master]);

  const [state, setState] = useState<ReturnType<typeof createSession> | null>(null);
  const [resumed, setResumed] = useState(false);

  // Keyed on the LINE, deliberately not on the target. The master lookup can
  // land after the user has already moved, and rebuilding the session then
  // would silently rewind them to act one. Nothing in createSession reads the
  // target, and the drill reads it live, so a late arrival still works.
  // ONE identity for a line, shared with saved sessions, review cards and the
  // links that point here. A second spelling would let a link open a line
  // whose paused session could never be found again.
  const lineKey = line ? lineKeyOf(line) : "";

  useEffect(() => {
    if (!line || !account.username) {
      setState(null);
      return;
    }
    const saved = loadSession(accountId, line, Date.now(), mode);
    setState(saved ?? createSession(line, mode));
    setResumed(Boolean(saved));
  }, [lineKey, accountId, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist on every change. One small write, and it is what makes walking
  // away from a three-run drill free rather than expensive.
  const [nextReview, setNextReview] = useState<string | null>(null);

  useEffect(() => {
    if (!state || !line || !account.username) return;
    if (state.act === "done") {
      const now = Date.now();
      const label = hole ? formatLine(hole.line, hole.color) : (card?.label ?? lineKey);
      // Finishing is the ONLY place a schedule is written. A line that is
      // merely opened, or abandoned mid-run, changes nothing: a review you
      // walked away from is not evidence about how well you know the line.
      const scheduled =
        state.mode === "review"
          ? recordReview(accountId, lineKey, state.misses, now)
          : scheduleAfterRepair(accountId, line, label, state.misses, now);
      if (state.mode !== "review") markRepaired(accountId, line, label, state.runs, now);
      setNextReview(scheduled ? describeNext(scheduled, now) : null);
      clearSession(accountId, state.mode);
      return;
    }
    saveSession(accountId, line, state, Date.now());
  }, [state, lineKey, accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const restart = useCallback(() => {
    if (!line) return;
    clearSession(accountId, mode);
    setState(createSession(line, mode));
    setResumed(false);
  }, [line, accountId, mode]);

  const [flashKey, setFlashKey] = useState(0);
  const exit = useCallback(() => void router.push("/plan"), [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape leaves. Nothing is lost by leaving: the session is saved on
      // every change, so this is a pause and not a discard.
      if (e.key === "Escape") {
        e.preventDefault();
        exit();
        return;
      }
      // Enter advances, but only where there is one obvious next step. Binding
      // it during the drill would let a stray keypress count as a move.
      if (e.key === "Enter" && state && line) {
        if (state.act === "learn") {
          e.preventDefault();
          setState(advance(state, line));
        } else if (state.act === "done") {
          e.preventDefault();
          exit();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exit, state, line]);

  const onPieceDrop = useCallback(
    (from: string, to: string) => {
      if (!state || !line) return false;
      // Squares to SAN. The board reports geometry; the session speaks moves.
      let san: string;
      try {
        const board = new Chess(state.fen);
        const move = board.move({ from, to, promotion: "q" });
        if (!move) return false;
        san = move.san;
      } catch {
        return false;
      }
      const next = submitMove(state, line, san);
      if (next === state) return false;
      setState(next);
      setFlashKey((k) => k + 1);
      // A wrong drill move snaps back: the position on the board must never
      // show a move the session did not accept.
      return next.feedback !== "wrong";
    },
    [state, line]
  );

  const flash: FlashState =
    state?.feedback === "correct" ? "green" : state?.feedback === "wrong" ? "red" : "idle";

  if (!line || !state) {
    // Three different nothings, and collapsing them would tell most of these
    // players something untrue. Asking for a line we no longer hold is not the
    // same as never having measured, and neither is "still working".
    const working = repertoire.phase === "fetching" || repertoire.phase === "building";
    const gone = !working && request.kind !== "today";
    return (
      <Shell>
        <Box sx={{ p: 4, maxWidth: 520 }}>
          <Typography sx={{ color: "#fff", fontSize: "1.1rem", fontWeight: 700, mb: 1 }}>
            {gone ? "That line is not in your measurement any more" : "Nothing to train yet"}
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.92rem", lineHeight: 1.65 }}>
            {working
              ? `${repertoire.label}…`
              : gone
                ? "It was measured from games you have played, and the measurement has since been rebuilt. That usually means the line stopped costing you, which is the outcome we were after."
                : "Measure your repertoire on your plan first, and we will bring the line that costs you most."}
          </Typography>
          <Box
            component="button"
            onClick={exit}
            sx={{
              mt: 3,
              minHeight: 44,
              px: 2,
              borderRadius: "12px",
              border: "1px solid rgba(249,115,22,0.45)",
              background: "rgba(249,115,22,0.06)",
              color: "#FB923C",
              fontSize: "0.8rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Back to your plan
          </Box>
        </Box>
      </Shell>
    );
  }

  const label = hole ? formatLine(hole.line, hole.color) : (card?.label ?? "");
  const goal = goalFor(state.mode);
  const yourTurn = state.act === "confront" || (state.act === "drill" && isUsersPly(line, state.ply));

  return (
    <Shell title={label}>
      <TrainerRail
        line={label}
        steps={railSteps(state, line)}
        streak={state.streak}
        drilling={state.act === "drill"}
        goal={goal}
        onExit={exit}
        onRestart={restart}
        resumed={resumed}
      />

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TrainerRailStrip
          line={label}
          steps={railSteps(state, line)}
          streak={state.streak}
          drilling={state.act === "drill"}
          goal={goal}
          onExit={exit}
          onRestart={restart}
          resumed={resumed}
        />

        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: { xs: "column", lg: "row" },
            gap: { xs: 2.5, lg: 3 },
            p: { xs: 2, md: 3 },
            alignItems: { lg: "flex-start" },
            justifyContent: "center",
          }}
        >
          {/* Capped by HEIGHT as well as width. A board sized only by its
              column overflows a short viewport and turns a no-scroll session
              into a scrolling one. */}
          <Box
            sx={{
              width: "100%",
              maxWidth: { xs: 620, lg: "min(620px, calc(100dvh - 190px))" },
              mx: { xs: "auto", lg: 0 },
            }}
          >
            <PuzzleBoardSurface
              fen={state.fen}
              orientation={line.color}
              interactive={yourTurn && state.act !== "done"}
              onPieceDrop={onPieceDrop}
              pieceSet={pieceSet}
              // Short, on purpose. A drill is a rhythm: the default animation
              // is long enough that a fast player's next click lands mid-move
              // and is dropped, which reads as the board ignoring them.
              animationMs={150}
              flash={{ state: flash, flashKey }}
              boardId="opening-trainer"
            />
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mt: 1.5,
                px: 0.5,
              }}
            >
              {/* Whose move, in words. A coloured dot alone would carry this
                  for nobody who cannot separate the two colours. */}
              <Typography sx={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.55)" }}>
                {state.act === "done"
                  ? "Session complete"
                  : state.act === "learn"
                    ? `You played ${state.confrontMove ?? ""}`
                    : yourTurn
                      ? `You play ${line.color === "white" ? "White" : "Black"}`
                      : "Your opponent replies"}
              </Typography>
              <Typography
                sx={{
                  fontSize: "0.78rem",
                  color: "rgba(255,255,255,0.35)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {state.act === "drill"
                  ? `move ${Math.floor(state.ply / 2) + 1} of ${Math.ceil(line.moves.length / 2)}`
                  : hole
                    ? `${hole.games} games`
                    : ""}
              </Typography>
            </Box>
          </Box>

          <TrainerPanel
            state={state}
            line={line}
            hole={hole}
            resumedNote={resumed ? describeProgress(state) : null}
            nextReview={nextReview}
            theory={theory}
            master={master}
            onAdvance={() => setState(advance(state, line))}
            onExit={exit}
          />
        </Box>
      </Box>
    </Shell>
  );
}

function Shell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <>
      <Head>
        <title key="title">
          {title ? `Train ${title} — Chess Masti AI` : "Opening trainer — Chess Masti AI"}
        </title>
      </Head>
      <GradientBackdrop />
      <Box sx={{ display: "flex", minHeight: "100dvh" }}>{children}</Box>
    </>
  );
}
