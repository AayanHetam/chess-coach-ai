import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  Grid,
  Divider,
  LinearProgress,
  Card,
  CardContent,
  CardActionArea,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
} from "@mui/material";
import { Chessboard } from "react-chessboard";
import { Chess, Square } from "chess.js";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { ThemeProvider } from "@mui/material/styles";
import Head from "next/head";
import { PageTitle } from "@/components/pageTitle";
import { chessMastiDarkTheme } from "@/theme/chessMasti";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
import { useScreenSize } from "@/hooks/useScreenSize";
import { pieceSetAtom } from "@/components/board/states";
import { Piece, CustomPieces } from "react-chessboard/dist/chessboard/types";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import SchoolIcon from "@mui/icons-material/School";
import ReplayIcon from "@mui/icons-material/Replay";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import AddIcon from "@mui/icons-material/Add";
import type { OpeningRepertoire, OpeningLine, OpeningCourse, OpeningChapter } from "@/types/openings";
import { OPENING_REPERTOIRES, getRepertoiresByColor, getCoursesByColor } from "@/data/repertoires";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RepertoireImport from "@/sections/openings/RepertoireImport";
import { atomWithStorage } from "jotai/utils";

const customRepertoiresAtom = atomWithStorage<OpeningRepertoire[]>(
  "chessMastiCustomRepertoires",
  []
);
import {
  drillProgressAtom,
  getLineProgress,
  calculateNextReview,
  qualityFromDrill,
  isDueForReview,
  countDueReviews,
} from "@/lib/spacedRepetition";

const PIECE_CODES: Piece[] = [
  "wP", "wB", "wN", "wR", "wQ", "wK",
  "bP", "bB", "bN", "bR", "bQ", "bK",
];

type Phase = "browse" | "drill";

