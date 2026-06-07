"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Box,
  Button,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { motion } from "framer-motion";
import { ArrowUp, RotateCcw, Sparkles, Target } from "lucide-react";
import { Chess } from "chess.js";
import {
  PuzzleCoachBubble,
  PuzzleCoachThinkingBubble,
} from "./PuzzleCoachBubble";
import { HintStageRow } from "./HintStageRow";
import type {
  PuzzleContext,
  PuzzleOutcome,
} from "@/lib/validation/puzzleChatSchemas";
import type {
  HintStage,
  PuzzleHintResponse,
  TermMention,
} from "@/lib/validation/puzzleHintSchemas";

/**
 * Puzzle Coach Panel — the right-column chat surface on /preview/puzzles.
 *
 * Owns:
 *   - chat history (turns array)
 *   - SSE stream consumption from /api/puzzle-chat
 *   - input box + send handling
 *   - "drill 3 more like this" CTA
 *   - auto-fired turn-0 explanation when the puzzle's outcome lands
 *
 * The panel is "scoped to the current puzzle" — when the parent swaps
 * `puzzle.id`, the history resets. This guarantees the coach never bleeds
 * context from one puzzle to the next.
 *
 * Spec recap (Aayan 2026-05-31):
 *   - Sonnet for turn 0 (initial explanation), Haiku for follow-ups —
 *     enforced server-side via turnIndex.
 *   - Responses are short, conversational, quick.
 *   - Coach can render inline mini-boards via [POSITION_AFTER:...] tags
 *     (handled by PuzzleCoachBubble).
 *   - Coach is NOT the general AI coach; scope ends when the puzzle ends.
 */

const EASE_OUT_STRONG: [number, number, number, number] = [0.23, 1, 0.32, 1];

interface ChatTurn {
  role: "user" | "coach";
  content: string;
  streaming?: boolean;
  /** When this turn was produced by the hint pipeline, the stage marker.
   *  Drives where the HintStageRow renders (under the most-recent hint
   *  turn) and helps PR-C.3 wire mentions back to the bubble that
   *  produced them. */
  hintStage?: HintStage;
  /** Structured mentions[] from the hint response (PR-C.1). Stashed here
   *  so PR-C.3 can paint board overlays when the user taps a glossary
   *  chip in this turn's prose. */
  mentions?: TermMention[];
}

interface PuzzleCoachPanelProps {
  /** Current puzzle context. Resets chat history when `puzzle.id` changes. */
  puzzle: PuzzleContext;
  /** Latest attempt outcome — drives the auto-fired turn-0 explanation. */
  outcome: PuzzleOutcome;
  /** SAN of the user's most recent wrong move (for "wrong" outcomes). */
  userAttemptSan?: string | null;
  /** Optional user rating to tune the coach voice depth. */
  userRating?: number;
  /** Fired when the user clicks "Drill 3 more like this". Parent loads
   *  fresh puzzles of the same theme + swaps `puzzle` prop. */
  onRequestMorePuzzles?: () => void;
  /** Fired when the user resets the puzzle. Panel clears history. */
  onResetPuzzle?: () => void;
  /** Fired when the user taps "Show on board" inside a DemoMoveCard. Parent
   *  opens the DemoMoveDialog and drives the demo on the main board. */
  onCoachDemoRequest?: (moves: string[]) => void;
}

const SUGGESTED_FOLLOWUPS = [
  "Why didn't my move work?",
  "What's the pattern called?",
  "Show me another way",
  "When does this come up in real games?",
];

