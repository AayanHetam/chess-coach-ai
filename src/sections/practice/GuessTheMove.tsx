import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Typography, Button, Paper, Chip } from "@mui/material";
import { Chess } from "chess.js";
import { useAtomValue } from "jotai";
import CasinoIcon from "@mui/icons-material/Casino";
import PsychologyAltIcon from "@mui/icons-material/PsychologyAlt";
import { useScreenSize } from "@/hooks/useScreenSize";
import { pieceSetAtom } from "@/components/board/states";
import { PuzzleBoardSurface } from "@/components/puzzle/PuzzleBoardSurface";
import { GUESS_THE_MOVE_GAMES, type GuessTheMoveGame } from "@/data/guessTheMoveGames";

/**
 * Guess the Move — step through a real master game, guessing the next move
 * for the side you picked before it's revealed. The opponent's (and any
 * wrong guess's real) moves auto-play with a short pause so the game still
 * reads as a game, not a puzzle set.
 *
 * Reuses PuzzleBoardSurface for the board purely as a presentational click-
 * to-move surface (its own contract: "owns ONLY the visual board + click-to-
 * move UX ... the PARENT owns all chess/solve state and grading") — this
 * component is exactly that parent, judging each attempt against the
 * game's real move rather than a puzzle solution line.
 */

const OPPONENT_MOVE_DELAY_MS = 700;
const REVEAL_DELAY_MS = 1100;
const WRONG_FLASH_MS = 450;

interface GuessTheMoveProps {
  onBack: () => void;
}

type Phase = "setup" | "playing" | "finished";
type Side = "w" | "b";

