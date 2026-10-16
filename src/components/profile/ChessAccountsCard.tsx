"use client";

import { Fragment } from "react";
import { Box, Button, Typography } from "@mui/material";
import { PanelCard } from "@/components/performance/PanelCard";
import {
  PLATFORM_NAME,
  profileUsername,
  type ChessPlatform,
  type ProfileUsernames,
} from "@/lib/chessAccounts";
import { LINE, TEXT, TYPE } from "@/theme/tokens";

const PLATFORMS: ChessPlatform[] = ["chesscom", "lichess"];

/**
 * The reader's Chess.com and Lichess usernames, on /profile.
 *
 * The load dialog on /analysis opens on these, and saves the first username a
 * reader loads a game from when there is none here yet ("Saved hikaru as your
 * Chess.com username"). This is where they see what was saved and change it.
 */
export default function ChessAccountsCard({
  profile,
  onChange,
}: {
  profile: ProfileUsernames | null;
  onChange: () => void;
}) {
  return (
    <PanelCard
      title="Chess accounts"
      subtitle="Loading a game starts from these, and Masti uses them to tell which side you played."
      action={
        <Button
          onClick={onChange}
          sx={{
            textTransform: "none",
            fontWeight: 600,
            fontSize: "0.8rem",
            px: 2,
            whiteSpace: "nowrap",
            color: TEXT.primary,
            border: `1px solid ${LINE.strong}`,
            "&:hover": { background: "rgba(255,255,255,0.06)" },
          }}
        >
          Change
        </Button>
      }
    >
      <Box
        component="dl"
        data-testid="chess-accounts"
        sx={{
          m: 0,
          display: "grid",
          gridTemplateColumns: "auto minmax(0, 1fr)",
          columnGap: 3,
          rowGap: 1,
        }}
      >
        {PLATFORMS.map((platform) => {
          const name = profileUsername(profile, platform);
          return (
            <Fragment key={platform}>
              <Typography
                component="dt"
                sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}
              >
                {PLATFORM_NAME[platform]}
              </Typography>
              <Typography
                component="dd"
                sx={{
                  ...TYPE.bodySmall,
                  m: 0,
                  color: name ? TEXT.primary : TEXT.tertiary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {name || "Not set"}
              </Typography>
            </Fragment>
          );
        })}
      </Box>
    </PanelCard>
  );
}
