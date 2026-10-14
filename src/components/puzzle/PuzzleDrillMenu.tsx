"use client";

import { useMemo, useState } from "react";
import { Box, Button, Collapse, Stack, Typography } from "@mui/material";
import { Chess } from "chess.js";
import { ChevronDown, Target } from "lucide-react";
import type { PuzzleContext } from "@/lib/validation/puzzleChatSchemas";
import { PuzzleBoardSurface } from "@/components/puzzle/PuzzleBoardSurface";
import { prettyTheme } from "@/components/puzzle/prettyTheme";
import { SERIF_DISPLAY } from "@/theme/fonts";
import { LINE, MOTION, RADIUS, SURFACE, TEXT, TYPE } from "@/theme/tokens";

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
    <Box sx={{ mt: 1.5, pl: { xs: 0, sm: 4.5 } }}>
      {/* Drag-down header */}
      <Button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="puzzle-drill-panel"
        variant="outlined"
        size="small"
        startIcon={<Target size={15} strokeWidth={1.75} />}
        endIcon={
          <ChevronDown
            size={16}
            strokeWidth={1.75}
            style={{
              transform: open ? "rotate(180deg)" : "none",
              transition: `transform ${MOTION.hover}`,
            }}
          />
        }
      >
        Drill {set.length} more like this
      </Button>

      <Collapse in={open} timeout={200} unmountOnExit id="puzzle-drill-panel">
        <Stack spacing={1.25} sx={{ mt: 1.5 }}>
          {set.map((p, i) => (
            <Box
              key={p.id}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                p: 1.25,
                borderRadius: `${RADIUS.control}px`,
                background: SURFACE.raisedSecondary,
                border: `1px solid ${LINE.hairline}`,
                transition: `border-color ${MOTION.hover}`,
                "&:hover": { borderColor: LINE.strong },
              }}
            >
              <Box
                sx={{
                  flexShrink: 0,
                  width: MINI_BOARD_WIDTH,
                  borderRadius: `${RADIUS.small}px`,
                  overflow: "hidden",
                }}
              >
                <MiniBoard puzzle={p} />
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontFamily: SERIF_DISPLAY,
                    fontSize: "0.9rem",
                    fontWeight: 500,
                    color: TEXT.primary,
                  }}
                >
                  {prettyTheme(p.themes)}
                </Typography>
                <Typography
                  sx={{
                    ...TYPE.caption,
                    color: TEXT.secondary,
                    fontVariantNumeric: "tabular-nums",
                    mb: 0.75,
                  }}
                >
                  Puzzle {i + 1}
                  {p.rating ? ` · ${p.rating}` : ""}
                </Typography>
                <Button
                  onClick={() => onPick(p.id)}
                  size="small"
                  variant="outlined"
                >
                  Open on board
                </Button>
              </Box>
            </Box>
          ))}
        </Stack>
      </Collapse>
    </Box>
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
