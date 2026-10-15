// ─────────────────────────────────────────────────────────────────────────────
// ChessComPlay
//
// Chess.com's Published Data API is READ-ONLY (no OAuth for playing), so
// nothing is played here. The tab loads a player's recent finished games, any
// time control, each one a click away from the analysis board, plus their
// ongoing daily games with a link out to chess.com to make the move.
//
// It used to show the daily games alone. Most players have none, so the tab
// answered "0 ongoing" and stopped there: a visitor trying the site read it as
// a page that does nothing. When a name has no games at all, the empty state
// now says so (and when the account was last online) and points somewhere.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Icon } from "@iconify/react";
import { ChessPawn, Info, RefreshCw, Search, User } from "lucide-react";
import { Chessboard } from "react-chessboard";
import { RecentGameRow } from "@/components/performance/RecentGamesCard";
import type { RecentGame } from "@/lib/performance/recentGames";
import {
  ACCENT,
  LINE,
  MOTION,
  RADIUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

interface ChessComGame {
  url: string;
  fen?: string;
  pgn?: string;
  timeControl?: string;
  timeClass?: string;
  rated: boolean;
  turn: "white" | "black" | null;
  moveBy: number | null;
  lastActivity: number | null;
  startTime: number | null;
  whiteUsername: string;
  blackUsername: string;
  yourTurn: boolean;
}

interface ChessComResponse {
  username: string;
  total: number;
  games: ChessComGame[];
}

/** `/api/chesscom/recent`: finished games, newest first. */
interface RecentResponse {
  username: string;
  everPlayed: boolean;
  /** Epoch ms, or null when Chess.com does not say. */
  lastOnline: number | null;
  games: RecentGame[];
}

const STORAGE_KEY = "chessmasti.chesscom.username";

/** A public account with games in every time control, for trying the tab. */
const SAMPLE_PLAYER = "hikaru";

function humanMoveBy(moveBy: number | null): string {
  if (!moveBy) return "No deadline";
  const diff = moveBy * 1000 - Date.now();
  if (diff <= 0) return "Time up";
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d left`;
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}h ${m}m left`;
}

/** Convert "1/86400" etc. into "1 move / day". */
function humanTimeControl(tc: string): string {
  const m = tc.match(/^(\d+)\/(\d+)$/);
  if (!m) return tc;
  const moves = parseInt(m[1], 10);
  const secs = parseInt(m[2], 10);
  const days = secs / 86400;
  return `${moves} move${moves > 1 ? "s" : ""} / ${days >= 1 ? `${days}d` : `${Math.round(secs / 3600)}h`}`;
}

/** "February 2008", for "last online in …". */
function monthYear(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/**
 * What went wrong, in words a player can act on. The routes answer 400 for a
 * name Chess.com could never accept, 404 for one it does not know, and 5xx
 * when Chess.com itself did not answer; their own messages are for logs.
 */
function errorFor(status: number): string {
  if (status === 404)
    return "Chess.com has no player with that name. Check the spelling.";
  if (status === 400)
    return "That doesn't look like a Chess.com username. Check the spelling.";
  return "Chess.com didn't answer. Try again in a minute.";
}

async function getJson<T>(
  url: string
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { data: null, error: errorFor(res.status) };
    const body = await res.json();
    return { data: body as T, error: null };
  } catch {
    return {
      data: null,
      error: "Couldn't reach Chess.com. Check your connection and try again.",
    };
  }
}

const sectionLabelSx = { ...TYPE.label, color: TEXT.secondary } as const;

export default function ChessComPlay() {
  const [username, setUsername] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChessComResponse | null>(null);
  const [recent, setRecent] = useState<RecentResponse | null>(null);

  // Restore last-used username from localStorage (client-only).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setUsername(saved);
      setInput(saved);
    }
  }, []);

  const fetchGames = useCallback(async (name: string) => {
    setLoading(true);
    setError(null);
    const q = encodeURIComponent(name);
    const [ongoing, finished] = await Promise.all([
      getJson<ChessComResponse>(`/api/chesscom/ongoing?username=${q}`),
      getJson<RecentResponse>(`/api/chesscom/recent?username=${q}`),
    ]);
    setData(ongoing.data);
    setRecent(finished.data);
    // Either list is worth showing alone; the error is for what is missing.
    setError(finished.error ?? ongoing.error);
    if (ongoing.data || finished.data) localStorage.setItem(STORAGE_KEY, name);
    setLoading(false);
  }, []);

  // Auto-fetch whenever we have a settled username.
  useEffect(() => {
    if (username) void fetchGames(username);
  }, [username, fetchGames]);

  const trySample = useCallback(() => {
    setInput(SAMPLE_PLAYER);
    setUsername(SAMPLE_PLAYER);
  }, []);

  const summary = useMemo(() => {
    if (!data && !recent) return null;
    return {
      total: data?.total ?? 0,
      toMove: data?.games.filter((g) => g.yourTurn).length ?? 0,
      recent: recent?.games.length ?? 0,
    };
  }, [data, recent]);

  // Read once per render so every row agrees about "now".
  const now = Date.now();
  const nothingToShow =
    !loading &&
    !!summary &&
    summary.total === 0 &&
    summary.recent === 0 &&
    !error;

  return (
    <Card elevation={0} sx={{ background: SURFACE.raised, overflow: "hidden" }}>
      <CardContent>
        <Stack spacing={2.5}>
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            justifyContent="space-between"
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box sx={{ display: "flex", color: TEXT.secondary }}>
                <Icon icon="simple-icons:chessdotcom" width={22} />
              </Box>
              <Box>
                <Typography sx={{ ...TYPE.h4, color: TEXT.primary }}>
                  Your Chess.com games
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Open any recent game on Masti&apos;s analysis board
                </Typography>
              </Box>
            </Stack>
            {username && (
              <Tooltip title="Reload games">
                {/* The span keeps the tooltip working while the button is
                    disabled during a load. */}
                <span>
                  <IconButton
                    onClick={() => fetchGames(username)}
                    disabled={loading}
                    aria-label="Reload games"
                    sx={{ width: 40, height: 40, color: "text.secondary" }}
                  >
                    <RefreshCw size={18} strokeWidth={1.75} aria-hidden />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Stack>

          <Alert
            severity="info"
            icon={<Info size={20} strokeWidth={1.75} aria-hidden />}
          >
            Enter a Chess.com username to load its recent games, then pick one
            and Masti walks you through it. Chess.com doesn&apos;t let other
            sites make moves, so daily games link back to chess.com. To play{" "}
            <em>inside</em> Chess Masti, use the Lichess tab.
          </Alert>

          <Divider />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              size="small"
              fullWidth
              label="Chess.com username"
              placeholder="e.g. hikaru"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim())
                  setUsername(input.trim());
              }}
              InputProps={{
                startAdornment: (
                  <User
                    size={18}
                    strokeWidth={1.75}
                    color={TEXT.secondary}
                    aria-hidden
                    style={{ marginRight: 6, flexShrink: 0 }}
                  />
                ),
              }}
            />
            <Button
              variant="contained"
              onClick={() => setUsername(input.trim())}
              disabled={!input.trim() || loading}
              startIcon={
                loading ? (
                  <CircularProgress size={16} color="inherit" aria-hidden />
                ) : (
                  <Search size={16} strokeWidth={1.75} aria-hidden />
                )
              }
              sx={{ minWidth: 120 }}
            >
              Load games
            </Button>
          </Stack>

          {summary && (
            <Stack direction="row" spacing={1}>
              <Chip size="small" label={`${summary.recent} recent`} />
              <Chip size="small" label={`${summary.total} ongoing`} />
              {summary.toMove > 0 && (
                <Chip
                  size="small"
                  label={`${summary.toMove} waiting on you`}
                  sx={{ background: ACCENT.tint, color: ACCENT.hover }}
                />
              )}
            </Stack>
          )}

          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {nothingToShow && (
            <Box sx={{ py: 4, textAlign: "center", color: TEXT.secondary }}>
              <ChessPawn
                size={40}
                strokeWidth={1.75}
                color={TEXT.tertiary}
                aria-hidden
              />
              <Typography variant="body2" sx={{ mt: 1 }}>
                {recent && !recent.everPlayed ? (
                  <>
                    <strong>{recent.username}</strong> hasn&apos;t played any
                    games on Chess.com
                    {recent.lastOnline
                      ? ` and was last online in ${monthYear(recent.lastOnline)}`
                      : ""}
                    .
                  </>
                ) : (
                  <>
                    No recent games for{" "}
                    <strong>{recent?.username ?? data?.username}</strong>.
                  </>
                )}
              </Typography>
              <Typography
                variant="body2"
                sx={{ mt: 0.5, color: TEXT.secondary }}
              >
                Check the spelling, try a sample player, or paste any game on
                the analysis board.
              </Typography>
              <Box
                sx={{
                  mt: 2,
                  display: "flex",
                  justifyContent: "center",
                  flexWrap: "wrap",
                  gap: 1,
                }}
              >
                <Button size="small" variant="outlined" onClick={trySample}>
                  See {SAMPLE_PLAYER}&apos;s games
                </Button>
                <Button size="small" variant="outlined" href="/analysis">
                  Open the analysis board
                </Button>
              </Box>
            </Box>
          )}

          {recent && recent.games.length > 0 && (
            <Box>
              <Typography sx={sectionLabelSx}>Recent games</Typography>
              <Box sx={{ mx: -1.25, mt: 0.5 }}>
                {recent.games.map((g) => (
                  <RecentGameRow key={g.id} game={g} now={now} />
                ))}
              </Box>
            </Box>
          )}

          {data && data.games.length > 0 && (
            <Box>
              <Typography sx={{ ...sectionLabelSx, mb: 1.25 }}>
                Daily games in progress
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, 1fr)",
                    lg: "repeat(3, 1fr)",
                  },
                  gap: 2,
                }}
              >
                {data.games.map((g) => (
                  <ChessComGameCard key={g.url} game={g} you={data.username} />
                ))}
              </Box>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function ChessComGameCard({ game, you }: { game: ChessComGame; you: string }) {
  const youAreWhite = game.whiteUsername.toLowerCase() === you.toLowerCase();
  const opponent = youAreWhite ? game.blackUsername : game.whiteUsername;
  const yourColor: "white" | "black" = youAreWhite ? "white" : "black";

  return (
    <Box
      component="a"
      href={game.url}
      target="_blank"
      rel="noreferrer"
      sx={{
        display: "block",
        borderRadius: `${RADIUS.control}px`,
        p: 1.25,
        textDecoration: "none",
        color: "inherit",
        // A nested block on the card, the same edge for every game. The
        // "Your move" tag and the tinted time-left chip say whose turn it is;
        // nothing glows and nothing lifts.
        background: SURFACE.raisedSecondary,
        border: `1px solid ${LINE.hairline}`,
        transition: `border-color ${MOTION.hover}, background-color ${MOTION.hover}`,
        "&:hover": { borderColor: LINE.strong },
        "&:active": { background: SURFACE.raisedTertiary },
        "&:focus-visible": { outline: "2px solid #FFFFFF", outlineOffset: 2 },
      }}
    >
      <Box sx={{ position: "relative", mb: 1 }}>
        <Box sx={{ pointerEvents: "none" }}>
          <Chessboard
            id={`cc-${game.url}`}
            position={game.fen || "start"}
            boardOrientation={yourColor}
            arePiecesDraggable={false}
            customBoardStyle={{ borderRadius: 4 }}
          />
        </Box>
        {/* A status tag, not an action: the ember word on an opaque base so
            it reads over the light and dark squares beneath it. */}
        {game.yourTurn && (
          <Chip
            size="small"
            label="Your move"
            sx={{
              position: "absolute",
              top: 4,
              right: 4,
              fontWeight: 600,
              background: SURFACE.raisedSecondary,
              color: ACCENT.hover,
            }}
          />
        )}
      </Box>
      <Stack
        direction="row"
        spacing={0.75}
        alignItems="center"
        sx={{ mb: 0.5 }}
      >
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            bgcolor: yourColor === "white" ? "#fff" : "#111",
            border: `1px solid ${LINE.strong}`,
            flexShrink: 0,
          }}
        />
        <Typography
          sx={{
            fontSize: TYPE.bodySmall.fontSize,
            color: TEXT.primary,
            "& strong": { fontWeight: 600 },
          }}
        >
          vs <strong>{opponent}</strong>
        </Typography>
      </Stack>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ flexWrap: "wrap", gap: 0.5 }}
      >
        {game.timeControl && (
          <Chip size="small" label={humanTimeControl(game.timeControl)} />
        )}
        <Tooltip
          title={
            game.moveBy ? new Date(game.moveBy * 1000).toLocaleString() : ""
          }
        >
          <Chip
            size="small"
            label={humanMoveBy(game.moveBy)}
            sx={
              game.yourTurn
                ? { background: ACCENT.tint, color: ACCENT.hover }
                : undefined
            }
          />
        </Tooltip>
        {game.rated && <Chip size="small" label="Rated" />}
      </Stack>
    </Box>
  );
}
