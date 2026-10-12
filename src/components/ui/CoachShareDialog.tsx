"use client";

import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Modal,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { Loader } from "@/components/ui/Loader";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  Link as LinkIcon,
  Share2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACCENT,
  LINE,
  MOTION,
  RADIUS,
  SHADOW,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";
import {
  buildAnalysisSnippetSvg,
  buildSnippetUrl,
  renderSnippetSvgToPng,
  type AnalysisSnippetData,
} from "@/lib/analysisSnippet";
import { loadPieceAssets } from "@/lib/chessPieceAssets";
import { triggerDownload, copyPngToClipboard } from "@/lib/shareCard";

interface CoachShareDialogProps {
  open: boolean;
  onClose: () => void;
  data: AnalysisSnippetData;
}

type ShareKind = "single" | "transcript";

/**
 * Share dialog for a coach reply — preview an SVG snippet of the position +
 * Claude's explanation, then download / copy as PNG or mint a permalink via
 * /api/insights (auth-gated, gracefully falls back to a ?fen= deep link
 * when sign-in isn't available).
 *
 * Pattern + helpers ported from `src/components/AnalysisSnippetDialog.tsx`
 * but re-themed for the dark-glass design OS.
 */
export function CoachShareDialog({
  open,
  onClose,
  data,
}: CoachShareDialogProps) {
  const transcriptShareable =
    Array.isArray(data.transcript) && data.transcript.length > 1;
  const [shareKind, setShareKind] = useState<ShareKind>("single");
  const [svg, setSvg] = useState<string | null>(null);
  const [insightId, setInsightId] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [authBlocked, setAuthBlocked] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setShareKind("single");
      setSvg(null);
      setInsightId(null);
      setInsightLoading(false);
      setAuthBlocked(false);
      setToast(null);
    }
  }, [open]);

  // Build the SVG preview once piece assets load
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const assets = await loadPieceAssets();
        if (cancelled) return;
        setSvg(buildAnalysisSnippetSvg(data, assets));
      } catch (err) {
        console.warn("[share] piece assets failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, data]);

  // Mint an /api/insights record (or fall back to ?fen= link)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setInsightLoading(true);
    setInsightId(null);
    setAuthBlocked(false);
    (async () => {
      try {
        const body: Record<string, unknown> = {
          fen: data.fen,
          coachContent: data.explanation,
          kind: shareKind,
        };
        if (
          shareKind === "transcript" &&
          data.transcript &&
          data.transcript.length > 0
        ) {
          body.transcript = data.transcript;
        }
        const res = await fetch("/api/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body),
        });
        if (cancelled) return;
        if (res.status === 401) {
          setAuthBlocked(true);
          return;
        }
        if (!res.ok) return;
        const json = (await res.json()) as { id?: string };
        if (json.id) setInsightId(json.id);
      } catch (err) {
        if (!cancelled) console.warn("[share] insight mint failed:", err);
      } finally {
        if (!cancelled) setInsightLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, shareKind, data]);

  const permalink = useMemo(() => {
    if (typeof window === "undefined") return "";
    // Post-cutover (2026-06-04): /analysis IS the canonical surface (the
    // former /preview/analysis dark-glass implementation). Always share
    // the canonical URL; /preview/analysis 308-redirects to /analysis,
    // but sharing the canonical avoids unfurl-cache churn.
    const path = buildSnippetUrl(data.fen, insightId);
    return `${window.location.origin}${path}`;
  }, [data.fen, insightId]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 1800);
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(permalink);
      showToast("Link copied");
    } catch {
      showToast("Couldn't copy link");
    }
  }, [permalink, showToast]);

  const handleDownloadPng = useCallback(async () => {
    if (!svg) return;
    try {
      const blob = await renderSnippetSvgToPng(svg);
      triggerDownload(blob, `chessmasti-analysis.png`);
      showToast("PNG downloaded");
    } catch {
      showToast("Couldn't download PNG");
    }
  }, [svg, showToast]);

  const handleCopyImage = useCallback(async () => {
    if (!svg) return;
    try {
      const blob = await renderSnippetSvgToPng(svg);
      const ok = await copyPngToClipboard(blob);
      showToast(ok ? "Image copied" : "Browser blocked clipboard");
    } catch {
      showToast("Couldn't copy image");
    }
  }, [svg, showToast]);

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
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            // Centering handled by the parent Modal's flexbox (added in its sx).
            // Must NOT set position:fixed + translate(-50%,-50%) here —
            // framer-motion animates y/scale and owns `transform`, so it would
            // overwrite the centering and drop the dialog off-center.
            style={{ outline: "none" }}
          >
            <Box
              sx={{
                width: { xs: "92vw", sm: 620 },
                maxWidth: "92vw",
                maxHeight: "88vh",
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
                <Share2 size={18} strokeWidth={1.75} color={TEXT.secondary} />
                <Typography
                  component="h2"
                  sx={{ flex: 1, ...TYPE.h4, color: TEXT.primary }}
                >
                  Share this insight
                </Typography>
                <IconButton
                  onClick={onClose}
                  aria-label="Close"
                  sx={{ color: TEXT.secondary }}
                >
                  <X size={16} />
                </IconButton>
              </Stack>

              {transcriptShareable && (
                <Box
                  sx={{
                    display: "flex",
                    gap: 0.5,
                    px: 1.5,
                    py: 1,
                    borderBottom: `1px solid ${LINE.hairline}`,
                  }}
                >
                  {(
                    [
                      { id: "single", label: "This message" },
                      { id: "transcript", label: "Whole conversation" },
                    ] as { id: ShareKind; label: string }[]
                  ).map(({ id, label }) => {
                    const isActive = shareKind === id;
                    return (
                      <Box
                        key={id}
                        onClick={() => setShareKind(id)}
                        sx={{
                          position: "relative",
                          flex: 1,
                          textAlign: "center",
                          px: 1.5,
                          py: 0.85,
                          borderRadius: `${RADIUS.small}px`,
                          cursor: "pointer",
                          color: isActive ? TEXT.primary : TEXT.secondary,
                          fontSize: TYPE.bodySmall.fontSize,
                          fontWeight: 600,
                          transition: `color ${MOTION.hover}`,
                          "&:hover": { color: TEXT.primary },
                        }}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="shareKindIndicator"
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
                          component="span"
                          sx={{ position: "relative", zIndex: 1 }}
                        >
                          {label}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              )}

              <Box
                sx={{
                  flex: 1,
                  overflowY: "auto",
                  p: 2.5,
                  "&::-webkit-scrollbar": { width: 6 },
                  "&::-webkit-scrollbar-thumb": {
                    background: LINE.strong,
                    borderRadius: "3px",
                  },
                }}
              >
                {/* Preview card */}
                <Box
                  sx={{
                    width: "100%",
                    aspectRatio: "1200 / 675",
                    borderRadius: `${RADIUS.control}px`,
                    overflow: "hidden",
                    background: SURFACE.raisedSecondary,
                    border: `1px solid ${LINE.hairline}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {svg ? (
                    <Box
                      sx={{ width: "100%", height: "100%" }}
                      dangerouslySetInnerHTML={{ __html: svg }}
                    />
                  ) : (
                    <Loader size={44} showLabel={false} />
                  )}
                </Box>

                {authBlocked && (
                  <Typography
                    sx={{ mt: 1.5, ...TYPE.caption, color: TEXT.secondary }}
                  >
                    Sign in on chessmasti.com for a stable permalink. For now
                    we&apos;ll fall back to a `?fen=` deep link that loads the
                    position but not the chat history.
                  </Typography>
                )}
              </Box>

              <Box
                sx={{
                  px: 3,
                  py: 2,
                  borderTop: `1px solid ${LINE.hairline}`,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 1,
                }}
              >
                <Tooltip title={permalink || "Generating link…"}>
                  <Button
                    onClick={handleCopyLink}
                    disabled={!permalink}
                    startIcon={
                      insightLoading ? (
                        <CircularProgress
                          size={12}
                          sx={{ color: TEXT.secondary }}
                        />
                      ) : (
                        <LinkIcon size={13} />
                      )
                    }
                    sx={secondaryBtn}
                  >
                    Copy link
                  </Button>
                </Tooltip>
                <Button
                  onClick={handleCopyImage}
                  disabled={!svg}
                  startIcon={<Copy size={13} />}
                  sx={secondaryBtn}
                >
                  Copy image
                </Button>
                <Button
                  onClick={handleDownloadPng}
                  disabled={!svg}
                  startIcon={<Download size={13} />}
                  sx={primaryBtn}
                >
                  Download PNG
                </Button>
              </Box>

              <AnimatePresence>
                {toast && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    style={{
                      position: "absolute",
                      bottom: 16,
                      left: "50%",
                      transform: "translateX(-50%)",
                      pointerEvents: "none",
                    }}
                  >
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={0.85}
                      sx={{
                        px: 1.5,
                        py: 0.85,
                        borderRadius: `${RADIUS.pill}px`,
                        background: SURFACE.raisedTertiary,
                        border: `1px solid ${LINE.hairline}`,
                        color: TEXT.primary,
                        boxShadow: SHADOW.floating,
                        fontSize: TYPE.caption.fontSize,
                        fontWeight: 600,
                        "& svg": { color: STATUS.success },
                      }}
                    >
                      <Check size={12} />
                      <Box component="span">{toast}</Box>
                    </Stack>
                  </motion.div>
                )}
              </AnimatePresence>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}

// The theme gives every Button its pill, size and press feedback; these
// only pick the outlined (secondary) and ember (primary) looks.
const secondaryBtn = {
  border: `1px solid ${LINE.strong}`,
  color: TEXT.primary,
  "&:hover": {
    background: "rgba(255,255,255,0.06)",
    borderColor: TEXT.secondary,
  },
  "&.Mui-disabled": {
    color: TEXT.tertiary,
    borderColor: LINE.hairline,
  },
};

const primaryBtn = {
  background: ACCENT.main,
  color: TEXT.onAccent,
  "&:hover": { background: ACCENT.hover },
  "&.Mui-disabled": {
    background: "rgba(255,255,255,0.08)",
    color: TEXT.tertiary,
  },
};
