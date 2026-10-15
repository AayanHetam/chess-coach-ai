"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { RefreshCw } from "lucide-react";
import { PanelCard } from "./PanelCard";
import { StatTile } from "./StatTile";
import { AccuracyBar } from "./AccuracyBar";
import { WindowSelect } from "./WindowSelect";
import { useRecentGames } from "@/lib/performance/useRecentGames";
import {
  GAME_WINDOWS,
  summarizeGameWindow,
  type GameWindow,
} from "@/lib/performance/gameWindow";
import { formatRelativeTime } from "@/lib/performance/relativeTime";
import { analysisHref, stageGameForAnalysis } from "@/lib/analysis/handoff";
import type { RecentGame } from "@/lib/performance/recentGames";
import {
  LINE,
  MOTION,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

/**
 * Recent games, fetched from the user's linked platforms, with a per-row
 * "Analyze now".
 *
 * The point of the whole card: nobody comes back here to tell us they played a
 * game. We already stored their chess.com / Lichess username and we already had
 * working fetchers — this is the first surface that puts the two together.
 */

const RESULT_TONE: Record<string, { color: string; bg: string }> = {
  win: { color: "#4ADE80", bg: "rgba(74,222,128,0.12)" },
  loss: { color: "#FCA5A5", bg: "rgba(248,113,113,0.12)" },
  draw: { color: "rgba(255,255,255,0.7)", bg: "rgba(255,255,255,0.07)" },
  none: { color: "rgba(255,255,255,0.4)", bg: "rgba(255,255,255,0.04)" },
};

/** "win" as a word on a chip: "Win". Case is set here, not by a transform. */
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function RecentGameRow({
  game,
  now,
}: {
  game: RecentGame;
  now: number;
}) {
  const router = useRouter();
  const tone = RESULT_TONE[game.result ?? "none"];
  const when = formatRelativeTime(game.playedAt, now);

  const analyze = () => {
    // Prefer the storage handoff; fall back to ?pgn= when storage is blocked.
    const staged = stageGameForAnalysis(game.pgn);
    void router.push(analysisHref(game.pgn, staged));
  };

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "auto minmax(0,1fr) auto",
          sm: "auto minmax(0,1fr) auto auto",
        },
        alignItems: "center",
        gap: 1.5,
        px: 1.25,
        py: 1.1,
        borderRadius: `${RADIUS.small}px`,
        transition: `background-color ${MOTION.hover}`,
        "&:hover": { background: "rgba(255,255,255,0.06)" },
        "&:hover .analyze-cta": { opacity: 1 },
      }}
    >
      {/* Result chip, the first thing the eye should land on. */}
      <Box
        sx={{
          width: 46,
          textAlign: "center",
          py: 0.35,
          borderRadius: `${RADIUS.small}px`,
          background: tone.bg,
          color: tone.color,
          fontSize: TYPE.caption.fontSize,
          fontWeight: 600,
        }}
      >
        {game.result ? capitalise(game.result) : "—"}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            ...TYPE.bodySmall,
            color: TEXT.primary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          vs {game.opponent}
          {game.opponentRating ? (
            <Box component="span" sx={{ color: TEXT.secondary, ml: 0.5 }}>
              ({game.opponentRating})
            </Box>
          ) : null}
        </Typography>
        <Typography
          sx={{
            ...TYPE.caption,
            color: TEXT.secondary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {[
            game.playerColor === "white"
              ? "as White"
              : game.playerColor === "black"
                ? "as Black"
                : null,
            game.speed,
            game.platform === "chesscom" ? "chess.com" : "lichess",
          ]
            .filter(Boolean)
            .join(" · ")}
        </Typography>
      </Box>

      <Typography
        sx={{
          ...TYPE.caption,
          color: TEXT.secondary,
          display: { xs: "none", sm: "block" },
          whiteSpace: "nowrap",
        }}
      >
        {when}
      </Typography>

      <Button
        className="analyze-cta"
        variant="outlined"
        size="small"
        onClick={analyze}
        sx={{
          whiteSpace: "nowrap",
          // Visible but quiet until hover: one CTA per row across ten rows
          // would otherwise be the loudest thing on the page.
          opacity: { xs: 1, md: 0.72 },
          transition: `opacity ${MOTION.hover}, background-color ${MOTION.hover}, border-color ${MOTION.hover}, transform ${MOTION.press}`,
        }}
      >
        Analyze now
      </Button>
    </Box>
  );
}

