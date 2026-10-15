"use client";

import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Modal,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Masti } from "@/components/masti";
import { Chess } from "chess.js";
import {
  describePgnError,
  type PgnErrorDescription,
} from "@/lib/pgn/describePgnError";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Bookmark,
  ClipboardPaste,
  Globe,
  Search,
  X,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ACCENT,
  FONT_MONO,
  LINE,
  MOTION,
  RADIUS,
  SHADOW,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

// A dialog arrives with a short cross-fade and a small scale from the
// centre, and leaves the same way.
const DIALOG_TRANSITION = { duration: 0.18, ease: "easeOut" } as const;

// MUI Modal does cloneElement(child, { ref }) on its direct child. When
// that child is <AnimatePresence> (a fragment-shaped framer-motion
// container), there's no DOM node to attach the ref to and React fires
// `Warning: Failed prop type: Invalid prop \`children\` supplied to
// \`ForwardRef(Modal)\`. Expected an element that can hold a ref.`
// Wrapping AnimatePresence in a forwardRef'd div absorbs the ref
// cleanly. No visual change — the div is a positioning-neutral
// container Modal already accounts for.
const ModalChild = React.forwardRef<
  HTMLDivElement,
  { children: React.ReactNode }
>(function ModalChild({ children }, ref) {
  return <div ref={ref}>{children}</div>;
});
import type { LichessGame } from "@/types/lichess";
import type { ChessComGame } from "@/types/chessCom";
import { getLichessUserRecentGames } from "@/lib/lichess";
import { getChessComUserRecentGames } from "@/lib/chessCom";
import { useGameDatabase } from "@/hooks/useGameDatabase";
import type { Game } from "@/types/game";

type Tab = "paste" | "saved" | "lichess" | "chesscom";

interface LoadGameDialogProps {
  open: boolean;
  onClose: () => void;
  onLoad: (game: Chess) => void;
}

