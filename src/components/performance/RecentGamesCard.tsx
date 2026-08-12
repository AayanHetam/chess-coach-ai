"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
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

function GameRow({ game, now }: { game: RecentGame; now: number }) {
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
        borderRadius: "0.75rem",
        transition: "background 160ms ease",
        "&:hover": { background: "rgba(255,255,255,0.035)" },
        "&:hover .analyze-cta": { opacity: 1 },
      }}
    >
      {/* Result chip — the first thing the eye should land on. */}
      <Box
        sx={{
          width: 46,
          textAlign: "center",
          py: 0.35,
          borderRadius: "0.45rem",
          background: tone.bg,
          color: tone.color,
          fontSize: "0.68rem",
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {game.result ? game.result : "—"}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: "0.85rem",
            color: "rgba(255,255,255,0.88)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          vs {game.opponent}
          {game.opponentRating ? (
            <Box
              component="span"
              sx={{ color: "rgba(255,255,255,0.38)", ml: 0.5 }}
            >
              ({game.opponentRating})
            </Box>
          ) : null}
        </Typography>
        <Typography
          sx={{
            fontSize: "0.7rem",
            color: "rgba(255,255,255,0.38)",
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
          fontSize: "0.72rem",
          color: "rgba(255,255,255,0.34)",
          display: { xs: "none", sm: "block" },
          whiteSpace: "nowrap",
        }}
      >
        {when}
      </Typography>

      <Button
        className="analyze-cta"
        size="small"
        onClick={analyze}
        sx={{
          textTransform: "none",
          fontSize: "0.76rem",
          fontWeight: 600,
          whiteSpace: "nowrap",
          borderRadius: "0.6rem",
          px: 1.25,
          color: "#FB923C",
          border: "1px solid rgba(249,115,22,0.32)",
          background: "rgba(249,115,22,0.06)",
          // Visible but quiet until hover — one CTA per row across ten rows
          // would otherwise be the loudest thing on the page.
          opacity: { xs: 1, md: 0.72 },
          transition: "opacity 160ms ease, background 160ms ease",
          "&:hover": {
            background: "rgba(249,115,22,0.14)",
            borderColor: "rgba(249,115,22,0.5)",
          },
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
            borderRadius: "0.9rem",
            border: "1px dashed rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <Typography
            sx={{
              fontSize: "0.88rem",
              color: "rgba(255,255,255,0.75)",
              mb: 0.5,
            }}
          >
            Link your chess.com or Lichess account
          </Typography>
          <Typography
            sx={{ fontSize: "0.76rem", color: "rgba(255,255,255,0.45)", mb: 2 }}
          >
            Then your games show up here automatically after you play — no
            uploading, no copying PGNs.
          </Typography>
          <Button
            onClick={onLinkAccount}
            sx={{
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.82rem",
              borderRadius: "0.6rem",
              px: 2,
              color: "#FB923C",
              border: "1px solid rgba(249,115,22,0.4)",
              "&:hover": { background: "rgba(249,115,22,0.1)" },
            }}
          >
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
          ? "Fetching your latest games…"
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
            size="small"
            onClick={refresh}
            disabled={loading}
            startIcon={
              loading ? (
                <CircularProgress
                  size={12}
                  sx={{ color: "rgba(255,255,255,0.4)" }}
                />
              ) : (
                <RefreshIcon sx={{ fontSize: 15 }} />
              )
            }
            sx={{
              textTransform: "none",
              fontSize: "0.75rem",
              color: "rgba(255,255,255,0.55)",
              minWidth: 0,
              "&:hover": {
                color: "#FB923C",
                background: "rgba(249,115,22,0.06)",
              },
            }}
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
          sx={{
            fontSize: "0.76rem",
            color: "#FCA5A5",
            mb: 1.5,
            px: 1.25,
          }}
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
                sx={{
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.38)",
                  mb: 0.5,
                }}
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
          <GameRow key={g.id} game={g} now={now} />
        ))}
      </Box>

      {!loading && summary.sampleSize === 0 && !error && (
        <Typography
          sx={{
            fontSize: "0.78rem",
            color: "rgba(255,255,255,0.4)",
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
