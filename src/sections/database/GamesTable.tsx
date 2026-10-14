import { useState, useCallback, useMemo } from "react";
import {
  Typography,
  Dialog,
  DialogContent,
  DialogTitle,
  Box,
  Button,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import { ClipboardCopy, Search, Trash2 } from "lucide-react";
import {
  DataGrid,
  GridColDef,
  GridLocaleText,
  GRID_DEFAULT_LOCALE_TEXT,
  GridActionsCellItem,
  GridRowId,
} from "@mui/x-data-grid";
import {
  GAMES_TABLE_MAX_WIDTH,
  GAMES_TABLE_MIN_HEIGHT,
} from "./gamesTableLayout";
import { useGameDatabase } from "@/hooks/useGameDatabase";
import { useRouter } from "next/router";
import { useSetAtom } from "jotai";
import {
  userPlayerInfoAtom,
  boardOrientationAtom,
} from "@/sections/analysis/states";
import type { Game } from "@/types/game";
import { LINE, MOTION, RADIUS, STATUS, SURFACE, TEXT } from "@/theme/tokens";

/**
 * Extracted from src/pages/database.tsx so the heavy @mui/x-data-grid
 * import (plus the perspective-selection dialog) lands in its own chunk.
 * The /database shell renders title + LoadGameButton + game count
 * immediately; this table streams in once webpack finishes fetching the
 * grid chunk.
 *
 * `games` is owned by the parent so the count tile can render before
 * this component mounts. We still call useGameDatabase() here (no arg)
 * for the deleteGame helper.
 */

interface Props {
  games: Game[];
}

const gridLocaleText: GridLocaleText = {
  ...GRID_DEFAULT_LOCALE_TEXT,
  noRowsLabel: "No games found",
};

export default function GamesTable({ games }: Props) {
  const { deleteGame } = useGameDatabase();
  const router = useRouter();
  const setUserPlayerInfo = useSetAtom(userPlayerInfoAtom);
  const setBoardOrientation = useSetAtom(boardOrientationAtom);

  // Perspective toggle dialog state
  const [perspectiveDialogOpen, setPerspectiveDialogOpen] = useState(false);
  const [pendingGameId, setPendingGameId] = useState<GridRowId | null>(null);
  const [selectedColor, setSelectedColor] = useState<"white" | "black">(
    "white"
  );

  const handleAnalyzeClick = (id: GridRowId) => {
    setPendingGameId(id);
    setSelectedColor("white");
    setPerspectiveDialogOpen(true);
  };

  const handleConfirmAnalyze = () => {
    if (pendingGameId === null) return;
    const game = games.find((g) => g.id === pendingGameId);
    const username =
      selectedColor === "white"
        ? game?.white?.name || null
        : game?.black?.name || null;

    setUserPlayerInfo({
      username,
      playerColor: selectedColor,
    });
    setBoardOrientation(selectedColor === "white");
    setPerspectiveDialogOpen(false);
    router.push({ pathname: "/analysis", query: { gameId: pendingGameId } });
  };

  const handleDeleteGameRow = useCallback(
    (id: GridRowId) => async () => {
      if (typeof id !== "number") {
        throw new Error("Unable to remove game");
      }
      await deleteGame(id);
    },
    [deleteGame]
  );

  const handleCopyGameRow = useCallback(
    (id: GridRowId) => async () => {
      if (typeof id !== "number") {
        throw new Error("Unable to copy game");
      }
      await navigator.clipboard?.writeText?.(games[id - 1].pgn);
    },
    [games]
  );

  const columns: GridColDef[] = useMemo(
    () => [
      {
        field: "event",
        headerName: "Event",
        width: 150,
      },
      {
        field: "site",
        headerName: "Site",
        width: 150,
      },
      {
        field: "date",
        headerName: "Date",
        width: 150,
      },
      {
        field: "round",
        headerName: "Round",
        headerAlign: "center",
        align: "center",
        width: 150,
      },
      {
        field: "whiteLabel",
        headerName: "White",
        width: 200,
        headerAlign: "center",
        align: "center",
        valueGetter: (_, row) =>
          `${row.white.name ?? "Unknown"} (${row.white.rating ?? "?"})`,
      },
      {
        field: "result",
        headerName: "Result",
        headerAlign: "center",
        align: "center",
        width: 100,
      },
      {
        field: "blackLabel",
        headerName: "Black",
        width: 200,
        headerAlign: "center",
        align: "center",
        valueGetter: (_, row) =>
          `${row.black.name ?? "Unknown"} (${row.black.rating ?? "?"})`,
      },
      {
        field: "eval",
        headerName: "Evaluation",
        type: "boolean",
        headerAlign: "center",
        align: "center",
        width: 100,
        valueGetter: (_, row) => !!row.eval,
      },
      {
        field: "openEvaluation",
        type: "actions",
        headerName: "Analyze",
        width: 100,
        cellClassName: "actions",
        getActions: ({ id }) => {
          return [
            <GridActionsCellItem
              icon={<Search size={20} strokeWidth={1.75} aria-hidden />}
              label="Open Evaluation"
              onClick={() => handleAnalyzeClick(id)}
              color="inherit"
              key={`${id}-open-eval-button`}
            />,
          ];
        },
      },
      {
        field: "delete",
        type: "actions",
        headerName: "Delete",
        width: 100,
        cellClassName: "actions",
        getActions: ({ id }) => {
          return [
            <GridActionsCellItem
              icon={
                <Trash2
                  size={20}
                  strokeWidth={1.75}
                  color={STATUS.error}
                  aria-hidden
                />
              }
              label="Delete"
              onClick={handleDeleteGameRow(id)}
              color="inherit"
              key={`${id}-delete-button`}
            />,
          ];
        },
      },
      {
        field: "copy pgn",
        type: "actions",
        headerName: "Copy pgn",
        width: 100,
        cellClassName: "actions",
        getActions: ({ id }) => {
          return [
            <GridActionsCellItem
              icon={<ClipboardCopy size={20} strokeWidth={1.75} aria-hidden />}
              label="Copy pgn"
              onClick={handleCopyGameRow(id)}
              color="inherit"
              key={`${id}-copy-button`}
            />,
          ];
        },
      },
    ],
    [handleDeleteGameRow, handleCopyGameRow]
  );

  const pendingGame =
    pendingGameId !== null
      ? games.find((gm) => gm.id === pendingGameId)
      : undefined;

  return (
    <>
      <DataGrid
        aria-label="Games list"
        rows={games}
        columns={columns}
        disableColumnMenu
        hideFooter={true}
        localeText={gridLocaleText}
        initialState={{
          sorting: {
            sortModel: [
              {
                field: "date",
                sort: "desc",
              },
            ],
          },
        }}
        sx={{
          // Exactly the box the loading Skeleton on /database occupies, so
          // the swap from one to the other costs nothing in either axis.
          // An empty grid is 163px tall and, left to its own column widths,
          // a width this cell has no way to predict.
          minHeight: GAMES_TABLE_MIN_HEIGHT,
          width: "100%",
          maxWidth: GAMES_TABLE_MAX_WIDTH,
          mx: "auto",
          // One flat card around the table.
          borderRadius: `${RADIUS.card}px`,
          border: `1px solid ${LINE.hairline}`,
          background: SURFACE.raised,
          overflow: "hidden",
          color: TEXT.primary,
          // Flip the light tracks/gridlines to the hairline so they read on
          // the dark surface instead of painting black/grey lines.
          "--DataGrid-rowBorderColor": LINE.hairline,
          "--DataGrid-containerBackground": "transparent",
          "& .MuiDataGrid-columnHeaders": {
            background: "transparent",
            borderBottom: `1px solid ${LINE.hairline}`,
          },
          "& .MuiDataGrid-columnHeader": {
            background: "transparent",
            color: TEXT.secondary,
          },
          "& .MuiDataGrid-columnSeparator": {
            color: LINE.hairline,
          },
          "& .MuiDataGrid-cell": {
            borderTop: `1px solid ${LINE.hairline}`,
            color: TEXT.primary,
          },
          "& .MuiDataGrid-row": {
            transition: `background-color ${MOTION.hover}`,
          },
          "& .MuiDataGrid-row:hover": {
            backgroundColor: "rgba(255,255,255,0.06)",
          },
          "& .MuiDataGrid-row.Mui-selected": {
            backgroundColor: "rgba(255,255,255,0.10)",
            "&:hover": { backgroundColor: "rgba(255,255,255,0.10)" },
          },
          // Right-edge scrollbar filler / pinned fillers paint white in v7
          // unless these are flipped transparent.
          "& .MuiDataGrid-filler, & .MuiDataGrid-filler--borderTop, & .MuiDataGrid-scrollbarFiller, & .MuiDataGrid-scrollbarFiller--header":
            {
              background: "transparent",
              borderColor: LINE.hairline,
            },
          "& .MuiDataGrid-virtualScroller": {
            background: "transparent",
          },
          "& .MuiDataGrid-footerContainer": {
            borderTop: `1px solid ${LINE.hairline}`,
            color: TEXT.secondary,
          },
          // 'No games found' overlay reads at the muted floor.
          "& .MuiDataGrid-overlay": {
            background: "transparent",
            color: TEXT.secondary,
          },
          "& .MuiDataGrid-iconButtonContainer .MuiSvgIcon-root, & .MuiDataGrid-sortIcon, & .MuiDataGrid-menuIconButton .MuiSvgIcon-root":
            {
              color: TEXT.secondary,
            },
        }}
      />

      {/* Perspective dialog. The paper, scrim, toggle group and buttons are
          styled by the theme. */}
      <Dialog
        open={perspectiveDialogOpen}
        onClose={() => setPerspectiveDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        {/* A real DialogTitle, so the dialog takes its accessible name from
            it (MUI wires aria-labelledby to the title's id). */}
        <DialogTitle sx={{ textAlign: "center", pt: 4, px: 3, pb: 1 }}>
          Analyze from which perspective?
        </DialogTitle>
        <DialogContent sx={{ textAlign: "center", pb: 4, px: 3 }}>
          <Typography variant="body2" sx={{ color: TEXT.secondary, mb: 3 }}>
            Choose the color you played so Masti analyzes from your side.
          </Typography>

          <ToggleButtonGroup
            value={selectedColor}
            exclusive
            onChange={(_, val) => val && setSelectedColor(val)}
            sx={{ mb: 3 }}
          >
            <ToggleButton
              value="white"
              sx={{ px: 4, py: 1.5, fontWeight: 600 }}
            >
              White
            </ToggleButton>
            <ToggleButton
              value="black"
              sx={{ px: 4, py: 1.5, fontWeight: 600 }}
            >
              Black
            </ToggleButton>
          </ToggleButtonGroup>

          {pendingGame && (
            <Typography
              variant="caption"
              sx={{ display: "block", mb: 2, color: TEXT.secondary }}
            >
              {pendingGame.white?.name || "White"} vs{" "}
              {pendingGame.black?.name || "Black"}
            </Typography>
          )}

          <Box sx={{ display: "flex", gap: 1.5, justifyContent: "center" }}>
            <Button
              onClick={() => setPerspectiveDialogOpen(false)}
              variant="text"
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmAnalyze} variant="contained">
              Analyze
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}
