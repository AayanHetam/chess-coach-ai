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
        sx={{
          // Neutral glass card frame around the table.
          borderRadius: "1.5rem",
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(20,22,28,0.55)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
          overflow: "hidden",
          color: "rgba(255,255,255,0.94)",
          // Flip the light tracks/gridlines to white-alpha so they're
          // visible on the dark glass instead of painting black/grey hairlines.
          "--DataGrid-rowBorderColor": "rgba(255,255,255,0.06)",
          "--DataGrid-containerBackground": "transparent",
          "& .MuiDataGrid-columnHeaders": {
            background: "transparent",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          },
          "& .MuiDataGrid-columnHeader": {
            background: "transparent",
            color: "rgba(255,255,255,0.62)",
          },
          "& .MuiDataGrid-columnSeparator": {
            color: "rgba(255,255,255,0.06)",
          },
          "& .MuiDataGrid-cell": {
            borderTop: "1px solid rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.94)",
          },
          "& .MuiDataGrid-row": {
            transition: "background-color 180ms ease",
          },
          "& .MuiDataGrid-row:hover": {
            backgroundColor: "rgba(255,255,255,0.04)",
          },
          "& .MuiDataGrid-row.Mui-selected": {
            backgroundColor: "rgba(249,115,22,0.12)",
            boxShadow: "inset 0 0 0 1px rgba(249,115,22,0.35)",
            "&:hover": { backgroundColor: "rgba(249,115,22,0.16)" },
          },
          // Right-edge scrollbar filler / pinned fillers paint white in v7
          // unless these are flipped transparent.
          "& .MuiDataGrid-filler, & .MuiDataGrid-filler--borderTop, & .MuiDataGrid-scrollbarFiller, & .MuiDataGrid-scrollbarFiller--header":
            {
              background: "transparent",
              borderColor: "rgba(255,255,255,0.06)",
            },
          "& .MuiDataGrid-virtualScroller": {
            background: "transparent",
          },
          "& .MuiDataGrid-footerContainer": {
            borderTop: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.62)",
          },
          // 'No games found' overlay reads at the muted floor.
          "& .MuiDataGrid-overlay": {
            background: "transparent",
            color: "rgba(255,255,255,0.5)",
          },
          "& .MuiDataGrid-iconButtonContainer .MuiSvgIcon-root, & .MuiDataGrid-sortIcon, & .MuiDataGrid-menuIconButton .MuiSvgIcon-root":
            {
              color: "rgba(255,255,255,0.62)",
            },
        }}
      />

      {/* Perspective Toggle Dialog */}
      <Dialog
        open={perspectiveDialogOpen}
        onClose={() => setPerspectiveDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          backdrop: {
            sx: {
              backgroundColor: "rgba(8,9,12,0.72)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            },
          },
        }}
        PaperProps={{
          sx: {
            borderRadius: "1.5rem",
            background:
              "linear-gradient(180deg, rgba(20,22,28,0.92), rgba(12,14,20,0.92))",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow:
              "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.94)",
          },
        }}
      >
        <DialogContent sx={{ textAlign: "center", py: 4, px: 3 }}>
          <Icon
            icon="mdi:chess-king"
            width={40}
            style={{ marginBottom: 12, color: "#FB923C" }}
          />
          <Typography
            variant="h6"
            sx={{ fontWeight: 700, mb: 1, color: "rgba(255,255,255,0.94)" }}
          >
            Analyze from which perspective?
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "rgba(255,255,255,0.62)", mb: 3 }}
          >
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
                color: "rgba(255,255,255,0.62)",
                bgcolor: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                transition: "all 180ms ease",
                "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
                "&.Mui-selected": {
                  bgcolor: "rgba(255,255,255,0.92)",
                  color: "#0A0A0A",
                  border: "1px solid rgba(249,115,22,0.4)",
                  boxShadow: "0 0 0 1px rgba(249,115,22,0.18)",
                  "&:hover": { bgcolor: "rgba(255,255,255,0.98)" },
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
                color: "rgba(255,255,255,0.62)",
                bgcolor: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                transition: "all 180ms ease",
                "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
                "&.Mui-selected": {
                  bgcolor: "rgba(20,22,28,0.9)",
                  color: "rgba(255,255,255,0.94)",
                  border: "1px solid rgba(249,115,22,0.4)",
                  boxShadow: "0 0 0 1px rgba(249,115,22,0.18)",
                  "&:hover": { bgcolor: "rgba(28,30,38,0.95)" },
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
            <Typography
              variant="caption"
              sx={{ display: "block", mb: 2, color: "rgba(255,255,255,0.5)" }}
            >
              {pendingGame.white?.name || "White"} vs {pendingGame.black?.name || "Black"}
            </Typography>
          )}

          <Box sx={{ display: "flex", gap: 1.5, justifyContent: "center" }}>
            <Button
              onClick={() => setPerspectiveDialogOpen(false)}
              variant="text"
              sx={{
                textTransform: "none",
                color: "rgba(255,255,255,0.62)",
                "&:hover": {
                  color: "rgba(255,255,255,0.92)",
                  bgcolor: "rgba(255,255,255,0.04)",
                },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAnalyze}
              variant="contained"
              sx={{
                px: 4,
                fontWeight: 700,
                borderRadius: "12px",
                textTransform: "none",
                bgcolor: "#F97316",
                color: "#0A0A0A",
                boxShadow: "0 6px 18px rgba(249,115,22,0.32)",
                transition: "all 180ms ease",
                "&:hover": {
                  bgcolor: "#FB923C",
                  boxShadow: "0 6px 18px rgba(249,115,22,0.32)",
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
