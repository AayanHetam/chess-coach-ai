"use client";

import { useState } from "react";
import { Button, Snackbar, Alert } from "@mui/material";
import { Icon } from "@iconify/react";
import { useViewer } from "@/hooks/useViewer";
import { FlagModal, type FlagSubmitInput } from "./FlagModal";
import { INTERN_THEME_COLOR } from "@/constants";

export type FlagButtonChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

interface Props {
  /**
   * The assistant message being flagged.
   */
  message: FlagButtonChatMessage;
  /**
   * Index of the flagged message in the full chat history.
   */
  messageIndex: number;
  /**
   * Full chat history at flag time. Sent verbatim to the server so the
   * captured pair includes complete context, not just the bad message.
   */
  chatHistory: FlagButtonChatMessage[];
  /**
   * Analysis context ID, if this chat is tied to a game analysis. Lets the
   * server pull PGN + FEN from the cached AnalysisContext. May be null
   * for chats not tied to a game.
   */
  contextId: string | null;
}

/**
 * Renders a small "Flag" button next to an assistant message. Renders nothing
 * for non-intern viewers OR for non-assistant messages.
 *
 * On click: opens a modal asking for category + optional note, then POSTs
 * the full payload to /api/intern/flag.
 */
export function FlagButton({ message, messageIndex, chatHistory, contextId }: Props) {
  const { isIntern } = useViewer();
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  if (!isIntern || message.role !== "assistant") return null;

  const handleSubmit = async (input: FlagSubmitInput) => {
    const res = await fetch("/api/intern/flag", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contextId,
        chatHistory,
        flaggedMessageIndex: messageIndex,
        flagCategory: input.category,
        whyWrong: input.whyWrong,
        idealResponse: input.idealResponse,
      }),
    });
    if (!res.ok) {
      let message = `Flag failed (${res.status})`;
      try {
        const data = (await res.json()) as { error?: string };
        if (data.error) message = data.error;
      } catch {
        // ignore
      }
      throw new Error(message);
    }
    setModalOpen(false);
    setToast({
      kind: "success",
      text: "Flag submitted. Counts toward your weekly quota.",
    });
  };

  return (
    <>
      <Button
        size="small"
        variant="text"
        onClick={() => setModalOpen(true)}
        startIcon={<Icon icon="mdi:flag-outline" />}
        sx={{
          color: INTERN_THEME_COLOR,
          textTransform: "none",
          fontWeight: 500,
          minWidth: 0,
          px: 1,
          opacity: 0.7,
          "&:hover": { opacity: 1, backgroundColor: "rgba(10, 77, 168, 0.08)" },
        }}
        aria-label="Flag this response as bad, inaccurate, or incomplete"
      >
        Flag
      </Button>

      <FlagModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        flaggedPreview={message.content}
      />

      <Snackbar
        open={toast !== null}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert
            severity={toast.kind}
            onClose={() => setToast(null)}
            variant="filled"
            sx={{ width: "100%" }}
          >
            {toast.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}
