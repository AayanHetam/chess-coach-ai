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
import { PageTitle } from "@/components/pageTitle";
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
      <>
        <PageTitle title="Chess Masti AI - Opening Training" />
        <Box sx={{ width: "100%", maxWidth: "100vw", p: { xs: 1, md: 2 } }}>
          <Paper sx={{ p: 3, mb: 2, maxWidth: 1000, mx: "auto" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
              <MenuBookIcon sx={{ color: "primary.main", fontSize: 28 }} />
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Opening Training
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Master your openings through flashcard-style drills with spaced repetition.
            </Typography>

            {/* Action bar */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3, flexWrap: "wrap", gap: 1 }}>
              <ToggleButtonGroup
                value={colorFilter}
                exclusive
                onChange={(_, val) => val && setColorFilter(val)}
                size="small"
              >
                <ToggleButton value="white" sx={{ textTransform: "none", px: 3 }}>White</ToggleButton>
                <ToggleButton value="black" sx={{ textTransform: "none", px: 3 }}>Black</ToggleButton>
              </ToggleButtonGroup>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => setImportDialogOpen(true)}
                sx={{ textTransform: "none", fontWeight: 600 }}
              >
                Import PGN
              </Button>
            </Box>

            {/* ===== COURSES (Chessly-style) ===== */}
            {filteredCourses.length > 0 && (
              <>
                <Typography variant="overline" sx={{ color: "grey.500", fontWeight: 700, letterSpacing: 1.5, mb: 1.5, display: "block" }}>
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
                        border: "1px solid",
                        borderColor: isExpanded ? "primary.dark" : "grey.800",
                        bgcolor: "grey.900",
                        borderRadius: 3,
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
                          "&:hover": { bgcolor: "rgba(255,255,255,0.02)" },
                        }}
                      >
                        {/* Course icon */}
                        <Box
                          sx={{
                            width: 64,
                            height: 64,
                            borderRadius: 2,
                            bgcolor: "primary.dark",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <SchoolIcon sx={{ fontSize: 32, color: "primary.light" }} />
                        </Box>

                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="h6" sx={{ fontWeight: 700, color: "grey.100", lineHeight: 1.3 }}>
                            {course.name}
                          </Typography>
                          <Typography variant="body2" sx={{ color: "grey.400", mt: 0.25 }} noWrap>
                            {course.description}
                          </Typography>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 1 }}>
                            <Typography variant="caption" sx={{ color: "grey.500" }}>
                              {course.chapters.length} chapters
                            </Typography>
                            <Typography variant="caption" sx={{ color: cp.pct > 0 ? "success.light" : "grey.500" }}>
                              {cp.pct}%
                            </Typography>
                            <LinearProgress
                              variant="determinate"
                              value={cp.pct}
                              sx={{
                                flex: 1,
                                height: 5,
                                borderRadius: 3,
                                bgcolor: "grey.800",
                                "& .MuiLinearProgress-bar": { bgcolor: cp.pct > 0 ? "success.main" : "grey.700" },
                              }}
                            />
                          </Box>
                        </Box>

                        {isExpanded ? (
                          <ExpandLessIcon sx={{ color: "grey.500" }} />
                        ) : (
                          <ExpandMoreIcon sx={{ color: "grey.500" }} />
                        )}
                      </Box>

                      {/* Expanded chapters */}
                      {isExpanded && (
                        <Box sx={{ px: 2.5, pb: 2.5 }}>
                          <Divider sx={{ borderColor: "grey.800", mb: 1.5 }} />
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
                                    borderRadius: 2,
                                    bgcolor: isChExpanded ? "rgba(255,255,255,0.03)" : "transparent",
                                    "&:hover": { bgcolor: "rgba(255,255,255,0.03)" },
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      color: "grey.500",
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
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: "grey.200" }}>
                                      {chapter.name}
                                    </Typography>
                                  </Box>

                                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
                                    <Typography variant="caption" sx={{ color: chProg.pct > 0 ? "success.light" : "grey.600" }}>
                                      {chProg.pct}%
                                    </Typography>
                                    <LinearProgress
                                      variant="determinate"
                                      value={chProg.pct}
                                      sx={{
                                        width: 80,
                                        height: 4,
                                        borderRadius: 2,
                                        bgcolor: "grey.800",
                                        "& .MuiLinearProgress-bar": { bgcolor: chProg.pct > 0 ? "success.main" : "grey.700" },
                                      }}
                                    />
                                    <Tooltip title={`Drill Shuffle — ${chProg.total} lines`}>
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
                                          color: "grey.400",
                                          "&:hover": { color: "primary.main", bgcolor: "rgba(255,107,53,0.08)" },
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
                                        <ExpandLessIcon sx={{ fontSize: 20, color: "grey.500" }} />
                                      ) : (
                                        <ExpandMoreIcon sx={{ fontSize: 20, color: "grey.500" }} />
                                      )}
                                    </Box>
                                  </Box>
                                </Box>

                                {/* Expanded chapter description */}
                                {isChExpanded && (
                                  <Box sx={{ pl: 10, pr: 2, pb: 1 }}>
                                    <Typography variant="body2" sx={{ color: "grey.400", fontSize: "0.82rem", mb: 1 }}>
                                      {chapter.description}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: "grey.600" }}>
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
      </>
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
    <>
      <PageTitle title={`Chess Masti AI - Drill: ${selectedLine.name}`} />
      <Box sx={{ width: "100%", maxWidth: "100vw", p: { xs: 1, md: 2 } }}>
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
              bgcolor: "grey.900",
              color: "grey.100",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <SchoolIcon sx={{ color: "primary.main" }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {selectedRepertoire.name}: {selectedLine.name}
                </Typography>
                <Typography variant="caption" sx={{ color: "grey.500" }}>
                  {selectedLine.description}
                </Typography>
              </Box>
            </Box>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setPhase("browse")}
              sx={{
                color: "grey.300",
                borderColor: "grey.700",
                "&:hover": { borderColor: "grey.500", bgcolor: "grey.800" },
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
              bgcolor: "grey.800",
              "& .MuiLinearProgress-bar": {
                bgcolor: drillStatus === "complete" ? "success.main" : "primary.main",
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
                  borderRadius: 1,
                  bgcolor:
                    drillStatus === "complete"
                      ? "success.dark"
                      : wrongSquare
                      ? "error.dark"
                      : "grey.800",
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
                      borderColor: "grey.500",
                      flexShrink: 0,
                    }}
                  />
                )}
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    color: drillStatus === "complete" || wrongSquare ? "#fff" : "grey.300",
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

            {/* Info panel */}
            <Paper
              sx={{
                p: 2.5,
                bgcolor: "grey.900",
                borderRadius: 2,
                flex: 1,
                minWidth: 0,
                maxWidth: { lg: 360 },
                width: { xs: "100%", lg: "auto" },
              }}
            >
              {/* Move list */}
              <Typography variant="caption" sx={{ color: "grey.500", fontWeight: 600, mb: 1, display: "block" }}>
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
                        <Typography variant="caption" sx={{ color: "grey.600", mr: 0.25 }}>
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
                              ? "rgba(76,175,80,0.15)"
                              : "rgba(255,255,255,0.05)"
                            : isCurrent
                            ? "rgba(25,118,210,0.15)"
                            : "rgba(255,255,255,0.03)",
                          color: isPlayed
                            ? isUserMove
                              ? "success.light"
                              : "grey.400"
                            : isCurrent
                            ? "primary.light"
                            : "grey.600",
                          border: isCurrent ? "1px solid" : "none",
                          borderColor: "primary.dark",
                        }}
                      />
                    </Box>
                  );
                })}
              </Box>

              <Divider sx={{ borderColor: "grey.800", my: 2 }} />

              {/* Themes */}
              <Typography variant="caption" sx={{ color: "grey.500", fontWeight: 600, mb: 1, display: "block" }}>
                STRATEGIC THEMES
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 2 }}>
                {selectedRepertoire.themes.map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    size="small"
                    sx={{ bgcolor: "grey.800", color: "grey.300", fontSize: "0.72rem" }}
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
                    sx={{ textTransform: "none", fontWeight: 600 }}
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
                          sx={{ textTransform: "none" }}
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
                    sx={{ textTransform: "none", color: "grey.400" }}
                  >
                    Back to Repertoires
                  </Button>
                </Box>
              )}
            </Paper>
          </Box>
        </Box>
      </Box>
    </>
  );
}
