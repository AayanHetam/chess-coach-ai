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
import { Chess } from "chess.js";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bookmark,
  ClipboardPaste,
  Globe,
  Search,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// MUI Modal does cloneElement(child, { ref }) on its direct child. When
// that child is <AnimatePresence> (a fragment-shaped framer-motion
// container), there's no DOM node to attach the ref to and React fires
// `Warning: Failed prop type: Invalid prop \`children\` supplied to
// \`ForwardRef(Modal)\`. Expected an element that can hold a ref.`
// Wrapping AnimatePresence in a forwardRef'd div absorbs the ref
// cleanly. No visual change — the div is a positioning-neutral
// container Modal already accounts for.
const ModalChild = React.forwardRef<HTMLDivElement, { children: React.ReactNode }>(
  function ModalChild({ children }, ref) {
    return <div ref={ref}>{children}</div>;
  }
);
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
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: "rgba(8,9,12,0.78)",
            backdropFilter: "blur(8px)",
          },
        },
      }}
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
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{
              duration: 0.28,
              ease: [0.22, 0.61, 0.36, 1],
            }}
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
                borderRadius: "1.5rem",
                background:
                  "linear-gradient(180deg, rgba(20,22,28,0.92), rgba(12,14,20,0.92))",
                backdropFilter: "blur(20px) saturate(150%)",
                WebkitBackdropFilter: "blur(20px) saturate(150%)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow:
                  "0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.94)",
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
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: "10px",
                    background:
                      "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
                    boxShadow: "0 0 16px rgba(249,115,22,0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ClipboardPaste size={14} color="#0A0A0A" />
                </Box>
                <Typography
                  sx={{
                    flex: 1,
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.94)",
                  }}
                >
                  Load a game
                </Typography>
                <IconButton
                  onClick={onClose}
                  sx={{
                    color: "rgba(255,255,255,0.6)",
                    "&:hover": {
                      color: "rgba(255,255,255,0.95)",
                      background: "rgba(255,255,255,0.05)",
                    },
                  }}
                >
                  <X size={16} />
                </IconButton>
              </Stack>

              {/* Tab strip */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  px: 1.5,
                  py: 1,
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(255,255,255,0.02)",
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
                        borderRadius: "0.55rem",
                        cursor: "pointer",
                        color: isActive ? "#0A0A0A" : "rgba(255,255,255,0.62)",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        transition: "color 180ms ease",
                        "&:hover": {
                          color: isActive
                            ? "#0A0A0A"
                            : "rgba(255,255,255,0.92)",
                        },
                      }}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="loadGameTabIndicator"
                          transition={{
                            type: "spring",
                            stiffness: 420,
                            damping: 34,
                          }}
                          style={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: "0.55rem",
                            background:
                              "linear-gradient(135deg, #F97316 0%, #FB923C 100%)",
                            boxShadow: "0 4px 16px rgba(249,115,22,0.32)",
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
                  "&::-webkit-scrollbar": { width: 6 },
                  "&::-webkit-scrollbar-thumb": {
                    background: "rgba(249,115,22,0.2)",
                    borderRadius: "3px",
                  },
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
  const [error, setError] = useState<string | null>(null);

  const handleLoad = useCallback(() => {
    const trimmed = pgn.trim();
    if (!trimmed) {
      setError("Paste a PGN first.");
      return;
    }
    try {
      const g = new Chess();
      g.loadPgn(trimmed);
      const history = g.history();
      if (history.length === 0) {
        setError("Couldn't parse any moves from that PGN.");
        return;
      }
      onLoad(g);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't parse that PGN."
      );
    }
  }, [pgn, onLoad]);

  return (
    <Stack spacing={1.5}>
      <Typography sx={{ fontSize: "0.86rem", color: "rgba(255,255,255,0.65)" }}>
        Paste a PGN from any source — Lichess, Chess.com, a database, your
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
        sx={{
          "& .MuiOutlinedInput-root": {
            backgroundColor: "rgba(255,255,255,0.03)",
            borderRadius: "12px",
            fontFamily: "Monaco, Menlo, monospace",
            fontSize: "0.82rem",
            "& fieldset": { borderColor: "rgba(255,255,255,0.1)" },
            "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2)" },
            "&.Mui-focused fieldset": {
              borderColor: "rgba(249,115,22,0.5)",
              borderWidth: "1px",
            },
          },
          "& .MuiOutlinedInput-input": {
            color: "rgba(255,255,255,0.95)",
            "&::placeholder": {
              color: "rgba(255,255,255,0.3)",
              opacity: 1,
            },
          },
        }}
      />
      {error && (
        <Typography
          sx={{
            fontSize: "0.8rem",
            color: "#fca5a5",
            background: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: "0.55rem",
            px: 1.25,
            py: 0.85,
          }}
        >
          {error}
        </Typography>
      )}
      <Stack direction="row" justifyContent="flex-end" spacing={1}>
        <Button
          onClick={handleLoad}
          sx={{
            px: 2,
            py: 0.85,
            borderRadius: "0.65rem",
            fontSize: "0.82rem",
            fontWeight: 700,
            background: "linear-gradient(135deg, #F97316 0%, #FB923C 100%)",
            color: "#0A0A0A",
            "&:hover": {
              background: "linear-gradient(135deg, #FB923C 0%, #FCD34D 100%)",
            },
          }}
        >
          Analyze
        </Button>
      </Stack>
    </Stack>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Saved games tab — Firestore/IndexedDB-backed via useGameDatabase. Surfaces