export function RecentGamesCard({
  onLinkAccount,
}: {
  onLinkAccount: () => void;
}) {
  // NOT named `window` — that would shadow the global inside this component,
  // which is a nasty trap for anyone later adding a `window.` call here.
  const [gameWindow, setGameWindow] = useState<GameWindow>(10);
  const { games, loading, error, hasLinkedAccount, refresh } =
    useRecentGames(50);

  const summary = useMemo(
    () => summarizeGameWindow(games, gameWindow),
    [games, gameWindow]
  );
  // Read once per render so every row in a given paint agrees about "now"
  // instead of drifting across the list.
  const now = Date.now();
  const visible = useMemo(
    () => games.slice(0, gameWindow),
    [games, gameWindow]
  );

  if (!hasLinkedAccount) {
    return (
      <PanelCard title="Recent games">
        <Box
          sx={{
            p: 3,
            textAlign: "center",
            borderRadius: `${RADIUS.control}px`,
            border: `1px dashed ${LINE.strong}`,
            background: SURFACE.raisedSecondary,
          }}
        >
          <Typography sx={{ ...TYPE.bodySmall, color: TEXT.primary, mb: 0.5 }}>
            Link your chess.com or Lichess account
          </Typography>
          <Typography sx={{ ...TYPE.caption, color: TEXT.secondary, mb: 2 }}>
            Then your games show up here automatically after you play: no
            uploading, no copying PGNs.
          </Typography>
          <Button variant="outlined" size="small" onClick={onLinkAccount}>
            Add your username
          </Button>
        </Box>
      </PanelCard>
    );
  }

  const record = `${summary.wins}W · ${summary.draws}D · ${summary.losses}L`;

  return (
    <PanelCard
      title="Recent games"
      subtitle={
        loading
          ? "Fetching your latest games"
          : summary.sampleSize === 0
            ? "No games found on your linked accounts yet."
            : `Your last ${summary.sampleSize} game${summary.sampleSize === 1 ? "" : "s"}${
                summary.undecided > 0
                  ? ` · ${summary.undecided} with no recorded result`
                  : ""
              }`
      }
      action={
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button
            variant="text"
            size="small"
            onClick={refresh}
            disabled={loading}
            startIcon={
              loading ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <RefreshCw size={16} strokeWidth={1.75} aria-hidden />
              )
            }
            sx={{ color: TEXT.secondary, minWidth: 0 }}
          >
            Refresh
          </Button>
          <WindowSelect
            value={gameWindow}
            options={GAME_WINDOWS}
            onChange={setGameWindow}
            noun="games"
            ariaLabel="Games window"
          />
        </Box>
      }
    >
      {error && (
        <Typography
          sx={{ ...TYPE.caption, color: STATUS.error, mb: 1.5, px: 1.25 }}
        >
          {error} Your saved games below are unaffected.
        </Typography>
      )}

      {summary.sampleSize > 0 && (
        <>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" },
              gap: 1.25,
              mb: 2,
            }}
          >
            <StatTile
              label="Record"
              value={record}
              hint={`over ${summary.sampleSize} games`}
            />
            <StatTile
              label="Win rate"
              value={summary.winRate === null ? null : `${summary.winRate}%`}
              hint="of decided games"
              tone={
                summary.winRate === null
                  ? "default"
                  : summary.winRate >= 50
                    ? "positive"
                    : "default"
              }
            />
            <StatTile
              label="As White"
              value={
                summary.asWhite.winRate === null
                  ? null
                  : `${summary.asWhite.winRate}%`
              }
              hint={`${summary.asWhite.wins}W · ${summary.asWhite.draws}D · ${summary.asWhite.losses}L`}
            />
            <StatTile
              label="As Black"
              value={
                summary.asBlack.winRate === null
                  ? null
                  : `${summary.asBlack.winRate}%`
              }
              hint={`${summary.asBlack.wins}W · ${summary.asBlack.draws}D · ${summary.asBlack.losses}L`}
            />
          </Box>

          {summary.bySpeed.length > 1 && (
            <Box sx={{ mb: 2, px: 0.25 }}>
              <Typography
                sx={{ ...TYPE.label, color: TEXT.secondary, mb: 0.5 }}
              >
                By time control
              </Typography>
              {summary.bySpeed.map((s) => (
                <AccuracyBar
                  key={s.speed}
                  label={s.speed}
                  accuracy={s.winRate}
                  solved={s.wins}
                  attempts={s.wins + s.draws + s.losses}
                />
              ))}
            </Box>
          )}
        </>
      )}

      <Box sx={{ mx: -1.25 }}>
        {visible.map((g) => (
          <RecentGameRow key={g.id} game={g} now={now} />
        ))}
      </Box>

      {!loading && summary.sampleSize === 0 && !error && (
        <Typography
          sx={{
            ...TYPE.caption,
            color: TEXT.secondary,
            textAlign: "center",
            py: 3,
          }}
        >
          Play a game on chess.com or Lichess and it will appear here.
        </Typography>
      )}
    </PanelCard>
  );
}
