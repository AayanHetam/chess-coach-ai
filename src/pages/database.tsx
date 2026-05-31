import { Grid, Skeleton, Typography } from "@mui/material";
import dynamic from "next/dynamic";
import LoadGameButton from "@/sections/loadGame/loadGameButton";
import { useGameDatabase } from "@/hooks/useGameDatabase";
import { PageTitle } from "@/components/pageTitle";

// The actual grid + perspective-selection dialog lives in its own chunk
// so /database's First Load doesn't have to ship @mui/x-data-grid (huge)
// before the page renders anything. See src/sections/database/GamesTable.tsx.
const GamesTable = dynamic(
  () => import("@/sections/database/GamesTable"),
  {
    ssr: false,
    loading: () => (
      <Skeleton
        variant="rectangular"
        height={360}
        sx={{ borderRadius: 1, width: "100%", maxWidth: 1100 }}
      />
    ),
  },
);

export default function GameDatabase() {
  const { games } = useGameDatabase(true);

  return (
    <Grid
      container
      justifyContent="center"
      alignItems="center"
      gap={4}
      marginTop={6}
    >
      <PageTitle title="Chess Masti AI - Game Database" />

      <Grid container justifyContent="center" alignItems="center" size={12}>
        <LoadGameButton />
      </Grid>

      <Grid container justifyContent="center" alignItems="center" size={12}>
        <Typography variant="subtitle2">
          You have {games.length} game{games.length !== 1 && "s"} in your
          database
        </Typography>
      </Grid>

      <Grid maxWidth="100%" minWidth="50px">
        <GamesTable games={games} />
      </Grid>
    </Grid>
  );
}