export function LoadGameDialog({ open, onClose, onLoad }: LoadGameDialogProps) {
  const [tab, setTab] = useState<Tab>("paste");

  // Reset to paste tab whenever dialog reopens
  useEffect(() => {
    if (open) setTab("paste");
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAfterTransition
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        outline: "none",
        p: 2,
      }}
    >
      <ModalChild>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={DIALOG_TRANSITION}
              // Centering handled by the parent Modal's flexbox (added in its sx).
              // Must NOT set position:fixed + translate(-50%,-50%) here —
              // framer-motion animates y/scale and owns `transform`, so it would
              // overwrite the centering and drop the dialog off-center.
              style={{ outline: "none" }}
            >
              <Box
                role="dialog"
                aria-modal="true"
                aria-label="Load game"
                sx={{
                  width: { xs: "92vw", sm: 560 },
                  maxWidth: "92vw",
                  // Round-2 smoke (2026-05-29): submit button rendered at
                  // y=771 in a 724px viewport. Root cause was that the body
                  // flex child couldn't shrink below its intrinsic
                  // content-min-height (TextField multiline minRows=8 has a
                  // hefty min-content), so the dialog overflowed
                  // maxHeight:84vh even with overflow:hidden on the outer.
                  // Drop to 80vh and let the body section's min-height:0
                  // (below) let flex shrink work correctly. Net: dialog
                  // never extends past the viewport; if the body content
                  // is too tall, it scrolls internally.
                  maxHeight: "80vh",
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: `${RADIUS.sheet}px`,
                  background: SURFACE.overlay,
                  border: `1px solid ${LINE.hairline}`,
                  boxShadow: SHADOW.modal,
                  color: TEXT.primary,
                  overflow: "hidden",
                }}
              >
                {/* Header */}
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1.5}
                  sx={{
                    px: 3,
                    py: 2,
                    borderBottom: `1px solid ${LINE.hairline}`,
                  }}
                >
                  <ClipboardPaste
                    size={18}
                    strokeWidth={1.75}
                    color={TEXT.secondary}
                  />
                  <Typography
                    component="h2"
                    sx={{ flex: 1, ...TYPE.h4, color: TEXT.primary }}
                  >
                    Load a game
                  </Typography>
                  <IconButton
                    onClick={onClose}
                    aria-label="Close"
                    sx={{ color: TEXT.secondary }}
                  >
                    <X size={16} />
                  </IconButton>
                </Stack>

                {/* Tab strip */}
                <Box
                  role="tablist"
                  aria-label="Game source"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    px: 1.5,
                    py: 1,
                    borderBottom: `1px solid ${LINE.hairline}`,
                  }}
                >
                  {(
                    [
                      { id: "paste", label: "Paste PGN", icon: ClipboardPaste },
                      { id: "saved", label: "Saved", icon: Bookmark },
                      { id: "lichess", label: "Lichess", icon: Globe },
                      { id: "chesscom", label: "Chess.com", icon: Globe },
                    ] as { id: Tab; label: string; icon: typeof Globe }[]
                  ).map(({ id, label, icon: Icon }) => {
                    const isActive = tab === id;
                    return (
                      <Box
                        key={id}
                        component="button"
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setTab(id)}
                        sx={{
                          position: "relative",
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 0.85,
                          px: 1.5,
                          py: 0.85,
                          border: "none",
                          background: "transparent",
                          font: "inherit",
                          borderRadius: `${RADIUS.small}px`,
                          cursor: "pointer",
                          color: isActive ? TEXT.primary : TEXT.secondary,
                          fontSize: TYPE.bodySmall.fontSize,
                          fontWeight: 600,
                          transition: `color ${MOTION.hover}`,
                          "&:hover": { color: TEXT.primary },
                          "&:focus-visible": {
                            outline: `2px solid ${TEXT.primary}`,
                            outlineOffset: 2,
                          },
                        }}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="loadGameTabIndicator"
                            transition={MOTION.springSheet}
                            style={{
                              position: "absolute",
                              inset: 0,
                              borderRadius: RADIUS.small,
                              background: "rgba(255,255,255,0.1)",
                            }}
                          />
                        )}
                        <Box
                          sx={{
                            position: "relative",
                            display: "flex",
                            alignItems: "center",
                            gap: 0.85,
                            zIndex: 1,
                          }}
                        >
                          <Icon size={13} />
                          <Box component="span">{label}</Box>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>

                {/* Tab body */}
                <Box
                  sx={{
                    flex: 1,
                    // CRITICAL flexbox gotcha: without min-height: 0 the
                    // body can't shrink below its content's min-content
                    // height, so overflowY:auto becomes a no-op and the
                    // whole dialog overflows the viewport. The submit
                    // button at the bottom of the body then renders at
                    // y > viewport-height and clicks miss.
                    minHeight: 0,
                    overflowY: "auto",
                    p: 3,
                  }}
                >
                  {tab === "paste" && (
                    <PastePgnTab
                      onLoad={(g) => {
                        onLoad(g);
                        onClose();
                      }}
                    />
                  )}
                  {tab === "saved" && (
                    <SavedGamesTab
                      onLoad={(g) => {
                        onLoad(g);
                        onClose();
                      }}
                    />
                  )}
                  {tab === "lichess" && (
                    <LichessTab
                      onLoad={(g) => {
                        onLoad(g);
                        onClose();
                      }}
                    />
                  )}
                  {tab === "chesscom" && (
                    <ChessComTab
                      onLoad={(g) => {
                        onLoad(g);
                        onClose();
                      }}
                    />
                  )}
                </Box>
              </Box>
            </motion.div>
          )}
        </AnimatePresence>
      </ModalChild>
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Paste PGN tab
// ───────────────────────────────────────────────────────────────────────────────