export function PuzzleCoachPanel({
  puzzle,
  outcome,
  userAttemptSan,
  userRating,
  onRequestMorePuzzles,
  onResetPuzzle,
  onCoachDemoRequest,
}: PuzzleCoachPanelProps) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Staged-hint pipeline state (PR-C.2). `hintsFired` tracks which stages
  // have already produced a turn this session — drives which buttons the
  // HintStageRow surfaces and which auto-fires are safe. `hintLoading`
  // marks the stage currently in flight so we can disable the row + show
  // a spinner on the right button.
  const [hintsFired, setHintsFired] = useState<HintStage[]>([]);
  const [hintLoading, setHintLoading] = useState<HintStage | null>(null);
  const hintsFiredRef = useRef<HintStage[]>([]);

  // Stable id ref so an in-flight stream aborts cleanly when the parent
  // swaps the puzzle. We compare current puzzle.id to the captured id on
  // each delta arrival; mismatch → drop the delta.
  const activePuzzleIdRef = useRef<string>(puzzle.id);
  const abortRef = useRef<AbortController | null>(null);

  // The FEN the coach's [POSITION_AFTER:...] tags are anchored to. Per
  // Lichess convention this is the position AFTER the opponent's setup
  // move (the position the student sees on the board, not the puzzle's
  // raw anchor FEN).
  const studentStartFen = useMemo(() => {
    try {
      const g = new Chess(puzzle.fen);
      const opp = puzzle.solution[0];
      if (opp) {
        g.move({
          from: opp.slice(0, 2),
          to: opp.slice(2, 4),
          promotion: opp.length > 4 ? opp.slice(4, 5) : undefined,
        });
      }
      return g.fen();
    } catch {
      return puzzle.fen;
    }
  }, [puzzle.fen, puzzle.solution]);

  // Reset chat when the puzzle changes (parent swaps puzzle.id).
  useEffect(() => {
    activePuzzleIdRef.current = puzzle.id;
    abortRef.current?.abort();
    abortRef.current = null;
    setTurns([]);
    setInput("");
    setStreaming(false);
    setError(null);
    setHintsFired([]);
    setHintLoading(null);
    hintsFiredRef.current = [];
  }, [puzzle.id]);

  // Keep the ref in sync so the wrong-outcome auto-fire effect doesn't
  // need `hintsFired` in its dep array (which would re-fire on every
  // stage completion).
  useEffect(() => {
    hintsFiredRef.current = hintsFired;
  }, [hintsFired]);

  // Stream-consumer factory shared by the auto-fired turn-0 explanation
  // and user-initiated follow-up turns. `turnIndex` is the server's
  // tier-picker (0 → Sonnet, ≥1 → Haiku).
  const fireTurn = useCallback(
    async (turnIndex: number, userMessage?: string) => {
      const capturedPuzzleId = puzzle.id;
      const ac = new AbortController();
      abortRef.current?.abort();
      abortRef.current = ac;
      setStreaming(true);
      setError(null);

      // Build the history snapshot that the server consumes. We translate
      // the panel's "coach" role to the API's "assistant" role.
      const apiHistory = turns.map((t) => ({
        role: t.role === "coach" ? "assistant" : t.role,
        content: t.content,
      }));

      // Insert the user-side bubble immediately (turn ≥ 1 only). Turn 0
      // is auto-fired with a synthetic trigger — we don't render it.
      if (turnIndex >= 1 && userMessage) {
        setTurns((prev) => [
          ...prev,
          { role: "user", content: userMessage },
          { role: "coach", content: "", streaming: true },
        ]);
      } else {
        // Turn 0 — push an empty coach bubble for the stream to fill.
        setTurns([{ role: "coach", content: "", streaming: true }]);
      }

      try {
        const resp = await fetch("/api/puzzle-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: ac.signal,
          body: JSON.stringify({
            puzzle,
            outcome,
            userAttemptSan: userAttemptSan ?? undefined,
            userRating,
            turnIndex,
            history: apiHistory,
            userMessage: turnIndex >= 1 ? userMessage : undefined,
          }),
        });
        if (!resp.ok || !resp.body) {
          throw new Error(`puzzle-chat HTTP ${resp.status}`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";
        let streamDone = false;

        while (!streamDone) {
          const { value, done } = await reader.read();
          if (done) {
            streamDone = true;
            break;
          }
          if (activePuzzleIdRef.current !== capturedPuzzleId) {
            // Puzzle changed mid-stream — drop the rest.
            try { reader.cancel(); } catch { /* ignore */ }
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          // SSE events separated by blank line.
          let evtEnd: number;
          while ((evtEnd = buffer.indexOf("\n\n")) !== -1) {
            const evt = buffer.slice(0, evtEnd);
            buffer = buffer.slice(evtEnd + 2);
            for (const line of evt.split("\n")) {
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              if (!data) continue;
              if (data === "[DONE]") continue;
              let parsed: any;
              try {
                parsed = JSON.parse(data);
              } catch {
                continue;
              }
              if (parsed.type === "text" && typeof parsed.delta === "string") {
                accumulated += parsed.delta;
                setTurns((prev) => {
                  if (prev.length === 0) return prev;
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last.role === "coach") {
                    next[next.length - 1] = {
                      ...last,
                      content: accumulated,
                      streaming: true,
                    };
                  }
                  return next;
                });
              } else if (parsed.type === "error") {
                throw new Error(parsed.error || "stream error");
              }
              // type === "meta" — we ignore for now (telemetry hook later).
            }
          }
        }

        // Stream done — flip streaming flag off on the last coach bubble.
        if (activePuzzleIdRef.current === capturedPuzzleId) {
          setTurns((prev) => {
            if (prev.length === 0) return prev;
            const next = [...prev];
            const last = next[next.length - 1];
            if (last.role === "coach") {
              next[next.length - 1] = {
                ...last,
                content: accumulated || last.content || "(no response)",
                streaming: false,
              };
            }
            return next;
          });
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          // Puzzle changed — silent.
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        if (activePuzzleIdRef.current === capturedPuzzleId) {
          setError(msg);
          setTurns((prev) => {
            if (prev.length === 0) return prev;
            const next = [...prev];
            const last = next[next.length - 1];
            if (last.role === "coach" && !last.content) {
              next[next.length - 1] = {
                ...last,
                content:
                  "Couldn't reach the coach. Check your connection and try again.",
                streaming: false,
              };
            } else {
              next[next.length - 1] = { ...last, streaming: false };
            }
            return next;
          });
        }
      } finally {
        if (activePuzzleIdRef.current === capturedPuzzleId) {
          setStreaming(false);
        }
      }
    },
    [puzzle, outcome, userAttemptSan, userRating, turns],
  );

  /** Staged-hint pipeline call (PR-C.1 API). Appends a thinking bubble,
   *  POSTs to /api/puzzle-hint, then replaces the bubble with the
   *  structured response. Records the stage in `hintsFired` so the row
   *  can advance + records mentions[] on the turn for PR-C.3's overlays.
   */
  const fireHintStage = useCallback(
    async (stage: HintStage) => {
      if (hintLoading) return;
      if (hintsFiredRef.current.includes(stage)) return;
      const capturedPuzzleId = puzzle.id;
      const ac = new AbortController();
      abortRef.current?.abort();
      abortRef.current = ac;
      setHintLoading(stage);
      setTurns((prev) => [
        ...prev,
        { role: "coach", content: "", streaming: true, hintStage: stage },
      ]);
      try {
        const resp = await fetch("/api/puzzle-hint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: ac.signal,
          body: JSON.stringify({
            puzzle,
            userAttemptSan: userAttemptSan ?? undefined,
            stage,
            userRating,
          }),
        });
        if (!resp.ok) throw new Error(`puzzle-hint HTTP ${resp.status}`);
        const data = (await resp.json()) as PuzzleHintResponse;
        if (activePuzzleIdRef.current !== capturedPuzzleId) return;

        // Splice SHOW_MOVE tag back into the rendered prose so the
        // existing PuzzleCoachBubble parser (PR-B) renders the demo card
        // inline. The server stripped the moves into showMoves[]; we
        // re-emit the tag at the end of the prose.
        let renderedProse = data.prose;
        if (data.showMoves && data.showMoves.length > 0) {
          renderedProse = `${data.prose}\n\n[SHOW_MOVE:${data.showMoves.join(" ")}]`;
        }

        setTurns((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "coach" && last.hintStage === stage) {
            next[next.length - 1] = {
              ...last,
              content: renderedProse,
              streaming: false,
              mentions: data.mentions,
            };
          }
          return next;
        });
        setHintsFired((prev) =>
          prev.includes(stage) ? prev : [...prev, stage],
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (activePuzzleIdRef.current !== capturedPuzzleId) return;
        setTurns((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "coach" && last.hintStage === stage) {
            next[next.length - 1] = {
              ...last,
              content:
                "Couldn't reach the coach. Try the button again in a moment.",
              streaming: false,
            };
          }
          return next;
        });
      } finally {
        if (activePuzzleIdRef.current === capturedPuzzleId) {
          setHintLoading(null);
        }
      }
    },
    [hintLoading, puzzle, userAttemptSan, userRating],
  );

  // Auto-fire on outcome change:
  //   - "wrong" → puzzle-hint pipeline (why_wrong stage), structured
  //   - "solved" → puzzle-chat (legacy conversational explanation)
  //   - "unattempted" → wait for the user to ask
  useEffect(() => {
    if (outcome === "unattempted") return;
    if (turns.length > 0) return;
    if (streaming || hintLoading) return;
    if (outcome === "wrong") {
      fireHintStage("why_wrong");
    } else {
      fireTurn(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, puzzle.id]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;
    setInput("");
    fireTurn(turns.filter((t) => t.role !== "coach" || t.content).length + 1, trimmed);
  }, [input, streaming, turns, fireTurn]);

  const handleSuggestion = useCallback(
    (s: string) => {
      if (streaming) return;
      setInput("");
      fireTurn(turns.filter((t) => t.role !== "coach" || t.content).length + 1, s);
    },
    [streaming, turns, fireTurn],
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        borderRadius: "1.5rem",
        background:
          "linear-gradient(180deg, rgba(255,122,26,0.04), rgba(22,18,14,0.5))",
        backdropFilter: "blur(16px) saturate(150%)",
        WebkitBackdropFilter: "blur(16px) saturate(150%)",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow:
          "0 16px 48px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2.5,
          py: 2,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: "12px",
            background:
              "linear-gradient(135deg, rgba(255,122,26,0.22), rgba(255,140,66,0.08))",
            border: "1px solid rgba(255,122,26,0.32)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Sparkles size={16} color="#FFD1A8" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: "0.95rem",
              fontWeight: 700,
              color: "rgba(255,240,224,0.96)",
              lineHeight: 1.1,
            }}
          >
            Puzzle Coach
          </Typography>
          <Typography
            sx={{
              fontSize: "0.72rem",
              color: "rgba(255,240,224,0.5)",
              mt: 0.25,
              fontFamily: "Monaco, Menlo, monospace",
            }}
          >
            #{puzzle.id}
            {puzzle.rating ? ` · ${puzzle.rating}` : ""}
            {puzzle.themes.length > 0 ? ` · ${puzzle.themes.slice(0, 2).join(", ")}` : ""}
          </Typography>
        </Box>
        {onResetPuzzle && (
          <IconButton
            size="small"
            onClick={onResetPuzzle}
            sx={{
              color: "rgba(255,240,224,0.55)",
              "&:hover": {
                color: "#FFD1A8",
                background: "rgba(255,122,26,0.08)",
              },
            }}
            aria-label="Reset puzzle"
          >
            <RotateCcw size={15} />
          </IconButton>
        )}
      </Box>

      {/* Scrollable transcript */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          px: 2.5,
          py: 2,
          "&::-webkit-scrollbar": { width: 6 },
          "&::-webkit-scrollbar-thumb": {
            background: "rgba(255,122,26,0.18)",
            borderRadius: 3,
          },
        }}
      >
        {turns.length === 0 && outcome === "unattempted" && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              minHeight: 200,
              color: "rgba(255,240,224,0.45)",
              textAlign: "center",
              px: 2,
            }}
          >
            <Target size={28} color="#FF7A1A" style={{ opacity: 0.5 }} />
            <Typography
              sx={{
                mt: 1.5,
                fontSize: "0.92rem",
                fontWeight: 600,
                color: "rgba(255,240,224,0.72)",
              }}
            >
              Solve the puzzle to start coaching
            </Typography>
            <Typography
              sx={{
                mt: 0.75,
                fontSize: "0.82rem",
                lineHeight: 1.5,
                color: "rgba(255,240,224,0.45)",
                maxWidth: 280,
              }}
            >
              I&apos;ll explain the reasoning the moment you solve it — or
              get stuck. Ask me anything about this position.
            </Typography>
          </Box>
        )}

        {turns.length === 0 && outcome !== "unattempted" && streaming && (
          <PuzzleCoachThinkingBubble />
        )}

        {turns.map((t, i) => (
          <PuzzleCoachBubble
            key={i}
            role={t.role}
            content={t.content || (t.streaming ? "" : "(empty)")}
            startFen={studentStartFen}
            streaming={!!t.streaming}
            onCoachDemoRequest={onCoachDemoRequest}
          />
        ))}

        {/* Staged-reveal button row (PR-C.2). Surfaces after `why_wrong`
            has produced a turn — the row decides which next-stage buttons
            to show based on what's already fired. */}
        {hintsFired.length > 0 && (
          <HintStageRow
            stagesFired={hintsFired}
            loading={hintLoading}
            onFire={fireHintStage}
          />
        )}

        {/* Drill-more CTA — only after a successful solve and the coach has
            finished its first explanation. */}
        {outcome === "solved" &&
          turns.length > 0 &&
          !streaming &&
          onRequestMorePuzzles && (
            <motion.div
              initial={{ opacity: 0, transform: "translateY(8px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              transition={{
                duration: 0.3,
                delay: 0.25,
                ease: EASE_OUT_STRONG,
              }}
            >
              <Box sx={{ mt: 1.5, pl: 4.5 }}>
                <Button
                  onClick={onRequestMorePuzzles}
                  startIcon={<Target size={15} />}
                  sx={{
                    px: 2.25,
                    py: 1,
                    borderRadius: "999px",
                    background:
                      "linear-gradient(135deg, rgba(255,122,26,0.18), rgba(255,140,66,0.08))",
                    border: "1px solid rgba(255,122,26,0.4)",
                    color: "#FFD1A8",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    textTransform: "none",
                    "&:hover": {
                      background:
                        "linear-gradient(135deg, rgba(255,122,26,0.28), rgba(255,140,66,0.14))",
                      borderColor: "rgba(255,122,26,0.6)",
                      boxShadow: "0 0 0 4px rgba(255,122,26,0.08)",
                    },
                    transition: "all 200ms cubic-bezier(0.23, 1, 0.32, 1)",
                  }}
                >
                  Drill 3 more like this
                </Button>
              </Box>
            </motion.div>
          )}

        {error && (
          <Typography
            sx={{
              color: "#fca5a5",
              fontSize: "0.78rem",
              mt: 1.5,
              px: 1,
            }}
          >
            {error}
          </Typography>
        )}
      </Box>

      {/* Suggestion chips + input — sticky at the bottom of the panel */}
      <Box
        sx={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(10,9,7,0.4)",
          px: 2,
          pt: 1.5,
          pb: 1.75,
        }}
      >
        {turns.length > 0 && !streaming && (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              mb: 1.25,
              flexWrap: "wrap",
              gap: 0.75,
              "& > *": { mt: 0 },
            }}
          >
            {SUGGESTED_FOLLOWUPS.map((s) => (
              <Box
                key={s}
                component="button"
                type="button"
                onClick={() => handleSuggestion(s)}
                disabled={streaming}
                sx={{
                  px: 1.25,
                  py: 0.5,
                  borderRadius: "999px",
                  background: "rgba(22,18,14,0.7)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,240,224,0.7)",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  cursor: streaming ? "default" : "pointer",
                  transition: "all 160ms ease",
                  "&:hover:not(:disabled)": {
                    borderColor: "rgba(255,122,26,0.4)",
                    color: "#FFD1A8",
                    background: "rgba(255,122,26,0.06)",
                  },
                  "&:disabled": { opacity: 0.5 },
                }}
              >
                {s}
              </Box>
            ))}
          </Stack>
        )}

        <Box
          sx={{
            display: "flex",
            alignItems: "flex-end",
            gap: 1,
            borderRadius: "0.9rem",
            background: "rgba(22,18,14,0.7)",
            border: "1px solid rgba(255,255,255,0.08)",
            px: 1.25,
            py: 0.5,
            transition: "border-color 200ms ease",
            "&:focus-within": {
              borderColor: "rgba(255,122,26,0.4)",
            },
          }}
        >
          <TextField
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              outcome === "unattempted"
                ? "Ask for a hint…"
                : "Ask about this puzzle…"
            }
            multiline
            maxRows={4}
            disabled={streaming}
            variant="standard"
            fullWidth
            InputProps={{
              disableUnderline: true,
              sx: {
                fontSize: "0.9rem",
                color: "rgba(255,240,224,0.94)",
                py: 0.5,
                "& textarea::placeholder": {
                  color: "rgba(255,240,224,0.4)",
                  opacity: 1,
                },
              },
            }}
          />
          <IconButton
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            size="small"
            sx={{
              flexShrink: 0,
              width: 32,
              height: 32,
              background: input.trim()
                ? "linear-gradient(135deg, #FF7A1A, #FB923C)"
                : "rgba(255,122,26,0.12)",
              color: input.trim() ? "#0A0907" : "rgba(255,122,26,0.5)",
              "&:hover": {
                background: input.trim()
                  ? "linear-gradient(135deg, #FB923C, #FBBF24)"
                  : "rgba(255,122,26,0.18)",
              },
              "&:disabled": {
                background: "rgba(255,122,26,0.08)",
                color: "rgba(255,122,26,0.3)",
              },
              transition: "all 160ms ease",
            }}
            aria-label="Send"
          >
            <ArrowUp size={16} />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}