// every game the user has saved via the GameHeader "Save game" button (G4
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
        <CircularProgress size={20} sx={{ color: "#FB923C" }} />
        <Typography
          sx={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.5)" }}
        >
          Loading your saved games…
        </Typography>
      </Stack>
    );
  }

  if (sortedGames.length === 0) {
    return (
      <Stack alignItems="center" spacing={1.5} sx={{ py: 5, px: 2 }}>
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: "999px",
            background: "rgba(249,115,22,0.08)",
            border: "1px solid rgba(249,115,22,0.24)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Bookmark size={22} color="#FB923C" />
        </Box>
        <Typography
          sx={{
            fontSize: "0.92rem",
            fontWeight: 700,
            color: "rgba(255,255,255,0.88)",
          }}
        >
          No saved games yet
        </Typography>
        <Typography
          sx={{
            fontSize: "0.82rem",
            color: "rgba(255,255,255,0.5)",
            textAlign: "center",
            maxWidth: 320,
          }}
        >
          Hit{" "}
          <Box
            component="span"
            sx={{ color: "#FB923C", fontWeight: 700 }}
          >
            Save game
          </Box>{" "}
          in the analysis header — Kasparov-Topalov 1999 is loaded by
          default if you just want to try it.
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={0.85}>
      <Typography
        sx={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.6)", mb: 0.5 }}
      >
        {sortedGames.length} saved game{sortedGames.length === 1 ? "" : "s"} —
        click any row to load.
      </Typography>
      {sortedGames.map((g) => (
        <Box
          key={g.id}
          onClick={() => {
            try {
              const chess = new Chess();
              chess.loadPgn(g.pgn);
              onLoad(chess);
            } catch (err) {
              console.warn("[saved games] PGN load failed:", err);
            }
          }}
          sx={{
            cursor: "pointer",
            p: 1.5,
            borderRadius: "0.7rem",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            transition: "all 180ms ease",
            "&:hover": {
              background: "rgba(249,115,22,0.08)",
              borderColor: "rgba(249,115,22,0.32)",
              transform: "translateY(-1px)",
            },
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                sx={{
                  fontSize: "0.92rem",
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.94)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {g.white.name} vs {g.black.name}
              </Typography>
              <Typography
                sx={{
                  fontSize: "0.74rem",
                  color: "rgba(255,255,255,0.45)",
                  mt: 0.15,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {[g.event, g.date].filter(Boolean).join(" · ") || "—"}
              </Typography>
            </Box>
            {g.result && (
              <Box
                sx={{
                  flexShrink: 0,
                  px: 1,
                  py: 0.25,
                  borderRadius: "999px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.7)",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, monospace",
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
      setError(
        err instanceof Error ? err.message : "Couldn't reach Lichess."
      );
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [username]);

  return (
    <Stack spacing={1.5}>
      <Typography sx={{ fontSize: "0.86rem", color: "rgba(255,255,255,0.65)" }}>
        Search any Lichess username. We'll fetch their 50 most recent games —
        click any one to analyze.
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
          sx={textFieldSx}
        />
        <Button
          onClick={handleFetch}
          disabled={loading || !username.trim()}
          startIcon={
            loading ? (
              <CircularProgress size={12} sx={{ color: "#0A0A0A" }} />
            ) : (
              <Search size={13} />
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
      <Typography sx={{ fontSize: "0.86rem", color: "rgba(255,255,255,0.65)" }}>
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
          sx={textFieldSx}
        />
        <Button
          onClick={handleFetch}
          disabled={loading || !username.trim()}
          startIcon={
            loading ? (
              <CircularProgress size={12} sx={{ color: "#0A0A0A" }} />
            ) : (
              <Search size={13} />
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
    <Stack
      spacing={0.5}
      sx={{
        maxHeight: 360,
        overflowY: "auto",
        pr: 0.5,
        "&::-webkit-scrollbar": { width: 4 },
        "&::-webkit-scrollbar-thumb": {
          background: "rgba(249,115,22,0.18)",
          borderRadius: "2px",
        },
      }}
    >
      {games.map((g) => {
        const meta = kind === "lichess" ? lichessMeta(g as LichessGame) : chessComMeta(g as ChessComGame);
        return (
          <Box
            key={meta.id}
            onClick={() => {
              try {
                const chess = new Chess();
                chess.loadPgn(meta.pgn);
                onLoad(chess);
              } catch (err) {
                console.warn("Couldn't load selected game:", err);
              }
            }}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 1.25,
              py: 0.85,
              borderRadius: "0.55rem",
              cursor: "pointer",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
              transition: "all 160ms ease",
              "&:hover": {
                background: "rgba(249,115,22,0.06)",
                borderColor: "rgba(249,115,22,0.3)",
              },
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.94)",
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {meta.white} <Box component="span" sx={{ color: "rgba(255,255,255,0.4)" }}>vs</Box> {meta.black}
              </Typography>
              <Stack
                direction="row"
                spacing={1.5}
                sx={{
                  mt: 0.25,
                  fontSize: "0.72rem",
                  color: "rgba(255,255,255,0.5)",
                  fontFamily: "Monaco, Menlo, monospace",
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
    <Typography
      sx={{
        fontSize: "0.8rem",
        color: "#fca5a5",
        background: "rgba(239,68,68,0.06)",
        border: "1px solid rgba(239,68,68,0.2)",
        borderRadius: "0.55rem",
        px: 1.25,
        py: 0.85,
      }}
    >
      {text}
    </Typography>
  );
}

const textFieldSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: "12px",
    fontSize: "0.88rem",
    "& fieldset": { borderColor: "rgba(255,255,255,0.1)" },
    "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2)" },
    "&.Mui-focused fieldset": {
      borderColor: "rgba(249,115,22,0.5)",
      borderWidth: "1px",
    },
  },
  "& .MuiOutlinedInput-input": {
    color: "rgba(255,255,255,0.95)",
    "&::placeholder": {
      color: "rgba(255,255,255,0.3)",
      opacity: 1,
    },
  },
};

const primaryButtonSx = {
  flexShrink: 0,
  px: 2,
  py: 0.85,
  borderRadius: "0.65rem",
  fontSize: "0.82rem",
  fontWeight: 700,
  background: "linear-gradient(135deg, #F97316 0%, #FB923C 100%)",
  color: "#0A0A0A",
  textTransform: "none" as const,
  "&:hover": {
    background: "linear-gradient(135deg, #FB923C 0%, #FCD34D 100%)",
  },
  "&.Mui-disabled": {
    background: "rgba(255,255,255,0.05)",
    color: "rgba(255,255,255,0.4)",
  },
};
