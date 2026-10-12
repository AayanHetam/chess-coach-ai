// ─────────────────────────────────────────────────────────────────────────────
// LichessLivePlay
//
// Top-level orchestrator for the "play on Lichess from inside ChessMasti" flow.
// Renders one of four sub-views driven by the hook's `phase`:
//
//   idle     →  connect + seek-setup card
//   seeking  →  "searching for opponent" spinner with cancel
//   playing  →  <LichessLiveBoard /> embedded, fully playable
//   finished →  board with result overlay + "play another" CTA
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { Icon } from "@iconify/react";
import {
  ACCENT,
  LINE,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";
import { useLichessLiveGame, SeekOptions } from "@/hooks/useLichessLiveGame";
import { useScreenSize } from "@/hooks/useScreenSize";
import LichessLiveBoard from "./LichessLiveBoard";

/* ── Time-control presets ─────────────────────────────────────────────────── */
// The Lichess Board API restricts seeks to rapid, classical, and
// correspondence time controls. Bullet/blitz are only allowed for direct
// challenges, not pool seeks. So we only offer rapid+ here.
const TIME_CONTROLS: Array<{
  label: string;
  time: number;
  increment: number;
  speed: string;
  icon: string;
}> = [
  { label: "10+0", time: 10, increment: 0, speed: "rapid", icon: "mdi:rabbit" },
  { label: "10+5", time: 10, increment: 5, speed: "rapid", icon: "mdi:rabbit" },
  {
    label: "15+10",
    time: 15,
    increment: 10,
    speed: "rapid",
    icon: "mdi:rabbit",
  },
  {
    label: "15+15",
    time: 15,
    increment: 15,
    speed: "rapid",
    icon: "mdi:rabbit",
  },
  {
    label: "30+0",
    time: 30,
    increment: 0,
    speed: "classical",
    icon: "mdi:turtle",
  },
  {
    label: "30+20",
    time: 30,
    increment: 20,
    speed: "classical",
    icon: "mdi:turtle",
  },
  {
    label: "60+0",
    time: 60,
    increment: 0,
    speed: "classical",
    icon: "mdi:turtle",
  },
];

const SPEED_LABEL: Record<string, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
  classical: "Classical",
};

const COLOR_LABEL = {
  random: "Random",
  white: "White",
  black: "Black",
} as const;