function PastePgnTab({ onLoad }: { onLoad: (game: Chess) => void }) {
  const [pgn, setPgn] = useState("");
  const [error, setError] = useState<PgnErrorDescription | null>(null);

  const handleLoad = useCallback(() => {
    const trimmed = pgn.trim();
    if (!trimmed) {
      setError({ headline: "Paste a PGN first." });
      return;
    }
    try {
      const g = new Chess();
      g.loadPgn(trimmed);
      const history = g.history();
      if (history.length === 0) {
        setError({
          headline: "Couldn't find any moves in that PGN.",
          detail:
            "A PGN is numbered moves like 1. e4 e5 2. Nf3. Headers in [brackets] are optional.",
        });
        return;
      }
      onLoad(g);
    } catch (err) {
      // chess.js's parser error is precise and unreadable ("Expected brace
      // comment, end of input, game termination marker, … but "a" found").
      // Say what kind of thing went wrong; keep the detail underneath.
      setError(
        describePgnError(
          err instanceof Error ? err.message : String(err),
          trimmed
        )
      );
    }
  }, [pgn, onLoad]);

  return (
    <Stack spacing={1.5}>
      <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}>
        Paste a PGN from any source: Lichess, Chess.com, a database, your
        clipboard. Headers (Event, White, Black, Date) are optional.
      </Typography>
      <TextField
        value={pgn}
        onChange={(e) => {
          setPgn(e.target.value);
          setError(null);
        }}
        placeholder={`[Event "Casual game"]\n[White "You"]\n[Black "Opponent"]\n\n1. e4 e5 2. Nf3 Nc6 ...`}
        multiline
        minRows={6}
        maxRows={14}
        fullWidth
        // Notation is the one place monospace belongs.
        InputProps={{
          sx: { fontFamily: FONT_MONO, fontSize: TYPE.bodySmall.fontSize },
        }}
      />
      {error && (
        <Box
          role="alert"
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 1,
            px: 1.25,
            py: 1,
            borderRadius: `${RADIUS.control}px`,
            background: STATUS.errorTint,
            border: `1px solid ${LINE.hairline}`,
          }}
        >
          <AlertTriangle
            size={16}
            strokeWidth={1.75}
            color={STATUS.error}
            style={{ marginTop: 1, flexShrink: 0 }}
          />
          <Typography sx={{ ...TYPE.caption, color: TEXT.primary }}>
            {error.headline}
            {error.detail && (
              <Box
                component="span"
                sx={{ display: "block", mt: 0.5, color: TEXT.secondary }}
              >
                {error.detail}
              </Box>
            )}
          </Typography>
        </Box>
      )}
      <Stack direction="row" justifyContent="flex-end" spacing={1}>
        <Button onClick={handleLoad} variant="contained" sx={primaryButtonSx}>
          Analyze
        </Button>
      </Stack>
    </Stack>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Saved games tab — Firestore/IndexedDB-backed via useGameDatabase. Surfaces
// every game the user has saved via the nav bar's "Save" button (G4
// in the cutover-gaps PR). Smoke test on 2026-05-29 found the data path
// worked but no UI consumed it; this tab is the missing surface.
// ───────────────────────────────────────────────────────────────────────────────

