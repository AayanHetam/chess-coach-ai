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
import { formatLine, type RepertoireHole } from "@/lib/learn/repertoireHole";
import {
  advance,
  createSession,
  isUsersPly,
  steps as railSteps,
  submitMove,
  type TrainerLine,
} from "@/lib/learn/trainerSession";
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
  const hole = repertoire.line;

  const [theory, setTheory] = useState<OpeningTheory | null>(null);
  const [master, setMaster] = useState<MasterView | null>(null);

  useEffect(() => {
    if (!hole) return;
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
  }, [hole]);

  const line: TrainerLine | null = useMemo(() => {
    if (!hole) return null;
    return {
      moves: hole.line.map((m) => m.san),
      color: hole.color,
      target: targetFor(hole, master),
    };
  }, [hole, master]);

  const [state, setState] = useState(() => (line ? createSession(line) : null));
  // Keyed on the LINE, deliberately not on the target. The master lookup can
  // land after the user has already moved, and rebuilding the session then
  // would silently rewind them to act one. Nothing in createSession reads the
  // target, and the drill reads it live, so a late arrival still works.
  const lineKey = line ? `${line.moves.join(" ")}|${line.color}` : "";
  useEffect(() => {
    setState(line ? createSession(line) : null);
  }, [lineKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const [flashKey, setFlashKey] = useState(0);
  const exit = useCallback(() => void router.push("/plan"), [router]);

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

  if (!hole || !line || !state) {
    return (
      <Shell>
        <Box sx={{ p: 4, maxWidth: 520 }}>
          <Typography sx={{ color: "#fff", fontSize: "1.1rem", fontWeight: 700, mb: 1 }}>
            Nothing to train yet
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.92rem", lineHeight: 1.65 }}>
            {repertoire.phase === "fetching" || repertoire.phase === "building"
              ? `${repertoire.label}…`
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

  const label = formatLine(hole.line, hole.color);
  const yourTurn = state.act === "confront" || (state.act === "drill" && isUsersPly(line, state.ply));

  return (
    <Shell title={label}>
      <TrainerRail
        line={label}
        steps={railSteps(state, line)}
        streak={state.streak}
        drilling={state.act === "drill"}
        onExit={exit}
      />

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TrainerRailStrip
          line={label}
          steps={railSteps(state, line)}
          streak={state.streak}
          drilling={state.act === "drill"}
          onExit={exit}
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
              orientation={hole.color}
              interactive={yourTurn && state.act !== "done"}
              onPieceDrop={onPieceDrop}
              pieceSet={pieceSet}
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
                      ? `You play ${hole.color === "white" ? "White" : "Black"}`
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
                  : `${hole.games} games`}
              </Typography>
            </Box>
          </Box>

          <TrainerPanel
            state={state}
            line={line}
            hole={hole}
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