export default function Openings() {
  const screenSize = useScreenSize();
  const pieceSet = useAtomValue(pieceSetAtom);
  const [allProgress, setAllProgress] = useAtom(drillProgressAtom);

  const [customRepertoires, setCustomRepertoires] = useAtom(customRepertoiresAtom);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Browse state
  const [colorFilter, setColorFilter] = useState<"white" | "black">("white");
  const [phase, setPhase] = useState<Phase>("browse");
  const [selectedRepertoire, setSelectedRepertoire] = useState<OpeningRepertoire | null>(null);
  const [selectedLine, setSelectedLine] = useState<OpeningLine | null>(null);

  // Drill state
  const [game, setGame] = useState<Chess>(new Chess());
  const [drillMoveIndex, setDrillMoveIndex] = useState(0);
  const [drillStatus, setDrillStatus] = useState<"playing" | "wrong" | "complete">("playing");
  const [hadError, setHadError] = useState(false);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [lastMoveSquares, setLastMoveSquares] = useState<{ from: Square; to: Square } | null>(null);
  const [wrongSquare, setWrongSquare] = useState<Square | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoveSquares, setLegalMoveSquares] = useState<Square[]>([]);
  const [correctMoveHint, setCorrectMoveHint] = useState<string | null>(null);

  const boardSize = useMemo(() => {
    const w = screenSize.width;
    const h = screenSize.height;
    if (!w || !h || w <= 0 || h <= 0) return 400;
    if (typeof window !== "undefined" && window.innerWidth < 1200) {
      return Math.max(Math.min(w - 32, h - 250), 280);
    }
    return Math.max(Math.min(w - 520, h * 0.76, 560), 320);
  }, [screenSize]);

  // Course state
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);

  const filteredCourses = useMemo(
    () => getCoursesByColor(colorFilter),
    [colorFilter]
  );

  const filteredRepertoires = useMemo(
    () => [
      ...getRepertoiresByColor(colorFilter),
      ...customRepertoires.filter((r) => r.color === colorFilter),
    ],
    [colorFilter, customRepertoires]
  );

  // Compute chapter progress
  const getChapterProgress = useCallback(
    (chapter: OpeningChapter) => {
      const rep = chapter.repertoire;
      const total = rep.lines.length;
      const practiced = rep.lines.filter((l) => {
        const key = `${rep.id}/${l.id}`;
        return allProgress[key] && allProgress[key].attempts > 0;
      }).length;
      return { total, practiced, pct: total > 0 ? Math.round((practiced / total) * 100) : 0 };
    },
    [allProgress]
  );

  // Compute course-level progress
  const getCourseProgress = useCallback(
    (course: OpeningCourse) => {
      let total = 0;
      let practiced = 0;
      for (const ch of course.chapters) {
        const p = getChapterProgress(ch);
        total += p.total;
        practiced += p.practiced;
      }
      return { total, practiced, pct: total > 0 ? Math.round((practiced / total) * 100) : 0 };
    },
    [getChapterProgress]
  );

  const handleImportRepertoire = useCallback(
    (rep: OpeningRepertoire) => {
      setCustomRepertoires((prev) => [...prev, rep]);
    },
    [setCustomRepertoires]
  );

  // Start a drill for a specific line
  const startDrill = useCallback(
    (repertoire: OpeningRepertoire, line: OpeningLine) => {
      setSelectedRepertoire(repertoire);
      setSelectedLine(line);
      setBoardOrientation(repertoire.color);
      setPhase("drill");
      setHadError(false);
      setDrillStatus("playing");
      setCorrectMoveHint(null);

      const g = new Chess();
      setGame(g);
      setDrillMoveIndex(0);
      setLastMoveSquares(null);
      setWrongSquare(null);
      setSelectedSquare(null);
      setLegalMoveSquares([]);

      // If user is Black, auto-play White's first move
      if (repertoire.color === "black" && line.moves.length > 0) {
        setTimeout(() => {
          const ng = new Chess();
          try {
            const result = ng.move(line.moves[0]);
            if (result) {
              setGame(ng);
              setDrillMoveIndex(1);
              setLastMoveSquares({ from: result.from as Square, to: result.to as Square });
            }
          } catch { /* chess.js move() can throw on invalid SAN — keep current state */ }
        }, 400);
      }
    },
    []
  );

  // Start a drill shuffle for a chapter (random line)
  const startDrillShuffle = useCallback(
    (chapter: OpeningChapter) => {
      const rep = chapter.repertoire;
      if (rep.lines.length === 0) return;
      const randomLine = rep.lines[Math.floor(Math.random() * rep.lines.length)];
      startDrill(rep, randomLine);
    },
    [startDrill]
  );

  // Play the opponent's response after a correct user move
  const playOpponentResponse = useCallback(
    (currentGame: Chess, nextIdx: number, line: OpeningLine) => {
      if (nextIdx >= line.moves.length) {
        setDrillStatus("complete");
        return;
      }

      setTimeout(() => {
        try {
          const g = new Chess(currentGame.fen());
          const result = g.move(line.moves[nextIdx]);
          if (result) {
            setGame(g);
            setDrillMoveIndex(nextIdx + 1);
            setLastMoveSquares({ from: result.from as Square, to: result.to as Square });

            if (nextIdx + 1 >= line.moves.length) {
              setDrillStatus("complete");
            }
          }
        } catch { /* chess.js move() can throw on invalid SAN — keep current state */ }
      }, 400);
    },
    []
  );

  // Handle completion — record SRS progress
  useEffect(() => {
    if (drillStatus !== "complete" || !selectedRepertoire || !selectedLine) return;

    const userMoves = selectedLine.moves.filter(
      (_, i) =>
        (selectedRepertoire.color === "white" && i % 2 === 0) ||
        (selectedRepertoire.color === "black" && i % 2 === 1)
    ).length;
    const depthReached = hadError ? Math.max(0, drillMoveIndex - 1) : userMoves;
    const quality = qualityFromDrill(hadError, depthReached, userMoves);

    const key = `${selectedRepertoire.id}/${selectedLine.id}`;
    const current = getLineProgress(allProgress, selectedRepertoire.id, selectedLine.id);
    const updated = calculateNextReview(
      { ...current, maxDepthReached: Math.max(current.maxDepthReached, depthReached) },
      quality
    );
    setAllProgress((prev) => ({ ...prev, [key]: updated }));
  }, [drillStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle user piece drop during drill
  const onPieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string): boolean => {
      if (drillStatus !== "playing" || !selectedLine) return false;
      if (drillMoveIndex >= selectedLine.moves.length) return false;

      const expectedSan = selectedLine.moves[drillMoveIndex];
      const from = sourceSquare as Square;
      const to = targetSquare as Square;

      // Try the move
      try {
        const g = new Chess(game.fen());
        // Try all possible promotions to find a match
        let result = g.move({ from, to });
        if (!result) {
          result = g.move({ from, to, promotion: "q" });
        }

        if (result && result.san === expectedSan) {
          setGame(g);
          setLastMoveSquares({ from: result.from as Square, to: result.to as Square });
          setWrongSquare(null);
          setSelectedSquare(null);
          setLegalMoveSquares([]);
          setCorrectMoveHint(null);

          const nextIdx = drillMoveIndex + 1;
          setDrillMoveIndex(nextIdx);

          if (nextIdx >= selectedLine.moves.length) {
            setDrillStatus("complete");
          } else {
            playOpponentResponse(g, nextIdx, selectedLine);
          }
          return true;
        }
      } catch { /* chess.js move() can throw on invalid SAN — fall through to wrong-move handling */ }

      // Wrong move
      setWrongSquare(to);
      setHadError(true);
      setCorrectMoveHint(expectedSan);

      setTimeout(() => {
        setWrongSquare(null);
      }, 1500);

      return false;
    },
    [game, drillStatus, drillMoveIndex, selectedLine, playOpponentResponse]
  );

  // Click-to-move
  const onSquareClick = useCallback(
    (square: Square) => {
      if (drillStatus !== "playing") return;
      if (!selectedSquare) {
        const piece = game.get(square);
        if (piece && piece.color === game.turn()) {
          setSelectedSquare(square);
          const moves = game.moves({ square, verbose: true });
          setLegalMoveSquares(moves.map((m) => m.to as Square));
        }
        return;
      }
      if (selectedSquare === square) {
        setSelectedSquare(null);
        setLegalMoveSquares([]);
        return;
      }
      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square);
        const moves = game.moves({ square, verbose: true });
        setLegalMoveSquares(moves.map((m) => m.to as Square));
        return;
      }
      onPieceDrop(selectedSquare, square);
    },
    [game, drillStatus, selectedSquare, onPieceDrop]
  );

  // Custom pieces
  const customPieces = useMemo(
    () =>
      PIECE_CODES.reduce<CustomPieces>((acc, piece) => {
        acc[piece] = ({ squareWidth }: { squareWidth: number }) => (
          <Box
            width={squareWidth}
            height={squareWidth}
            sx={{
              backgroundImage: `url(/piece/${pieceSet}/${piece}.svg)`,
              backgroundSize: "contain",
            }}
          />
        );
        return acc;
      }, {}),
    [pieceSet]
  );

  // Square styles
  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMoveSquares) {
      styles[lastMoveSquares.from] = { backgroundColor: "rgba(255, 170, 0, 0.4)" };
      styles[lastMoveSquares.to] = { backgroundColor: "rgba(255, 170, 0, 0.5)" };
    }
    if (selectedSquare) {
      styles[selectedSquare] = { backgroundColor: "rgba(20, 85, 180, 0.5)" };
    }
    for (const sq of legalMoveSquares) {
      const existing = styles[sq] || {};
      styles[sq] = {
        ...existing,
        background: `${existing.backgroundColor || ""} radial-gradient(circle, rgba(0,0,0,0.15) 25%, transparent 25%)`.trim(),
      };
    }
    if (wrongSquare) {
      styles[wrongSquare] = { backgroundColor: "rgba(220, 50, 50, 0.6)" };
    }
    return styles;
  }, [lastMoveSquares, selectedSquare, legalMoveSquares, wrongSquare]);

  // ==================== BROWSE VIEW ====================
  if (phase === "browse") {
    return (
      <ThemeProvider theme={chessMastiDarkTheme}>
        <PageTitle title="Chess Masti AI - Opening Training" />
        <Head>
          <meta name="color-scheme" content="dark" />
          <meta name="theme-color" content="#08090C" />
          <style>{`html,body{background-color:#08090C;color-scheme:dark;margin:0;}::-webkit-scrollbar{width:10px;height:10px;}::-webkit-scrollbar-track{background:#08090C;}::-webkit-scrollbar-thumb{background:rgba(249,115,22,0.18);border-radius:5px;}`}</style>
        </Head>

        <GradientBackdrop />

        <Box
          sx={{
            minHeight: "100vh",
            color: "rgba(255,255,255,0.94)",
            pt: 2,
            pb: 4,
            px: { xs: 2, md: 3 },
          }}
        >
          <NavPill active="openings" />
          <Paper
            sx={{
              p: 3,
              mb: 2,
              maxWidth: 1000,
              mx: "auto",
              borderRadius: "1.5rem",
              background: "rgba(20,22,28,0.55)",
              backdropFilter: "blur(14px) saturate(140%)",
              WebkitBackdropFilter: "blur(14px) saturate(140%)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow:
                "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
              overflow: "hidden",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: "12px",
                  bgcolor: "rgba(249,115,22,0.14)",
                  border: "1px solid rgba(249,115,22,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <MenuBookIcon sx={{ color: "#F97316", fontSize: 24 }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: "rgba(255,255,255,0.94)" }}>
                Opening Training
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ mb: 3, color: "rgba(255,255,255,0.62)" }}>
              Master your openings through flashcard-style drills with spaced repetition.
            </Typography>

            {/* Action bar */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3, flexWrap: "wrap", gap: 1 }}>
              <ToggleButtonGroup
                value={colorFilter}
                exclusive
                onChange={(_, val) => val && setColorFilter(val)}
                size="small"
                sx={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: "999px",
                  p: 0.5,
                  gap: 0.5,
                }}
              >
                <ToggleButton
                  value="white"
                  sx={{
                    textTransform: "none",
                    px: 3,
                    border: "none",
                    borderRadius: "999px",
                    color: "rgba(255,255,255,0.62)",
                    "&:hover": { color: "rgba(255,255,255,0.92)" },
                    "&.Mui-selected": {
                      bgcolor: "rgba(249,115,22,0.18)",
                      border: "1px solid rgba(249,115,22,0.4)",
                      color: "#FB923C",
                      boxShadow: "0 0 0 1px rgba(249,115,22,0.18)",
                      "&:hover": { bgcolor: "rgba(249,115,22,0.24)" },
                    },
                  }}
                >
                  White
                </ToggleButton>
                <ToggleButton
                  value="black"
                  sx={{
                    textTransform: "none",
                    px: 3,
                    border: "none",
                    borderRadius: "999px",
                    color: "rgba(255,255,255,0.62)",
                    "&:hover": { color: "rgba(255,255,255,0.92)" },
                    "&.Mui-selected": {
                      bgcolor: "rgba(249,115,22,0.18)",
                      border: "1px solid rgba(249,115,22,0.4)",
                      color: "#FB923C",
                      boxShadow: "0 0 0 1px rgba(249,115,22,0.18)",
                      "&:hover": { bgcolor: "rgba(249,115,22,0.24)" },
                    },
                  }}
                >
                  Black
                </ToggleButton>
              </ToggleButtonGroup>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => setImportDialogOpen(true)}
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: "999px",
                  color: "rgba(255,255,255,0.8)",
                  borderColor: "rgba(255,255,255,0.18)",
                  "&:hover": {
                    borderColor: "rgba(255,255,255,0.32)",
                    bgcolor: "rgba(255,255,255,0.04)",
                  },
                }}
              >
                Import PGN
              </Button>
            </Box>

            {/* ===== COURSES (Chessly-style) ===== */}
            {filteredCourses.length > 0 && (
              <>
                <Typography variant="overline" sx={{ color: "rgba(255,255,255,0.5)", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", mb: 1.5, display: "block" }}>
                  Courses
                </Typography>
                {filteredCourses.map((course) => {
                  const cp = getCourseProgress(course);
                  const isExpanded = expandedCourse === course.id;

                  return (
                    <Card
                      key={course.id}
                      sx={{
                        mb: 2,
                        background: "rgba(20,22,28,0.55)",
                        backdropFilter: "blur(14px) saturate(140%)",
                        WebkitBackdropFilter: "blur(14px) saturate(140%)",
                        border: isExpanded
                          ? "1px solid rgba(249,115,22,0.35)"
                          : "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "1.5rem",
                        boxShadow: isExpanded
                          ? "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(249,115,22,0.18)"
                          : "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
                        overflow: "hidden",
                      }}
                    >
                      {/* Course header — click to expand */}
                      <Box
                        onClick={() => setExpandedCourse(isExpanded ? null : course.id)}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                          p: 2.5,
                          cursor: "pointer",
                          transition: "all 180ms ease",
                          "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
                        }}
                      >
                        {/* Course icon */}
                        <Box
                          sx={{
                            width: 64,
                            height: 64,
                            borderRadius: "1rem",
                            bgcolor: "rgba(249,115,22,0.14)",
                            border: "1px solid rgba(249,115,22,0.3)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <SchoolIcon sx={{ fontSize: 32, color: "#FB923C" }} />
                        </Box>

                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="h6" sx={{ fontWeight: 700, color: "rgba(255,255,255,0.94)", lineHeight: 1.3 }}>
                            {course.name}
                          </Typography>
                          <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.62)", mt: 0.25 }} noWrap>
                            {course.description}
                          </Typography>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 1 }}>
                            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.5)" }}>
                              {course.chapters.length} chapters
                            </Typography>
                            <Typography variant="caption" sx={{ color: cp.pct > 0 ? "#4ADE80" : "rgba(255,255,255,0.5)", fontFamily: "Menlo, Monaco, monospace" }}>
                              {cp.pct}%
                            </Typography>
                            <LinearProgress
                              variant="determinate"
                              value={cp.pct}
                              sx={{
                                flex: 1,
                                height: 5,
                                borderRadius: 3,
                                bgcolor: "rgba(255,255,255,0.1)",
                                "& .MuiLinearProgress-bar": { bgcolor: cp.pct > 0 ? "#4ADE80" : "rgba(255,255,255,0.18)" },
                              }}
                            />
                          </Box>
                        </Box>

                        {isExpanded ? (
                          <ExpandLessIcon sx={{ color: "rgba(255,255,255,0.5)" }} />
                        ) : (
                          <ExpandMoreIcon sx={{ color: "rgba(255,255,255,0.5)" }} />
                        )}
                      </Box>

                      {/* Expanded chapters */}
                      {isExpanded && (
                        <Box sx={{ px: 2.5, pb: 2.5 }}>
                          <Divider sx={{ borderColor: "rgba(255,255,255,0.08)", mb: 1.5 }} />
                          {course.chapters.map((chapter, chIdx) => {
                            const chProg = getChapterProgress(chapter);
                            const isChExpanded = expandedChapter === chapter.id;

                            return (
                              <Box key={chapter.id} sx={{ mb: 0.5 }}>
                                {/* Chapter row */}
                                <Box
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1.5,
                                    p: 1.5,
                                    borderRadius: "12px",
                                    transition: "all 180ms ease",
                                    bgcolor: isChExpanded ? "rgba(255,255,255,0.05)" : "transparent",
                                    "&:hover": { bgcolor: "rgba(255,255,255,0.03)" },
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      color: "rgba(255,255,255,0.5)",
                                      fontWeight: 600,
                                      minWidth: 70,
                                      flexShrink: 0,
                                    }}
                                  >
                                    Chapter {chIdx + 1}
                                  </Typography>

                                  <Box
                                    sx={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                                    onClick={() => setExpandedChapter(isChExpanded ? null : chapter.id)}
                                  >
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: "rgba(255,255,255,0.94)" }}>
                                      {chapter.name}
                                    </Typography>
                                  </Box>

                                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
                                    <Typography variant="caption" sx={{ color: chProg.pct > 0 ? "#4ADE80" : "rgba(255,255,255,0.5)", fontFamily: "Menlo, Monaco, monospace" }}>
                                      {chProg.pct}%
                                    </Typography>
                                    <LinearProgress
                                      variant="determinate"
                                      value={chProg.pct}
                                      sx={{
                                        width: 80,
                                        height: 4,
                                        borderRadius: 2,
                                        bgcolor: "rgba(255,255,255,0.1)",
                                        "& .MuiLinearProgress-bar": { bgcolor: chProg.pct > 0 ? "#4ADE80" : "rgba(255,255,255,0.18)" },
                                      }}
                                    />
                                    <Tooltip
                                      title={`Drill Shuffle — ${chProg.total} lines`}
                                      slotProps={{
                                        tooltip: {
                                          sx: {
                                            bgcolor: "rgba(20,22,28,0.92)",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            backdropFilter: "blur(8px)",
                                            color: "rgba(255,255,255,0.92)",
                                          },
                                        },
                                      }}
                                    >
                                      <Button
                                        size="small"
                                        variant="text"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          startDrillShuffle(chapter);
                                        }}
                                        sx={{
                                          minWidth: 0,
                                          px: 1,
                                          color: "rgba(255,255,255,0.62)",
                                          "&:hover": { color: "#FB923C", bgcolor: "rgba(249,115,22,0.1)" },
                                        }}
                                      >
                                        <ShuffleIcon sx={{ fontSize: 18 }} />
                                      </Button>
                                    </Tooltip>
                                    <Box
                                      onClick={() => setExpandedChapter(isChExpanded ? null : chapter.id)}
                                      sx={{ cursor: "pointer", display: "flex", alignItems: "center" }}
                                    >
                                      {isChExpanded ? (
                                        <ExpandLessIcon sx={{ fontSize: 20, color: "rgba(255,255,255,0.5)" }} />
                                      ) : (
                                        <ExpandMoreIcon sx={{ fontSize: 20, color: "rgba(255,255,255,0.5)" }} />
                                      )}
                                    </Box>
                                  </Box>
                                </Box>

                                {/* Expanded chapter description */}
                                {isChExpanded && (
                                  <Box sx={{ pl: 10, pr: 2, pb: 1 }}>
                                    <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.62)", fontSize: "0.82rem", mb: 1 }}>
                                      {chapter.description}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.5)" }}>
                                      {chProg.total} lines · {chProg.practiced} practiced
                                    </Typography>
                                  </Box>
                                )}
                              </Box>
                            );
                          })}
                        </Box>
                      )}
                    </Card>
                  );
                })}
              </>
            )}

          </Paper>

          {/* PGN Import Dialog */}
          <RepertoireImport
            open={importDialogOpen}
            onClose={() => setImportDialogOpen(false)}
            onImport={handleImportRepertoire}
          />
        </Box>
      </ThemeProvider>
    );
  }

  // ==================== DRILL VIEW ====================
  if (!selectedRepertoire || !selectedLine) return null;

  const userMovesInLine = selectedLine.moves.filter(
    (_, i) =>
      (selectedRepertoire.color === "white" && i % 2 === 0) ||
      (selectedRepertoire.color === "black" && i % 2 === 1)
  );
  const progressPct = (drillMoveIndex / selectedLine.moves.length) * 100;

  return (
    <ThemeProvider theme={chessMastiDarkTheme}>
      <PageTitle title={`Chess Masti AI - Drill: ${selectedLine.name}`} />
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#08090C" />
        <style>{`html,body{background-color:#08090C;color-scheme:dark;margin:0;}::-webkit-scrollbar{width:10px;height:10px;}::-webkit-scrollbar-track{background:#08090C;}::-webkit-scrollbar-thumb{background:rgba(249,115,22,0.18);border-radius:5px;}`}</style>
      </Head>

      <GradientBackdrop />

      <Box
        sx={{
          minHeight: "100vh",
          color: "rgba(255,255,255,0.94)",
          pt: 2,
          pb: 4,
          px: { xs: 2, md: 3 },
        }}
      >
        <NavPill active="openings" />
        <Box sx={{ maxWidth: 1200, mx: "auto" }}>
          {/* Header */}
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
              borderRadius: "1.5rem",
              color: "rgba(255,255,255,0.94)",
              background: "rgba(20,22,28,0.55)",
              backdropFilter: "blur(14px) saturate(140%)",
              WebkitBackdropFilter: "blur(14px) saturate(140%)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow:
                "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
              overflow: "hidden",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <SchoolIcon sx={{ color: "#FB923C" }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2, color: "rgba(255,255,255,0.94)" }}>
                  {selectedRepertoire.name}: {selectedLine.name}
                </Typography>
                <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.5)" }}>
                  {selectedLine.description}
                </Typography>
              </Box>
            </Box>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setPhase("browse")}
              sx={{
                color: "rgba(255,255,255,0.8)",
                borderColor: "rgba(255,255,255,0.18)",
                borderRadius: "999px",
                "&:hover": { borderColor: "rgba(255,255,255,0.32)", bgcolor: "rgba(255,255,255,0.04)" },
                textTransform: "none",
              }}
            >
              Back to Repertoires
            </Button>
          </Paper>

          {/* Progress bar */}
          <LinearProgress
            variant="determinate"
            value={progressPct}
            sx={{
              mb: 2,
              height: 6,
              borderRadius: 3,
              bgcolor: "rgba(255,255,255,0.1)",
              "& .MuiLinearProgress-bar": {
                bgcolor: drillStatus === "complete" ? "#4ADE80" : "#F97316",
              },
            }}
          />

          {/* Board + info */}
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", lg: "row" },
              gap: 2,
              alignItems: "flex-start",
              justifyContent: "center",
            }}
          >
            {/* Board */}
            <Box>
              {/* Status bar */}
              <Box
                sx={{
                  mb: 1,
                  px: 1.5,
                  py: 0.75,
                  borderRadius: "12px",
                  bgcolor:
                    drillStatus === "complete"
                      ? "rgba(74,222,128,0.16)"
                      : wrongSquare
                      ? "rgba(248,113,113,0.16)"
                      : "rgba(255,255,255,0.05)",
                  border:
                    drillStatus === "complete"
                      ? "1px solid rgba(74,222,128,0.4)"
                      : wrongSquare
                      ? "1px solid rgba(248,113,113,0.45)"
                      : "1px solid rgba(255,255,255,0.08)",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                {drillStatus === "playing" && !wrongSquare && (
                  <Box
                    sx={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      bgcolor: game.turn() === "w" ? "#fff" : "#333",
                      border: "2px solid",
                      borderColor: "rgba(255,255,255,0.4)",
                      flexShrink: 0,
                    }}
                  />
                )}
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    color:
                      drillStatus === "complete"
                        ? "#86EFAC"
                        : wrongSquare
                        ? "#FCA5A5"
                        : "rgba(255,255,255,0.94)",
                  }}
                >
                  {drillStatus === "complete"
                    ? hadError
                      ? "Line complete (with mistakes)"
                      : "Perfect! Line mastered!"
                    : wrongSquare
                    ? `Wrong — the correct move is ${correctMoveHint || "..."}`
                    : `Play the ${selectedRepertoire.color === "white" ? "white" : "black"} move`}
                </Typography>
              </Box>

              <Box
                sx={{
                  p: 1,
                  borderRadius: "1.5rem",
                  background: "rgba(20,22,28,0.55)",
                  backdropFilter: "blur(14px) saturate(140%)",
                  WebkitBackdropFilter: "blur(14px) saturate(140%)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
                }}
              >
                <Box sx={{ width: boardSize }}>
                  <Chessboard
                    id="OpeningDrillBoard"
                  position={game.fen()}
                  onPieceDrop={onPieceDrop}
                  onSquareClick={onSquareClick}
                  boardOrientation={boardOrientation}
                  boardWidth={boardSize}
                  customBoardStyle={{
                    borderRadius: "4px",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
                  }}
                  customSquareStyles={customSquareStyles}
                  customPieces={customPieces}
                  isDraggablePiece={({ piece }) => {
                    if (drillStatus !== "playing") return false;
                    const color = piece[0] === "w" ? "w" : "b";
                    return color === game.turn();
                  }}
                  animationDuration={200}
                />
                </Box>
              </Box>
            </Box>

            {/* Info panel */}
            <Paper
              sx={{
                p: 2.5,
                borderRadius: "1.5rem",
                background: "rgba(20,22,28,0.55)",
                backdropFilter: "blur(14px) saturate(140%)",
                WebkitBackdropFilter: "blur(14px) saturate(140%)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow:
                  "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
                overflow: "hidden",
                flex: 1,
                minWidth: 0,
                maxWidth: { lg: 360 },
                width: { xs: "100%", lg: "auto" },
              }}
            >
              {/* Move list */}
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.5)", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", mb: 1, display: "block" }}>
                MOVES
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 2 }}>
                {selectedLine.moves.map((move, i) => {
                  const isUserMove =
                    (selectedRepertoire.color === "white" && i % 2 === 0) ||
                    (selectedRepertoire.color === "black" && i % 2 === 1);
                  const isPlayed = i < drillMoveIndex;
                  const isCurrent = i === drillMoveIndex;
                  const moveNum = Math.floor(i / 2) + 1;
                  const showNum = i % 2 === 0;

                  return (
                    <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                      {showNum && (
                        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.5)", mr: 0.25 }}>
                          {moveNum}.
                        </Typography>
                      )}
                      <Chip
                        label={isPlayed || !isUserMove ? move : isCurrent ? "?" : "..."}
                        size="small"
                        sx={{
                          height: 24,
                          fontSize: "0.75rem",
                          fontWeight: isUserMove ? 700 : 400,
                          bgcolor: isPlayed
                            ? isUserMove
                              ? "rgba(74,222,128,0.16)"
                              : "rgba(255,255,255,0.06)"
                            : isCurrent
                            ? "rgba(249,115,22,0.18)"
                            : "rgba(255,255,255,0.04)",
                          color: isPlayed
                            ? isUserMove
                              ? "#86EFAC"
                              : "rgba(255,255,255,0.7)"
                            : isCurrent
                            ? "#FB923C"
                            : "rgba(255,255,255,0.5)",
                          border: isCurrent ? "1px solid" : "none",
                          borderColor: "rgba(249,115,22,0.4)",
                        }}
                      />
                    </Box>
                  );
                })}
              </Box>

              <Divider sx={{ borderColor: "rgba(255,255,255,0.08)", my: 2 }} />

              {/* Themes */}
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.5)", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", mb: 1, display: "block" }}>
                STRATEGIC THEMES
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 2 }}>
                {selectedRepertoire.themes.map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    size="small"
                    sx={{ bgcolor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", fontSize: "0.72rem" }}
                  />
                ))}
              </Box>

              {/* Action buttons */}
              {drillStatus === "complete" && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 2 }}>
                  <Button
                    variant="contained"
                    startIcon={<ReplayIcon />}
                    onClick={() => startDrill(selectedRepertoire, selectedLine)}
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
                    Drill Again
                  </Button>
                  {/* Next line button */}
                  {(() => {
                    const currentIdx = selectedRepertoire.lines.findIndex((l) => l.id === selectedLine.id);
                    const nextLine = selectedRepertoire.lines[currentIdx + 1];
                    if (nextLine) {
                      return (
                        <Button
                          variant="outlined"
                          endIcon={<ArrowForwardIcon />}
                          onClick={() => startDrill(selectedRepertoire, nextLine)}
                          sx={{
                            textTransform: "none",
                            borderRadius: "999px",
                            color: "rgba(255,255,255,0.8)",
                            borderColor: "rgba(255,255,255,0.18)",
                            "&:hover": { borderColor: "rgba(255,255,255,0.32)", bgcolor: "rgba(255,255,255,0.04)" },
                          }}
                        >
                          Next: {nextLine.name}
                        </Button>
                      );
                    }
                    return null;
                  })()}
                  <Button
                    variant="text"
                    onClick={() => setPhase("browse")}
                    sx={{ textTransform: "none", color: "rgba(255,255,255,0.62)", "&:hover": { color: "rgba(255,255,255,0.9)" } }}
                  >
                    Back to Repertoires
                  </Button>
                </Box>
              )}
            </Paper>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