export default function LichessLivePlay() {
  const screen = useScreenSize();
  const {
    authenticated,
    user,
    authChecked,
    phase,
    game,
    gameState,
    yourColor,
    streamError,
    connect,
    disconnect,
    seekGame,
    cancelSeek,
    makeMove,
    resign,
    abort,
    offerDraw,
    reset,
  } = useLichessLiveGame();

  // Form state for the lobby.
  const [tc, setTc] = useState(TIME_CONTROLS[0]); // 10+0 default
  const [rated, setRated] = useState(true);
  const [color, setColor] = useState<"random" | "white" | "black">("random");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Parse query params from the OAuth callback for a one-shot toast.
  const [banner, setBanner] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const lichess = url.searchParams.get("lichess");
    if (lichess === "connected") {
      setBanner({ kind: "ok", msg: "Lichess connected. Ready to play." });
    } else if (lichess === "error") {
      const reason = url.searchParams.get("reason") ?? "unknown";
      setBanner({ kind: "err", msg: `Lichess sign-in failed (${reason}).` });
    }
    if (lichess) {
      url.searchParams.delete("lichess");
      url.searchParams.delete("reason");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const boardSize = useMemo(() => {
    const width = screen.width;
    const height = screen.height;
    if (typeof window === "undefined") return 600;
    if (window.innerWidth < 900) return Math.min(width - 16, height - 160);
    // Allow up to 85% of viewport height and 800px max for a larger board.
    return Math.min(Math.min(width - 340, 800), height * 0.85 - 80);
  }, [screen]);

  /* ── Auth check still in flight ────────────────────────────────────────── */
  //
  // Until /api/lichess/me answers we do not know which of the views below is
  // the right one, so we render neither.
  //
  // This used to fall straight through to the Idle / Lobby view at the bottom
  // of this component, which meant a signed-out visitor was shown a working
  // lobby — profile card, time controls, "Start a game" — for as long as the
  // round trip took, and only then had it replaced by the connect card. On a
  // throttled mobile that was ~4.7s of a lobby that was never theirs, and the
  // swap was 0.12 of CLS measured on production: React reconciles the two
  // trees, reuses the nodes they have in common, and every reused node counts
  // as an element that moved.
  //
  // The `key` on each branch is load-bearing. Without it React sees the same
  // <Box> in the same slot and patches it in place, which is exactly the
  // node-reuse that scores as a shift. With it, each view mounts fresh, and a
  // newly inserted element has no previous position to have moved from.
  if (!authChecked) {
    return (
      <Box
        key="lichess-auth-checking"
        sx={{
          maxWidth: 480,
          mx: "auto",
          minHeight: 420,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography sx={{ color: TEXT.secondary, fontSize: "0.9rem" }}>
          Checking your Lichess connection…
        </Typography>
      </Box>
    );
  }

  /* ── Not authenticated ─────────────────────────────────────────────────── */
  if (!authenticated) {
    return (
      <Box key="lichess-connect" sx={{ maxWidth: 480, mx: "auto" }}>
        <Stack spacing={4} alignItems="center" sx={{ py: 6 }}>
          {/* Logo */}
          <Box sx={{ display: "flex", color: TEXT.primary }}>
            <Icon icon="simple-icons:lichess" width={48} />
          </Box>

          <Stack spacing={1} alignItems="center" textAlign="center">
            <Typography sx={{ ...TYPE.h2, color: TEXT.primary }}>
              Play live on Lichess
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ maxWidth: 340 }}
            >
              Real opponents. Real ratings. Powered by Lichess, played right
              here on ChessMasti.
            </Typography>
          </Stack>

          {banner && (
            <Alert
              severity={banner.kind === "ok" ? "success" : "error"}
              onClose={() => setBanner(null)}
              sx={{ width: "100%" }}
            >
              {banner.msg}
            </Alert>
          )}

          {/* Features */}
          <Stack
            spacing={2}
            sx={{
              width: "100%",
              p: 2.5,
              borderRadius: `${RADIUS.card}px`,
              background: SURFACE.raised,
              border: `1px solid ${LINE.hairline}`,
            }}
          >
            <FeaturePill
              icon="mdi:earth"
              text="Play real opponents worldwide"
            />
            <FeaturePill
              icon="mdi:lightning-bolt"
              text="Bullet, Blitz, Rapid & Classical"
            />
            <FeaturePill
              icon="mdi:chart-line"
              text="Your Lichess rating updates normally"
            />
            <FeaturePill
              icon="mdi:shield-check-outline"
              text="Secure sign-in, no passwords stored"
            />
          </Stack>

          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={connect}
            startIcon={<Icon icon="simple-icons:lichess" />}
          >
            Connect with Lichess
          </Button>

          <Typography variant="caption" color="text.secondary">
            <Icon
              icon="mdi:lock-outline"
              width={12}
              style={{ verticalAlign: "middle", marginRight: 4 }}
            />
            Only <strong>board:play</strong> and <strong>challenge</strong>{" "}
            scopes. Revoke any time from Lichess settings.
          </Typography>
        </Stack>
      </Box>
    );
  }

  /* ── Playing / finished ────────────────────────────────────────────────── */
  if (
    (phase === "playing" || phase === "finished") &&
    game &&
    gameState &&
    yourColor
  ) {
    return (
      <Stack
        key="lichess-board"
        spacing={2}
        alignItems="center"
        sx={{ width: "100%" }}
      >
        {streamError && (
          <Alert severity="warning" sx={{ alignSelf: "stretch" }}>
            {streamError}, trying to reconnect…
          </Alert>
        )}
        <LichessLiveBoard
          game={game}
          state={gameState}
          yourColor={yourColor}
          boardSize={boardSize}
          onMakeMove={makeMove}
          onResign={resign}
          onAbort={abort}
          onOfferDraw={offerDraw}
          onExit={reset}
        />
      </Stack>
    );
  }

  /* ── Seeking ───────────────────────────────────────────────────────────── */
  if (phase === "seeking") {
    return (
      <Box key="lichess-seeking" sx={{ maxWidth: 520, mx: "auto" }}>
        <Stack spacing={3} alignItems="center" sx={{ py: 4 }}>
          {/* Top status */}
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CircularProgress size={20} />
            <Typography sx={{ fontWeight: 600, fontSize: "1rem" }}>
              Waiting for opponent…
            </Typography>
          </Stack>

          {/* Board-sized placeholder while the seek is open */}
          <Box
            sx={{
              width: "100%",
              aspectRatio: "1",
              maxWidth: 400,
              borderRadius: `${RADIUS.card}px`,
              background: SURFACE.raised,
              border: `1px solid ${LINE.hairline}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <Icon
              icon="mdi:crown"
              width={48}
              style={{ color: ACCENT.main, marginBottom: 12 }}
            />
            <Typography sx={{ ...TYPE.h4, color: TEXT.primary }}>
              Finding opponent…
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {tc.label} {SPEED_LABEL[tc.speed] ?? tc.speed} ·{" "}
              {rated ? "Rated" : "Casual"}
            </Typography>
          </Box>

          <Button variant="outlined" onClick={cancelSeek} sx={{ px: 4 }}>
            Abort
          </Button>
        </Stack>
      </Box>
    );
  }

  /* ── Idle / Lobby ──────────────────────────────────────────────────────── */
  // Keyed for the same reason as the branches above: a fresh mount rather
  // than a patch over whatever view preceded it.
  return (
    <Box key="lichess-lobby" sx={{ maxWidth: 520, mx: "auto" }}>
      <Stack spacing={3}>
        {/* ── Profile card ── */}
        <Box
          sx={{
            position: "relative",
            p: 3,
            borderRadius: `${RADIUS.card}px`,
            background: SURFACE.raised,
            border: `1px solid ${LINE.hairline}`,
            overflow: "hidden",
          }}
        >
          <Stack spacing={2.5}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Stack direction="row" spacing={2} alignItems="center">
                {/* Avatar circle */}
                <Box
                  sx={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: ACCENT.tint,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: ACCENT.hover,
                    fontSize: "1.3rem",
                    fontWeight: 700,
                    border: `1px solid ${ACCENT.border}`,
                  }}
                >
                  {(user?.username ?? "?")[0].toUpperCase()}
                </Box>
                <Box>
                  <Typography sx={{ ...TYPE.h5, color: TEXT.primary }}>
                    {user?.title ? `${user.title} ` : ""}
                    {user?.username}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    on Lichess
                  </Typography>
                </Box>
              </Stack>
              <Button
                size="small"
                variant="text"
                onClick={disconnect}
                sx={{
                  color: TEXT.secondary,
                  "&:hover": { color: STATUS.error },
                }}
              >
                Disconnect
              </Button>
            </Stack>

            {/* Rating stats — show all available, highlight the one matching selected TC */}
            {user?.perfs && Object.keys(user.perfs).length > 0 ? (
              <Box
                sx={{
                  display: "flex",
                  gap: 2,
                  flexWrap: "wrap",
                  bgcolor: SURFACE.raisedSecondary,
                  border: `1px solid ${LINE.hairline}`,
                  borderRadius: `${RADIUS.control}px`,
                  p: 1.5,
                  px: 2,
                }}
              >
                {(["bullet", "blitz", "rapid", "classical"] as const)
                  .filter((k) => user.perfs?.[k])
                  .map((k) => (
                    <Box
                      key={k}
                      sx={{
                        opacity: k === tc.speed ? 1 : 0.5,
                        transition: "opacity 0.15s",
                      }}
                    >
                      <StatItem
                        label={SPEED_LABEL[k]}
                        value={String(user.perfs![k])}
                        icon="mdi:chart-line"
                      />
                    </Box>
                  ))}
              </Box>
            ) : user?.rating ? (
              <Box
                sx={{
                  display: "flex",
                  gap: 3,
                  bgcolor: SURFACE.raisedSecondary,
                  border: `1px solid ${LINE.hairline}`,
                  borderRadius: `${RADIUS.control}px`,
                  p: 1.5,
                  px: 2,
                }}
              >
                <StatItem
                  label={SPEED_LABEL[user.ratingPerf ?? ""] ?? "Rating"}
                  value={String(user.rating)}
                  icon="mdi:chart-line"
                />
              </Box>
            ) : null}
          </Stack>
        </Box>

        {banner && (
          <Alert
            severity={banner.kind === "ok" ? "success" : "error"}
            onClose={() => setBanner(null)}
          >
            {banner.msg}
          </Alert>
        )}

        {(streamError || submitError) && (
          <Alert severity="error" onClose={() => setSubmitError(null)}>
            {submitError ?? streamError}
          </Alert>
        )}

        {/* ── Start a game card ── */}
        <Box
          sx={{
            position: "relative",
            p: 3,
            borderRadius: `${RADIUS.card}px`,
            background: SURFACE.raised,
            border: `1px solid ${LINE.hairline}`,
            overflow: "hidden",
          }}
        >
          <Stack spacing={3}>
            <Typography sx={{ ...TYPE.h4, color: TEXT.primary }}>
              Start a game
            </Typography>

            {/* Rated toggle */}
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography sx={{ fontWeight: 600, fontSize: "0.95rem" }}>
                Rated game
              </Typography>
              <Switch
                checked={rated}
                onChange={(e) => setRated(e.target.checked)}
              />
            </Stack>

            <Divider />

            {/* Time control */}
            <Box>
              <Typography
                sx={{ ...TYPE.label, color: TEXT.secondary, mb: 1.5 }}
              >
                Time control
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
                  gap: 1,
                }}
              >
                {TIME_CONTROLS.map((opt) => {
                  const selected = opt.label === tc.label;
                  return (
                    <Button
                      key={opt.label}
                      onClick={() => setTc(opt)}
                      variant="outlined"
                      size="small"
                      aria-pressed={selected}
                      sx={{
                        minWidth: 0,
                        fontVariantNumeric: "tabular-nums",
                        ...(selected
                          ? {
                              background: ACCENT.tint,
                              borderColor: ACCENT.border,
                              color: ACCENT.hover,
                              "&:hover": {
                                background: ACCENT.tint,
                                borderColor: ACCENT.border,
                              },
                            }
                          : {}),
                      }}
                    >
                      {opt.label}
                    </Button>
                  );
                })}
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1, display: "block" }}
              >
                {SPEED_LABEL[tc.speed] ?? tc.speed}
                {tc.increment > 0 ? ` with ${tc.increment}s increment` : ""}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 0.5, display: "block" }}
              >
                Lichess limits app seeks to rapid and classical games, so faster
                time controls are not offered here.
              </Typography>
            </Box>

            <Divider />

            {/* Color select */}
            <Box>
              <Typography
                sx={{ ...TYPE.label, color: TEXT.secondary, mb: 1.5 }}
              >
                Your color
              </Typography>
              <Stack direction="row" spacing={1}>
                {(["random", "white", "black"] as const).map((c) => {
                  const sel = color === c;
                  const colorIcon =
                    c === "random"
                      ? "mdi:shuffle-variant"
                      : c === "white"
                        ? "mdi:circle-outline"
                        : "mdi:circle";
                  return (
                    <Button
                      key={c}
                      onClick={() => setColor(c)}
                      variant="outlined"
                      size="small"
                      startIcon={<Icon icon={colorIcon} width={16} />}
                      aria-pressed={sel}
                      sx={{
                        flex: 1,
                        ...(sel
                          ? {
                              background: ACCENT.tint,
                              borderColor: ACCENT.border,
                              color: ACCENT.hover,
                              "&:hover": {
                                background: ACCENT.tint,
                                borderColor: ACCENT.border,
                              },
                            }
                          : {}),
                      }}
                    >
                      {COLOR_LABEL[c]}
                    </Button>
                  );
                })}
              </Stack>
            </Box>

            {/* Start button */}
            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={async () => {
                setSubmitError(null);
                const opts: SeekOptions = {
                  time: tc.time,
                  increment: tc.increment,
                  rated,
                  color,
                };
                // Fire-and-forget — seekGame runs in the background consuming the stream.
                void seekGame(opts).catch((e) =>
                  setSubmitError((e as Error).message)
                );
              }}
            >
              Start game
            </Button>
          </Stack>
        </Box>

        {/* Footer */}
        <Stack
          direction="row"
          spacing={0.75}
          alignItems="center"
          justifyContent="center"
          sx={{ pb: 2 }}
        >
          <Icon
            icon="simple-icons:lichess"
            width={14}
            style={{ color: TEXT.secondary }}
          />
          <Typography variant="caption" color="text.secondary">
            Powered by Lichess
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
}

/* ── Sub-components ────────────────────────────────────────────────────────── */

function FeaturePill({ icon, text }: { icon: string; text: string }) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center">
      <Box sx={{ display: "flex", flexShrink: 0, color: ACCENT.main }}>
        <Icon icon={icon} width={20} />
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {text}
      </Typography>
    </Stack>
  );
}

function StatItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Icon icon={icon} width={18} style={{ color: ACCENT.main }} />
      <Box>
        <Typography
          sx={{ ...TYPE.caption, color: TEXT.secondary, lineHeight: 1.2 }}
        >
          {label}
        </Typography>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: "1.15rem",
            lineHeight: 1.1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </Typography>
      </Box>
    </Stack>
  );
}