export default function GuessTheMove({ onBack }: GuessTheMoveProps) {
  const screenSize = useScreenSize();
  const pieceSet = useAtomValue(pieceSetAtom);

  const [phase, setPhase] = useState<Phase>("setup");
  const [selectedGameId, setSelectedGameId] = useState(GUESS_THE_MOVE_GAMES[0].id);
  const [userColor, setUserColor] = useState<Side>("w");

  const selectedGame = useMemo(
    () => GUESS_THE_MOVE_GAMES.find((g) => g.id === selectedGameId)!,
    [selectedGameId],
  );

  const [game, setGame] = useState<Chess>(() => new Chess());
  const [moveIndex, setMoveIndex] = useState(0);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [revealedSan, setRevealedSan] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [userMoveCount, setUserMoveCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const boardSize = useMemo(() => {
    const width = screenSize.width;
    const height = screenSize.height;
    if (!width || !height || width <= 0 || height <= 0) return 400;
    if (typeof window !== "undefined" && window.innerWidth < 900) {
      return Math.max(Math.min(width - 32, height - 320), 260);
    }
    return Math.max(Math.min(width - 520, height * 0.68, 520), 320);
  }, [screenSize]);

  const totalMoves = selectedGame.moves.length;
  const isUsersTurn = phase === "playing" && !busy && game.turn() === userColor;

  const pickRandomGame = useCallback(() => {
    const others = GUESS_THE_MOVE_GAMES.filter((g) => g.id !== selectedGameId);
    const pool = others.length ? others : GUESS_THE_MOVE_GAMES;
    setSelectedGameId(pool[Math.floor(Math.random() * pool.length)].id);
  }, [selectedGameId]);

  const handleStart = useCallback(() => {
    setGame(new Chess());
    setMoveIndex(0);
    setLastMove(null);
    setFeedback(null);
    setRevealedSan(null);
    setScore(0);
    setUserMoveCount(0);
    setBusy(false);
    setPhase("playing");
  }, []);

  // Advance exactly one ply by replaying the game's real move at moveIndex.
  // Used both for the opponent's own moves and to reveal the correct move
  // after a wrong guess — same mechanic either way.
  const advanceOneMove = useCallback(() => {
    // Index off the moveIndex STATE, not chess.js's own history() — every
    // `new Chess(fen)` below starts a fresh instance with an empty history
    // (a FEN encodes only the position, not how it was reached), so
    // history().length after one .move() call is always 1 regardless of how
    // many plies actually preceded it. moveIndex is the real ply counter.
    setMoveIndex((idx) => {
      const san = selectedGame.moves[idx];
      if (!san) return idx;
      setGame((prev) => {
        const next = new Chess(prev.fen());
        const result = next.move(san);
        if (result) setLastMove({ from: result.from, to: result.to });
        return next;
      });
      return idx + 1;
    });
    setFeedback(null);
    setRevealedSan(null);
    setBusy(false);
  }, [selectedGame]);

  // Opponent's turn: auto-play after a short pause so the game still reads
  // as a game rather than a rapid-fire quiz.
  useEffect(() => {
    if (phase !== "playing") return;
    if (moveIndex >= totalMoves) {
      setPhase("finished");
      return;
    }
    if (game.turn() === userColor) return; // waiting on the human
    setBusy(true);
    const t = setTimeout(advanceOneMove, OPPONENT_MOVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [phase, moveIndex, totalMoves, game, userColor, advanceOneMove]);

  const handlePieceDrop = useCallback(
    (from: string, to: string): boolean => {
      if (!isUsersTurn) return false;
      const attempt = new Chess(game.fen());
      let result;
      try {
        result = attempt.move({ from, to, promotion: "q" });
      } catch {
        return false;
      }
      if (!result) return false;

      const expectedSan = selectedGame.moves[moveIndex];
      setUserMoveCount((c) => c + 1);

      if (result.san === expectedSan) {
        setScore((s) => s + 1);
        setLastMove({ from: result.from, to: result.to });
        setFeedback("correct");
        setGame(attempt);
        setMoveIndex((i) => i + 1);
        setBusy(true);
        setTimeout(() => setFeedback(null), 400);
        return true;
      }

      // Wrong: snap back, flash red, then reveal what was actually played.
      setFeedback("wrong");
      setRevealedSan(expectedSan);
      setBusy(true);
      setTimeout(() => {
        setTimeout(advanceOneMove, REVEAL_DELAY_MS - WRONG_FLASH_MS);
      }, WRONG_FLASH_MS);
      return false;
    },
    [isUsersTurn, game, selectedGame, moveIndex, advanceOneMove],
  );

  const accuracy = userMoveCount > 0 ? Math.round((score / userMoveCount) * 100) : 0;

  // ---- SETUP SCREEN ----
  if (phase === "setup") {
    return (
      <Paper
        sx={{
          p: 4,
          maxWidth: 640,
          mx: "auto",
          borderRadius: "1.5rem",
          background: "rgba(20,22,28,0.55)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
          <PsychologyAltIcon sx={{ color: "#FDE047", fontSize: 32 }} />
          <Typography variant="h5" sx={{ fontWeight: 700, color: "rgba(255,255,255,0.94)" }}>
            Guess the Move
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Pick a real master game and a side. When it&rsquo;s your side&rsquo;s
          turn, guess the move before it&rsquo;s revealed. Guess wrong and
          you&rsquo;ll see what the master actually played, then the game
          continues.
        </Typography>

        <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", mb: 1 }}>
          Game
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mb: 3 }}>
          {GUESS_THE_MOVE_GAMES.map((g) => (
            <Paper
              key={g.id}
              onClick={() => setSelectedGameId(g.id)}
              sx={{
                p: 1.5,
                cursor: "pointer",
                borderRadius: "0.85rem",
                border:
                  selectedGameId === g.id
                    ? "1px solid rgba(250,204,21,0.4)"
                    : "1px solid rgba(255,255,255,0.08)",
                background:
                  selectedGameId === g.id
                    ? "rgba(250,204,21,0.1)"
                    : "rgba(255,255,255,0.03)",
                transition: "all 160ms ease",
              }}
            >
              <Typography sx={{ fontWeight: 700, fontSize: "0.88rem", color: "rgba(255,255,255,0.92)" }}>
                {g.white} vs {g.black}
              </Typography>
              <Typography sx={{ fontSize: "0.74rem", color: "rgba(255,255,255,0.5)" }}>
                {g.event}, {g.year} · {g.result} · {g.moves.length} moves
              </Typography>
            </Paper>
          ))}
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
          <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>
            Play as
          </Typography>
          {(["w", "b"] as Side[]).map((side) => (
            <Chip
              key={side}
              label={side === "w" ? "White" : "Black"}
              onClick={() => setUserColor(side)}
              sx={{
                fontWeight: 700,
                bgcolor: userColor === side ? "rgba(250,204,21,0.18)" : "rgba(255,255,255,0.05)",
                color: userColor === side ? "#FDE047" : "rgba(255,255,255,0.6)",
                border: userColor === side ? "1px solid rgba(250,204,21,0.4)" : "1px solid rgba(255,255,255,0.1)",
              }}
            />
          ))}
          <Button
            size="small"
            startIcon={<CasinoIcon />}
            onClick={pickRandomGame}
            sx={{ ml: "auto", textTransform: "none", color: "rgba(255,255,255,0.55)" }}
          >
            Random
          </Button>
        </Box>

        <Box sx={{ display: "flex", gap: 2 }}>
          <Button
            variant="outlined"
            onClick={onBack}
            sx={{
              textTransform: "none",
              color: "rgba(255,255,255,0.85)",
              borderColor: "rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.04)",
              "&:hover": {
                borderColor: "rgba(250,204,21,0.4)",
                color: "#FDE047",
                background: "rgba(250,204,21,0.1)",
              },
            }}
          >
            Back
          </Button>
          <Button
            variant="contained"
            size="large"
            onClick={handleStart}
            startIcon={<PsychologyAltIcon />}
            sx={{
              px: 4,
              fontWeight: 700,
              textTransform: "none",
              borderRadius: "999px",
              bgcolor: "#F97316",
              color: "#0A0A0A",
              boxShadow: "0 6px 18px rgba(249,115,22,0.32)",
              "&:hover": { bgcolor: "#FB923C" },
            }}
          >
            Start
          </Button>
        </Box>
      </Paper>
    );
  }

  // ---- FINISHED SCREEN ----
  if (phase === "finished") {
    return (
      <Paper
        sx={{
          p: 4,
          maxWidth: 480,
          mx: "auto",
          textAlign: "center",
          borderRadius: "1.5rem",
          background: "rgba(20,22,28,0.55)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: "rgba(255,255,255,0.94)" }}>
          Game Complete!
        </Typography>
        <Typography variant="h2" sx={{ fontWeight: 800, color: "success.light", mb: 1 }}>
          {accuracy}%
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {score} of {userMoveCount} moves guessed like{" "}
          {userColor === "w" ? selectedGame.white : selectedGame.black}
        </Typography>
        <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
          <Button
            variant="outlined"
            onClick={() => setPhase("setup")}
            sx={{
              textTransform: "none",
              color: "rgba(255,255,255,0.85)",
              borderColor: "rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.04)",
            }}
          >
            Back to Setup
          </Button>
          <Button
            variant="contained"
            onClick={handleStart}
            startIcon={<PsychologyAltIcon />}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              borderRadius: "999px",
              bgcolor: "#F97316",
              color: "#0A0A0A",
              boxShadow: "0 6px 18px rgba(249,115,22,0.32)",
              "&:hover": { bgcolor: "#FB923C" },
            }}
          >
            Play Again
          </Button>
        </Box>
      </Paper>
    );
  }

  // ---- PLAYING SCREEN ----
  return (
    <Box sx={{ maxWidth: 760, mx: "auto" }}>
      <Paper
        sx={{
          px: 2,
          py: 1.5,
          mb: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1,
          borderRadius: "1rem",
          background: "rgba(20,22,28,0.55)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.94)",
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>
          {selectedGame.white} vs {selectedGame.black}{" "}
          <Box component="span" sx={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>
            · {selectedGame.event} {selectedGame.year}
          </Box>
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Typography sx={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.55)" }}>
            Score{" "}
            <Box component="span" sx={{ color: "success.light", fontWeight: 700, fontFamily: "Monaco, monospace" }}>
              {score}/{userMoveCount}
            </Box>
          </Typography>
          <Button
            size="small"
            onClick={() => setPhase("finished")}
            sx={{ textTransform: "none", color: "rgba(255,255,255,0.55)" }}
          >
            End
          </Button>
        </Box>
      </Paper>

      <Box
        sx={{
          mb: 1.5,
          px: 2,
          py: 1,
          borderRadius: "0.85rem",
          textAlign: "center",
          bgcolor:
            feedback === "correct"
              ? "success.dark"
              : feedback === "wrong"
                ? "error.dark"
                : "rgba(255,255,255,0.05)",
          color: "#fff",
          fontWeight: 600,
          fontSize: "0.88rem",
        }}
      >
        {feedback === "correct" && "Correct! That's what was played."}
        {feedback === "wrong" && revealedSan && `Not quite — the actual move was ${revealedSan}.`}
        {!feedback &&
          (isUsersTurn
            ? `Your move — what did ${userColor === "w" ? selectedGame.white : selectedGame.black} play here?`
            : "Opponent is thinking…")}
      </Box>

      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <PuzzleBoardSurface
          boardId="GuessTheMoveBoard"
          fen={game.fen()}
          orientation={userColor === "w" ? "white" : "black"}
          interactive={isUsersTurn}
          onPieceDrop={handlePieceDrop}
          lastMove={lastMove}
          boardWidth={boardSize}
          pieceSet={pieceSet}
          animationMs={200}
        />
      </Box>
    </Box>
  );
}
