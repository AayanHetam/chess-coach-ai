"use client";

import { useMemo, useState } from "react";
import { Box, Button, Collapse, Stack, Typography } from "@mui/material";
import { Chess } from "chess.js";
import { ChevronDown, Target } from "lucide-react";
import { motion } from "framer-motion";
import type { PuzzleContext } from "@/lib/validation/puzzleChatSchemas";
import { PuzzleBoardSurface } from "@/components/puzzle/PuzzleBoardSurface";
import { prettyTheme } from "@/components/puzzle/prettyTheme";

/**
 * PuzzleDrillMenu — the "drill more like this" set, as an opt-in drag-down
 * instead of a forced queue. Closed by default; tapping the header reveals
 * up to three previewed puzzles, each a non-interactive mini board. "Open"
 * loads that puzzle onto the main board (the parent owns the jump).
 *
 * Lives in the coach chat column on /puzzles. Each preview renders from the
 * student's starting position (the opponent's setup move already applied) so
 * the thumbnail matches what the user will see when it opens.
 */

const MINI_BOARD_WIDTH = 140;

/** Apply the opponent's setup move (solution[0]) to get the student's POV. */
function studentStartFen(puzzle: PuzzleContext): string {
  try {
    const g = new Chess(puzzle.fen);
    const opp = puzzle.solution[0];
    if (opp) {
      g.move({
        from: opp.slice(0, 2),
        to: opp.slice(2, 4),
        promotion: opp.length > 4 ? opp.slice(4, 5).toLowerCase() : undefined,
      });
    }
    return g.fen();
  } catch {
    return puzzle.fen;
  }
}

interface PuzzleDrillMenuProps {
  puzzles: PuzzleContext[];
  onPick: (id: string) => void;
}

export function PuzzleDrillMenu({ puzzles, onPick }: PuzzleDrillMenuProps) {
  const [open, setOpen] = useState(false);
  const set = useMemo(() => puzzles.slice(0, 3), [puzzles]);
  if (set.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, transform: "translateY(8px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{ duration: 0.3, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
    >
      <Box sx={{ mt: 1.5, pl: { xs: 0, sm: 4.5 } }}>
        {/* Drag-down header */}
        <Button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="puzzle-drill-panel"
          startIcon={<Target size={15} />}
          endIcon={
            <ChevronDown
              size={16}
              style={{
                transform: open ? "rotate(180deg)" : "none",
                transition: "transform 220ms cubic-bezier(0.23,1,0.32,1)",
              }}
            />
          }
          sx={{
            px: 2.25,
            py: 1,
            borderRadius: "999px",
            background:
              "linear-gradient(135deg, rgba(255,122,26,0.18), rgba(255,140,66,0.08))",
            border: "1px solid rgba(255,122,26,0.4)",
            color: "#FFD1A8",
            fontWeight: 600,
            fontSize: "0.85rem",
            textTransform: "none",
            "&:hover": {
              background:
                "linear-gradient(135deg, rgba(255,122,26,0.28), rgba(255,140,66,0.14))",
              borderColor: "rgba(255,122,26,0.6)",
              boxShadow: "0 0 0 4px rgba(255,122,26,0.08)",
            },
            transition: "all 200ms cubic-bezier(0.23, 1, 0.32, 1)",
          }}
        >
          Drill {set.length} more like this
        </Button>

        <Collapse in={open} timeout={260} unmountOnExit id="puzzle-drill-panel">
          <Stack spacing={1.25} sx={{ mt: 1.5 }}>
            {set.map((p, i) => (
              <Box
                key={p.id}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  p: 1.25,
                  borderRadius: "1rem",
                  background: "rgba(22,18,14,0.55)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  transition: "border-color 180ms ease-out",
                  "&:hover": { borderColor: "rgba(255,122,26,0.35)" },
                }}
              >
                <Box
                  sx={{
                    flexShrink: 0,
                    width: MINI_BOARD_WIDTH,
                    borderRadius: "0.65rem",
                    overflow: "hidden",
                    boxShadow: "0 0 0 1px rgba(255,255,255,0.06)",
                  }}
                >
                  <MiniBoard puzzle={p} />
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "rgba(255,240,224,0.92)",
                    }}
                  >
                    {prettyTheme(p.themes)}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "0.72rem",
                      color: "rgba(255,240,224,0.5)",
                      fontFamily: "Monaco, Menlo, monospace",
                      mb: 0.75,
                    }}
                  >
                    Puzzle {i + 1}
                    {p.rating ? ` · ${p.rating}` : ""}
                  </Typography>
                  <Button
                    onClick={() => onPick(p.id)}
                    size="small"
                    sx={{
                      px: 1.75,
                      py: 0.4,
                      minHeight: 0,
                      borderRadius: "999px",
                      background: "linear-gradient(135deg, #FF7A1A, #FB923C)",
                      color: "#0A0907",
                      fontSize: "0.76rem",
                      fontWeight: 700,
                      textTransform: "none",
                      "&:hover": {
                        background:
                          "linear-gradient(135deg, #FB923C, #FBBF24)",
                      },
                    }}
                  >
                    Open on board →
                  </Button>
                </Box>
              </Box>
            ))}
          </Stack>
        </Collapse>
      </Box>
    </motion.div>
  );
}

function MiniBoard({ puzzle }: { puzzle: PuzzleContext }) {
  const fen = useMemo(() => studentStartFen(puzzle), [puzzle]);
  const orientation = useMemo<"white" | "black">(() => {
    try {
      return new Chess(fen).turn() === "w" ? "white" : "black";
    } catch {
      return "white";
    }
  }, [fen]);
  return (
    <PuzzleBoardSurface
      boardId={`drill-${puzzle.id}`}
      fen={fen}
      orientation={orientation}
      interactive={false}
      onPieceDrop={() => false}
      boardWidth={MINI_BOARD_WIDTH}
    />
  );
}

export default PuzzleDrillMenu;
