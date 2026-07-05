import { useGameDatabase } from "@/hooks/useGameDatabase";
import { getGameFromPgn } from "@/lib/chess";
import { GameOrigin } from "@/types/enums";
import {
  MenuItem,
  Select,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  FormControl,
  InputLabel,
  OutlinedInput,
  DialogActions,
  Grid,
  Snackbar,
  Alert,
  useTheme,
} from "@mui/material";
import { setContext as setSentryContext } from "@sentry/react";
import { Chess } from "chess.js";
import { useRef, useState } from "react";
import GamePgnInput from "./gamePgnInput";
import ChessComInput from "./chessComInput";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import LichessInput from "./lichessInput";
import { useSetAtom } from "jotai";
import { boardOrientationAtom, userPlayerInfoAtom } from "../analysis/states";
import { extractImportedGameInfo, detectUserColor } from "@/lib/smartColorDetection";
import {
  glassDialogPaperSx,
  glassBackdropSx,
  glassInputSx,
  glassPrimaryBtnSx,
  glassOutlineBtnSx,
} from "./glassTheme";

interface Props {
  open: boolean;
  onClose: () => void;
  setGame?: (game: Chess) => Promise<void>;
}

export default function NewGameDialog({ open, onClose, setGame }: Props) {
  const [pgn, setPgn] = useState("");
  const [gameOrigin, setGameOrigin] = useLocalStorage(
    "preferred-game-origin",
    GameOrigin.ChessCom
  );
  const [parsingError, setParsingError] = useState("");
  const parsingErrorTimeout = useRef<NodeJS.Timeout | null>(null);
  const setBoardOrientation = useSetAtom(boardOrientationAtom);
  const setUserPlayerInfo = useSetAtom(userPlayerInfoAtom);
  const { addGame } = useGameDatabase();
  const dark = useTheme().palette.mode === "dark";

  const handleAddGame = async (
    pgn: string,
    boardOrientation?: boolean,
    gameOrigin?: string,
    searchUsername?: string
  ) => {
    if (!pgn) return;

    try {
      const gameToAdd = getGameFromPgn(pgn);
      setSentryContext("loadedGame", { pgn });

      // Store game origin and username for smart color detection
      if (gameOrigin && searchUsername) {
        localStorage.setItem("last-game-origin", gameOrigin);
        localStorage.setItem("last-search-username", searchUsername);
      }

      // Extract player information and determine user's color
      const importedGameInfo = extractImportedGameInfo(
        gameToAdd,
        gameOrigin,
        searchUsername
      );
      
      let playerColor: "white" | "black" | null = null;
      if (importedGameInfo && searchUsername) {
        const colorDetection = detectUserColor(
          gameToAdd,
          importedGameInfo,
          boardOrientation
        );
        playerColor = colorDetection.userColor;
      }

      // Store username and player color in atom for AI coach
      if (searchUsername) {
        setUserPlayerInfo({
          username: searchUsername,
          playerColor: playerColor,
        });
      }

      if (setGame) {
        await setGame(gameToAdd);
      } else {
        await addGame(gameToAdd);
      }

      setBoardOrientation(boardOrientation ?? true);
      handleClose();
    } catch (error) {
      console.error(error);

      if (parsingErrorTimeout.current) {
        clearTimeout(parsingErrorTimeout.current);
      }

      setParsingError(
        error instanceof Error
          ? `${error.message} !`
          : "Invalid PGN: unknown error !"
      );

      parsingErrorTimeout.current = setTimeout(() => {
        setParsingError("");
      }, 3000);
    }
  };

  const handleClose = () => {
    setPgn("");
    setParsingError("");
    if (parsingErrorTimeout.current) {
      clearTimeout(parsingErrorTimeout.current);
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: { sx: glassDialogPaperSx(dark) },
        backdrop: { sx: glassBackdropSx(dark) },
      }}
    >
      <DialogTitle marginY={1} variant="h5">
        {setGame ? "Load a game" : "Add a game to your database"}
      </DialogTitle>
      <DialogContent>
        <Grid
          container
          marginTop={1}
          alignItems="center"
          justifyContent="start"
          rowGap={2}
        >
          <FormControl sx={[{ m: 1, width: 150 }, glassInputSx(dark)]}>
            <InputLabel id="dialog-select-label">Game origin</InputLabel>
            <Select
              labelId="dialog-select-label"
              id="dialog-select"
              displayEmpty
              input={<OutlinedInput label="Game origin" />}
              value={gameOrigin ?? ""}
              onChange={(e) => {
                setGameOrigin(e.target.value as GameOrigin);
                setParsingError("");
              }}
            >
              {Object.entries(gameOriginLabel).map(([origin, label]) => (
                <MenuItem key={origin} value={origin}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {gameOrigin === GameOrigin.Pgn && (
            <GamePgnInput pgn={pgn} setPgn={setPgn} />
          )}

          {gameOrigin === GameOrigin.ChessCom && (
            <ChessComInput onSelect={handleAddGame} />
          )}

          {gameOrigin === GameOrigin.Lichess && (
            <LichessInput onSelect={handleAddGame} />
          )}

          <Snackbar open={!!parsingError}>
            <Alert
              onClose={() => setParsingError("")}
              severity="error"
              variant="filled"
              sx={{ width: "100%" }}
            >
              {parsingError}
            </Alert>
          </Snackbar>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ m: 2 }}>
        <Button
          variant="outlined"
          onClick={handleClose}
          sx={glassOutlineBtnSx(dark)}
        >
          Cancel
        </Button>
        {gameOrigin === GameOrigin.Pgn && (
          <Button
            variant="contained"
            sx={[{ marginLeft: 2 }, glassPrimaryBtnSx(dark)]}
            onClick={() => {
              handleAddGame(pgn);
            }}
          >
            Add
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

const gameOriginLabel: Record<GameOrigin, string> = {
  [GameOrigin.ChessCom]: "Chess.com",
  [GameOrigin.Lichess]: "Lichess.org",
  [GameOrigin.Pgn]: "PGN",
};
