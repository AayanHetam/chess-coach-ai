import { useState, useCallback, useMemo } from "react";
import {
  Typography,
  Dialog,
  DialogContent,
  Box,
  Button,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import { Icon } from "@iconify/react";
import {
  DataGrid,
  GridColDef,
  GridLocaleText,
  GRID_DEFAULT_LOCALE_TEXT,
  GridActionsCellItem,
  GridRowId,
} from "@mui/x-data-grid";
import { blue, red } from "@mui/material/colors";
import { useGameDatabase } from "@/hooks/useGameDatabase";
import { useRouter } from "next/router";
import { useSetAtom } from "jotai";
import {
  userPlayerInfoAtom,
  boardOrientationAtom,
} from "@/sections/analysis/states";
import type { Game } from "@/types/game";

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
  const [selectedColor, setSelectedColor] = useState<"white" | "black">("white");

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
    [deleteGame],
  );

  const handleCopyGameRow = useCallback(
    (id: GridRowId) => async () => {
      if (typeof id !== "number") {
        throw new Error("Unable to copy game");
      }
      await navigator.clipboard?.writeText?.(games[id - 1].pgn);
    },
    [games],
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
              icon={
                <Icon icon="streamline:magnifying-glass-solid" width="20px" />
              }
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
                <Icon icon="mdi:delete-outline" color={red[400]} width="20px" />
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
              icon={
                <Icon icon="ri:clipboard-line" color={blue[400]} width="20px" />
              }
              label="Copy pgn"
              onClick={handleCopyGameRow(id)}
              color="inherit"
              key={`${id}-copy-button`}
            />,
          ];
        },
      },
    ],
    [handleDeleteGameRow, handleCopyGameRow],
  );

  const pendingGame =
    pendingGameId !== null ? games.find((gm) => gm.id === pendingGameId) : undefined;

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
      />

      {/* Perspective Toggle Dialog */}
      <Dialog
        open={perspectiveDialogOpen}
        onClose={() => setPerspectiveDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogContent sx={{ textAlign: "center", py: 4, px: 3 }}>
          <Icon
            icon="mdi:chess-king"
            width={40}
            style={{ marginBottom: 12, color: "#FF6B35" }}
          />
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            Analyze from which perspective?
          </Typography>
          <Typography variant="body2" sx={{ color: "#777", mb: 3 }}>
            Choose the color you played so the AI coach analyzes from your point of view.
          </Typography>

          <ToggleButtonGroup
            value={selectedColor}
            exclusive
            onChange={(_, val) => val && setSelectedColor(val)}
            sx={{ mb: 3 }}
          >
            <ToggleButton
              value="white"
              sx={{
                px: 4,
                py: 1.5,
                textTransform: "none",
                fontWeight: 600,
                fontSize: "1rem",
                borderRadius: "12px 0 0 12px !important",
                "&.Mui-selected": {
                  bgcolor: "#fff",
                  color: "#333",
                  border: "2px solid #FF6B35",
                  "&:hover": { bgcolor: "#f5f5f5" },
                },
              }}
            >
              <Icon icon="mdi:chess-king" width={20} style={{ marginRight: 8 }} />
              White
            </ToggleButton>
            <ToggleButton
              value="black"
              sx={{
                px: 4,
                py: 1.5,
                textTransform: "none",
                fontWeight: 600,
                fontSize: "1rem",
                borderRadius: "0 12px 12px 0 !important",
                "&.Mui-selected": {
                  bgcolor: "#333",
                  color: "#fff",
                  border: "2px solid #FF6B35",
                  "&:hover": { bgcolor: "#444" },
                },
              }}
            >
              <Icon
                icon="mdi:chess-king"
                width={20}
                style={{ marginRight: 8, filter: "invert(1)" }}
              />
              Black
            </ToggleButton>
          </ToggleButtonGroup>

          {pendingGame && (
            <Typography variant="caption" sx={{ display: "block", mb: 2, color: "#999" }}>
              {pendingGame.white?.name || "White"} vs {pendingGame.black?.name || "Black"}
            </Typography>
          )}

          <Box sx={{ display: "flex", gap: 1.5, justifyContent: "center" }}>
            <Button
              onClick={() => setPerspectiveDialogOpen(false)}
              variant="text"
              sx={{ textTransform: "none", color: "#888" }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAnalyze}
              variant="contained"
              sx={{
                px: 4,
                fontWeight: 700,
                borderRadius: 2.5,
                textTransform: "none",
                background:
                  "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
                "&:hover": {
                  background:
                    "linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)",
                },
              }}
            >
              Analyze
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}
