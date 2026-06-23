import { useLocalStorage } from "@/hooks/useLocalStorage";
import { getChessComUserRecentGames } from "@/lib/chessCom";
import { capitalize } from "@/lib/helpers";
import {
  CircularProgress,
  FormControl,
  Grid,
  ListItemButton,
  ListItemText,
  TextField,
  useTheme,
} from "@mui/material";
import { useDebounce } from "@/hooks/useDebounce";
import { useQuery } from "@tanstack/react-query";
import { glassInputSx, glassListRowSx } from "./glassTheme";

interface Props {
  onSelect: (
    pgn: string,
    boardOrientation?: boolean,
    gameOrigin?: string,
    searchUsername?: string
  ) => void;
}

export default function ChessComInput({ onSelect }: Props) {
  const [chessComUsername, setChessComUsername] = useLocalStorage(
    "chesscom-username",
    ""
  );
  const debouncedUsername = useDebounce(chessComUsername, 300);
  const dark = useTheme().palette.mode === "dark";

  const {
    data: games,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ["CCUserGames", debouncedUsername],
    enabled: !!debouncedUsername,
    queryFn: ({ signal }) =>
      getChessComUserRecentGames(debouncedUsername ?? "", signal),
    retry: 1,
  });

  return (
    <>
      <FormControl sx={{ m: 1, width: 300 }}>
        <TextField
          label="Enter your Chess.com username..."
          variant="outlined"
          value={chessComUsername ?? ""}
          onChange={(e) => setChessComUsername(e.target.value)}
          sx={glassInputSx(dark)}
        />
      </FormControl>

      {chessComUsername && (
        <Grid
          container
          gap={2}
          justifyContent="center"
          alignContent="center"
          minHeight={100}
          size={12}
        >
          {isFetching ? (
            <CircularProgress />
          ) : isError ? (
            <span style={{ color: "salmon" }}>
              User not found. Please check your username.
            </span>
          ) : !games?.length ? (
            <span style={{ color: "salmon" }}>
              No games found. Please check your username.
            </span>
          ) : (
            games.map((game) => (
              <ListItemButton
                onClick={() => {
                  const boardOrientation =
                    chessComUsername.toLowerCase() !==
                    game.black?.username?.toLowerCase();
                  onSelect(
                    game.pgn,
                    boardOrientation,
                    "chesscom",
                    chessComUsername
                  );
                }}
                style={{ width: 350, maxWidth: 350 }}
                sx={glassListRowSx(dark)}
                key={game.uuid}
              >
                <ListItemText
                  primary={`${capitalize(game.white?.username || "white")} (${
                    game.white?.rating || "?"
                  }) vs ${capitalize(game.black?.username || "black")} (${
                    game.black?.rating || "?"
                  })`}
                  secondary={
                    game.end_time
                      ? `${capitalize(game.time_class || "game")} played at ${new Date(
                          game.end_time * 1000
                        )
                          .toLocaleString()
                          .slice(0, -3)}`
                      : undefined
                  }
                  slotProps={{
                    primary: { noWrap: true },
                    secondary: { noWrap: true },
                  }}
                />
              </ListItemButton>
            ))
          )}
        </Grid>
      )}
    </>
  );
}