function SavedGamesTab({ onLoad }: { onLoad: (game: Chess) => void }) {
  // shouldFetchGames=true asks the hook to actually populate `games` from
  // the IndexedDB store + cloud-sync on mount.
  const { games } = useGameDatabase(true);

  // Sort newest-first when a date header is present; otherwise preserve
  // IndexedDB insertion order so saves stay grouped sensibly.
  const sortedGames = useMemo<Game[]>(() => {
    if (!games) return [];
    return [...games].sort((a, b) => {
      const aDate = a.date ?? "";
      const bDate = b.date ?? "";
      if (aDate && bDate) return bDate.localeCompare(aDate);
      // Fallback: higher IndexedDB id = saved later
      return (b.id ?? 0) - (a.id ?? 0);
    });
  }, [games]);

  if (!games) {
    return (
      <Stack alignItems="center" spacing={1.5} sx={{ py: 4 }}>
        <Masti mood="thinking" size={72} loops={0} decorative />
        <Typography
          role="status"
          sx={{ ...TYPE.caption, color: TEXT.secondary }}
        >
          Loading your saved games
        </Typography>
      </Stack>
    );
  }

  if (sortedGames.length === 0) {
    return (
      <Stack alignItems="center" spacing={1.5} sx={{ py: 5, px: 2 }}>
        <Masti mood="idea" size={80} loops={2} decorative />
        <Typography sx={{ ...TYPE.h5, color: TEXT.primary }}>
          No saved games yet
        </Typography>
        <Typography
          sx={{
            ...TYPE.bodySmall,
            color: TEXT.secondary,
            textAlign: "center",
            maxWidth: 320,
          }}
        >
          Hit{" "}
          <Box component="span" sx={{ color: TEXT.primary, fontWeight: 600 }}>
            Save game
          </Box>{" "}
          in the analysis header once you&apos;ve loaded a game, and it&apos;ll
          show up here.
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={0.5}>
      <Typography sx={{ ...TYPE.caption, color: TEXT.secondary, mb: 0.5 }}>
        {sortedGames.length} saved game{sortedGames.length === 1 ? "" : "s"}.
        Click any row to load.
      </Typography>
      {sortedGames.map((g) => (
        <Box
          key={g.id}
          component="button"
          type="button"
          onClick={() => {
            try {
              const chess = new Chess();
              chess.loadPgn(g.pgn);
              onLoad(chess);
            } catch (err) {
              console.warn("[saved games] PGN load failed:", err);
            }
          }}
          sx={listRowSx}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
            sx={{ flex: 1, minWidth: 0 }}
          >
            <Box sx={{ minWidth: 0, flex: 1, textAlign: "left" }}>
              <Typography
                sx={{
                  ...TYPE.bodySmall,
                  fontWeight: 600,
                  color: TEXT.primary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {g.white.name} vs {g.black.name}
              </Typography>
              <Typography
                sx={{
                  ...TYPE.caption,
                  color: TEXT.secondary,
                  mt: 0.15,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {[g.event, g.date].filter(Boolean).join(" · ") || "No details"}
              </Typography>
            </Box>
            {g.result && (
              <Box
                sx={{
                  flexShrink: 0,
                  px: 1,
                  py: 0.25,
                  minHeight: 24,
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: `${RADIUS.small}px`,
                  background: SURFACE.raisedTertiary,
                  fontSize: TYPE.caption.fontSize,
                  fontWeight: 500,
                  color: TEXT.primary,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {g.result}
              </Box>
            )}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Lichess tab
// ───────────────────────────────────────────────────────────────────────────────

function LichessTab({ onLoad }: { onLoad: (game: Chess) => void }) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<LichessGame[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const handleFetch = useCallback(async () => {
    const u = username.trim();
    if (!u) {
      setError("Enter a Lichess username first.");
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    setGames([]);
    try {
      const result = await getLichessUserRecentGames(u, ac.signal);
      if (ac.signal.aborted) return;
      if (result.length === 0) {
        setError(`No recent games found for ${u}.`);
      } else {
        setGames(result);
      }
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Couldn't reach Lichess.");
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [username]);

  return (
    <Stack spacing={1.5}>
      <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}>
        Search any Lichess username. We'll fetch their 50 most recent games.
        Click any one to analyze.
      </Typography>
      <Stack direction="row" spacing={1}>
        <TextField
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleFetch();
          }}
          placeholder="e.g. DrNykterstein"
          fullWidth
        />
        <Button
          onClick={handleFetch}
          disabled={loading || !username.trim()}
          startIcon={
            loading ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <Search size={14} strokeWidth={1.75} />
            )
          }
          sx={primaryButtonSx}
        >
          {loading ? "Searching" : "Fetch"}
        </Button>
      </Stack>
      {error && <ErrorPill text={error} />}
      <GameList games={games} kind="lichess" onLoad={onLoad} />
    </Stack>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Chess.com tab
// ───────────────────────────────────────────────────────────────────────────────

function ChessComTab({ onLoad }: { onLoad: (game: Chess) => void }) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<ChessComGame[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const handleFetch = useCallback(async () => {
    const u = username.trim();
    if (!u) {
      setError("Enter a Chess.com username first.");
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    setGames([]);
    try {
      const result = await getChessComUserRecentGames(u, ac.signal);
      if (ac.signal.aborted) return;
      if (result.length === 0) {
        setError(`No recent games found for ${u}.`);
      } else {
        setGames(result);
      }
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(
        err instanceof Error ? err.message : "Couldn't reach Chess.com."
      );
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [username]);

  return (
    <Stack spacing={1.5}>
      <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}>
        Search any Chess.com username. We fetch the current month's archive
        first, then last month if needed.
      </Typography>
      <Stack direction="row" spacing={1}>
        <TextField
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleFetch();
          }}
          placeholder="e.g. Hikaru"
          fullWidth
        />
        <Button
          onClick={handleFetch}
          disabled={loading || !username.trim()}
          startIcon={
            loading ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <Search size={14} strokeWidth={1.75} />
            )
          }
          sx={primaryButtonSx}
        >
          {loading ? "Searching" : "Fetch"}
        </Button>
      </Stack>
      {error && <ErrorPill text={error} />}
      <GameList games={games} kind="chesscom" onLoad={onLoad} />
    </Stack>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Shared: game list, error pill, shared styles
// ───────────────────────────────────────────────────────────────────────────────

function GameList({
  games,
  kind,
  onLoad,
}: {
  games: LichessGame[] | ChessComGame[];
  kind: "lichess" | "chesscom";
  onLoad: (game: Chess) => void;
}) {
  if (games.length === 0) return null;
  return (
    <Stack spacing={0.5} sx={{ maxHeight: 360, overflowY: "auto", pr: 0.5 }}>
      {games.map((g) => {
        const meta =
          kind === "lichess"
            ? lichessMeta(g as LichessGame)
            : chessComMeta(g as ChessComGame);
        return (
          <Box
            key={meta.id}
            component="button"
            type="button"
            onClick={() => {
              try {
                const chess = new Chess();
                chess.loadPgn(meta.pgn);
                onLoad(chess);
              } catch (err) {
                console.warn("Couldn't load selected game:", err);
              }
            }}
            sx={listRowSx}
          >
            <Box sx={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <Typography
                sx={{
                  ...TYPE.bodySmall,
                  fontWeight: 600,
                  color: TEXT.primary,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {meta.white}{" "}
                <Box component="span" sx={{ color: TEXT.secondary }}>
                  vs
                </Box>{" "}
                {meta.black}
              </Typography>
              <Stack
                direction="row"
                spacing={1.5}
                sx={{
                  mt: 0.25,
                  ...TYPE.caption,
                  color: TEXT.secondary,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <Box>{meta.dateLabel}</Box>
                {meta.speed && <Box>· {meta.speed}</Box>}
              </Stack>
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}

function lichessMeta(g: LichessGame) {
  const w = g.players?.white?.user?.name ?? "?";
  const b = g.players?.black?.user?.name ?? "?";
  const date = new Date(g.lastMoveAt);
  return {
    id: g.id,
    pgn: g.pgn,
    white: w,
    black: b,
    speed: g.speed,
    dateLabel: date.toLocaleDateString(),
  };
}

function chessComMeta(g: ChessComGame) {
  const date = new Date(g.end_time * 1000);
  return {
    id: g.uuid,
    pgn: g.pgn,
    white: g.white.username,
    black: g.black.username,
    speed: g.time_class,
    dateLabel: date.toLocaleDateString(),
  };
}

function ErrorPill({ text }: { text: string }) {
  return (
    <Box
      role="alert"
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 1,
        px: 1.25,
        py: 1,
        borderRadius: `${RADIUS.control}px`,
        background: STATUS.errorTint,
        border: `1px solid ${LINE.hairline}`,
      }}
    >
      <AlertTriangle
        size={16}
        strokeWidth={1.75}
        color={STATUS.error}
        style={{ marginTop: 1, flexShrink: 0 }}
      />
      <Typography sx={{ ...TYPE.caption, color: TEXT.primary }}>
        {text}
      </Typography>
    </Box>
  );
}

// A game row: a real button, the list-row recipe (hover one step lighter,
// press darkens, no lift). The theme styles the inputs, so the username and
// PGN fields carry no sx of their own.
const listRowSx = {
  display: "flex",
  alignItems: "center",
  gap: 1,
  width: "100%",
  px: 1.5,
  py: 1.25,
  minHeight: 44,
  border: `1px solid ${LINE.hairline}`,
  background: SURFACE.raisedSecondary,
  color: TEXT.primary,
  font: "inherit",
  textAlign: "left",
  cursor: "pointer",
  borderRadius: `${RADIUS.small}px`,
  transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}`,
  "&:hover": {
    background: SURFACE.raisedTertiary,
    borderColor: LINE.strong,
  },
  "&:active": { background: SURFACE.raisedTertiary },
  "&:focus-visible": {
    outline: `2px solid ${TEXT.primary}`,
    outlineOffset: 2,
  },
} as const;

// The theme gives the Button its pill, size and press feedback; this only
// picks the ember look of the one primary action.
const primaryButtonSx = {
  flexShrink: 0,
  background: ACCENT.main,
  color: TEXT.onAccent,
  "&:hover": { background: ACCENT.hover },
  "&.Mui-disabled": {
    background: "rgba(255,255,255,0.08)",
    color: TEXT.tertiary,
  },
};
